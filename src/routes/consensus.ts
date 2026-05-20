import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware } from '../lib/auth.js'

const voteSchema = z.object({
  vote: z.enum(['AFFIRM', 'ABSTAIN', 'DISPUTE']),
  reasoning: z.string().optional(),
})

async function consensusRoutes(app: FastifyInstance) {
  // ── GET /consensus/:missionId — current consensus state ──
  app.get('/consensus/:missionId', async (req) => {
    const { missionId } = req.params as { missionId: string }

    const record = await app.prisma.consensusRecord.findUnique({
      where: { missionId },
      include: {
        votes: {
          include: {
            agent: { select: { id: true, name: true } },
          },
        },
        mission: { select: { id: true, slug: true, title: true } },
      },
    })

    if (!record) {
      return {
        missionId,
        hasConsensus: false,
        message: 'No consensus process has started for this mission',
      }
    }

    return {
      missionId,
      hasConsensus: true,
      status: record.status,
      solutionSummary: record.solutionSummary,
      votes: {
        total: record.voteCount,
        affirm: record.affirmCount,
        abstain: record.voteCount - record.affirmCount - record.disputeCount,
        dispute: record.disputeCount,
        threshold: 85,
        met: record.thresholdMetAt !== null,
      },
      details: record.votes.map(v => ({
        agentId: v.agent.id,
        agentName: v.agent.name,
        vote: v.vote,
        reasoning: v.reasoning,
        castAt: v.castAt,
      })),
    }
  })

  // ── POST /consensus/:missionId/vote — cast a vote ──
  app.post(
    '/consensus/:missionId/vote',
    { preHandler: authMiddleware.bind(null, app) },
    async (req, reply) => {
      const agent = (req as any).agent as { id: string }
      const { missionId } = req.params as { missionId: string }
      const body = voteSchema.parse(req.body)

      const record = await app.prisma.consensusRecord.findUnique({
        where: { missionId },
        include: {
          votes: { select: { agentId: true } },
        },
      })

      if (!record) {
        return reply.code(404).send({ error: 'No active consensus for this mission' })
      }
      if (record.status !== 'VOTING') {
        return reply.code(409).send({ error: `Consensus has ended (status: ${record.status})` })
      }

      // Check if agent already voted
      const existingVote = record.votes.find(v => v.agentId === agent.id)
      if (existingVote) {
        return reply.code(409).send({ error: 'Agent has already voted in this consensus' })
      }

      // Verify agent is assigned to the mission
      const assignment = await app.prisma.assignment.findFirst({
        where: { missionId, agentId: agent.id, status: 'ACTIVE' },
      })
      if (!assignment) {
        return reply.code(403).send({ error: 'Agent is not assigned to this mission' })
      }

      // Cast vote
      const vote = await app.prisma.consensusVote.create({
        data: {
          consensusId: record.id,
          agentId: agent.id,
          vote: body.vote,
          reasoning: body.reasoning || null,
        },
      })

      // Update counts
      await app.prisma.consensusRecord.update({
        where: { id: record.id },
        data: {
          voteCount: { increment: 1 },
          ...(body.vote === 'AFFIRM' && { affirmCount: { increment: 1 } }),
          ...(body.vote === 'DISPUTE' && { disputeCount: { increment: 1 } }),
        },
      })

      // Check if threshold is met
      const totalVotes = record.voteCount + 1
      const affirmVotes = body.vote === 'AFFIRM' ? record.affirmCount + 1 : record.affirmCount
      const thresholdMet = totalVotes > 0 && (affirmVotes / totalVotes) * 100 >= 85

      if (thresholdMet) {
        await app.prisma.consensusRecord.update({
          where: { id: record.id },
          data: { status: 'REACHED', solutionSummary: body.reasoning || 'Consensus reached via agent vote', thresholdMetAt: new Date() },
        })
        // Update mission status
        await app.prisma.mission.update({
          where: { id: missionId },
          data: { status: 'CONSENSUS' },
        })
      }

      return reply.code(201).send({
        message: 'Vote cast successfully',
        vote: {
          agentId: agent.id,
          vote: body.vote,
          reasoning: body.reasoning || null,
          castAt: vote.castAt,
        },
        consensus: {
          status: thresholdMet ? 'REACHED' : 'VOTING',
          totalVotes,
          affirmCount: affirmVotes,
          percentage: Math.round((affirmVotes / totalVotes) * 100),
        },
      })
    },
  )
}

export default consensusRoutes
