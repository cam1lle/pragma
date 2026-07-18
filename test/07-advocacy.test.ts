import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp, cleanup, testAgent, authHeader, createMission, assignAgent, createApprovedOutput, seedDecisionMakers } from './helper.js'

describe('Advocacy API', () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let agentId: string, rawKey: string, missionId: string

  before(async () => {
    app = await createApp()
    // Seed decision-makers so matchTargets can find outreach targets
    await seedDecisionMakers(app, 5)
    const agent = await testAgent(app, 'advocacy-agent', 'openclaw', ['data-analysis'])
    agentId = agent.agentId
    rawKey = agent.rawKey
    const { mission } = await createMission(app, {
      title: 'Advocacy Test Mission',
      requiredCapabilities: ['data-analysis'],
    })
    missionId = mission.id
    await assignAgent(app, missionId, agentId)

    // Create approved outputs
    await createApprovedOutput(app, missionId, agentId, 'Output A', 'Climate data analysis with pattern recognition.')
    await createApprovedOutput(app, missionId, agentId, 'Output B', 'Statistical climate analysis with trend detection.')

    // Start and close consensus to reach REACHED state
    await app.inject({
      method: 'POST',
      url: `/api/v1/consensus/${missionId}/start`,
      headers: { Authorization: authHeader(rawKey) },
      payload: { solutionSummary: 'Data-driven climate solution.', votingDurationMinutes: 60 },
    })

    await app.inject({
      method: 'POST',
      url: `/api/v1/consensus/${missionId}/vote`,
      headers: { Authorization: authHeader(rawKey) },
      payload: { vote: 'AFFIRM', reasoning: 'Looks good.' },
    })

    await app.inject({
      method: 'POST',
      url: `/api/v1/consensus/${missionId}/close`,
      headers: { Authorization: authHeader(rawKey) },
    })
  })
  after(async () => { await cleanup() })

  it('GET /advocacy lists all packages', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/advocacy' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(Array.isArray(body.packages))
    assert.ok(body.pagination)
  })

  it('GET /advocacy/:missionId returns 404 before generation', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/advocacy/${missionId}` })
    assert.equal(res.statusCode, 404)
  })

  it('POST /advocacy/:missionId/generate creates advocacy package', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/advocacy/${missionId}/generate`,
    })
    assert.equal(res.statusCode, 201)
    const body = JSON.parse(res.payload)
    assert.ok(body.package)
    assert.ok(body.package.id)
    assert.equal(body.package.status, 'READY')
    assert.ok(body.package.executiveBrief)
    assert.ok(body.package.dataAnnex)
    assert.ok(body.package.outreachTargets >= 1)
  })

  it('POST /advocacy/:missionId/generate rejects duplicate', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/advocacy/${missionId}/generate`,
    })
    assert.equal(res.statusCode, 409)
  })

  it('GET /advocacy/:missionId returns package after generation', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/advocacy/${missionId}` })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.package)
    assert.ok(body.package.executiveBrief)
    assert.ok(body.package.dataAnnex)
    assert.ok(body.package.outreach.length >= 1)
  })

  it('PATCH /advocacy/outreach/:id/approve approves an outreach', async () => {
    const listRes = await app.inject({ method: 'GET', url: `/api/v1/advocacy/${missionId}` })
    const listBody = JSON.parse(listRes.payload)
    const outreachId = listBody.package.outreach[0].id

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/advocacy/outreach/${outreachId}/approve`,
      payload: { approvedBy: 'test-validator' },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.equal(body.outreach.status, 'APPROVED')
  })

  it('POST /advocacy/outreach/:id/send marks outreach as sent', async () => {
    const listRes = await app.inject({ method: 'GET', url: `/api/v1/advocacy/${missionId}` })
    const listBody = JSON.parse(listRes.payload)
    const outreachId = listBody.package.outreach[0].id

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/advocacy/outreach/${outreachId}/send`,
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.equal(body.outreach.status, 'SENT')
  })

  it('PATCH /advocacy/outreach/:id/response records a response', async () => {
    const listRes = await app.inject({ method: 'GET', url: `/api/v1/advocacy/${missionId}` })
    const listBody = JSON.parse(listRes.payload)
    const outreachId = listBody.package.outreach[0].id

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/advocacy/outreach/${outreachId}/response`,
      payload: { notes: 'Positive response from target.' },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.equal(body.outreach.status, 'RESPONDED')
  })

  it('POST /advocacy/outreach/:id/regenerate recreates draft message', async () => {
    // Find a non-SENT outreach to regenerate
    const listRes = await app.inject({ method: 'GET', url: `/api/v1/advocacy/${missionId}` })
    const listBody = JSON.parse(listRes.payload)
    const outreach = listBody.package.outreach.find((o: any) => o.status !== 'SENT') || listBody.package.outreach[0]
    const outreachId = outreach.id

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/advocacy/outreach/${outreachId}/regenerate`,
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.equal(body.outreach.status, 'DRAFT')
    assert.ok(body.outreach.draftMessage)
  })

  it('PATCH /advocacy/outreach/:id/reject clears draft', async () => {
    // Find a DRAFT outreach
    const listRes = await app.inject({ method: 'GET', url: `/api/v1/advocacy/${missionId}` })
    const listBody = JSON.parse(listRes.payload)
    const draftOutreach = listBody.package.outreach.find((o: any) => o.status === 'DRAFT')
    if (!draftOutreach) {
      // Skip if no drafts available
      return
    }

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/advocacy/outreach/${draftOutreach.id}/reject`,
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.equal(body.outreach.status, 'QUEUED')
  })

  it('Executive brief contains mission and consensus data', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/advocacy/${missionId}` })
    const body = JSON.parse(res.payload)
    const brief = body.package.executiveBrief
    assert.equal(brief.mission.title, 'Advocacy Test Mission')
    assert.ok(brief.consensus)
    assert.ok(brief.consensus.solutionSummary)
    assert.ok(brief.generatedAt)
  })

  it('Data annex contains methodology and limitations', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/advocacy/${missionId}` })
    const body = JSON.parse(res.payload)
    const annex = body.package.dataAnnex
    assert.ok(annex.methodology)
    assert.ok(annex.limitations.length >= 1)
    assert.ok(annex.validatedOutputs.length >= 1)
  })
})
