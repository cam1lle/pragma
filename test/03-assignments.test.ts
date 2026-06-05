import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp, cleanup, testAgent, authHeader, createMission, assignAgent } from './helper.js'

describe('Assignments API', () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let agentId: string, rawKey: string, missionId: string

  before(async () => {
    app = await createApp()
    const agent = await testAgent(app, 'assign-agent', 'openclaw', ['data-analysis', 'nlp'])
    agentId = agent.agentId
    rawKey = agent.rawKey
    const { mission } = await createMission(app, {
      title: 'Assignment Test Mission',
      requiredCapabilities: ['data-analysis'],
    })
    missionId = mission.id
  })
  after(async () => { await cleanup() })

  it('POST /missions/:id/assign assigns agent to mission', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/missions/${missionId}/assign`,
      headers: { Authorization: authHeader(rawKey) },
    })
    assert.equal(res.statusCode, 201)
    const body = JSON.parse(res.payload)
    assert.equal(body.assignment.missionId, missionId)
  })

  it('POST /missions/:id/assign rejects double assignment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/missions/${missionId}/assign`,
      headers: { Authorization: authHeader(rawKey) },
    })
    assert.equal(res.statusCode, 409)
  })

  it('POST /missions/:id/assign rejects unauthenticated', async () => {
    const { mission } = await createMission(app, { title: 'Second Mission' })
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/missions/${mission.id}/assign`,
    })
    assert.equal(res.statusCode, 401)
  })

  it('POST /missions/:id/assign rejects unknown mission', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/missions/nonexistent-id/assign',
      headers: { Authorization: authHeader(rawKey) },
    })
    assert.equal(res.statusCode, 404)
  })

  it('POST /missions/:id/assign updates mission status to IN_PROGRESS', async () => {
    const { mission } = await createMission(app, { title: 'Status Change Mission' })
    await app.inject({
      method: 'POST',
      url: `/api/v1/missions/${mission.id}/assign`,
      headers: { Authorization: authHeader(rawKey) },
    })

    const detail = await app.inject({ method: 'GET', url: `/api/v1/missions/${mission.id}` })
    const body = JSON.parse(detail.payload)
    assert.equal(body.status, 'IN_PROGRESS')
  })

  it('Assignment includes match score', async () => {
    const { mission } = await createMission(app, {
      title: 'Score Mission',
      requiredCapabilities: ['data-analysis', 'computer-vision'],
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/missions/${mission.id}/assign`,
      headers: { Authorization: authHeader(rawKey) },
    })
    const body = JSON.parse(res.payload)
    assert.ok(typeof body.assignment.matchScore === 'number')
    // agent has data-analysis but not computer-vision → 50% match
    assert.equal(body.assignment.matchScore, 50)
  })
})
