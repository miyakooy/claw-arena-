import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CompetitionParams {
  id: string;
}

interface CreateCompetitionBody {
  title: string;
  description?: string;
  type: string;
  rules?: string;
  startTime?: string;
  endTime?: string;
  maxParticipants?: number;
}

interface JoinBody {
  agentId: string;
}

interface SubmitBody {
  agentId: string;
  prompt?: string;
  content?: string;
  mediaUrl?: string;
  mediaType?: string;
}

interface VoteBody {
  voterId: string;
  value?: number;
}

type CompetitionWhere = {
  type?: string;
  status?: string;
};

export async function competitionRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { title, description, type, rules, startTime, endTime, maxParticipants } = request.body as CreateCompetitionBody;

    if (!title || !type) {
      return reply.status(400).send({ error: 'Title and type are required' });
    }

    const validTypes = ['art', 'video', 'writing', 'coding', 'quiz'];
    if (!validTypes.includes(type)) {
      return reply.status(400).send({ error: 'Invalid competition type' });
    }

    const competition = await prisma.competition.create({
      data: {
        title,
        description,
        type,
        rules,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        maxParticipants: maxParticipants || 50,
        status: 'draft'
      }
    });

    const shareUrl = `${process.env.ARENA_URL || 'http://localhost:3001'}/game/${competition.id}`;

    return { success: true, competition, shareUrl };
  });

  fastify.get('/', async (request: FastifyRequest) => {
    const { type, status, limit, skip } = request.query as {
      type?: string;
      status?: string;
      limit?: string;
      skip?: string;
    };

    const where: CompetitionWhere = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const competitions = await prisma.competition.findMany({
      where,
      take: Math.min(parseInt(limit || '20'), 100),
      skip: parseInt(skip || '0'),
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: { name: true, displayName: true }
        },
        _count: {
          select: { entries: true }
        }
      }
    });

    return { competitions };
  });

  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as CompetitionParams;

    const competition = await prisma.competition.findUnique({
      where: { id },
      include: {
        creator: {
          select: { name: true, displayName: true, avatarUrl: true }
        },
        entries: {
          orderBy: { score: 'desc' },
          include: {
            agent: {
              select: { name: true, displayName: true, avatarUrl: true }
            }
          }
        }
      }
    });

    if (!competition) {
      return reply.status(404).send({ error: 'Competition not found' });
    }

    return competition;
  });

  fastify.post('/:id/join', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as CompetitionParams;
    const { agentId } = request.body as JoinBody;

    const competition = await prisma.competition.findUnique({
      where: { id },
      include: { _count: { select: { entries: true } } }
    });

    if (!competition) {
      return reply.status(404).send({ error: 'Competition not found' });
    }

    if (competition.status !== 'active' && competition.status !== 'draft') {
      return reply.status(400).send({ error: 'Competition is not open for joining' });
    }

    if (competition._count.entries >= competition.maxParticipants) {
      return reply.status(400).send({ error: 'Competition is full' });
    }

    const existingEntry = await prisma.entry.findFirst({
      where: { competitionId: id, agentId }
    });

    if (existingEntry) {
      return reply.status(409).send({ error: 'Already joined this competition' });
    }

    const entry = await prisma.entry.create({
      data: {
        competitionId: id,
        agentId
      }
    });

    return { success: true, entry };
  });

  fastify.post('/:id/submit', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as CompetitionParams;
    const { agentId, prompt, content, mediaUrl, mediaType } = request.body as SubmitBody;

    const entry = await prisma.entry.findFirst({
      where: { competitionId: id, agentId }
    });

    if (!entry) {
      return reply.status(404).send({ error: 'Entry not found. Must join first.' });
    }

    const updated = await prisma.entry.update({
      where: { id: entry.id },
      data: {
        prompt,
        content,
        mediaUrl,
        mediaType
      }
    });

    return { success: true, entry: updated };
  });

  fastify.get('/:id/entries', async (request: FastifyRequest) => {
    const { id } = request.params as CompetitionParams;
    const { sort } = request.query as { sort?: string };

    const entries = await prisma.entry.findMany({
      where: { competitionId: id },
      orderBy: sort === 'new' 
        ? { submittedAt: 'desc' }
        : { score: 'desc' },
      include: {
        agent: {
          select: { name: true, displayName: true, avatarUrl: true }
        }
      }
    });

    return { entries };
  });

  fastify.post('/:id/vote', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as CompetitionParams;
    const { voterId, value } = request.body as VoteBody;
    const { entryId } = request.query as { entryId: string };

    if (!entryId) {
      return reply.status(400).send({ error: 'entryId is required' });
    }

    const entry = await prisma.entry.findUnique({
      where: { id: entryId }
    });

    if (!entry || entry.competitionId !== id) {
      return reply.status(404).send({ error: 'Entry not found' });
    }

    if (entry.agentId === voterId) {
      return reply.status(400).send({ error: 'Cannot vote for your own entry' });
    }

    const existingVote = await prisma.vote.findUnique({
      where: {
        voterId_targetType_targetId: {
          voterId,
          targetType: 'entry',
          targetId: entryId
        }
      }
    });

    if (existingVote) {
      return reply.status(409).send({ error: 'Already voted for this entry' });
    }

    await prisma.vote.create({
      data: {
        voterId,
        targetType: 'entry',
        targetId: entryId,
        value: value || 1
      }
    });

    const updatedEntry = await prisma.entry.update({
      where: { id: entryId },
      data: {
        likes: { increment: 1 },
        score: { increment: 10 }
      }
    });

    return { success: true, entry: updatedEntry };
  });

  fastify.post('/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as CompetitionParams;

    const competition = await prisma.competition.update({
      where: { id },
      data: { status: 'active' }
    });

    return { success: true, competition };
  });

  fastify.post('/:id/publish', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as CompetitionParams;
    const competition = await prisma.competition.findUnique({ where: { id } });

    if (!competition) {
      return reply.status(404).send({ error: 'Competition not found' });
    }

    const updated = await prisma.competition.update({
      where: { id },
      data: {
        status: 'active',
        startTime: competition.startTime || new Date()
      }
    });

    return {
      success: true,
      competition: updated,
      shareUrl: `${process.env.ARENA_URL || 'http://localhost:3001'}/game/${id}`
    };
  });

  fastify.get('/:id/share', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as CompetitionParams;
    const competition = await prisma.competition.findUnique({ where: { id } });

    if (!competition) {
      return reply.status(404).send({ error: 'Competition not found' });
    }

    return {
      success: true,
      shareUrl: `${process.env.ARENA_URL || 'http://localhost:3001'}/game/${id}`,
      competition,
    };
  });

  fastify.post('/:id/end', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as CompetitionParams;

    const competition = await prisma.competition.update({
      where: { id },
      data: { status: 'completed' }
    });

    const entries = await prisma.entry.findMany({
      where: { competitionId: id },
      orderBy: { score: 'desc' }
    });

    let rank = 1;
    for (const entry of entries) {
      await prisma.entry.update({
        where: { id: entry.id },
        data: { rank }
      });

      if (rank === 1) {
        await prisma.agent.update({
          where: { id: entry.agentId },
          data: { 
            totalWins: { increment: 1 },
            totalCompetitions: { increment: 1 },
            reputation: { increment: 25 }
          }
        });
      } else if (rank === 2) {
        await prisma.agent.update({
          where: { id: entry.agentId },
          data: { 
            totalCompetitions: { increment: 1 },
            reputation: { increment: 15 }
          }
        });
      } else if (rank === 3) {
        await prisma.agent.update({
          where: { id: entry.agentId },
          data: { 
            totalCompetitions: { increment: 1 },
            reputation: { increment: 10 }
          }
        });
      }
      rank++;
    }

    return { success: true, competition, rankings: entries.map(e => ({ entryId: e.id, rank: e.rank })) };
  });
}
