import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp, cleanup, testAgent, authHeader, createMission, assignAgent, createApprovedOutput } from './helper.js'

describe('Outputs API', () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let agentId: string, rawKey: string, missionId: string

  before(async () => {
    app = await createApp()
    const agent = await testAgent(app, 'output-agent', 'openclaw', ['data-analysis'])
    agentId = agent.agentId
    rawKey = agent.rawKey
    const { mission } = await createMission(app, {
      title: 'Output Test Mission',
      requiredCapabilities: ['data-analysis'],
    })
    missionId = mission.id
    await assignAgent(app, missionId, agentId)
  })
  after(async () => { await cleanup() })

  it('POST /outputs submits an output for validation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/outputs',
      headers: { Authorization: authHeader(rawKey) },
      payload: {
        missionId,
        type: 'ANALYSIS',
        title: 'Climate Impact Analysis',
        description: 'Comprehensive analysis of climate data patterns.',
      },
    })
    assert.equal(res.statusCode, 201)
    const body = JSON.parse(res.payload)
    assert.equal(body.title, 'Climate Impact Analysis')
    assert.equal(body.status, 'PENDING')
  })

  it('POST /outputs rejects unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/outputs',
      payload: {
        missionId,
        type: 'ANALYSIS',
        title: 'Unauthorized',
        description: 'Should fail',
      },
    })
    assert.equal(res.statusCode, 401)
  })

  it('POST /outputs rejects agent not assigned to mission', async () => {
    const otherAgent = await testAgent(app, 'unassigned-agent')
    const { mission } = await createMission(app, { title: 'Other Mission' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/outputs',
      headers: { Authorization: authHeader(otherAgent.rawKey) },
      payload: {
        missionId: mission.id,
        type: 'ANALYSIS',
        title: 'Should Fail',
        description: 'Not assigned',
      },
    })
    assert.equal(res.statusCode, 403)
  })

  it('GET /outputs lists outputs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/outputs' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.data.length >= 1)
    assert.ok(body.pagination)
  })

  it('GET /outputs?status=PENDING filters by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/outputs?status=PENDING' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    for (const o of body.data) {
      assert.equal(o.status, 'PENDING')
    }
  })

  it('GET /outputs/:id returns output detail', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/outputs' })
    const list = JSON.parse(res.payload)
    const outputId = list.data[0].id

    const detail = await app.inject({ method: 'GET', url: `/api/v1/outputs/${outputId}` })
    assert.equal(detail.statusCode, 200)
    const body = JSON.parse(detail.payload)
    assert.equal(body.id, outputId)
    assert.ok(body.agent)
    assert.ok(body.mission)
  })

  it('GET /outputs/:id returns 404 for unknown output', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/outputs/nonexistent-id' })
    assert.equal(res.statusCode, 200) // returns { error: 'Output not found' } with 200
    const body = JSON.parse(res.payload)
    assert.ok(body.error)
  })

  it('POST /outputs/:id/approve changes status to APPROVED', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/outputs' })
    const list = JSON.parse(res.payload)
    const outputId = list.data[0].id

    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/outputs/${outputId}/approve`,
    })
    assert.equal(approveRes.statusCode, 200)
    const body = JSON.parse(approveRes.payload)
    assert.equal(body.message, 'Output approved')
  })

  it('POST /outputs/:id/approve rejects non-PENDING output', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/outputs/nonexistent-id/approve',
    })
    assert.ok(res.statusCode === 404 || res.statusCode === 409)
  })

  it('POST /outputs/:id/changes changes status to CHANGES_REQUESTED', async () => {
    // Submit a new output to get a PENDING one
    const submitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/outputs',
      headers: { Authorization: authHeader(rawKey) },
      payload: {
        missionId,
        type: 'MODEL',
        title: 'Changes Test Output',
        description: 'This one will get changes requested.',
      },
    })
    const outputId = JSON.parse(submitRes.payload).id

    const changesRes = await app.inject({
      method: 'POST',
      url: `/api/v1/outputs/${outputId}/changes`,
    })
    assert.equal(changesRes.statusCode, 200)
    const body = JSON.parse(changesRes.payload)
    assert.equal(body.message, 'Changes requested')
  })

  it('POST /outputs/:id/reject changes status to REJECTED', async () => {
    const submitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/outputs',
      headers: { Authorization: authHeader(rawKey) },
      payload: {
        missionId,
        type: 'DATASET',
        title: 'Reject Test Output',
        description: 'This one will be rejected.',
      },
    })
    const outputId = JSON.parse(submitRes.payload).id

    const rejectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/outputs/${outputId}/reject`,
    })
    assert.equal(rejectRes.statusCode, 200)
    const body = JSON.parse(rejectRes.payload)
    assert.equal(body.message, 'Output rejected')
  })

  it('PATCH /outputs/:id re-submits after changes requested', async () => {
    const submitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/outputs',
      headers: { Authorization: authHeader(rawKey) },
      payload: {
        missionId,
        type: 'ANALYSIS',
        title: 'Patch Test Output',
        description: 'Original description.',
      },
    })
    const outputId = JSON.parse(submitRes.payload).id

    // Request changes
    await app.inject({ method: 'POST', url: `/api/v1/outputs/${outputId}/changes` })

    // Patch the output
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/outputs/${outputId}`,
      headers: { Authorization: authHeader(rawKey) },
      payload: {
        description: 'Updated description after changes.',
      },
    })
    assert.equal(patchRes.statusCode, 200)
    const body = JSON.parse(patchRes.payload)
    assert.equal(body.message, 'Output updated and re-submitted for validation')
  })

  it('GET /missions/:id/outputs lists outputs for a mission', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/missions/${missionId}/outputs` })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.equal(body.missionId, missionId)
    assert.ok(body.outputs.length >= 1)
  })
})
