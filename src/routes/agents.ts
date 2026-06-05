import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

function arr(v: string[]): string { return JSON.stringify(v) }

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  framework: z.string().min(1),
  capabilities: z.array(z.string()).min(1),
  mode: z.enum(['AUTO', 'NOTIFY_FIRST', 'DOMAIN_LOCKED']).default('NOTIFY_FIRST'),
  endpointUrl: z.string().url().optional(),
})

async function agentsRoutes(app: FastifyInstance) {
  // ── GET /agents — list all agents ──
  app.get('/agents', async (req) => {
    const agents = await app.prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        framework: true,
        capabilities: true,
        mode: true,
        isActive: true,
        lastActiveAt: true,
        registeredAt: true,
      },
      orderBy: { registeredAt: 'desc' },
    })
    return agents.map(a => ({
      id: a.id,
      name: a.name,
      framework: a.framework,
      capabilities: JSON.parse(a.capabilities || '[]'),
      mode: a.mode,
      status: a.isActive ? 'working' : 'idle',
      lastActiveAt: a.lastActiveAt,
      registeredAt: a.registeredAt,
    }))
  })

  // ── POST /agents/register ──
  app.post('/agents/register', async (req, reply) => {
    try {
      console.log('[agent] register called, body =', JSON.stringify(req.body).substring(0, 200))
      const body = registerSchema.parse(req.body)
      console.log('[agent] parsed:', JSON.stringify(body))

    const crypto = await import('crypto')
    const rawKey = 'pragma_key_' + Math.random().toString(36).slice(2, 18) + Math.random().toString(36).slice(2, 18)
    const apiKeyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

    const agent = await app.prisma.agent.create({
      data: {
        name: body.name,
        framework: body.framework,
        capabilities: arr(body.capabilities),
        mode: body.mode,
        endpointUrl: body.endpointUrl || null,
        apiKeyHash,
      },
      select: {
        id: true,
        name: true,
        framework: true,
        capabilities: true,
        mode: true,
        endpointUrl: true,
        isActive: true,
        registeredAt: true,
      },
    })

    return reply.code(201).send({
      ...agent,
      capabilities: body.capabilities,
      status: agent.isActive ? 'working' : 'idle',
      apiKey: rawKey,
      message: 'Agent registered. Keep your API key secure — it won\'t be shown again.',
    })
    console.log('[agent] registered:', agent.id)
    } catch (err: any) {
      console.error('[agent] ERROR:', err)
      if (err.name === 'ZodError') {
        return reply.code(400).send({ error: 'Validation error', message: err.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') })
      }
      if (err.code === 'P2002') {
        return reply.code(409).send({ error: 'Agent with this name already exists' })
      }
      return reply.code(500).send({ error: 'Internal server error', message: err.message || String(err) })
    }
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
      capabilities: JSON.parse(agent.capabilities || '[]'),
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
    const body = z.object({ id: z.string() }).parse(req.body)
    const crypto = await import('crypto')
    const newHash = crypto.createHash('sha256').update(Math.random().toString(36).slice(2) + Date.now().toString()).digest('hex')

    const result = await app.prisma.agent.update({
      where: { id: body.id },
      data: { apiKeyHash: newHash },
      select: { id: true, updatedAt: true },
    })

    return reply.send({ message: 'API key rotated successfully', updatedAt: result.updatedAt })
  })
}

export default agentsRoutes
