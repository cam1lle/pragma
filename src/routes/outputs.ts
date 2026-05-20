import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware } from '../lib/auth.js'

const submitOutputSchema = z.object({
  missionId: z.string(),
  taskId: z.string().optional(),
  type: z.enum(['MODEL', 'PIPELINE', 'DATASET', 'ANALYSIS', 'METHODOLOGY']),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  artifactUrl: z.string().url().optional(),
})

async function outputRoutes(app: FastifyInstance) {
  // ── POST /outputs — submit output for validation ──
  app.post(
    '/outputs',
    { preHandler: authMiddleware.bind(null, app) },
    async (req, reply) => {
      const agent = (req as any).agent as { id: string }
      const body = submitOutputSchema.parse(req.body)

      // Verify agent is assigned to the mission
      const assignment = await app.prisma.assignment.findFirst({
        where: { missionId: body.missionId, agentId: agent.id, status: 'ACTIVE' },
      })
      if (!assignment) {
        return reply.code(403).send({ error: 'Agent is not assigned to this mission' })
      }

      // Verify task ownership if taskId provided
      if (body.taskId) {
        const task = await app.prisma.task.findFirst({
          where: { id: body.taskId, missionId: body.missionId },
        })
        if (task && task.claimedByAgentId && task.claimedByAgentId !== agent.id) {
          return reply.code(403).send({ error: 'Agent did not claim this sub-task' })
        }
      }

      const output = await app.prisma.output.create({
        data: {
          missionId: body.missionId,
          agentId: agent.id,
          taskId: body.taskId || null,
          type: body.type,
          title: body.title,
          description: body.description,
          artifactUrl: body.artifactUrl || null,
          status: 'PENDING',
        },
        include: {
          mission: { select: { id: true, slug: true, title: true } },
        },
      })

      // Update task status if associated
      if (body.taskId) {
        await app.prisma.task.update({
          where: { id: body.taskId },
          data: { status: 'IN_PROGRESS' },
        })
      }

      return reply.code(201).send({
        ...output,
        message: 'Output submitted for validation',
      })
    },
  )

  // ── GET /outputs/:id — get output status ──
  app.get('/outputs/:id', async (req) => {
    const { id } = req.params as { id: string }

    const output = await app.prisma.output.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, name: true, framework: true } },
        mission: { select: { id: true, slug: true, title: true } },
        validator: { select: { id: true, name: true, email: true } },
      },
    })

    if (!output) {
      return { error: 'Output not found' }
    }

    return {
      id: output.id,
      mission: output.mission,
      agent: output.agent,
      type: output.type,
      title: output.title,
      description: output.description,
      artifactUrl: output.artifactUrl,
      status: output.status,
      validatorNotes: output.validatorNotes,
      submittedAt: output.submittedAt,
      reviewedAt: output.reviewedAt,
    }
  })

  // ── PATCH /outputs/:id — respond to change request ──
  app.patch(
    '/outputs/:id',
    { preHandler: authMiddleware.bind(null, app) },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { description, artifactUrl } = req.body as { description?: string; artifactUrl?: string }

      const output = await app.prisma.output.findUnique({ where: { id } })
      if (!output) {
        return reply.code(404).send({ error: 'Output not found' })
      }
      if (output.status !== 'CHANGES_REQUESTED') {
        return reply.code(409).send({ error: 'Output is not awaiting changes' })
      }

      const updated = await app.prisma.output.update({
        where: { id },
        data: {
          ...(description && { description }),
          ...(artifactUrl && { artifactUrl }),
          status: 'PENDING',
        },
      })

      return reply.send({ message: 'Output updated and re-submitted for validation', outputId: updated.id })
    },
  )

  // ── GET /missions/:id/outputs — list outputs for a mission ──
  app.get('/missions/:id/outputs', async (req) => {
    const { id } = req.params as { id: string }

    const outputs = await app.prisma.output.findMany({
      where: { missionId: id },
      orderBy: { submittedAt: 'desc' },
      include: {
        agent: { select: { id: true, name: true, framework: true } },
        validator: { select: { id: true, name: true } },
      },
    })

    return {
      missionId: id,
      outputs: outputs.map(o => ({
        id: o.id,
        agentId: o.agent.id,
        agentName: o.agent.name,
        agentFramework: o.agent.framework,
        type: o.type,
        title: o.title,
        status: o.status,
        submittedAt: o.submittedAt,
        reviewedAt: o.reviewedAt,
        validatorName: o.validator?.name,
      })),
    }
  })
}

export default outputRoutes
