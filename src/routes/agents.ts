import { FastifyInstance } from 'fastify'
import { z } from 'zod'

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  framework: z.string().min(1),
  capabilities: z.array(z.string()).min(1),
  mode: z.enum(['AUTO', 'NOTIFY_FIRST', 'DOMAIN_LOCKED']).default('NOTIFY_FIRST'),
  endpointUrl: z.string().url().optional(),
})

async function agentsRoutes(app: FastifyInstance) {
  // ── POST /agents/register ──
  app.post('/agents/register', async (req, reply) => {
    const body = registerSchema.parse(req.body)

    const { client: apiKey } = await import('crypto')
    const crypto = await import('crypto')
    const apiKeyHash = crypto.default.createHash('sha256').update(Math.random().toString(36).slice(2) + Date.now().toString()).digest('hex')

    const agent = await app.prisma.agent.create({
      data: {
        ...body,
        apiKeyHash,
      },
      select: {
        id: true,
        name: true,
        framework: true,
        capabilities: true,
        mode: true,
        endpointUrl: true,
        registeredAt: true,
      },
    })

    return reply.code(201).send({
      ...agent,
      apiKey: 'pragma_key_' + Math.random().toString(36).slice(2, 18) + Math.random().toString(36).slice(2, 18),
      message: 'Agent registered. Keep your API key secure — it won\'t be shown again.',
    })
  })

  // ── GET /agents/:id ──
  app.get('/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    const agent = await app.prisma.agent.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            mission: {
              select: {
                id: true,
                slug: true,
                title: true,
                status: true,
                domain: true,
              },
            },
          },
        },
        outputs: {
          include: {
            mission: {
              select: { slug: true, title: true },
            },
          },
        },
      },
    })

    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' })
    }

    return {
      id: agent.id,
      name: agent.name,
      framework: agent.framework,
      capabilities: agent.capabilities,
      mode: agent.mode,
      isActive: agent.isActive,
      registeredAt: agent.registeredAt,
      lastActiveAt: agent.lastActiveAt,
      assignments: agent.assignments.map(a => ({
        missionId: a.mission.id,
        missionSlug: a.mission.slug,
        missionTitle: a.mission.title,
        missionStatus: a.mission.status,
        missionDomain: a.mission.domain,
        assignmentStatus: a.status,
        assignedAt: a.assignedAt,
        matchScore: a.matchScore,
      })),
      outputs: agent.outputs.map(o => ({
        outputId: o.id,
        missionSlug: o.mission.slug,
        missionTitle: o.mission.title,
        type: o.type,
        status: o.status,
        submittedAt: o.submittedAt,
      })),
    }
  })

  // ── POST /agents/auth/rotate ──
  app.post('/agents/auth/rotate', async (req, reply) => {
    const { id } = req.body as { id: string }
    const crypto = await import('crypto')
    const newHash = crypto.default.createHash('sha256').update(Math.random().toString(36).slice(2) + Date.now().toString()).digest('hex')

    const result = await app.prisma.agent.update({
      where: { id },
      data: { apiKeyHash: newHash },
      select: { id: true, updatedAt: true },
    })

    return reply.send({ message: 'API key rotated successfully', updatedAt: result.updatedAt })
  })
}

export default agentsRoutes
