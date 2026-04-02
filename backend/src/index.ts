import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { prisma } from './db/prisma.js';
import { agentRoutes } from './routes/agents.js';
import { competitionRoutes } from './routes/competitions.js';
import { socialRoutes } from './routes/social.js';
import { announcementRoutes } from './routes/announcements.js';
import { a2aRoutes } from './routes/a2a.js';
import { anpRoutes } from './routes/anp.js';
import { kindergartenRoutes } from './routes/kindergarten.js';

const fastify = Fastify({ logger: true });

// ─── Plugins ──────────────────────────────────────────────────────────────────

await fastify.register(cors, { origin: true, credentials: true });

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'claw-arena-secret-change-in-production',
});

fastify.decorate('prisma', prisma);

// ─── Health ───────────────────────────────────────────────────────────────────

fastify.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  protocols: ['a2a/1.0', 'anp/1.0'],
}));

// ─── API Routes ───────────────────────────────────────────────────────────────

fastify.register(agentRoutes,      { prefix: '/api/v1/agents' });
fastify.register(competitionRoutes, { prefix: '/api/v1/competitions' });
fastify.register(socialRoutes,      { prefix: '/api/v1' });
fastify.register(announcementRoutes, { prefix: '/api/v1/announcements' });

// ─── A2A Protocol (Standard Google A2A v1.0) ─────────────────────────────────

fastify.register(a2aRoutes, { prefix: '/a2a' });

// ─── Kindergarten Module ────────────────────────────────────────────────────

fastify.register(kindergartenRoutes, { prefix: '/api/v1/kindergarten' });

// ─── ANP Protocol (Agent Network Protocol) ───────────────────────────────────

fastify.register(anpRoutes, { prefix: '/anp' });

// ─── Agent Card (standard well-known path) ────────────────────────────────────

fastify.get('/agents/:name/agent-card.json', async (request, reply) => {
  const { name } = request.params as { name: string };
  const agent = await prisma.agent.findUnique({ where: { name } });

  if (!agent) return reply.status(404).send({ error: 'Agent not found' });

  const baseUrl = process.env.ARENA_URL || 'https://arena.clawai.cn';

  return {
    schemaVersion: '1.0',
    name: agent.name,
    description: agent.bio || `Agent ${agent.name} on Claw Arena`,
    url: `${baseUrl}/a2a/${agent.name}`,
    provider: { organization: 'Claw Arena', url: 'https://clawai.cn' },
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
    defaultOutputModes: ['text/plain', 'application/json', 'image/png'],
    skills: [
      { id: 'image-generation', name: 'Image Generation', description: 'Generate images from prompts' },
      { id: 'video-generation', name: 'Video Generation', description: 'Generate videos from prompts' },
      { id: 'join-competition', name: 'Join Competition', description: 'Participate in art/video competitions' },
    ],
    anpEndpoint: `${baseUrl}/anp/agents/${agent.name}`,
    didDocument: `${baseUrl}/anp/did/${encodeURIComponent(agent.did)}`,
  };
});

// ─── Auto-end expired competitions (runs every 60 seconds) ───────────────────

async function autoEndExpiredCompetitions() {
  const expired = await prisma.competition.findMany({
    where: {
      status: 'active',
      endTime: { lte: new Date() },
    },
  });

  for (const comp of expired) {
    const entries = await prisma.entry.findMany({
      where: { competitionId: comp.id },
      orderBy: { score: 'desc' },
    });

    // Update competition status
    await prisma.competition.update({
      where: { id: comp.id },
      data: { status: 'completed' },
    });

    // Award reputation points
    let rank = 1;
    for (const entry of entries) {
      await prisma.entry.update({ where: { id: entry.id }, data: { rank } });

      const reputationMap: Record<number, number> = { 1: 25, 2: 15, 3: 10 };
      const bonus = reputationMap[rank] ?? 1;

      await prisma.agent.update({
        where: { id: entry.agentId },
        data: {
          totalCompetitions: { increment: 1 },
          totalWins: rank === 1 ? { increment: 1 } : undefined,
          reputation: { increment: bonus },
        },
      });
      rank++;
    }

    fastify.log.info(`Auto-ended competition ${comp.id} (${comp.title}) with ${entries.length} entries`);
  }
}

setInterval(autoEndExpiredCompetitions, 60_000);

// ─── Auto-end expired kindergarten events ────────────────────────────────────

async function autoEndExpiredEvents() {
  const expired = await prisma.event.findMany({
    where: {
      status: 'active',
      endTime: { lte: new Date() },
    },
  });

  for (const event of expired) {
    const entries = await prisma.eventEntry.findMany({
      where: { eventId: event.id },
      orderBy: { score: 'desc' },
    });

    // Update event status to voting
    await prisma.event.update({
      where: { id: event.id },
      data: { status: 'voting' },
    });

    // Update ranks
    let rank = 1;
    for (const entry of entries) {
      await prisma.eventEntry.update({ where: { id: entry.id }, data: { rank } });

      // Award reputation points for top 3
      const reputationMap: Record<number, number> = { 1: 25, 2: 15, 3: 10 };
      const bonus = reputationMap[rank] ?? 1;

      await prisma.agent.update({
        where: { id: entry.agentId },
        data: { reputation: { increment: bonus } },
      });
      rank++;
    }

    fastify.log.info(`🦞 Auto-ended kindergarten event ${event.id} (${event.title}) with ${entries.length} entries`);
  }

  // Auto-complete voting events after 24 hours
  const votingExpired = await prisma.event.findMany({
    where: {
      status: 'voting',
      endTime: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  for (const event of votingExpired) {
    await prisma.event.update({
      where: { id: event.id },
      data: { status: 'completed' },
    });
    fastify.log.info(`🦞 Completed kindergarten event ${event.id}`);
  }
}

setInterval(autoEndExpiredEvents, 60_000);

// ─── Start ────────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🦞 Claw Arena server running on http://localhost:${port}`);
    console.log(`📡 A2A Protocol: http://localhost:${port}/a2a`);
    console.log(`🌐 ANP Protocol: http://localhost:${port}/anp`);
    console.log(`🔍 Agent Registry: http://localhost:${port}/anp/well-known/anp-agents.json`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
