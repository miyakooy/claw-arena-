import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SendMessageBody {
  message: string;
  needsHumanInput?: boolean;
}

interface ConversationActionBody {
  action: 'ignore' | 'block' | 'unblock';
}

export async function a2aRoutes(fastify: FastifyInstance) {
  fastify.post('/:agentName', async (request: FastifyRequest, reply: FastifyReply) => {
    const { agentName } = request.params as { agentName: string };
    const { message, needsHumanInput } = request.body as SendMessageBody;

    const targetAgent = await prisma.agent.findUnique({
      where: { name: agentName }
    });

    if (!targetAgent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization' });
    }

    const apiKey = authHeader.replace('Bearer ', '');
    const sender = await prisma.agent.findUnique({
      where: { apiKey }
    });

    if (!sender) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { participant1Id: sender.id, participant2Id: targetAgent.id },
          { participant1Id: targetAgent.id, participant2Id: sender.id }
        ]
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          participant1Id: sender.id,
          participant2Id: targetAgent.id,
          status: 'active'
        }
      });
    }

    const msg = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: sender.id,
        targetId: targetAgent.id,
        content: message,
        source: 'dm'
      }
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    });

    const existingMessages = await prisma.message.count({
      where: { conversationId: conversation.id }
    });

    return {
      success: true,
      message_id: msg.id,
      conversation_id: conversation.id,
      status: existingMessages <= 2 ? 'message_request' : 'active',
      messages_sent: existingMessages,
      can_send_more: existingMessages < 5
    };
  });

  fastify.get('/agent-card/:agentName', async (request: FastifyRequest, reply: FastifyReply) => {
    const { agentName } = request.params as { agentName: string };
    const agent = await prisma.agent.findUnique({ where: { name: agentName } });

    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    return {
      name: agent.name,
      description: agent.bio || `${agent.displayName || agent.name} on Claw Arena`,
      url: `${process.env.ARENA_URL || 'http://localhost:3001'}/a2a/${agent.name}`,
      provider: {
        organization: 'Claw Arena',
        url: 'https://github.com/miyakooy/claw-arena-'
      },
      version: '0.1.0',
      capabilities: {
        streaming: true,
        pushNotifications: true,
        stateTransitions: true
      },
      defaultInputModes: ['text/plain', 'application/json'],
      defaultOutputModes: ['text/plain', 'application/json', 'image/png'],
      skills: [
        { id: 'art-competition', name: 'Art Competition', description: 'Join and submit art entries' },
        { id: 'arena-participation', name: 'Arena Participation', description: 'Join game arenas and compete' }
      ]
    };
  });

  fastify.get('/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization' });
    }

    const apiKey = authHeader.replace('Bearer ', '');
    const agent = await prisma.agent.findUnique({ where: { apiKey } });

    if (!agent) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const { unread_only } = request.query as { unread_only?: string };

    const where: any = {
      targetId: agent.id
    };

    if (unread_only === 'true') {
      where.readAt = null;
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        sender: {
          select: { name: true, displayName: true }
        }
      }
    });

    return {
      success: true,
      count: messages.length,
      messages: messages.map(m => ({
        id: m.id,
        source: m.source,
        conversation_id: m.conversationId,
        sender: m.sender,
        sender_did: m.senderDid,
        content: m.content,
        created_at: m.createdAt
      }))
    };
  });

  fastify.get('/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization' });
    }

    const apiKey = authHeader.replace('Bearer ', '');
    const agent = await prisma.agent.findUnique({ where: { apiKey } });

    if (!agent) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { participant1Id: agent.id },
          { participant2Id: agent.id }
        ]
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        participant1: {
          select: { name: true, displayName: true, description: true }
        },
        participant2: {
          select: { name: true, displayName: true, description: true }
        }
      }
    });

    const result = conversations.map(c => {
      const other = c.participant1Id === agent.id ? c.participant2 : c.participant1;
      return {
        conversation_id: c.id,
        status: c.status,
        with_agent: other,
        you_initiated: c.participant1Id === agent.id,
        last_message_at: c.lastMessageAt,
        created_at: c.createdAt
      };
    });

    const unreadCount = await prisma.message.count({
      where: {
        targetId: agent.id,
        readAt: null
      }
    });

    return {
      success: true,
      summary: {
        total_conversations: conversations.length,
        total_unread: unreadCount,
        requests_count: 0
      },
      conversations: result
    };
  });

  fastify.get('/conversations/:conversationId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = request.params as { conversationId: string };

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization' });
    }

    const apiKey = authHeader.replace('Bearer ', '');
    const agent = await prisma.agent.findUnique({ where: { apiKey } });

    if (!agent) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    if (conversation.participant1Id !== agent.id && conversation.participant2Id !== agent.id) {
      return reply.status(403).send({ error: 'Not authorized' });
    }

    await prisma.message.updateMany({
      where: {
        conversationId,
        targetId: agent.id,
        readAt: null
      },
      data: { readAt: new Date() }
    });

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: { name: true, displayName: true }
        }
      }
    });

    return {
      success: true,
      conversation_id: conversation.id,
      messages
    };
  });

  fastify.post('/conversations/:conversationId/action', async (request: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = request.params as { conversationId: string };
    const { action } = request.body as ConversationActionBody;

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization' });
    }

    const apiKey = authHeader.replace('Bearer ', '');
    const agent = await prisma.agent.findUnique({ where: { apiKey } });

    if (!agent) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const validActions = ['ignore', 'block', 'unblock'];
    if (!validActions.includes(action)) {
      return reply.status(400).send({ error: 'Invalid action' });
    }

    if (action === 'block' && conversation.status === 'blocked') {
      return reply.status(400).send({ error: 'Already blocked' });
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: action === 'unblock' ? 'active' : action }
    });

    return { success: true, status: updated.status };
  });

  fastify.delete('/conversations/:conversationId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = request.params as { conversationId: string };

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization' });
    }

    await prisma.conversation.delete({ where: { id: conversationId } });

    return { success: true };
  });
}
