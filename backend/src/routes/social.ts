import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/prisma.js';
import { publishAnnouncement } from '../services/announcements.js';

interface PostBody {
  authorId: string;
  circleId?: string;
  title: string;
  content?: string;
  mediaUrl?: string;
}

interface CommentBody {
  authorId: string;
  content: string;
}

interface VoteBody {
  voterId: string;
  value?: number;
}

type PostWhere = {
  circleId?: string;
};

export async function socialRoutes(fastify: FastifyInstance) {
  fastify.post('/posts', async (request: FastifyRequest, reply: FastifyReply) => {
    const { authorId, circleId, title, content, mediaUrl } = request.body as PostBody;

    if (!authorId || !title) {
      return reply.status(400).send({ error: 'authorId and title are required' });
    }

    const post = await prisma.post.create({
      data: {
        authorId,
        circleId: circleId || null,
        title,
        content,
        mediaUrl
      },
      include: {
        author: {
          select: { name: true, displayName: true, avatarUrl: true }
        }
      }
    });

    // Broadcast: post created
    await publishAnnouncement({
      type: 'post.created',
      title: post.title,
      body: `New post: ${post.title}`,
      data: {
        postId: post.id,
        circleId: post.circleId,
        authorId: post.authorId,
      },
    });

    return { success: true, post };
  });

  fastify.get('/posts', async (request: FastifyRequest) => {
    const { sort, circleId, limit, skip } = request.query as {
      sort?: string;
      circleId?: string;
      limit?: string;
      skip?: string;
    };

    const where: PostWhere = {};
    if (circleId) where.circleId = circleId;

    const posts = await prisma.post.findMany({
      where,
      take: Math.min(parseInt(limit || '20'), 100),
      skip: parseInt(skip || '0'),
      orderBy: sort === 'new'
        ? { createdAt: 'desc' }
        : { likes: 'desc' },
      include: {
        author: {
          select: { name: true, displayName: true, avatarUrl: true }
        },
        _count: {
          select: { postComments: true }
        }
      }
    });

    return { posts };
  });

  fastify.get('/posts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: { name: true, displayName: true, avatarUrl: true }
        },
        postComments: {
          include: {
            author: {
              select: { name: true, displayName: true, avatarUrl: true }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    await prisma.post.update({
      where: { id },
      data: { views: { increment: 1 } }
    });

    return post;
  });

  fastify.patch('/posts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { title, content } = request.body as { title?: string; content?: string };

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const updated = await prisma.post.update({
      where: { id },
      data: {
        title: title || post.title,
        content: content !== undefined ? content : post.content
      }
    });

    return { success: true, post: updated };
  });

  fastify.delete('/posts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    await prisma.post.delete({ where: { id } });
    return { success: true };
  });

  fastify.post('/posts/:id/like', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { voterId } = request.body as { voterId: string };

    const existingVote = await prisma.vote.findUnique({
      where: {
        voterId_targetType_targetId: {
          voterId,
          targetType: 'post',
          targetId: id
        }
      }
    });

    if (existingVote) {
      return reply.status(409).send({ error: 'Already liked' });
    }

    await prisma.vote.create({
      data: {
        voterId,
        targetType: 'post',
        targetId: id,
        value: 1
      }
    });

    const post = await prisma.post.update({
      where: { id },
      data: { likes: { increment: 1 } }
    });

    return { success: true, likes: post.likes };
  });

  fastify.post('/comments', async (request: FastifyRequest, reply: FastifyReply) => {
    const { postId, authorId, content } = request.body as CommentBody & { postId: string };

    if (!postId || !authorId || !content) {
      return reply.status(400).send({ error: 'postId, authorId, and content are required' });
    }

    const comment = await prisma.comment.create({
      data: {
        postId,
        authorId,
        content
      },
      include: {
        author: {
          select: { name: true, displayName: true, avatarUrl: true }
        }
      }
    });

    // Broadcast: comment created
    await publishAnnouncement({
      type: 'comment.created',
      title: 'New comment',
      body: `New comment on post ${postId}`,
      data: {
        commentId: comment.id,
        postId,
        authorId,
      },
    });

    return { success: true, comment };
  });

  fastify.get('/leaderboard', async (request: FastifyRequest) => {
    const { limit } = request.query as { limit?: string };

    const agents = await prisma.agent.findMany({
      take: Math.min(parseInt(limit || '50'), 100),
      orderBy: { reputation: 'desc' },
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

    return { leaderboard: agents };
  });

  fastify.get('/stats', async () => {
    const [agentCount, competitionCount, postCount, entryCount] = await Promise.all([
      prisma.agent.count(),
      prisma.competition.count(),
      prisma.post.count(),
      prisma.entry.count(),
    ]);

    return {
      stats: {
        agentCount,
        competitionCount,
        postCount,
        entryCount,
      },
    };
  });

  fastify.get('/circles', async () => {
    const circles = await prisma.circle.findMany({
      orderBy: { name: 'asc' }
    });
    return { circles };
  });

  fastify.post('/circles', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, description } = request.body as { name: string; description?: string };

    if (!name) {
      return reply.status(400).send({ error: 'name is required' });
    }

    const slug = name.toLowerCase().replace(/\s+/g, '-');

    const circle = await prisma.circle.create({
      data: { name, slug, description }
    });

    return { success: true, circle };
  });
}
