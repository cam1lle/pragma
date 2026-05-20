import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../lib/auth.js'

async function assignmentRoutes(app: FastifyInstance) {
  // ── POST /missions/:id/assign — self-assign to a mission ──
  app.post(
    '/missions/:id/assign',
    { preHandler: authMiddleware.bind(null, app) },
    async (req, reply) => {
      const agent = (req as any).agent as { id: string }
      const { id } = req.params as { id: string }

      // Verify mission exists
      const mission = await app.prisma.mission.findUnique({ where: { id } })
      if (!mission) {
        return reply.code(404).send({ error: 'Mission not found' })
      }
      if (mission.status !== 'OPEN' && mission.status !== 'IN_PROGRESS') {
        return reply.code(409).send({ error: `Mission is not open for assignments (status: ${mission.status})` })
      }

      // Check if already assigned
      const existing = await app.prisma.assignment.findFirst({
        where: { missionId: id, agentId: agent.id },
      })
      if (existing) {
        return reply.code(409).send({ error: 'Agent is already assigned to this mission' })
      }

      // Calculate match score for record-keeping
      const agentCaps = JSON.parse(agent.capabilities || '[]')
      const reqCaps = JSON.parse(mission.requiredCapabilities || '[]')
      const overlap = reqCaps.filter(c => agentCaps.includes(c)).length
      const score = reqCaps.length > 0 ? Math.round((overlap / reqCaps.length) * 100) : 0

      const assignment = await app.prisma.assignment.create({
        data: {
          missionId: id,
          agentId: agent.id,
          matchScore: score,
        },
        include: {
          mission: { select: { id: true, slug: true, title: true, status: true } },
        },
      })

      // Update mission status to IN_PROGRESS if first assignment
      if (mission.status === 'OPEN') {
        await app.prisma.mission.update({
          where: { id },
          data: { status: 'IN_PROGRESS' },
        })
      }

      return reply.code(201).send({
        message: 'Successfully assigned to mission',
        assignment: {
          missionId: assignment.mission.id,
          missionSlug: assignment.mission.slug,
          missionTitle: assignment.mission.title,
          missionStatus: assignment.mission.status,
          matchScore: score,
        },
      })
    },
  )

  // ── DELETE /missions/:id/assign — withdraw from a mission ──
  app.delete(
    '/missions/:id/assign',
    { preHandler: authMiddleware.bind(null, app) },
    async (req, reply) => {
      const agent = (req as any).agent as { id: string }
      const { id } = req.params as { id: string }

      const assignment = await app.prisma.assignment.findFirst({
        where: { missionId: id, agentId: agent.id },
      })
      if (!assignment) {
        return reply.code(404).send({ error: 'No active assignment found for this mission' })
      }

      await app.prisma.assignment.update({
        where: { id: assignment.id },
        data: { status: 'WITHDRAWN' },
      })

      // If mission has no active assignments, revert to OPEN
      const activeAssignments = await app.prisma.assignment.count({
        where: { missionId: id, status: 'ACTIVE' },
      })
      if (activeAssignments === 0) {
        await app.prisma.mission.update({
          where: { id },
          data: { status: 'OPEN' },
        })
      }

      return reply.send({ message: 'Withdrawn from mission successfully' })
    },
  )

  // ── GET /missions/:id/tasks — list sub-tasks for a mission ──
  app.get(
    '/missions/:id/tasks',
    { preHandler: authMiddleware.bind(null, app) },
    async (req) => {
      const { id } = req.params as { id: string }

      const mission = await app.prisma.mission.findUnique({ where: { id } })
      if (!mission) {
        return { error: 'Mission not found' }
      }

      const tasks = await app.prisma.task.findMany({
        where: { missionId: id },
        orderBy: { createdAt: 'asc' },
      })

      return {
        missionId: id,
        missionTitle: mission.title,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description,
          requiredCapabilities: t.requiredCapabilities,
          status: t.status,
          claimedByAgentId: t.claimedByAgentId,
        })),
      }
    },
  )

  // Note: task claiming moved to missions.ts (POST /missions/:id/tasks/:tid/claim)
  // Task release (PATCH /missions/:id/tasks/:tid/release)
  // Task completion (PATCH /missions/:id/tasks/:tid/complete)
}

export default assignmentRoutes
