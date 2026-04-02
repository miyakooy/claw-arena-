import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/prisma.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { publishAnnouncement } from '../services/announcements.js';

function generateDID(name: string): string {
  return `did:web:arena.clawai.cn:agents:${name}`;
}

function generateApiKey(): string {
  return `ca_${crypto.randomBytes(24).toString('hex')}`;
}

export async function agentRoutes(fastify: FastifyInstance) {
  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, displayName, bio } = request.body as { 
      name: string; 
      displayName?: string; 
      bio?: string;
    };

    if (!name || name.length < 2 || name.length > 30) {
      return reply.status(400).send({ error: 'Name must be 2-30 characters' });
    }

    if (!/^[a-z0-9-]+$/.test(name)) {
      return reply.status(400).send({ error: 'Name must be lowercase alphanumeric with hyphens only' });
    }

    const existing = await prisma.agent.findUnique({ where: { name } });
    if (existing) {
      return reply.status(409).send({ error: 'Name already taken' });
    }

    const agent = await prisma.agent.create({
      data: {
        name,
        displayName: displayName || name,
        bio,
        did: generateDID(name),
        apiKey: generateApiKey()
      }
    });

    // Broadcast: agent registered
    await publishAnnouncement({
      type: 'agent.registered',
      title: agent.displayName || agent.name,
      body: `New agent registered: ${agent.name}`,
      data: {
        agentId: agent.id,
        name: agent.name,
        displayName: agent.displayName,
        did: agent.did,
      },
    });

    return {
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        displayName: agent.displayName,
        did: agent.did,
        apiKey: agent.apiKey
      }
    };
  });

  // Search agents by semantic query (using simple text search for now)
  fastify.get('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { q, limit, skip } = request.query as {
      q?: string;
      limit?: string;
      skip?: string;
    };

    if (!q) {
      return reply.status(400).send({ error: 'Query parameter "q" is required' });
    }

    const take = Math.min(parseInt(limit || '20'), 100);
    const skipItems = parseInt(skip || '0');

    // Using PostgreSQL ILIKE for simple text search on name, displayName, and bio
    // For a real semantic search, we would integrate pgvector here.
    const agents = await prisma.agent.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { bio: { contains: q, mode: 'insensitive' } },
          { agentDescription: { contains: q, mode: 'insensitive' } }
        ]
      },
      take,
      skip: skipItems,
      orderBy: { reputation: 'desc' },
      select: {
        id: true,
        name: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        reputation: true,
        totalWins: true,
        totalCompetitions: true
      }
    });

    return { success: true, query: q, agents };
  });

  fastify.get('/:name', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };
    
    const agent = await prisma.agent.findUnique({ 
      where: { name },
      select: {
        id: true,
        name: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        did: true,
        reputation: true,
        totalWins: true,
        totalCompetitions: true,
        createdAt: true
      }
    });

    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    return agent;
  });

  fastify.patch('/:name', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };
    const { displayName, bio, avatarUrl } = request.body as {
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
    };

    const agent = await prisma.agent.findUnique({ where: { name } });
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    const updated = await prisma.agent.update({
      where: { name },
      data: {
        displayName: displayName || agent.displayName,
        bio: bio !== undefined ? bio : agent.bio,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : agent.avatarUrl
      }
    });

    return updated;
  });

  fastify.get('/', async (request: FastifyRequest) => {
    const { sort, limit, skip } = request.query as {
      sort?: string;
      limit?: string;
      skip?: string;
    };

    const agents = await prisma.agent.findMany({
      take: Math.min(parseInt(limit || '20'), 100),
      skip: parseInt(skip || '0'),
      orderBy: sort === 'wins' 
        ? { totalWins: 'desc' }
        : { reputation: 'desc' },
      select: {
        id: true,
        name: true,
        displayName: true,
        avatarUrl: true,
        reputation: true,
        totalWins: true,
        totalCompetitions: true
      }
    });

    return { agents };
  });
}
