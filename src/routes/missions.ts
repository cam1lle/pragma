import { FastifyInstance } from 'fastify'
import { z } from 'zod'

const missionQuerySchema = z.object({
  domain: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  sdg: z.string().optional(),
  search: z.string().optional(),
  limit: z.string().transform(s => parseInt(s, 10)).default('50'),
  offset: z.string().transform(s => parseInt(s, 10)).default('0'),
})

async function missionsRoutes(app: FastifyInstance) {
  // ── GET /missions — list & filter ──
  app.get('/missions', async (req, reply) => {
    const query = missionQuerySchema.parse(req.query)

    const where: Record<string, unknown> = {}
    if (query.domain) where.domain = query.domain
    if (query.priority) where.priority = query.priority
    if (query.status) where.status = query.status
    if (query.sdg) {
      where.sdgAlignment = { has: query.sdg }
    }

    const [total, missions] = await Promise.all([
      app.prisma.mission.count({ where }),
      app.prisma.mission.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              outputs: true,
              assignments: true,
              tasks: true,
            },
          },
          curator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ])

    return {
      data: missions.map(m => ({
        id: m.id,
        slug: m.slug,
        title: m.title,
        description: m.description,
        domain: m.domain,
        priority: m.priority,
        status: m.status,
        sourceFramework: m.sourceFramework,
        sdgAlignment: m.sdgAlignment,
        requiredCapabilities: m.requiredCapabilities,
        successCondition: m.successCondition,
        version: m.version,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        progress: {
          tasksTotal: m._count.tasks,
          tasksComplete: m._count.tasks, // TODO: filter by status
          outputsTotal: m._count.outputs,
          assignmentsTotal: m._count.assignments,
        },
        curator: m.curator,
      })),
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
    }
  })

  // ── GET /missions/:id — full mission detail ──
  app.get('/missions/:id', async (req) => {
    const { id } = req.params as { id: string }

    const mission = await app.prisma.mission.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { createdAt: 'asc' },
          include: {
            _count: {
              select: { outputs: true },
            },
          },
        },
        outputs: {
          orderBy: { submittedAt: 'desc' },
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                framework: true,
                capabilities: true,
              },
            },
            validator: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        assignments: {
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                framework: true,
                capabilities: true,
                isActive: true,
              },
            },
          },
          orderBy: { assignedAt: 'desc' },
        },
        consensusRecord: true,
      },
    })

    if (!mission) {
      return reply.code(404).send({ error: 'Mission not found' })
    }

    return {
      id: mission.id,
      slug: mission.slug,
      title: mission.title,
      description: mission.description,
      domain: mission.domain,
      priority: mission.priority,
      status: mission.status,
      sourceFramework: mission.sourceFramework,
      sdgAlignment: mission.sdgAlignment,
      requiredCapabilities: mission.requiredCapabilities,
      successCondition: mission.successCondition,
      taskDecomposition: mission.taskDecomposition,
      version: mission.version,
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
      tasks: mission.tasks,
      outputs: mission.outputs,
      assignments: mission.assignments,
      consensusRecord: mission.consensusRecord,
    }
  })

  // ── GET /missions/match — matching endpoint (agent-facing) ──
  app.get('/missions/match', async (req) => {
    const agentId = (req.query as Record<string, string>).agent
    const domain = (req.query as Record<string, string>).domain
    const limit = parseInt((req.query as Record<string, string>).limit || '10', 10)

    if (!agentId) {
      return reply.code(400).send({ error: 'agent query param required' })
    }

    // Fetch agent capabilities
    const agent = await app.prisma.agent.findUnique({
      where: { id: agentId },
      select: { capabilities: true, isActive: true },
    })

    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' })
    }
    if (!agent.isActive) {
      return reply.code(403).send({ error: 'Agent is inactive' })
    }

    // Fetch open/in-progress missions
    const missions = await app.prisma.mission.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        ...(domain ? { domain } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2, // fetch extra for scoring
      select: {
        id: true,
        slug: true,
        title: true,
        domain: true,
        priority: true,
        requiredCapabilities: true,
        sdgAlignment: true,
      },
    })

    // Scoring algorithm
    const scored = missions.map(m => {
      const caps = m.requiredCapabilities || []
      const agentCaps = agent.capabilities || []

      // capability overlap (0-50 pts)
      const overlap = caps.filter(c => agentCaps.includes(c)).length
      const capabilityScore = caps.length > 0 ? (overlap / caps.length) * 50 : 0

      // urgency (0-20 pts)
      const priorityPts = { CRITICAL: 20, HIGH: 15, MEDIUM: 10, LOW: 5 }
      const urgencyScore = priorityPts[m.priority as keyof typeof priorityPts] || 10

      // coverage gap (0-20 pts) — fewer assignments = more unserved
      const assignedCount = 0 // TODO: query assignments count
      const coverageGapScore = assignedCount === 0 ? 20 : Math.max(0, 20 - assignedCount * 5)

      // specialization bonus (0-10 pts) — rare caps the mission needs
      const rareCaps = ['low-resource-ml', 'multilingual', 'epidemiology']
      const specializationBonus = caps.filter(c => rareCaps.includes(c) && agentCaps.includes(c)).length * 2.5

      const totalScore = capabilityScore + urgencyScore + coverageGapScore + specializationBonus

      return { ...m, score: Math.round(Math.min(totalScore, 100)) }
    })

    // Filter threshold (≥40) and sort
    const matched = scored
      .filter(m => m.score >= 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return {
      agent: { id: agentId, capabilities: agent.capabilities },
      matched,
      count: matched.length,
    }
  })

  // ── POST /missions — propose a mission ──
  const proposeSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1),
    domain: z.string(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    sourceFramework: z.string().optional(),
    sdgAlignment: z.array(z.string()).optional(),
    requiredCapabilities: z.array(z.string()).optional(),
    successCondition: z.string().optional(),
  })

  app.post('/missions', async (req, reply) => {
    const body = proposeSchema.parse(req.body)

    const slug = body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60)

    // Check for duplicate slug
    const existing = await app.prisma.mission.findUnique({ where: { slug } })
    if (existing) {
      return reply.code(409).send({ error: 'A mission with this title already exists' })
    }

    const mission = await app.prisma.mission.create({
      data: {
        ...body,
        slug,
        status: 'OPEN' as const,
      },
    })

    return reply.code(201).send({ ...mission, message: 'Mission proposed — awaiting curator review' })
  })
}

export default missionsRoutes
