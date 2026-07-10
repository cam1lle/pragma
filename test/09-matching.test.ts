import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp, cleanup, testAgent, authHeader, createMission } from './helper.js'

describe('Matching Engine', () => {
  let app: Awaited<ReturnType<typeof createApp>>

  before(async () => { app = await createApp() })
  after(async () => { await cleanup() })

  // ── scoreMission unit tests ──

  it('high overlap + high priority = high score', async () => {
    const { scoreMission } = await import('../src/lib/matching.js')
    const mission = {
      id: 'm1', slug: 'test', title: 'Test', domain: 'climate',
      priority: 'HIGH', status: 'OPEN',
      requiredCapabilities: JSON.stringify(['data-analysis', 'nlp']),
      createdAt: new Date(),
    }
    const agent = {
      id: 'a1', name: 'test',
      capabilities: ['data-analysis', 'nlp', 'geospatial'],
      mode: 'AUTO',
    }
    const result = scoreMission(mission, agent)
    assert.ok(result.matchScore >= 70, `Expected high score, got ${result.matchScore}`)
    assert.strictEqual(result.capabilityOverlap, 1.0)
  })

  it('zero overlap = low score', async () => {
    const { scoreMission } = await import('../src/lib/matching.js')
    const mission = {
      id: 'm2', slug: 'test', title: 'Test', domain: 'health',
      priority: 'LOW', status: 'OPEN',
      requiredCapabilities: JSON.stringify(['epidemiology', 'clinical']),
      createdAt: new Date(Date.now() - 60 * 86400000), // old mission
    }
    const agent = {
      id: 'a2', name: 'test',
      capabilities: ['data-analysis', 'nlp'],
      mode: 'AUTO',
    }
    const result = scoreMission(mission, agent)
    assert.ok(result.matchScore < 30, `Expected low score with no overlap, got ${result.matchScore}`)
    assert.strictEqual(result.capabilityOverlap, 0)
  })

  it('recency bonus decays over time', async () => {
    const { scoreMission } = await import('../src/lib/matching.js')
    const recent = {
      id: 'm3', slug: 'test', title: 'Test', domain: 'climate',
      priority: 'MEDIUM', status: 'OPEN',
      requiredCapabilities: JSON.stringify(['data-analysis']),
      createdAt: new Date(),
    }
    const old = {
      id: 'm4', slug: 'test2', title: 'Test2', domain: 'climate',
      priority: 'MEDIUM', status: 'OPEN',
      requiredCapabilities: JSON.stringify(['data-analysis']),
      createdAt: new Date(Date.now() - 60 * 86400000),
    }
    const agent = {
      id: 'a3', name: 'test',
      capabilities: ['data-analysis'],
      mode: 'AUTO',
    }
    const recentScore = scoreMission(recent, agent).matchScore
    const oldScore = scoreMission(old, agent).matchScore
    assert.ok(recentScore > oldScore, `Recent (${recentScore}) should beat old (${oldScore})`)
  })

  it('empty capabilities = no overlap, score from priority only', async () => {
    const { scoreMission } = await import('../src/lib/matching.js')
    const mission = {
      id: 'm5', slug: 'test', title: 'Test', domain: 'climate',
      priority: 'CRITICAL', status: 'OPEN',
      requiredCapabilities: JSON.stringify(['data-analysis']),
      createdAt: new Date(),
    }
    const agent = {
      id: 'a4', name: 'test',
      capabilities: [],
      mode: 'AUTO',
    }
    const result = scoreMission(mission, agent)
    assert.strictEqual(result.capabilityOverlap, 0)
    assert.ok(result.matchScore >= 45, `Expected ~50 from priority+recency, got ${result.matchScore}`)
  })

  // ── checkAssignmentMode tests ──

  it('AUTO always allowed', async () => {
    const { checkAssignmentMode } = await import('../src/lib/matching.js')
    const result = checkAssignmentMode(
      { id: 'a1', name: 'test', capabilities: ['nlp'], mode: 'AUTO' },
      { domain: 'climate', status: 'OPEN' },
    )
    assert.deepStrictEqual(result, { allowed: true })
  })

  it('DOMAIN_LOCKED blocks mismatched domain', async () => {
    const { checkAssignmentMode } = await import('../src/lib/matching.js')
    const result = checkAssignmentMode(
      { id: 'a1', name: 'test', capabilities: ['data-analysis'], mode: 'DOMAIN_LOCKED' },
      { domain: 'health', status: 'OPEN' },
    )
    assert.strictEqual(result.allowed, false)
    assert.ok(result.reason.includes('domain'), 'Should mention domain mismatch')
  })

  it('DOMAIN_LOCKED allows matched domain', async () => {
    const { checkAssignmentMode } = await import('../src/lib/matching.js')
    const result = checkAssignmentMode(
      { id: 'a1', name: 'test', capabilities: ['data-analysis', 'climate'], mode: 'DOMAIN_LOCKED' },
      { domain: 'climate', status: 'OPEN' },
    )
    assert.deepStrictEqual(result, { allowed: true })
  })

  it('DOMAIN_LOCKED with no matching keywords = blocked', async () => {
    const { checkAssignmentMode } = await import('../src/lib/matching.js')
    const result = checkAssignmentMode(
      { id: 'a1', name: 'test', capabilities: ['cooking', 'baking'], mode: 'DOMAIN_LOCKED' },
      { domain: 'climate', status: 'OPEN' },
    )
    assert.strictEqual(result.allowed, false)
  })

  // ── categorizeMatches tests ──

  it('splits by threshold', async () => {
    const { categorizeMatches } = await import('../src/lib/matching.js')
    const matches = [
      { missionId: '1', slug: 'a', title: 'A', domain: 'x', priority: 'HIGH', status: 'OPEN', matchScore: 80, capabilityOverlap: 1, reason: 'good' },
      { missionId: '2', slug: 'b', title: 'B', domain: 'x', priority: 'MEDIUM', status: 'OPEN', matchScore: 50, capabilityOverlap: 0.5, reason: 'ok' },
      { missionId: '3', slug: 'c', title: 'C', domain: 'x', priority: 'LOW', status: 'OPEN', matchScore: 20, capabilityOverlap: 0.1, reason: 'weak' },
    ]
    const cats = categorizeMatches(matches)
    assert.strictEqual(cats.strong.length, 1)
    assert.strictEqual(cats.moderate.length, 1)
    assert.strictEqual(cats.weak.length, 1)
  })

  // ── API endpoint tests ──

  it('GET /missions/match: returns ranked missions', async () => {
    const { agentId, rawKey } = await testAgent(app, 'match-agent', 'openclaw', [
      'data-analysis', 'nlp', 'geospatial',
    ])

    await createMission(app, {
      title: 'Climate Data Analysis',
      domain: 'climate',
      priority: 'CRITICAL',
      requiredCapabilities: ['data-analysis', 'geospatial'],
    })
    await createMission(app, {
      title: 'Health Survey',
      domain: 'health',
      priority: 'LOW',
      requiredCapabilities: ['nlp'],
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/match?agentId=${agentId}&minScore=0`,
    })

    const body = JSON.parse(res.body)
    assert.strictEqual(body.agentId, agentId)
    assert.ok(Array.isArray(body.matches))
    assert.ok(body.matches.length > 0)
    assert.ok(body.matches[0].matchScore >= body.matches[body.matches.length - 1].matchScore)
  })

  it('GET /missions/match: requires agentId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/match',
    })
    assert.strictEqual(res.statusCode, 400)
    assert.ok(JSON.parse(res.body).error.includes('agentId'))
  })

  it('GET /missions/match: filters by domain', async () => {
    const { agentId, rawKey } = await testAgent(app, 'domain-agent', 'openclaw', [
      'data-analysis', 'nlp',
    ])

    await createMission(app, {
      title: 'Climate Mission',
      domain: 'climate',
      priority: 'HIGH',
      requiredCapabilities: ['data-analysis'],
    })
    await createMission(app, {
      title: 'Health Mission',
      domain: 'health',
      priority: 'HIGH',
      requiredCapabilities: ['nlp'],
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/match?agentId=${agentId}&domain=climate`,
    })

    const body = JSON.parse(res.body)
    assert.ok(Array.isArray(body.matches))
    body.matches.forEach((m: any) => {
      assert.strictEqual(m.domain, 'climate')
    })
  })

  it('GET /agents/:id/match: returns agent-specific matches', async () => {
    const { agentId, rawKey } = await testAgent(app, 'agent-match', 'openclaw', [
      'data-analysis', 'nlp',
    ])

    await createMission(app, {
      title: 'NLP Task',
      domain: 'education',
      priority: 'HIGH',
      requiredCapabilities: ['nlp', 'multilingual'],
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/agents/${agentId}/match`,
    })

    const body = JSON.parse(res.body)
    assert.strictEqual(body.agentId, agentId)
    assert.ok(Array.isArray(body.matches))
    assert.ok(body.categories)
    assert.ok(body.categories.strong || body.categories.moderate || body.categories.weak)
  })

  it('GET /agents/:id/match: returns 404 for unknown agent', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/nonexistent/match',
    })
    assert.strictEqual(res.statusCode, 404)
  })

  it('GET /missions/match/push: returns unassigned matching missions', async () => {
    const { agentId, rawKey } = await testAgent(app, 'push-agent', 'openclaw', [
      'data-analysis',
    ])

    await createMission(app, {
      title: 'Push Test Mission',
      domain: 'climate',
      priority: 'HIGH',
      requiredCapabilities: ['data-analysis'],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/match/push',
      headers: { Authorization: authHeader(rawKey) },
    })

    const body = JSON.parse(res.body)
    assert.strictEqual(body.agentId, agentId)
    assert.ok(Array.isArray(body.matches))
    assert.strictEqual(body.assignedCount, 0)
  })

  it('GET /missions/match/push: excludes already-assigned missions', async () => {
    const { agentId, rawKey } = await testAgent(app, 'assigned-agent', 'openclaw', [
      'data-analysis',
    ])

    const { mission } = await createMission(app, {
      title: 'Already Assigned',
      domain: 'climate',
      priority: 'HIGH',
      requiredCapabilities: ['data-analysis'],
    })

    await app.prisma.assignment.create({
      data: { missionId: mission.id, agentId, status: 'ACTIVE' },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/match/push',
      headers: { Authorization: authHeader(rawKey) },
    })

    const body = JSON.parse(res.body)
    assert.strictEqual(body.assignedCount, 1)
    assert.ok(!body.matches.some((m: any) => m.missionId === mission.id))
  })

  it('POST /missions/:id/assign: DOMAIN_LOCKED blocks wrong domain', async () => {
    const { agentId, rawKey } = await testAgent(app, 'locked-agent-2', 'openclaw', [
      'data-analysis',
    ], 'DOMAIN_LOCKED')

    const { mission } = await createMission(app, {
      title: 'Health Mission Alpha',
      domain: 'health',
      priority: 'HIGH',
      requiredCapabilities: ['epidemiology'],
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/missions/${mission.id}/assign`,
      headers: { Authorization: authHeader(rawKey) },
      payload: {},
    })

    assert.strictEqual(res.statusCode, 403)
    const body = JSON.parse(res.body)
    assert.ok(body.error.includes('domain') || body.error.includes('locked'))
  })

  it('POST /missions/:id/assign: AUTO mode allows any domain', async () => {
    const { agentId, rawKey } = await testAgent(app, 'auto-agent', 'openclaw', [
      'data-analysis',
    ], 'AUTO')

    const { mission } = await createMission(app, {
      title: 'Any Domain Mission',
      domain: 'health',
      priority: 'HIGH',
      requiredCapabilities: ['epidemiology'],
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/missions/${mission.id}/assign`,
      headers: { Authorization: authHeader(rawKey) },
      payload: {},
    })

    assert.strictEqual(res.statusCode, 201)
    const body = JSON.parse(res.body)
    assert.strictEqual(body.message, 'Successfully assigned to mission')
  })

  it('POST /missions/:id/assign: NOTIFY_FIRST logs SYSTEM message', async () => {
    const { agentId, rawKey } = await testAgent(app, 'notify-agent', 'openclaw', [
      'data-analysis',
    ], 'NOTIFY_FIRST')

    const { mission } = await createMission(app, {
      title: 'Notify Mission',
      domain: 'climate',
      priority: 'HIGH',
      requiredCapabilities: ['data-analysis'],
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/missions/${mission.id}/assign`,
      headers: { Authorization: authHeader(rawKey) },
      payload: {},
    })

    assert.strictEqual(res.statusCode, 201)

    const messages = await app.prisma.missionMessage.findMany({
      where: { missionId: mission.id },
    })
    const systemMsg = messages.find(m => m.type === 'SYSTEM')
    assert.ok(systemMsg, 'SYSTEM message should be logged for NOTIFY_FIRST')
    assert.ok(systemMsg.content.includes('notify-first'))
  })
})
