import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/prisma.js';
import { publishAnnouncement } from '../services/announcements.js';

function parseSince(since?: string): Date | undefined {
  if (!since) return undefined;
  // allow ms timestamp or ISO string
  const maybeMs = Number(since);
  if (!Number.isNaN(maybeMs) && maybeMs > 0) return new Date(maybeMs);
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const adminKey = process.env.ANNOUNCEMENT_ADMIN_KEY;
  if (!adminKey) {
    reply.status(501).send({ error: 'ANNOUNCEMENT_ADMIN_KEY not configured' });
    return false;
  }
  const auth = request.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing authorization' });
    return false;
  }
  const token = auth.slice('Bearer '.length).trim();
  if (token !== adminKey) {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export async function announcementRoutes(fastify: FastifyInstance) {
  /**
   * Agent 轮询拉取公告
   * GET /api/v1/announcements?since=<iso或ms>&types=a,b,c&limit=50
   */
  fastify.get('/', async (request: FastifyRequest) => {
    const { since, types, limit } = request.query as {
      since?: string;
      types?: string;
      limit?: string;
    };

    const where: any = {};
    const sinceDate = parseSince(since);
    if (sinceDate) where.createdAt = { gt: sinceDate };
    if (types) {
      const inTypes = types
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      if (inTypes.length > 0) where.type = { in: inTypes };
    }

    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: Math.min(parseInt(limit || '50', 10), 200),
    });

    return { announcements };
  });

  /**
   * 手动发布公告（用于：幼儿园/课程/skill 还没接入自动发布前的过渡，以及简单测试）
   * POST /api/v1/announcements
   * header: Authorization: Bearer <ANNOUNCEMENT_ADMIN_KEY>
   */
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;

    const { type, title, body, data } = request.body as {
      type?: string;
      title?: string;
      body?: string;
      data?: unknown;
    };

    if (!type) return reply.status(400).send({ error: 'type is required' });

    const announcement = await publishAnnouncement({ type, title, body, data });
    return { success: true, announcement };
  });
}

