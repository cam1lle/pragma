import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp, cleanup, testAgent, authHeader, createMission, assignAgent, createApprovedOutput } from './helper.js'

describe('Consensus API', () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let agent1: { agentId: string; rawKey: string }
  let agent2: { agentId: string; rawKey: string }
  let agent3: { agentId: string; rawKey: string }
  let missionId: string

  before(async () => {
    app = await createApp()

    agent1 = await testAgent(app, 'consensus-agent-1', 'openclaw', ['data-analysis'])
    agent2 = await testAgent(app, 'consensus-agent-2', 'openclaw', ['data-analysis'])
    agent3 = await testAgent(app, 'consensus-agent-3', 'openclaw', ['data-analysis'])

    const { mission } = await createMission(app, {
      title: 'Consensus Test Mission',
      requiredCapabilities: ['data-analysis'],
    })
    missionId = mission.id

    // Assign all agents
    await assignAgent(app, missionId, agent1.agentId)
    await assignAgent(app, missionId, agent2.agentId)
    await assignAgent(app, missionId, agent3.agentId)

    // Create approved outputs (need ≥2 for consensus start)
    await createApprovedOutput(app, missionId, agent1.agentId, 'Output A', 'Analysis of climate data patterns and trends.')
    await createApprovedOutput(app, missionId, agent2.agentId, 'Output B', 'Statistical analysis of climate data with pattern recognition.')
  })
  after(async () => { await cleanup() })

  it('GET /consensus/:missionId returns no consensus initially', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/consensus/${missionId}` })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.equal(body.hasConsensus, false)
  })

  it('POST /consensus/:missionId/start initiates consensus round', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/consensus/${missionId}/start`,
      headers: { Authorization: authHeader(agent1.rawKey) },
      payload: {
        solutionSummary: 'Agents agree on a data-driven approach.',
        votingDurationMinutes: 60,
      },
    })
    assert.equal(res.statusCode, 201)
    const body = JSON.parse(res.payload)
    assert.equal(body.message, 'Consensus round started')
    assert.ok(body.eligibleVoters >= 3)
    assert.ok(body.outputsUnderReview >= 2)
    assert.ok(Array.isArray(body.similarity))
  })

  it('POST /consensus/:missionId/start rejects duplicate', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/consensus/${missionId}/start`,
      headers: { Authorization: authHeader(agent1.rawKey) },
      payload: { solutionSummary: 'Duplicate' },
    })
    assert.equal(res.statusCode, 409)
  })

  it('GET /consensus/:missionId shows voting state', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/consensus/${missionId}` })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.equal(body.hasConsensus, true)
    assert.equal(body.status, 'VOTING')
    assert.ok(body.votingDeadline)
    assert.ok(body.timeRemainingMs > 0)
  })

  it('POST /consensus/:missionId/vote casts a vote', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/consensus/${missionId}/vote`,
      headers: { Authorization: authHeader(agent1.rawKey) },
      payload: {
        vote: 'AFFIRM',
        reasoning: 'The solution looks solid.',
      },
    })
    assert.equal(res.statusCode, 201)
    const body = JSON.parse(res.payload)
    assert.equal(body.message, 'Vote cast successfully')
    assert.equal(body.vote.vote, 'AFFIRM')
  })

  it('POST /consensus/:missionId/vote rejects double vote', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/consensus/${missionId}/vote`,
      headers: { Authorization: authHeader(agent1.rawKey) },
      payload: { vote: 'AFFIRM' },
    })
    assert.equal(res.statusCode, 409)
  })

  it('POST /consensus/:missionId/vote rejects unassigned agent', async () => {
    const unassigned = await testAgent(app, 'unassigned-voter')
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/consensus/${missionId}/vote`,
      headers: { Authorization: authHeader(unassigned.rawKey) },
      payload: { vote: 'AFFIRM' },
    })
    assert.equal(res.statusCode, 403)
  })

  it('GET /consensus/:missionId/similarity returns similarity analysis', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/consensus/${missionId}/similarity` })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.pairs.length >= 1)
    assert.ok(body.clusters.length >= 1)
    assert.ok(body.solutionSummary)
  })

  it('POST /consensus/:missionId/close closes voting', async () => {
    // Cast more votes to have data
    await app.inject({
      method: 'POST',
      url: `/api/v1/consensus/${missionId}/vote`,
      headers: { Authorization: authHeader(agent2.rawKey) },
      payload: { vote: 'AFFIRM' },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/consensus/${missionId}/close`,
      headers: { Authorization: authHeader(agent1.rawKey) },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.status === 'REACHED' || body.status === 'FAILED')
    assert.ok(typeof body.votes.total === 'number')
  })

  it('GET /consensus/:missionId shows final state after close', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/consensus/${missionId}` })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.status === 'REACHED' || body.status === 'FAILED')
    assert.ok(body.votes.details.length >= 2)
  })

  it('POST /consensus/:missionId/close is idempotent for already closed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/consensus/${missionId}/close`,
      headers: { Authorization: authHeader(agent1.rawKey) },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.status === 'REACHED' || body.status === 'FAILED')
  })

  it('POST /consensus/check-timeouts runs timeout check', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/consensus/check-timeouts',
      headers: { Authorization: authHeader(agent1.rawKey) },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(typeof body.closed.length === 'number')
  })
})
