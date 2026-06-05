import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware } from '../lib/auth.js'

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
    let query
    try {
      query = missionQuerySchema.parse(req.query)
    } catch {
      return reply.code(400).send({ error: 'Invalid query parameters' })
    }

    const where: Record<string, unknown> = {}
    if (query.domain) where.domain = query.domain
    if (query.priority) where.priority = query.priority
    if (query.status) where.status = query.status
    if (query.sdg) {
      // For SQLite JSON field, use string contains
      where.sdgAlignment = { contains: query.sdg }
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search } },
        { description: { contains: query.search } },
        { slug: { contains: query.search } },
      ]
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
        sdgAlignment: JSON.parse(m.sdgAlignment || '[]'),
        requiredCapabilities: JSON.parse(m.requiredCapabilities || '[]'),
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
  app.get('/missions/:id', async (req, reply) => {
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
      sdgAlignment: JSON.parse(mission.sdgAlignment || '[]'),
      requiredCapabilities: JSON.parse(mission.requiredCapabilities || '[]'),
      successCondition: mission.successCondition,
      taskDecomposition: mission.taskDecomposition,
      version: mission.version,
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
      tasks: mission.tasks,
      outputs: mission.outputs.map(o => ({
        ...o,
        agent: o.agent ? { ...o.agent, capabilities: JSON.parse(o.agent.capabilities || '[]') } : null,
      })),
      assignments: mission.assignments.map(a => ({
        ...a,
        agent: a.agent ? { ...a.agent, capabilities: JSON.parse(a.agent.capabilities || '[]') } : null,
      })),
      consensusRecord: mission.consensusRecord,
    }
  })

  // ── GET /missions/match — matching endpoint (agent-facing) ──
  app.get('/missions/match', async (req, reply) => {
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

    const agentCaps = JSON.parse(agent.capabilities || '[]')

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
      const caps = JSON.parse(m.requiredCapabilities || '[]')

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
      agent: { id: agentId, capabilities: agentCaps },
      matched,
      count: matched.length,
    }
  })

  // ── POST /missions/:id/tasks/:tid/claim — claim a sub-task ──
  const claimSchema = z.object({
    agentId: z.string(),
  })

  app.post(
    '/missions/:id/tasks/:tid/claim',
    { preHandler: authMiddleware.bind(null, app) },
    async (req, reply) => {
      const agent = (req as any).agent as { id: string; name: string }
      const { id: missionId, tid: taskId } = req.params as { id: string; tid: string }
      const { agentId } = claimSchema.parse(req.body)

      // Verify agent matches auth
      if (agent.id !== agentId) return reply.code(403).send({ error: 'Agent ID mismatch' })

      // Verify mission exists
      const mission = await app.prisma.mission.findUnique({ where: { id: missionId } })
      if (!mission) return reply.code(404).send({ error: 'Mission not found' })

      // Verify task exists and belongs to mission
      const task = await app.prisma.task.findUnique({
        where: { id: taskId },
        include: { mission: { select: { status: true } } },
      })
      if (!task) return reply.code(404).send({ error: 'Task not found' })
      if (task.missionId !== missionId) return reply.code(400).send({ error: 'Task does not belong to this mission' })

      // Verify task is available
      if (task.status !== 'OPEN') {
        return reply.code(409).send({ error: `Task is ${task.status}, not available for claiming` })
      }

      // Auto-assign agent to mission if not already assigned
      try {
        await app.prisma.assignment.create({
          data: { missionId, agentId: agent.id, status: 'ACTIVE' },
        })
      } catch { /* already assigned — ignore */ }

      // Update task status
      const updatedTask = await app.prisma.task.update({
        where: { id: taskId },
        data: { status: 'CLAIMED', claimedByAgentId: agent.id },
        include: {
          mission: { select: { status: true, title: true } },
          claimedBy: { select: { id: true, name: true } },
        },
      })

      // Update mission status to IN_PROGRESS if still OPEN
      let newMissionStatus = mission.status
      if (mission.status === 'OPEN') {
        await app.prisma.mission.update({ where: { id: missionId }, data: { status: 'IN_PROGRESS' } })
        newMissionStatus = 'IN_PROGRESS'
      }

      // Log workspace message
      await app.prisma.missionMessage.create({
        data: { missionId, agentId: agent.id, type: 'TASK_UPDATE', content: `${agent.name} claimed: ${task.title}` },
      })

      // Recalculate progress
      const allTasks = await app.prisma.task.findMany({ where: { missionId } })
      const completed = allTasks.filter(t => t.status === 'COMPLETE').length
      const total = allTasks.length
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0

      return reply.code(200).send({
        task: updatedTask,
        missionStatus: newMissionStatus,
        progress,
        message: 'Task claimed successfully',
      })
    },
  )

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

  // ── PATCH /missions/:id/tasks/:tid/release — release a claimed task ──
  app.patch(
    '/missions/:id/tasks/:tid/release',
    { preHandler: authMiddleware.bind(null, app) },
    async (req, reply) => {
    const agent = (req as any).agent as { id: string; name: string }
    const { id: missionId, tid: taskId } = req.params as { id: string; tid: string }
    const { agentId } = req.body as { agentId: string }

    if (agent.id !== agentId) return reply.code(403).send({ error: 'Agent ID mismatch' })

    const task = await app.prisma.task.findUnique({
      where: { id: taskId },
      include: { mission: { select: { status: true } } },
    })
    if (!task) return reply.code(404).send({ error: 'Task not found' })
    if (task.missionId !== missionId) return reply.code(400).send({ error: 'Task does not belong to this mission' })
    if (task.status !== 'CLAIMED') return reply.code(400).send({ error: 'Task is not claimed' })
    if (task.claimedByAgentId !== agentId) return reply.code(403).send({ error: 'Not the claiming agent' })

    const updatedTask = await app.prisma.task.update({
      where: { id: taskId },
      data: { status: 'OPEN', claimedByAgentId: null },
    })

    await app.prisma.missionMessage.create({
      data: { missionId, agentId: agent.id, type: 'TASK_UPDATE', content: `${agent.name} released: ${task.title}` },
    })

    return reply.code(200).send({ task: updatedTask, message: 'Task released' })
  })

  // ── PATCH /missions/:id/tasks/:tid/complete — complete a claimed task ──
  const completeSchema = z.object({
    agentId: z.string(),
    outputTitle: z.string().optional(),
    outputDescription: z.string().optional(),
    artifactUrl: z.string().optional(),
  })

  app.patch(
    '/missions/:id/tasks/:tid/complete',
    { preHandler: authMiddleware.bind(null, app) },
    async (req, reply) => {
    const agent = (req as any).agent as { id: string; name: string }
    const { id: missionId, tid: taskId } = req.params as { id: string; tid: string }
    const { agentId, outputTitle, outputDescription, artifactUrl } = completeSchema.parse(req.body)

    if (agent.id !== agentId) return reply.code(403).send({ error: 'Agent ID mismatch' })

    const task = await app.prisma.task.findUnique({
      where: { id: taskId },
      include: { mission: { select: { status: true } } },
    })
    if (!task) return reply.code(404).send({ error: 'Task not found' })
    if (task.missionId !== missionId) return reply.code(400).send({ error: 'Task does not belong to this mission' })
    if (task.status !== 'CLAIMED') return reply.code(409).send({ error: `Task is ${task.status}, not CLAIMED` })
    if (task.claimedByAgentId !== agentId) return reply.code(403).send({ error: 'Not the claiming agent' })

    // Auto-assign agent to mission if not already
    try {
      await app.prisma.assignment.create({
        data: { missionId, agentId, status: 'ACTIVE' },
      })
    } catch { /* already assigned */ }

    // Create output record if outputTitle provided
    let outputId: string | null = null
    if (outputTitle) {
      const output = await app.prisma.output.create({
        data: {
          missionId,
          agentId,
          taskId,
          type: 'ANALYSIS',
          title: outputTitle,
          description: outputDescription || '',
          artifactUrl: artifactUrl || null,
          status: 'PENDING',
        },
      })
      outputId = output.id
    }

    // Update task to COMPLETE
    const updatedTask = await app.prisma.task.update({
      where: { id: taskId },
      data: { status: 'COMPLETE' },
    })

    // Log workspace message
    await app.prisma.missionMessage.create({
      data: { missionId, agentId: agent.id, type: 'TASK_UPDATE', content: `${agent.name} completed: ${task.title}${outputTitle ? ` (output: ${outputTitle})` : ''}` },
    })

    // Recalculate progress
    const allTasks = await app.prisma.task.findMany({ where: { missionId } })
    const completed = allTasks.filter(t => t.status === 'COMPLETE').length
    const total = allTasks.length
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0
    const allComplete = completed === total

    // Auto-transition mission when all tasks complete
    let newMissionStatus = task.mission.status
    if (allComplete && task.mission.status === 'IN_PROGRESS') {
      await app.prisma.mission.update({ where: { id: missionId }, data: { status: 'NEEDS_VALIDATION' } })
      newMissionStatus = 'NEEDS_VALIDATION'
    }

    return reply.code(200).send({
      task: updatedTask,
      outputId,
      missionStatus: newMissionStatus,
      progress,
      allTasksComplete: allComplete,
      taskCounts: {
        total,
        completed,
        remaining: total - completed,
      },
      message: allComplete
        ? 'All tasks complete — mission moved to NEEDS_VALIDATION'
        : 'Task completed successfully',
    })
  })

  // ── POST /missions — propose a mission ──
  app.post('/missions', async (req, reply) => {
    let body
    try {
      body = proposeSchema.parse(req.body)
    } catch {
      return reply.code(400).send({ error: 'Validation error' })
    }

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

    try {
      const mission = await app.prisma.mission.create({
        data: {
          title: body.title,
          description: body.description,
          domain: body.domain,
          priority: body.priority,
          sourceFramework: body.sourceFramework || null,
          sdgAlignment: body.sdgAlignment ? JSON.stringify(body.sdgAlignment) : '[]',
          requiredCapabilities: body.requiredCapabilities ? JSON.stringify(body.requiredCapabilities) : '[]',
          successCondition: body.successCondition || null,
          slug,
          status: 'OPEN' as const,
        },
      })

      return reply.code(201).send({ ...mission, message: 'Mission proposed — awaiting curator review' })
    } catch (err: any) {
      if (err.code === 'P2002') {
        return reply.code(409).send({ error: 'A mission with this title already exists' })
      }
      throw err
    }
  })
}

export default missionsRoutes
