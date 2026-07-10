import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware } from '../lib/auth.js'
import { scoreMission, checkAssignmentMode, categorizeMatches } from '../lib/matching.js'

const matchQuerySchema = z.object({
  limit: z.string().transform(s => parseInt(s, 10)).optional().default('20'),
  offset: z.string().transform(s => parseInt(s, 10)).optional().default('0'),
  minScore: z.string().transform(s => parseInt(s, 10)).optional().default('0'),
  domain: z.string().optional(),
  status: z.string().optional(),
})

async function matchingRoutes(app: FastifyInstance) {
  // ── GET /missions/match — ranked mission matches for an agent ──
  // Also works as: GET /agents/:id/match
  app.get(
    '/match',
    async (req, reply) => {
      const { limit, offset, minScore, domain, status } = matchQuerySchema.parse(req.query)

      // Determine which agent to use:
      // 1. Query param ?agentId=X
      // 2. Authenticated agent (if any)
      const agentId = (req.query as Record<string, string>).agentId
      const authenticatedAgent = (req as any).agent

      let agentIdToUse: string | undefined
      if (agentId) {
        agentIdToUse = agentId
      } else if (authenticatedAgent) {
        agentIdToUse = authenticatedAgent.id
      }

      if (!agentIdToUse) {
        return reply.code(400).send({ error: 'Provide agentId query param or authenticate' })
      }

      const agent = await app.prisma.agent.findUnique({
        where: { id: agentIdToUse },
      })
      if (!agent) {
        return reply.code(404).send({ error: 'Agent not found' })
      }

      // Fetch open/in_progress missions
      const where: Record<string, unknown> = {}
      if (domain) where.domain = domain
      if (status) where.status = status
      else where.status = { in: ['OPEN', 'IN_PROGRESS'] }

      const missions = await app.prisma.mission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })

      // Score each mission
      const agentProfile = {
        id: agent.id,
        name: agent.name,
        capabilities: JSON.parse(agent.capabilities || '[]'),
        mode: agent.mode,
      }

      const scored = missions
        .map(m => scoreMission(m, agentProfile))
        .filter(m => m.matchScore >= minScore)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(offset, offset + limit)

      // Categorize
      const categorized = categorizeMatches(scored)

      return {
        agentId: agent.id,
        agentName: agent.name,
        agentCapabilities: agentProfile.capabilities,
        agentMode: agent.mode,
        totalAvailable: missions.length,
        matches: scored,
        categories: {
          strong: categorized.strong.map(m => ({
            missionId: m.missionId,
            slug: m.slug,
            title: m.title,
            matchScore: m.matchScore,
            reason: m.reason,
          })),
          moderate: categorized.moderate.map(m => ({
            missionId: m.missionId,
            slug: m.slug,
            title: m.title,
            matchScore: m.matchScore,
            reason: m.reason,
          })),
          weak: categorized.weak.map(m => ({
            missionId: m.missionId,
            slug: m.slug,
            title: m.title,
            matchScore: m.matchScore,
            reason: m.reason,
          })),
        },
      }
    },
  )

  // ── GET /agents/:id/match — alias for /missions/match?agentId=X ──
  app.get(
    '/agents/:id/match',
    async (req, reply) => {
      const { id } = req.params as { id: string }

      const agent = await app.prisma.agent.findUnique({
        where: { id },
      })
      if (!agent) {
        return reply.code(404).send({ error: 'Agent not found' })
      }

      // Fetch open/in_progress missions
      const missions = await app.prisma.mission.findMany({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        orderBy: { createdAt: 'desc' },
      })

      const agentProfile = {
        id: agent.id,
        name: agent.name,
        capabilities: JSON.parse(agent.capabilities || '[]'),
        mode: agent.mode,
      }

      const scored = missions
        .map(m => scoreMission(m, agentProfile))
        .filter(m => m.matchScore >= 0)
        .sort((a, b) => b.matchScore - a.matchScore)

      const categorized = categorizeMatches(scored)

      return {
        agentId: agent.id,
        agentName: agent.name,
        agentCapabilities: agentProfile.capabilities,
        agentMode: agent.mode,
        totalAvailable: missions.length,
        matches: scored,
        categories: {
          strong: categorized.strong,
          moderate: categorized.moderate,
          weak: categorized.weak,
        },
      }
    },
  )

  // ── GET /missions/match/push — check for new matches for an agent ──
  // Used by agent polling to discover new matching missions
  app.get(
    '/match/push',
    { preHandler: authMiddleware.bind(null, app) },
    async (req, reply) => {
      const agent = (req as any).agent as { id: string }

      const agentRecord = await app.prisma.agent.findUnique({
        where: { id: agent.id },
      })
      if (!agentRecord) {
        return reply.code(404).send({ error: 'Agent not found' })
      }

      // Get missions the agent is NOT already assigned to
      const assignedMissions = await app.prisma.assignment.findMany({
        where: {
          agentId: agent.id,
          status: 'ACTIVE',
        },
        select: { missionId: true },
      })
      const assignedIds = assignedMissions.map(a => a.missionId)

      const missions = await app.prisma.mission.findMany({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          id: { notIn: assignedIds.length > 0 ? assignedIds : undefined },
        },
        orderBy: { createdAt: 'desc' },
      })

      const agentProfile = {
        id: agent.id,
        name: agentRecord.name,
        capabilities: JSON.parse(agentRecord.capabilities || '[]'),
        mode: agentRecord.mode,
      }

      const scored = missions
        .map(m => scoreMission(m, agentProfile))
        .filter(m => m.matchScore >= 20)
        .sort((a, b) => b.matchScore - a.matchScore)

      return {
        agentId: agent.id,
        agentName: agentRecord.name,
        matches: scored,
        assignedCount: assignedIds.length,
        totalAvailable: missions.length,
      }
    },
  )
}

export default matchingRoutes
