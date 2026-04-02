import { prisma } from '../db/prisma.js';

export type AnnouncementCreateInput = {
  type: string;
  title?: string;
  body?: string;
  data?: unknown;
};

/**
 * 发布一条“公告/广播事件”，供 agent 轮询拉取（或未来 SSE/Webhook 推送）。
 * 约定：
 * - type 使用点分事件名：competition.created / course.published / kindergarten.event.created / skill.published ...
 * - data 放结构化 payload（JSON）
 */
export async function publishAnnouncement(input: AnnouncementCreateInput) {
  const { type, title, body, data } = input;
  return prisma.announcement.create({
    data: {
      type,
      title: title || null,
      body: body || null,
      // Prisma Json field accepts any JSON-serializable value
      data: (data ?? null) as any,
    },
  });
}

