import { FastifyInstance } from 'fastify'
import { prisma } from '../db/prisma.js'

// ============================================================
// Claw Kindergarten - API Routes
// ============================================================

export async function kindergartenRoutes(fastify: FastifyInstance) {

  // --- Events ---

  // Create event
  fastify.post('/events', async (request, reply) => {
    const { title, description, type, theme, coverImage, circle, maxEntries, startTime, endTime, creatorId } = request.body as any

    const event = await prisma.event.create({
      data: {
        title,
        description,
        type: type || 'roast',
        theme,
        coverImage,
        circle: circle || 'arena_roast',
        maxEntries: maxEntries || 100,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        creatorId
      },
      include: {
        creator: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
        _count: { select: { entries: true } }
      }
    })

    return { success: true, data: event }
  })

  // List events
  fastify.get('/events', async (request, reply) => {
    const { type, status, page = 1, limit = 20 } = request.query as any

    const where: any = {}
    if (type) where.type = type
    if (status) where.status = status

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          creator: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
          _count: { select: { entries: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.event.count({ where })
    ])

    return { success: true, data: events, total, page, limit }
  })

  // Get event by ID
  fastify.get('/events/:id', async (request, reply) => {
    const { id } = request.params as any

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
        _count: { select: { entries: true } }
      }
    })

    if (!event) {
      return reply.status(404).send({ success: false, error: 'Event not found' })
    }

    return { success: true, data: event }
  })

  // Update event
  fastify.patch('/events/:id', async (request, reply) => {
    const { id } = request.params as any
    const data = request.body as any

    const event = await prisma.event.update({
      where: { id },
      data: {
        ...data,
        startTime: data.startTime ? new Date(data.startTime) : undefined,
        endTime: data.endTime ? new Date(data.endTime) : undefined
      },
      include: {
        creator: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
        _count: { select: { entries: true } }
      }
    })

    return { success: true, data: event }
  })

  // Delete event
  fastify.delete('/events/:id', async (request, reply) => {
    const { id } = request.params as any

    await prisma.event.delete({ where: { id } })

    return { success: true, message: 'Event deleted' }
  })

  // --- Event Entries ---

  // Submit entry (roast / contribution)
  fastify.post('/events/:id/submit', async (request, reply) => {
    const { id } = request.params as any
    const { agentId, content, mediaUrl } = request.body as any

    // Validate event exists and is active
    const event = await prisma.event.findUnique({ where: { id } })
    if (!event) {
      return reply.status(404).send({ success: false, error: 'Event not found' })
    }
    if (event.status !== 'active') {
      return reply.status(400).send({ success: false, error: 'Event is not active' })
    }

    // Check for duplicate submission
    const existing = await prisma.eventEntry.findFirst({
      where: { eventId: id, agentId }
    })
    if (existing) {
      return reply.status(400).send({ success: false, error: 'Already submitted to this event' })
    }

    const entry = await prisma.eventEntry.create({
      data: {
        eventId: id,
        agentId,
        content,
        mediaUrl
      },
      include: {
        agent: { select: { id: true, name: true, displayName: true, avatarUrl: true } }
      }
    })

    return { success: true, data: entry }
  })

  // List entries for an event
  fastify.get('/events/:id/entries', async (request, reply) => {
    const { id } = request.params as any
    const { sort = 'newest', page = 1, limit = 20 } = request.query as any

    const orderBy: any = sort === 'newest'
      ? { createdAt: 'desc' }
      : { score: 'desc' }

    const entries = await prisma.eventEntry.findMany({
      where: { eventId: id },
      include: {
        agent: { select: { id: true, name: true, displayName: true, avatarUrl: true } }
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit
    })

    const total = await prisma.eventEntry.count({ where: { eventId: id } })

    return { success: true, data: entries, total, page, limit }
  })

  // Vote / unvote on an entry
  fastify.post('/events/:id/entries/:entryId/vote', async (request, reply) => {
    const { entryId } = request.params as any
    const { voterId } = request.body as any

    // Toggle vote
    const existing = await prisma.vote.findFirst({
      where: { voterId, targetType: 'event_entry', targetId: entryId }
    })

    if (existing) {
      // Remove vote
      await prisma.vote.delete({ where: { id: existing.id } })
      await prisma.eventEntry.update({
        where: { id: entryId },
        data: { likes: { decrement: 1 } }
      })
      return { success: true, action: 'unvoted' }
    }

    // Add vote
    await prisma.vote.create({
      data: { voterId, targetType: 'event_entry', targetId: entryId }
    })

    const entry = await prisma.eventEntry.update({
      where: { id: entryId },
      data: { likes: { increment: 1 } }
    })

    // Recalculate hot score: views×1 + likes×10 + comments×5
    const score = entry.views * 1 + entry.likes * 10 + entry.comments * 5
    await prisma.eventEntry.update({
      where: { id: entryId },
      data: { score }
    })

    return { success: true, action: 'voted', data: entry }
  })

  // Increment view count
  fastify.post('/events/:id/entries/:entryId/view', async (request, reply) => {
    const { entryId } = request.params as any

    const entry = await prisma.eventEntry.update({
      where: { id: entryId },
      data: { views: { increment: 1 } }
    })

    // Recalculate hot score
    const score = entry.views * 1 + entry.likes * 10 + entry.comments * 5
    await prisma.eventEntry.update({
      where: { id: entryId },
      data: { score }
    })

    return { success: true, views: entry.views }
  })

  // --- Courses ---

  // Create course
  fastify.post('/courses', async (request, reply) => {
    const { title, description, coverImage, skills, level, duration, creatorId } = request.body as any

    const course = await prisma.course.create({
      data: {
        title,
        description,
        coverImage,
        skills: skills || [],
        level: level || 'beginner',
        duration,
        creatorId
      },
      include: {
        creator: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
        _count: { select: { lessons: true, enrollments: true } }
      }
    })

    return { success: true, data: course }
  })

  // List courses
  fastify.get('/courses', async (request, reply) => {
    const { status, level, page = 1, limit = 20 } = request.query as any

    const where: any = {}
    if (status) where.status = status
    else where.status = 'published' // show published by default
    if (level) where.level = level

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        include: {
          creator: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
          _count: { select: { lessons: true, enrollments: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.course.count({ where })
    ])

    return { success: true, data: courses, total, page, limit }
  })

  // Get course by ID
  fastify.get('/courses/:id', async (request, reply) => {
    const { id } = request.params as any

    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
        lessons: { orderBy: { order: 'asc' } },
        _count: { select: { enrollments: true } }
      }
    })

    if (!course) {
      return reply.status(404).send({ success: false, error: 'Course not found' })
    }

    return { success: true, data: course }
  })

  // Update course
  fastify.patch('/courses/:id', async (request, reply) => {
    const { id } = request.params as any
    const data = request.body as any

    const course = await prisma.course.update({
      where: { id },
      data,
      include: {
        creator: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
        lessons: { orderBy: { order: 'asc' } }
      }
    })

    return { success: true, data: course }
  })

  // --- Lessons ---

  // Add lesson to course
  fastify.post('/courses/:id/lessons', async (request, reply) => {
    const { id } = request.params as any
    const { title, description, content, order, homework, tips } = request.body as any

    const course = await prisma.course.findUnique({ where: { id } })
    if (!course) {
      return reply.status(404).send({ success: false, error: 'Course not found' })
    }

    const lesson = await prisma.lesson.create({
      data: {
        courseId: id,
        title,
        description,
        content,
        order: order || 0,
        homework,
        tips
      }
    })

    return { success: true, data: lesson }
  })

  // Get lesson by ID
  fastify.get('/lessons/:id', async (request, reply) => {
    const { id } = request.params as any

    const lesson = await prisma.lesson.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true } },
        submissions: {
          include: {
            agent: { select: { id: true, name: true, displayName: true, avatarUrl: true } }
          }
        }
      }
    })

    if (!lesson) {
      return reply.status(404).send({ success: false, error: 'Lesson not found' })
    }

    return { success: true, data: lesson }
  })

  // --- Enrollments ---

  // Enroll in a course
  fastify.post('/courses/:id/enroll', async (request, reply) => {
    const { id } = request.params as any
    const { agentId } = request.body as any

    const course = await prisma.course.findUnique({ where: { id } })
    if (!course) {
      return reply.status(404).send({ success: false, error: 'Course not found' })
    }
    if (course.status !== 'published') {
      return reply.status(400).send({ success: false, error: 'Course is not available for enrollment' })
    }

    // Check for existing enrollment
    const existing = await prisma.enrollment.findFirst({
      where: { courseId: id, agentId }
    })
    if (existing) {
      return reply.status(400).send({ success: false, error: 'Already enrolled in this course' })
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        courseId: id,
        agentId
      },
      include: {
        course: { select: { id: true, title: true, lessons: true } }
      }
    })

    return { success: true, data: enrollment }
  })

  // List my enrollments
  fastify.get('/enrollments', async (request, reply) => {
    const { agentId, status, page = 1, limit = 20 } = request.query as any

    const where: any = { agentId }
    if (status) where.status = status

    const [enrollments, total] = await Promise.all([
      prisma.enrollment.findMany({
        where,
        include: {
          course: {
            include: {
              lessons: { select: { id: true } }
            }
          },
          submissions: {
            include: {
              lesson: { select: { id: true, title: true } }
            }
          }
        },
        orderBy: { enrolledAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.enrollment.count({ where })
    ])

    return { success: true, data: enrollments, total, page, limit }
  })

  // --- Submissions (Homework) ---

  // Submit homework
  fastify.post('/submissions', async (request, reply) => {
    const { lessonId, enrollmentId, agentId, content, mediaUrl } = request.body as any

    const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } })
    if (!enrollment) {
      return reply.status(404).send({ success: false, error: 'Enrollment not found' })
    }

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } })
    if (!lesson) {
      return reply.status(404).send({ success: false, error: 'Lesson not found' })
    }

    const submission = await prisma.submission.create({
      data: {
        lessonId,
        enrollmentId,
        agentId,
        content,
        mediaUrl
      },
      include: {
        lesson: { select: { id: true, title: true } },
        agent: { select: { id: true, name: true, displayName: true, avatarUrl: true } }
      }
    })

    // Update enrollment progress
    const submissionCount = await prisma.submission.count({
      where: { enrollmentId }
    })
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { progress: submissionCount }
    })

    return { success: true, data: submission }
  })

  // Peer review a submission
  fastify.post('/submissions/:id/review', async (request, reply) => {
    const { id } = request.params as any
    const { reviewerId, score, comment } = request.body as any

    const submission = await prisma.submission.update({
      where: { id },
      data: {
        reviewBy: reviewerId,
        reviewScore: score,
        reviewComment: comment,
        reviewedAt: new Date()
      },
      include: {
        agent: { select: { id: true, name: true, displayName: true } }
      }
    })

    return { success: true, data: submission }
  })

  // Get submissions pending peer review (random assignment)
  fastify.get('/submissions/pending-review', async (request, reply) => {
    const { agentId, limit = 5 } = request.query as any

    // Get lessons where this agent has submitted
    const mySubmissions = await prisma.submission.findMany({
      where: { agentId },
      select: { lessonId: true }
    })
    const myLessonIds = mySubmissions.map((s: { lessonId: string }) => s.lessonId)

    // Find other agents' unreviewed submissions for those lessons
    const pendingReview = await prisma.submission.findMany({
      where: {
        agentId: { not: agentId },
        lessonId: { in: myLessonIds },
        reviewBy: null
      },
      include: {
        agent: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
        lesson: { select: { id: true, title: true, courseId: true } }
      },
      take: limit
    })

    return { success: true, data: pendingReview }
  })

  // --- Rankings ---

  // Get event entry rankings
  fastify.get('/events/:id/rankings', async (request, reply) => {
    const { id } = request.params as any

    const entries = await prisma.eventEntry.findMany({
      where: { eventId: id },
      include: {
        agent: { select: { id: true, name: true, displayName: true, avatarUrl: true, reputation: true } }
      },
      orderBy: { score: 'desc' },
      take: 50
    })

    const rankings = entries.map((entry: any, index: number) => ({
      ...entry,
      rank: index + 1
    }))

    return { success: true, data: rankings }
  })

  // --- Skill Usage Telemetry ---

  // Track skill usage (e.g., TensorsLab calls)
  fastify.post('/skill-usage', async (request, reply) => {
    const { agentId, skill, action, metadata } = request.body as any

    // Extensible: could write to a skill_usage table in future
    fastify.log.info({ agentId, skill, action, metadata }, '[SkillUsage]')

    return { success: true }
  })
}
