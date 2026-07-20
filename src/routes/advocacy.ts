import { FastifyInstance } from 'fastify'
import { packageToPDFPayload, generateAdvocacyPDF } from '../services/pdf-generator.js'
import { emailService } from '../services/email-service.js'

// ── Draft Message Generation ────────────────────────────────────────────

function generateDraftMessage(
  mission: { title: string; domain: string; description: string; priority: string; successCondition: string },
  consensus: { solutionSummary: string | null; affirmCount: number; totalVotes: number },
  target: { targetName: string; targetRole: string; targetOrg: string }
): string {
  const salutation = `Dear ${target.targetName.split(' ')[0] === 'Dr.' ? `${target.targetName.split(' ')[0]} ${target.targetName.split(' ')[1]}` : target.targetName.split(' ')[0]}`

  const priorityContext = mission.priority === 'CRITICAL'
    ? 'This mission has been classified as critical priority.'
    : mission.priority === 'HIGH'
    ? 'This mission has been classified as high priority.'
    : 'This mission addresses an important gap in our collective response.'

  const consensusContext = consensus.totalVotes > 0
    ? `${consensus.affirmCount} of ${consensus.totalVotes} agents voted to affirm this solution.`
    : 'Multiple agents have independently converged on this approach.'

  return `${salutation},

I'm reaching out on behalf of the Pragma agent coordination platform regarding a consensus solution for: **${mission.title}**.

${priorityContext}

**The Challenge**
${mission.description}

**Agent-Derived Solution**
${consensus.solutionSummary || 'Agents have produced validated outputs that converge on a viable approach.'}

**Consensus Status**
${consensusContext} The solution has passed the platform's validation threshold and is ready for real-world consideration.

**Why ${target.targetOrg}**
Given ${target.targetRole.toLowerCase()} at ${target.targetOrg}, your organization is uniquely positioned to evaluate and potentially operationalize this approach. We'd welcome the opportunity to share the full advocacy package, including the executive brief and data annex.

Would you be open to a brief discussion?

Respectfully,
Pragma Advocacy Team`
}

// ── Match targets to a mission (queries the DecisionMaker DB) ───────────

async function matchTargets(
  app: FastifyInstance,
  mission: { domain: string; requiredCapabilities: string }
): Promise<Array<{ id: string; name: string; role: string; org: string; email: string; score: number }>> {
  const domain = mission.domain.toLowerCase()
  const caps: string[] = mission.requiredCapabilities ? JSON.parse(mission.requiredCapabilities) : []
  const allKeywords = [domain, ...caps]

  // Fetch all decision-makers (limit reasonable for scoring)
  const decisionMakers = await app.prisma.decisionMaker.findMany({
    take: 500,
    where: { verified: true },
  })

  const scored = decisionMakers.map(dm => {
    const dmDomains: string[] = typeof dm.domains === 'string' ? JSON.parse(dm.domains) : (dm.domains as string[])
    let score = 0
    for (const kw of allKeywords) {
      for (const td of dmDomains) {
        if (kw.includes(td) || td.includes(kw)) score++
      }
    }
    // Bonus for high seniority
    const seniorityBonus: Record<string, number> = { STAFF: 0, MANAGER: 2, DIRECTOR: 4, EXECUTIVE: 6, HEAD_OF_ORG: 8 }
    score += seniorityBonus[(dm as any).seniority] || 0
    return { id: dm.id, name: dm.name, role: dm.role, org: dm.org, email: dm.email, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

// ── Data Annex Generation ───────────────────────────────────────────────

function generateDataAnnex(
  mission: any,
  consensus: any,
  approvedOutputs: any[]
): any {
  const capsFrom = (s: string) => s ? JSON.parse(s) : []

  return {
    methodology: {
      framework: 'Pragma Agent Coordination Platform',
      consensusMechanism: 'Multi-agent voting with TF-IDF similarity clustering',
      affirmationThreshold: '67% of voting agents',
      validationProcess: 'Human validator review → Agent consensus vote → Advocacy generation',
    },
    mission: {
      title: mission.title,
      slug: mission.slug,
      domain: mission.domain,
      priority: mission.priority,
      sdgAlignment: capsFrom(mission.sdgAlignment),
      requiredCapabilities: capsFrom(mission.requiredCapabilities),
      successCondition: mission.successCondition,
      sourceFramework: mission.sourceFramework,
    },
    consensus: {
      solutionSummary: consensus.solutionSummary,
      totalVotes: consensus.voteCount,
      affirmCount: consensus.affirmCount,
      disputeCount: consensus.disputeCount,
      thresholdMet: consensus.affirmCount / Math.max(1, consensus.voteCount) >= 0.67,
      closedAt: consensus.thresholdMetAt?.toISOString(),
    },
    validatedOutputs: approvedOutputs.map((o: any) => ({
      id: o.id,
      title: o.title,
      type: o.type,
      description: o.description,
      agent: o.agent?.name || 'Unknown',
      framework: o.agent?.framework || 'Unknown',
      artifactUrl: o.artifactUrl,
      submittedAt: o.submittedAt?.toISOString(),
    })),
    limitations: [
      'Agent outputs are computational recommendations, not field-tested implementations.',
      'Consensus reflects computational agreement, not ground truth.',
      'Human validation has been applied but domain expertise should be independently verified.',
      'Advocacy targets are algorithmically matched and may require manual review for accuracy.',
    ],
    generatedAt: new Date().toISOString(),
  }
}

// ── Advocacy Routes ─────────────────────────────────────────────────────

export default async function advocacyRoutes(app: FastifyInstance) {

  // ── List all advocacy packages ────────────────────────────────────────
  app.get('/advocacy', async (req, reply) => {
    const { status, page = '1', limit = '20' } = req.query as Record<string, string>
    const where: any = {}
    if (status) where.status = status

    const pageNum = Math.max(1, parseInt(page))
    const lim = Math.min(100, Math.max(1, parseInt(limit)))

    const [total, packages] = await Promise.all([
      app.prisma.advocacyPackage.count({ where }),
      app.prisma.advocacyPackage.findMany({
        where,
        skip: (pageNum - 1) * lim,
        take: lim,
        orderBy: { createdAt: 'desc' },
        include: {
          consensus: { select: { status: true, solutionSummary: true } },
          outreach: { select: { id: true, targetName: true, targetOrg: true, status: true } },
        },
      }),
    ])

    return {
      packages: packages.map((p: any) => ({
        id: p.id,
        missionId: p.missionId,
        status: p.status,
        createdAt: p.createdAt,
        executiveBrief: p.executiveBrief ? JSON.parse(p.executiveBrief) : null,
        outreachCount: (p as any).outreach?.length || 0,
      })),
      pagination: { page: pageNum, limit: lim, total, pages: Math.ceil(total / lim) },
    }
  })

  // ── Get advocacy package for a mission ────────────────────────────────
  app.get('/advocacy/:missionId', async (req, reply) => {
    const missionId = (req.params as { missionId: string }).missionId

    const pkg = await app.prisma.advocacyPackage.findFirst({
      where: { missionId },
      include: {
        consensus: true,
        outreach: { orderBy: { id: 'asc' } },
      },
    })

    if (!pkg) return reply.code(404).send({ error: 'No advocacy package for this mission' })

    const outreach = (pkg as any).outreach || []

    return {
      package: {
        id: pkg.id,
        missionId: pkg.missionId,
        status: pkg.status,
        createdAt: pkg.createdAt,
        executiveBrief: pkg.executiveBrief ? JSON.parse(pkg.executiveBrief) : null,
        dataAnnex: pkg.dataAnnex ? JSON.parse(pkg.dataAnnex) : null,
        outreach: outreach.map((o: any) => ({
          id: o.id,
          targetName: o.targetName,
          targetRole: o.targetRole,
          targetOrg: o.targetOrg,
          targetEmail: o.targetEmail,
          status: o.status,
          draftMessage: o.draftMessage || null,
        })),
      },
    }
  })

  // ── Generate advocacy package ─────────────────────────────────────────
  app.post('/advocacy/:missionId/generate', async (req, reply) => {
    const missionId = (req.params as { missionId: string }).missionId

    const mission = await app.prisma.mission.findUnique({ where: { id: missionId } })
    if (!mission) return reply.code(404).send({ error: 'Mission not found' })

    const consensus = await app.prisma.consensusRecord.findUnique({
      where: { missionId },
      include: { votes: { include: { agent: true } } },
    })
    if (!consensus) return reply.code(400).send({ error: 'No consensus record for this mission' })
    if (consensus.status !== 'REACHED') {
      return reply.code(400).send({ error: 'Consensus must be reached before generating advocacy package' })
    }

    // Check if package already exists
    const existing = await app.prisma.advocacyPackage.findUnique({ where: { consensusId: consensus.id } })
    if (existing) {
      return reply.code(409).send({ error: 'Advocacy package already generated', package: existing })
    }

    // Get approved outputs for data annex
    const approvedOutputs = await app.prisma.output.findMany({
      where: { missionId, status: 'APPROVED' },
      include: { agent: { select: { name: true, framework: true } } },
    })

    // Generate executive brief
    const executiveBrief = {
      mission: {
        title: mission.title,
        slug: mission.slug,
        domain: mission.domain,
        priority: mission.priority,
        description: mission.description,
        successCondition: mission.successCondition,
      },
      consensus: {
        solutionSummary: consensus.solutionSummary,
        affirmCount: consensus.affirmCount,
        totalVotes: consensus.voteCount,
        threshold: '67%',
      },
      validatedOutputs: approvedOutputs.map((o: any) => ({
        title: o.title,
        type: o.type,
        agent: o.agent.name,
      })),
      generatedAt: new Date().toISOString(),
    }

    // Generate data annex
    const dataAnnex = generateDataAnnex(mission, consensus, approvedOutputs)

    // Match outreach targets from the DecisionMaker database
    const outreachTargets = await matchTargets(app, mission)

    // Create package
    const pkg = await app.prisma.advocacyPackage.create({
      data: {
        consensusId: consensus.id,
        missionId,
        executiveBrief: JSON.stringify(executiveBrief),
        dataAnnex: JSON.stringify(dataAnnex),
        status: 'READY',
      },
    })

    // Create outreach records with draft messages, linking to DecisionMaker DB
    for (const target of outreachTargets) {
      const draftMessage = generateDraftMessage(
        {
          title: mission.title,
          domain: mission.domain,
          description: mission.description,
          priority: mission.priority,
          successCondition: mission.successCondition,
        },
        {
          solutionSummary: consensus.solutionSummary,
          affirmCount: consensus.affirmCount,
          totalVotes: consensus.voteCount,
        },
        { targetName: target.name, targetRole: target.role, targetOrg: target.org }
      )

      await app.prisma.advocacyOutreach.create({
        data: {
          packageId: pkg.id,
          decisionMakerId: target.id,
          targetName: target.name,
          targetRole: target.role,
          targetOrg: target.org,
          targetEmail: target.email,
          draftMessage,
          status: 'DRAFT',
        },
      })
    }

    // Update mission status
    await app.prisma.mission.update({
      where: { id: missionId },
      data: { status: 'ADVOCATING' },
    })

    // Log in workspace
    await app.prisma.missionMessage.create({
      data: {
        missionId,
        type: 'SYSTEM',
        content: `Advocacy package generated with ${outreachTargets.length} outreach targets. Package includes executive brief and data annex.`,
      },
    })

    return reply.code(201).send({
      package: {
        id: pkg.id,
        status: pkg.status,
        missionId,
        createdAt: pkg.createdAt,
        executiveBrief,
        dataAnnex,
        outreachTargets: outreachTargets.length,
      },
    })
  })

  // ── Approve an outreach item ──────────────────────────────────────────
  app.patch('/advocacy/outreach/:id/approve', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const { approvedBy } = req.body as { approvedBy?: string }

    const outreach = await app.prisma.advocacyOutreach.findUnique({ where: { id } })
    if (!outreach) return reply.code(404).send({ error: 'Outreach record not found' })
    if (outreach.status !== 'DRAFT' && outreach.status !== 'QUEUED') {
      return reply.code(400).send({ error: `Cannot approve outreach in status: ${outreach.status}` })
    }

    const updated = await app.prisma.advocacyOutreach.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: approvedBy || 'system' },
    })

    return { outreach: updated }
  })

  // ── Reject an outreach item ───────────────────────────────────────────
  app.patch('/advocacy/outreach/:id/reject', async (req, reply) => {
    const id = (req.params as { id: string }).id

    const outreach = await app.prisma.advocacyOutreach.findUnique({ where: { id } })
    if (!outreach) return reply.code(404).send({ error: 'Outreach record not found' })

    const updated = await app.prisma.advocacyOutreach.update({
      where: { id },
      data: { status: 'QUEUED', draftMessage: null },
    })

    return { outreach: updated }
  })

  // ── Send an outreach item ─────────────────────────────────────────────
  app.post('/advocacy/outreach/:id/send', async (req, reply) => {
    const id = (req.params as { id: string }).id

    const outreach = await app.prisma.advocacyOutreach.findUnique({
      where: { id },
      include: { package: true },
    })
    if (!outreach) return reply.code(404).send({ error: 'Outreach record not found' })
    if (outreach.status !== 'APPROVED') {
      return reply.code(400).send({ error: `Outreach must be approved before sending (current: ${outreach.status})` })
    }

    // Send email via email service
    const emailSent = await emailService.sendEmail({
      to: outreach.targetEmail,
      subject: `Advocacy Outreach: ${outreach.package?.missionId}`,
      text: outreach.draftMessage,
    })

    if (!emailSent) {
      return reply.code(500).send({ error: 'Failed to send email' })
    }

    const updated = await app.prisma.advocacyOutreach.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    })

    // Update package status
    const pkgOutreach = await app.prisma.advocacyOutreach.findMany({
      where: { packageId: outreach.packageId },
    })
    const allSent = pkgOutreach.every(o => o.status === 'SENT' || o.status === 'RESPONDED')
    await app.prisma.advocacyPackage.update({
      where: { id: outreach.packageId },
      data: { status: allSent ? 'COMPLETE' : 'SENDING' },
    })

    return { outreach: updated }
  })

  // ── Batch send all approved outreach for a package ────────────────────
  app.post('/advocacy/:missionId/batch-send', async (req, reply) => {
    const missionId = (req.params as { missionId: string }).missionId

    const pkg = await app.prisma.advocacyPackage.findFirst({
      where: { missionId },
      include: { outreach: { orderBy: { id: 'asc' } } },
    })
    if (!pkg) return reply.code(404).send({ error: 'No advocacy package for this mission' })

    const outreachList = (pkg as any).outreach as any[]
    const approved = outreachList.filter(o => o.status === 'APPROVED')

    if (approved.length === 0) {
      return reply.code(400).send({ error: 'No approved outreach items to send', sent: 0, failed: 0 })
    }

    // Send all approved outreach in parallel
    const results = await Promise.allSettled(
      approved.map(async (o: any) => {
        try {
          const emailSent = await emailService.sendEmail({
            to: o.targetEmail,
            subject: `Advocacy Outreach: ${o.package?.missionId || missionId}`,
            text: o.draftMessage,
          })

          if (!emailSent) {
            return { id: o.id, target: o.targetName, status: 'FAILED', reason: 'Email service returned false' }
          }

          await app.prisma.advocacyOutreach.update({
            where: { id: o.id },
            data: { status: 'SENT', sentAt: new Date() },
          })

          return { id: o.id, target: o.targetName, status: 'SENT' }
        } catch (err) {
          return { id: o.id, target: o.targetName, status: 'FAILED', reason: (err as Error).message }
        }
      })
    )

    const sent = results.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ status: string }>).value.status === 'SENT').length
    const failed = results.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ status: string }>).value.status === 'FAILED').length
    const errors = results
      .filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ status: string }>).value.status === 'FAILED')
      .map(r => (r as PromiseFulfilledResult<{ id: string; target: string; status: string; reason: string }>).value)

    // Update package status
    const allOutreach = await app.prisma.advocacyOutreach.findMany({
      where: { packageId: pkg.id },
    })
    const allSent = allOutreach.every(o => o.status === 'SENT' || o.status === 'RESPONDED')
    const anyPending = allOutreach.some(o => o.status === 'APPROVED' || o.status === 'DRAFT')
    await app.prisma.advocacyPackage.update({
      where: { id: pkg.id },
      data: {
        status: allSent ? 'COMPLETE' : (anyPending ? 'SENDING' : pkg.status),
      },
    })

    // Log in workspace
    await app.prisma.missionMessage.create({
      data: {
        missionId,
        type: 'SYSTEM',
        content: `Batch send completed: ${sent} sent, ${failed} failed out of ${approved.length} approved outreach items.`,
      },
    })

    return reply.code(200).send({
      sent,
      failed,
      total: approved.length,
      results: results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<{ id: string; target: string; status: string; reason?: string }>).value),
      ...(errors.length > 0 ? { errors } : {}),
    })
  })

  // ── Update outreach response ──────────────────────────────────────────
  app.patch('/advocacy/outreach/:id/response', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const { notes } = req.body as { notes?: string }

    const outreach = await app.prisma.advocacyOutreach.findUnique({ where: { id } })
    if (!outreach) return reply.code(404).send({ error: 'Outreach record not found' })

    const updated = await app.prisma.advocacyOutreach.update({
      where: { id },
      data: {
        status: 'RESPONDED',
        responseReceivedAt: new Date(),
        ...(notes ? { validatorNotes: notes } : {}),
      },
    })

    return { outreach: updated }
  })

  // ── Download advocacy package as PDF ──────────────────────────────────
  app.get('/advocacy/:missionId/pdf', async (req, reply) => {
    const missionId = (req.params as { missionId: string }).missionId

    const pkg = await app.prisma.advocacyPackage.findFirst({
      where: { missionId },
      include: { outreach: { orderBy: { id: 'asc' } } },
    })

    if (!pkg) return reply.code(404).send({ error: 'No advocacy package for this mission' })

    const payload = packageToPDFPayload(
      { executiveBrief: pkg.executiveBrief, dataAnnex: pkg.dataAnnex, missionId },
      (pkg as any).outreach.map((o: any) => ({
        targetName: o.targetName,
        targetRole: o.targetRole,
        targetOrg: o.targetOrg,
        status: o.status,
      }))
    )

    if (!payload) return reply.code(400).send({ error: 'Package missing required data (executive brief or data annex)' })

    try {
      const pdfBuffer = await generateAdvocacyPDF(payload)
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="pragma-${pkg.status.toLowerCase()}-${missionId}.pdf"`)
        .send(pdfBuffer)
    } catch (err) {
      return reply.code(500).send({ error: 'Failed to generate PDF', details: (err as Error).message })
    }
  })

  // ── Regenerate draft message ──────────────────────────────────────────
  app.post('/advocacy/outreach/:id/regenerate', async (req, reply) => {
    const id = (req.params as { id: string }).id

    const outreach = await app.prisma.advocacyOutreach.findUnique({
      where: { id },
      include: { package: true },
    })
    if (!outreach) return reply.code(404).send({ error: 'Outreach record not found' })

    const mission = await app.prisma.mission.findUnique({ where: { id: outreach.package.missionId } })
    if (!mission) return reply.code(404).send({ error: 'Mission not found' })

    const consensus = await app.prisma.consensusRecord.findUnique({
      where: { missionId: mission.id },
    })
    if (!consensus) return reply.code(404).send({ error: 'Consensus record not found' })

    const draftMessage = generateDraftMessage(
      {
        title: mission.title,
        domain: mission.domain,
        description: mission.description,
        priority: mission.priority,
        successCondition: mission.successCondition,
      },
      {
        solutionSummary: consensus.solutionSummary,
        affirmCount: consensus.affirmCount,
        totalVotes: consensus.voteCount,
      },
      {
        targetName: outreach.targetName,
        targetRole: outreach.targetRole,
        targetOrg: outreach.targetOrg,
      }
    )

    const updated = await app.prisma.advocacyOutreach.update({
      where: { id },
      data: { draftMessage, status: 'DRAFT' },
    })

    return { outreach: updated }
  })

  // ── List decision-makers (filtered by domain/orgType/seniority) ───────
  app.get('/decision-makers', async (req, reply) => {
    const { page = '1', limit = '50', domain, orgType, seniority, verified } = req.query as Record<string, string>
    const where: any = {}

    if (domain) where.domains = { contains: `"${domain}"` }
    if (orgType) where.orgType = orgType
    if (seniority) where.seniority = seniority
    if (verified) where.verified = verified === 'true'

    const pageNum = Math.max(1, parseInt(page))
    const lim = Math.min(200, Math.max(1, parseInt(limit)))

    const [total, dms] = await Promise.all([
      app.prisma.decisionMaker.count({ where }),
      app.prisma.decisionMaker.findMany({
        where,
        skip: (pageNum - 1) * lim,
        take: lim,
        orderBy: [{ orgType: 'asc' }, { name: 'asc' }],
      }),
    ])

    return {
      decisionMakers: dms.map((dm: any) => ({
        id: dm.id,
        name: dm.name,
        role: dm.role,
        org: dm.org,
        email: dm.email,
        domains: typeof dm.domains === 'string' ? JSON.parse(dm.domains) : dm.domains,
        orgType: dm.orgType,
        seniority: dm.seniority,
        verified: dm.verified,
      })),
      pagination: { page: pageNum, limit: lim, total, pages: Math.ceil(total / lim) },
    }
  })

  // ── Get a single decision-maker ───────────────────────────────────────
  app.get('/decision-makers/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id

    const dm = await app.prisma.decisionMaker.findUnique({ where: { id } })
    if (!dm) return reply.code(404).send({ error: 'Decision-maker not found' })

    return {
      decisionMaker: {
        id: dm.id,
        name: dm.name,
        role: dm.role,
        org: dm.org,
        email: dm.email,
        domains: typeof dm.domains === 'string' ? JSON.parse(dm.domains) : dm.domains,
        orgType: dm.orgType,
        seniority: dm.seniority,
        verified: dm.verified,
        notes: dm.notes || null,
      },
    }
  })

  // ── Verify a decision-maker ──────────────────────────────────────────
  app.patch('/decision-makers/:id/verify', async (req, reply) => {
    const id = (req.params as { id: string }).id

    const updated = await app.prisma.decisionMaker.update({
      where: { id },
      data: { verified: true, updatedAt: new Date() },
    })

    return { decisionMaker: { id: updated.id, verified: updated.verified } }
  })

  // ── Add a new decision-maker ─────────────────────────────────────────
  app.post('/decision-makers', async (req, reply) => {
    const { name, role, org, email, domains, orgType, seniority, notes } = req.body as {
      name: string
      role: string
      org: string
      email: string
      domains: string[]
      orgType?: string
      seniority?: string
      notes?: string
    }

    const dm = await app.prisma.decisionMaker.create({
      data: {
        name,
        role,
        org,
        email,
        domains: JSON.stringify(domains),
        orgType: orgType || 'OTHER',
        seniority: seniority || 'STAFF',
        notes,
      },
    })

    return reply.code(201).send({ decisionMaker: { ...dm, domains: JSON.parse(dm.domains) } })
  })
}
