/**
 * A2A Protocol Routes - Full Standard Implementation (v1.0)
 * 
 * Implements:
 * - Agent Card discovery
 * - Task lifecycle: submitted → working → completed/failed/canceled/input-required
 * - SSE streaming responses
 * - Push notification configs
 * - DM Inbox (legacy backward-compat)
 * - Conversation management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/prisma.js';
import axios from 'axios';
import crypto from 'crypto';

// ─── A2A Data Types ───────────────────────────────────────────────────────────

interface A2APart {
  type?: string;
  text?: string;
  data?: unknown;
  url?: string;
  mediaType?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
}

interface A2AMessage {
  messageId?: string;
  contextId?: string;
  taskId?: string;
  role: 'user' | 'agent';
  parts: A2APart[];
  metadata?: Record<string, unknown>;
}

interface SendMessageBody {
  message: A2AMessage;
  // Legacy field for backward compat
  text?: string;
  needsHumanInput?: boolean;
}

interface TaskActionBody {
  action: 'cancel';
}

interface PushConfigBody {
  url: string;
  token?: string;
  taskStates?: string[];
}

interface ConversationActionBody {
  action: 'ignore' | 'block' | 'unblock';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractApiKey(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.replace('Bearer ', '').trim();
}

async function getAgentByKey(apiKey: string) {
  return prisma.agent.findUnique({ where: { apiKey } });
}

/** Notify push webhook for a task state change */
async function notifyPush(taskId: string, serverAgentId: string, taskState: string) {
  try {
    const configs = await prisma.pushNotificationConfig.findMany({
      where: { agentId: serverAgentId }
    });
    for (const cfg of configs) {
      if (cfg.taskStates) {
        const states = JSON.parse(cfg.taskStates) as string[];
        if (!states.includes(taskState)) continue;
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (cfg.token) headers['Authorization'] = `Bearer ${cfg.token}`;
      await axios.post(cfg.url, { taskId, state: taskState }, { headers, timeout: 5000 });
    }
  } catch {
    // Best-effort; don't break main flow
  }
}

/** Build a standard A2A Agent Card for the given agent */
function buildAgentCard(agent: { name: string; bio: string | null; displayName: string | null; did: string }, baseUrl: string) {
  return {
    schemaVersion: '1.0',
    name: agent.name,
    description: agent.bio || `${agent.displayName || agent.name} on Claw Arena`,
    url: `${baseUrl}/a2a/${agent.name}`,
    provider: {
      organization: 'Claw Arena',
      url: 'https://github.com/miyakooy/claw-arena-',
    },
    version: '1.0.0',
    protocolVersion: 'a2a/1.0',
    did: agent.did,
    capabilities: {
      streaming: true,
      pushNotifications: true,
      stateTransitions: true,
    },
    authentication: {
      schemes: ['Bearer'],
      credentials: 'header::Authorization',
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json', 'image/png', 'video/mp4'],
    skills: [
      {
        id: 'art-competition',
        name: 'Art Competition',
        description: 'Join and submit art entries to image generation competitions',
        tags: ['art', 'image', 'competition'],
        examples: ['Join competition abc123', 'Submit my artwork to the current battle'],
      },
      {
        id: 'arena-participation',
        name: 'Arena Participation',
        description: 'Participate in any type of competition (art/video/writing/coding/quiz)',
        tags: ['competition', 'game', 'arena'],
      },
      {
        id: 'agent-messaging',
        name: 'Agent Messaging',
        description: 'Send and receive messages from other agents in the arena',
        tags: ['messaging', 'a2a'],
      },
    ],
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function a2aRoutes(fastify: FastifyInstance) {
  const baseUrl = process.env.ARENA_URL || 'http://localhost:3001';

  // ── Agent Card (Extended, after auth) ─────────────────────────────────────
  fastify.get('/agent-card/:agentName', async (request: FastifyRequest, reply: FastifyReply) => {
    const { agentName } = request.params as { agentName: string };
    const agent = await prisma.agent.findUnique({ where: { name: agentName } });
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    return buildAgentCard(agent, baseUrl);
  });

  // ── Send Message / Create Task (POST /a2a/:agentName) ─────────────────────
  // Supports both new A2A Task model and legacy simple message
  fastify.post('/:agentName', async (request: FastifyRequest, reply: FastifyReply) => {
    const { agentName } = request.params as { agentName: string };
    const body = request.body as SendMessageBody;

    const targetAgent = await prisma.agent.findUnique({ where: { name: agentName } });
    if (!targetAgent) return reply.status(404).send({ error: 'Agent not found' });

    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });

    const sender = await getAgentByKey(apiKey);
    if (!sender) return reply.status(401).send({ error: 'Invalid API key' });

    if (sender.id === targetAgent.id) {
      return reply.status(400).send({ error: 'Cannot send message to yourself' });
    }

    // Support both new A2A message format and legacy text field
    const incomingMsg = body.message || {
      role: 'user' as const,
      parts: [{ type: 'text', text: body.text || '' }],
    };

    const contextId = incomingMsg.contextId || crypto.randomUUID();
    const messageId = incomingMsg.messageId || crypto.randomUUID();

    // ── Create A2A Task ──────────────────────────────────────────────────────
    const task = await prisma.task.create({
      data: {
        contextId,
        clientAgentId: sender.id,
        serverAgentId: targetAgent.id,
        state: 'submitted',
        inputMessage: JSON.stringify(incomingMsg),
        metadata: incomingMsg.metadata ? JSON.stringify(incomingMsg.metadata) : null,
      },
    });

    // Store the incoming message in task messages
    await prisma.taskMessage.create({
      data: {
        taskId: task.id,
        messageId,
        role: 'user',
        parts: JSON.stringify(incomingMsg.parts),
        metadata: incomingMsg.metadata ? JSON.stringify(incomingMsg.metadata) : null,
      },
    });

    // Also store in legacy Conversation/Message for inbox compat
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { participant1Id: sender.id, participant2Id: targetAgent.id },
          { participant1Id: targetAgent.id, participant2Id: sender.id },
        ],
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          participant1Id: sender.id,
          participant2Id: targetAgent.id,
          status: 'active',
        },
      });
    }

    const textContent = incomingMsg.parts
      .filter((p) => p.type === 'text' || p.text)
      .map((p) => p.text || '')
      .join('\n');

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: sender.id,
        targetId: targetAgent.id,
        content: textContent || JSON.stringify(incomingMsg.parts),
        messageType: 'text',
        source: 'dm',
        senderDid: sender.did,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // Mark task as working (will be picked up by target agent's inbox)
    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: { state: 'working' },
    });

    // Notify push webhooks
    await notifyPush(task.id, targetAgent.id, 'working');

    return reply.status(200).send({
      id: updatedTask.id,
      contextId: updatedTask.contextId,
      state: updatedTask.state,
      message: {
        messageId,
        contextId,
        taskId: task.id,
        role: 'agent',
        parts: [{ type: 'text', text: 'Message received. Task is being processed.' }],
      },
      metadata: {},
    });
  });

  // ── Get Task (GET /a2a/tasks/:taskId) ────────────────────────────────────
  fastify.get('/tasks/:taskId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = request.params as { taskId: string };
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });

    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (task.clientAgentId !== agent.id && task.serverAgentId !== agent.id) {
      return reply.status(403).send({ error: 'Not authorized' });
    }

    return {
      id: task.id,
      contextId: task.contextId,
      state: task.state,
      statusMessage: task.statusMessage,
      artifacts: task.artifacts ? JSON.parse(task.artifacts) : [],
      history: task.messages.map((m) => ({
        messageId: m.messageId,
        role: m.role,
        parts: JSON.parse(m.parts),
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
        createdAt: m.createdAt,
      })),
      metadata: task.metadata ? JSON.parse(task.metadata) : {},
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    };
  });

  // ── List Tasks (GET /a2a/tasks) ─────────────────────────────────────────
  fastify.get('/tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });

    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const { state, limit, skip } = request.query as {
      state?: string;
      limit?: string;
      skip?: string;
    };

    const where: Record<string, unknown> = {
      OR: [{ clientAgentId: agent.id }, { serverAgentId: agent.id }],
    };
    if (state) where.state = state;

    const tasks = await prisma.task.findMany({
      where,
      take: Math.min(parseInt(limit || '20'), 100),
      skip: parseInt(skip || '0'),
      orderBy: { createdAt: 'desc' },
    });

    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        contextId: t.contextId,
        state: t.state,
        statusMessage: t.statusMessage,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    };
  });

  // ── Cancel Task (POST /a2a/tasks/:taskId/cancel) ─────────────────────────
  fastify.post('/tasks/:taskId/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = request.params as { taskId: string };
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });

    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (task.clientAgentId !== agent.id) return reply.status(403).send({ error: 'Only client can cancel' });

    const terminalStates = ['completed', 'failed', 'canceled', 'rejected'];
    if (terminalStates.includes(task.state)) {
      return reply.status(400).send({ error: `Task already in terminal state: ${task.state}` });
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { state: 'canceled', completedAt: new Date() },
    });

    await notifyPush(taskId, task.serverAgentId, 'canceled');

    return { id: updated.id, state: updated.state };
  });

  // ── Reply to Task (POST /a2a/tasks/:taskId/reply) ────────────────────────
  // Server agent sends back a reply / updates task state
  fastify.post('/tasks/:taskId/reply', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = request.params as { taskId: string };
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });

    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (task.serverAgentId !== agent.id) return reply.status(403).send({ error: 'Only server agent can reply' });

    const { message, state, artifacts, statusMessage } = request.body as {
      message?: A2AMessage;
      state?: string;
      artifacts?: Array<{ name: string; parts: A2APart[] }>;
      statusMessage?: string;
    };

    const validStates = ['working', 'input-required', 'completed', 'failed'];
    const newState = state && validStates.includes(state) ? state : task.state;
    const isTerminal = ['completed', 'failed'].includes(newState);

    // Store reply message
    if (message) {
      await prisma.taskMessage.create({
        data: {
          taskId,
          messageId: message.messageId || crypto.randomUUID(),
          role: 'agent',
          parts: JSON.stringify(message.parts || []),
          metadata: message.metadata ? JSON.stringify(message.metadata) : null,
        },
      });
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        state: newState,
        artifacts: artifacts ? JSON.stringify(artifacts) : task.artifacts,
        statusMessage: statusMessage || task.statusMessage,
        completedAt: isTerminal ? new Date() : task.completedAt,
      },
    });

    await notifyPush(taskId, task.serverAgentId, newState);

    return {
      id: updated.id,
      state: updated.state,
      artifacts: updated.artifacts ? JSON.parse(updated.artifacts) : [],
    };
  });

  // ── Stream Task Updates (GET /a2a/tasks/:taskId/stream) ─── SSE ──────────
  fastify.get('/tasks/:taskId/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = request.params as { taskId: string };
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });

    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (task.clientAgentId !== agent.id && task.serverAgentId !== agent.id) {
      return reply.status(403).send({ error: 'Not authorized' });
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Send current state immediately
    sendEvent('task_state', { id: task.id, state: task.state, contextId: task.contextId });

    // Poll for state changes (simple polling SSE; in production use Postgres LISTEN/NOTIFY)
    const terminalStates = ['completed', 'failed', 'canceled', 'rejected'];
    if (!terminalStates.includes(task.state)) {
      let lastState = task.state;
      const pollInterval = setInterval(async () => {
        try {
          const updated = await prisma.task.findUnique({
            where: { id: taskId },
            include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
          });
          if (!updated) {
            clearInterval(pollInterval);
            reply.raw.end();
            return;
          }
          if (updated.state !== lastState) {
            lastState = updated.state;
            sendEvent('task_state', {
              id: updated.id,
              state: updated.state,
              statusMessage: updated.statusMessage,
              artifacts: updated.artifacts ? JSON.parse(updated.artifacts) : [],
            });

            if (updated.messages.length > 0) {
              const msg = updated.messages[0];
              sendEvent('task_message', {
                taskId: updated.id,
                role: msg.role,
                parts: JSON.parse(msg.parts),
              });
            }

            if (terminalStates.includes(updated.state)) {
              sendEvent('task_completed', { id: updated.id, state: updated.state });
              clearInterval(pollInterval);
              reply.raw.end();
            }
          }
        } catch {
          clearInterval(pollInterval);
          reply.raw.end();
        }
      }, 1000);

      // Cleanup on client disconnect
      request.raw.on('close', () => {
        clearInterval(pollInterval);
      });
    } else {
      // Already terminal — send final event and close
      sendEvent('task_completed', { id: task.id, state: task.state });
      reply.raw.end();
    }
  });

  // ── Push Notification Config CRUD ─────────────────────────────────────────
  fastify.post('/push-configs', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const { url, token, taskStates } = request.body as PushConfigBody;
    if (!url) return reply.status(400).send({ error: 'url is required' });

    const config = await prisma.pushNotificationConfig.create({
      data: {
        agentId: agent.id,
        url,
        token,
        taskStates: taskStates ? JSON.stringify(taskStates) : null,
      },
    });

    return { id: config.id, url: config.url, createdAt: config.createdAt };
  });

  fastify.get('/push-configs', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const configs = await prisma.pushNotificationConfig.findMany({
      where: { agentId: agent.id },
    });

    return {
      configs: configs.map((c) => ({
        id: c.id,
        url: c.url,
        taskStates: c.taskStates ? JSON.parse(c.taskStates) : null,
        createdAt: c.createdAt,
      })),
    };
  });

  fastify.delete('/push-configs/:configId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { configId } = request.params as { configId: string };
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const config = await prisma.pushNotificationConfig.findUnique({ where: { id: configId } });
    if (!config || config.agentId !== agent.id) {
      return reply.status(404).send({ error: 'Config not found' });
    }

    await prisma.pushNotificationConfig.delete({ where: { id: configId } });
    return { success: true };
  });

  // ── Unified Inbox (GET /a2a/messages) ─────────────────────────────────────
  fastify.get('/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const { unread_only, limit } = request.query as { unread_only?: string; limit?: string };

    const where: Record<string, unknown> = { targetId: agent.id };
    if (unread_only === 'true') where.readAt = null;

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit || '50'), 100),
      include: {
        sender: { select: { name: true, displayName: true, did: true } },
      },
    });

    return {
      success: true,
      count: messages.length,
      messages: messages.map((m) => ({
        id: m.id,
        source: m.source,
        conversation_id: m.conversationId,
        sender: m.sender,
        sender_did: m.senderDid,
        content: m.content,
        message_type: m.messageType,
        read: !!m.readAt,
        created_at: m.createdAt,
      })),
    };
  });

  // ── Task Inbox (GET /a2a/task-inbox) ─────────────────────────────────────
  // Shows pending tasks for the server agent
  fastify.get('/task-inbox', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const tasks = await prisma.task.findMany({
      where: {
        serverAgentId: agent.id,
        state: { in: ['submitted', 'working', 'input-required'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        clientAgent: { select: { name: true, displayName: true, did: true } },
      },
    });

    return {
      count: tasks.length,
      tasks: tasks.map((t) => ({
        id: t.id,
        contextId: t.contextId,
        state: t.state,
        from: t.clientAgent,
        inputMessage: t.inputMessage ? JSON.parse(t.inputMessage) : null,
        createdAt: t.createdAt,
      })),
    };
  });

  // ── Conversations (legacy DM threads) ────────────────────────────────────
  fastify.get('/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ participant1Id: agent.id }, { participant2Id: agent.id }],
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        participant1: { select: { name: true, displayName: true, did: true } },
        participant2: { select: { name: true, displayName: true, did: true } },
      },
    });

    const unreadCount = await prisma.message.count({
      where: { targetId: agent.id, readAt: null },
    });

    return {
      success: true,
      summary: {
        total_conversations: conversations.length,
        total_unread: unreadCount,
      },
      conversations: conversations.map((c) => {
        const other = c.participant1Id === agent.id ? c.participant2 : c.participant1;
        return {
          conversation_id: c.id,
          status: c.status,
          with_agent: other,
          you_initiated: c.participant1Id === agent.id,
          last_message_at: c.lastMessageAt,
          created_at: c.createdAt,
        };
      }),
    };
  });

  fastify.get('/conversations/:conversationId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = request.params as { conversationId: string };
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    if (conversation.participant1Id !== agent.id && conversation.participant2Id !== agent.id) {
      return reply.status(403).send({ error: 'Not authorized' });
    }

    await prisma.message.updateMany({
      where: { conversationId, targetId: agent.id, readAt: null },
      data: { readAt: new Date() },
    });

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { name: true, displayName: true } } },
    });

    return { success: true, conversation_id: conversation.id, messages };
  });

  fastify.post('/conversations/:conversationId/action', async (request: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = request.params as { conversationId: string };
    const { action } = request.body as ConversationActionBody;
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    if (conversation.participant1Id !== agent.id && conversation.participant2Id !== agent.id) {
      return reply.status(403).send({ error: 'Not authorized' });
    }

    const validActions = ['ignore', 'block', 'unblock'];
    if (!validActions.includes(action)) return reply.status(400).send({ error: 'Invalid action' });

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: action === 'unblock' ? 'active' : action },
    });

    return { success: true, status: updated.status };
  });

  fastify.delete('/conversations/:conversationId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = request.params as { conversationId: string };
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    if (conversation.participant1Id !== agent.id && conversation.participant2Id !== agent.id) {
      return reply.status(403).send({ error: 'Not authorized' });
    }

    await prisma.conversation.delete({ where: { id: conversationId } });
    return { success: true };
  });
}
