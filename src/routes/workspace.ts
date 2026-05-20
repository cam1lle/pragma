import { FastifyInstance } from 'fastify'

/**
 * Workspace routes — mission file store, message log, and progress summary.
 */
async function workspaceRoutes(app: FastifyInstance) {

  // ── POST /missions/:id/workspace/files — upload a file ──
  app.post('/missions/:id/workspace/files', async (req, reply) => {
    const { id: missionId } = req.params as { id: string }
    const { name, path: filePath, size, mimeType, checksum } = req.body as Record<string, unknown>

    // Verify mission exists
    const mission = await app.prisma.mission.findUnique({ where: { id: missionId } })
    if (!mission) return reply.code(404).send({ error: 'Mission not found' })

    const agentId = (req as any).agentId // set by auth middleware

    const file = await app.prisma.missionFile.create({
      data: {
        missionId,
        agentId: agentId || null,
        name: name as string,
        path: filePath as string,
        size: size ? parseInt(size as string, 10) : null,
        mimeType: mimeType as string || null,
        checksum: checksum as string || null,
      },
    })

    // Log system message
    await app.prisma.missionMessage.create({
      data: {
        missionId,
        type: 'SYSTEM',
        content: `File uploaded: ${file.name}`,
      },
    })

    return reply.code(201).send(file)
  })

  // ── GET /missions/:id/workspace/files — list workspace files ──
  app.get('/missions/:id/workspace/files', async (req) => {
    const { id: missionId } = req.params as { id: string }

    const mission = await app.prisma.mission.findUnique({ where: { id: missionId } })
    if (!mission) return reply.code(404).send({ error: 'Mission not found' })

    const files = await app.prisma.missionFile.findMany({
      where: { missionId },
      orderBy: { createdAt: 'desc' },
      include: {
        agent: {
          select: { id: true, name: true, framework: true },
        },
      },
    })

    return files.map(f => ({
      ...f,
      agent: f.agent ? { ...f.agent, capabilities: JSON.parse(f.agent.capabilities || '[]') } : null,
    }))
  })

  // ── GET /workspace/files/:id — download a file ──
  app.get('/workspace/files/:id', async (req, reply) => {
    const { id } = req.params as { id: string }

    const file = await app.prisma.missionFile.findUnique({
      where: { id },
      include: { mission: { select: { id: true, title: true } } },
    })

    if (!file) return reply.code(404).send({ error: 'File not found' })

    return file
  })

  // ── DELETE /missions/:id/workspace/files/:fileId — remove a file ──
  app.delete('/missions/:id/workspace/files/:fileId', async (req, reply) => {
    const { id: missionId, fileId } = req.params as { id: string; fileId: string }

    const file = await app.prisma.missionFile.findUnique({ where: { id: fileId } })
    if (!file) return reply.code(404).send({ error: 'File not found' })
    if (file.missionId !== missionId) return reply.code(400).send({ error: 'File does not belong to this mission' })

    await app.prisma.missionFile.delete({ where: { id: fileId } })

    // Log system message
    await app.prisma.missionMessage.create({
      data: {
        missionId,
        type: 'SYSTEM',
        content: `File removed: ${file.name}`,
      },
    })

    return reply.code(204).send()
  })

  // ── POST /missions/:id/workspace/messages — add a message ──
  app.post('/missions/:id/workspace/messages', async (req, reply) => {
    const { id: missionId } = req.params as { id: string }
    const { type, content } = req.body as { type?: string; content: string }

    const mission = await app.prisma.mission.findUnique({ where: { id: missionId } })
    if (!mission) return reply.code(404).send({ error: 'Mission not found' })

    const agentId = (req as any).agentId

    const message = await app.prisma.missionMessage.create({
      data: {
        missionId,
        agentId: agentId || null,
        type: (type as string) || 'INFO',
        content,
      },
    })

    return reply.code(201).send(message)
  })

  // ── GET /missions/:id/workspace/messages — list messages ──
  app.get('/missions/:id/workspace/messages', async (req) => {
    const { id: missionId } = req.params as { id: string }
    const limit = parseInt((req.query as Record<string, string>).limit || '50', 10)
    const offset = parseInt((req.query as Record<string, string>).offset || '0', 10)

    const mission = await app.prisma.mission.findUnique({ where: { id: missionId } })
    if (!mission) return reply.code(404).send({ error: 'Mission not found' })

    const messages = await app.prisma.missionMessage.findMany({
      where: { missionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        agent: {
          select: { id: true, name: true, framework: true },
        },
      },
    })

    const total = await app.prisma.missionMessage.count({ where: { missionId } })

    return {
      data: messages.map(m => ({
        ...m,
        agent: m.agent ? { ...m.agent, capabilities: JSON.parse(m.agent.capabilities || '[]') } : null,
      })),
      pagination: { total, limit, offset },
    }
  })

  // ── GET /missions/:id/workspace/summary — progress summary ──
  app.get('/missions/:id/workspace/summary', async (req) => {
    const { id: missionId } = req.params as { id: string }

    const mission = await app.prisma.mission.findUnique({
      where: { id: missionId },
      include: {
        tasks: {
          include: {
            _count: { select: { outputs: true } },
            claimedBy: { select: { id: true, name: true } },
          },
        },
        outputs: true,
        assignments: {
          include: {
            agent: { select: { id: true, name: true, isActive: true } },
          },
        },
      },
    })

    if (!mission) return reply.code(404).send({ error: 'Mission not found' })

    const tasks = mission.tasks
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(t => t.status === 'COMPLETE').length
    const claimedTasks = tasks.filter(t => t.status === 'CLAIMED').length
    const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length
    const openTasks = tasks.filter(t => t.status === 'OPEN').length

    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    const pendingOutputs = mission.outputs.filter(o => o.status === 'PENDING').length
    const approvedOutputs = mission.outputs.filter(o => o.status === 'APPROVED').length

    return {
      mission: {
        id: mission.id,
        title: mission.title,
        status: mission.status,
        progress,
      },
      tasks: {
        total: totalTasks,
        open: openTasks,
        claimed: claimedTasks,
        inProgress: inProgressTasks,
        complete: completedTasks,
      },
      assignments: {
        total: mission.assignments.length,
        active: mission.assignments.filter(a => a.status === 'ACTIVE').length,
      },
      outputs: {
        total: mission.outputs.length,
        pending: pendingOutputs,
        approved: approvedOutputs,
      },
      allTasksComplete: totalTasks > 0 && completedTasks === totalTasks,
    }
  })
}

export default workspaceRoutes
