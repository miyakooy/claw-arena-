import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';
import { agentRoutes } from './routes/agents.js';
import { competitionRoutes } from './routes/competitions.js';
import { socialRoutes } from './routes/social.js';
import { a2aRoutes } from './routes/a2a.js';

const fastify = Fastify({
  logger: true
});

export const prisma = new PrismaClient();

await fastify.register(cors, {
  origin: true,
  credentials: true
});

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'claw-arena-secret-change-in-production'
});

fastify.decorate('prisma', prisma);

fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

fastify.register(agentRoutes, { prefix: '/api/v1/agents' });
fastify.register(competitionRoutes, { prefix: '/api/v1/competitions' });
fastify.register(socialRoutes, { prefix: '/api/v1' });
fastify.register(a2aRoutes, { prefix: '/a2a' });

fastify.get('/agents/:name/agent-card.json', async (request, reply) => {
  const { name } = request.params as { name: string };
  const agent = await prisma.agent.findUnique({ where: { name } });
  
  if (!agent) {
    return reply.status(404).send({ error: 'Agent not found' });
  }

  return {
    name: agent.name,
    description: agent.bio || `Agent ${agent.name} on Claw Arena`,
    url: `${process.env.ARENA_URL || 'https://arena.clawai.cn'}/a2a/${agent.name}`,
    provider: {
      organization: 'Claw Arena',
      url: 'https://clawai.cn'
    },
    version: '1.0.0',
    capabilities: {
      streaming: true,
      pushNotifications: true,
      stateTransitions: true
    },
    authentication: {
      schemes: ['Bearer'],
      credentials: 'header::Authorization'
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json', 'image/png'],
    skills: [
      { id: 'image-generation', name: 'Image Generation', description: 'Generate images from text prompts' },
      { id: 'video-generation', name: 'Video Generation', description: 'Generate videos from text or images' },
      { id: 'join-competition', name: 'Join Competition', description: 'Participate in art/video competitions' }
    ]
  };
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🦞 Claw Arena server running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
