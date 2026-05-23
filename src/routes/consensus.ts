import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware } from '../lib/auth.js'
import { computeOutputSimilarity, clusterOutputs, synthesizeSolution } from '../lib/similarity.js'

const voteSchema = z.object({
  vote: z.enum(['AFFIRM', 'ABSTAIN', 'DISPUTE']),
  reasoning: z.string().optional(),
})

const startSchema = z.object({
  solutionSummary: z.string().optional(),
  votingDurationMinutes: z.number().min(1).max(10080).default(60), // up to 1 week
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

  // ── POST /consensus/:missionId/start — initiate consensus round ──
  app.post(
    '/consensus/:missionId/start',
    { preHandler: authMiddleware.bind(null, app) },
    async (req, reply) => {
      const { missionId } = req.params as { missionId: string }
      const body = startSchema.parse(req.body || {})

      // Check if consensus already exists
      const existing = await app.prisma.consensusRecord.findUnique({
        where: { missionId },
      })
      if (existing) {
        return reply.code(409).send({
          error: 'Consensus already exists for this mission',
          status: existing.status,
        })
      }

      // Check that the mission has approved outputs to vote on
      const approvedOutputs = await app.prisma.output.findMany({
        where: { missionId, status: 'APPROVED' },
        select: { id: true, title: true, description: true, status: true, agentId: true },
      })

      if (approvedOutputs.length < 2) {
        return reply.code(400).send({
          error: 'Need at least 2 approved outputs to start consensus',
          currentApproved: approvedOutputs.length,
        })
      }

      // Get assigned agents
      const assignments = await app.prisma.assignment.findMany({
        where: { missionId, status: 'ACTIVE' },
        select: { agentId: true },
      })

      // Auto-generate solution summary if not provided
      let solutionSummary = body.solutionSummary
      if (!solutionSummary) {
        solutionSummary = synthesizeSolution(approvedOutputs)
      }

      // Compute output similarity for the record
      const similarity = computeOutputSimilarity(
        approvedOutputs.map((o) => ({ id: o.id, title: o.title, description: o.description }))
      )

      // Create consensus record
      const record = await app.prisma.consensusRecord.create({
        data: {
          missionId,
          solutionSummary,
          status: 'VOTING',
        },
      })

      // Update mission status
      await app.prisma.mission.update({
        where: { id: missionId },
        data: { status: 'CONSENSUS' },
      })

      // Log to workspace
      await app.prisma.missionMessage.create({
        data: {
          missionId,
          type: 'CONSENSUS',
          content: `Consensus round initiated. ${approvedOutputs.length} outputs, ${assignments.length} agents eligible to vote.`,
        },
      })

      return reply.code(201).send({
        message: 'Consensus round started',
        consensusId: record.id,
        eligibleVoters: assignments.length,
        outputsUnderReview: approvedOutputs.length,
        similarity,
      })
    },
  )

  // ── POST /consensus/:missionId/close — manually close voting ──
  app.post(
    '/consensus/:missionId/close',
    { preHandler: authMiddleware.bind(null, app) },
    async (req, reply) => {
      const { missionId } = req.params as { missionId: string }

      const record = await app.prisma.consensusRecord.findUnique({
        where: { missionId },
        include: { votes: { include: { agent: { select: { name: true } } } } },
      })

      if (!record) {
        return reply.code(404).send({ error: 'No consensus found for this mission' })
      }
      if (record.status !== 'VOTING') {
        return reply.code(409).send({ error: `Consensus already ended (status: ${record.status})` })
      }

      // Determine outcome
      const totalVotes = record.voteCount
      const percentAffirm = totalVotes > 0 ? Math.round((record.affirmCount / totalVotes) * 100) : 0
      const thresholdMet = percentAffirm >= 85

      const newStatus = thresholdMet ? 'REACHED' : 'FAILED'

      await app.prisma.consensusRecord.update({
        where: { id: record.id },
        data: {
          status: newStatus,
          thresholdMetAt: thresholdMet ? new Date() : undefined,
        },
      })

      // Update mission status based on outcome
      if (thresholdMet) {
        await app.prisma.mission.update({
          where: { id: missionId },
          data: { status: 'ADVOCATING' },
        })
      }

      // Log
      await app.prisma.missionMessage.create({
        data: {
          missionId,
          type: 'CONSENSUS',
          content: `Consensus closed: ${newStatus}. ${record.affirmCount}/${totalVotes} affirmed (${percentAffirm}% vs 85% threshold).`,
        },
      })

      return reply.code(200).send({
        message: `Consensus ${newStatus.toLowerCase()}`,
        status: newStatus,
        votes: {
          total: totalVotes,
          affirm: record.affirmCount,
          dispute: record.disputeCount,
          abstain: totalVotes - record.affirmCount - record.disputeCount,
          percentage: percentAffirm,
        },
      })
    },
  )

  // ── GET /consensus/:missionId/similarity — output similarity analysis ──
  app.get('/consensus/:missionId/similarity', async (req) => {
    const { missionId } = req.params as { missionId: string }

    const outputs = await app.prisma.output.findMany({
      where: { missionId, status: 'APPROVED' },
      include: { agent: { select: { name: true } } },
    })

    if (outputs.length < 2) {
      return {
        missionId,
        message: 'Need at least 2 approved outputs for similarity analysis',
        outputsCount: outputs.length,
      }
    }

    const plainOutputs = outputs.map((o: any) => ({
      id: o.id,
      title: o.title,
      description: o.description,
    }))

    const pairs = computeOutputSimilarity(plainOutputs)
    const clusters = clusterOutputs(plainOutputs)
    const solution = synthesizeSolution(outputs)

    return {
      missionId,
      outputsCount: outputs.length,
      pairs,
      clusters,
      solutionSummary: solution,
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
