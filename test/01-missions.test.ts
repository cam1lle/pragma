import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp, cleanup, testAgent, authHeader, createMission, assignAgent } from './helper.js'

describe('Missions API', () => {
  let app: Awaited<ReturnType<typeof createApp>>

  before(async () => { app = await createApp() })
  after(async () => { await cleanup() })

  it('POST /missions creates a new mission', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/missions',
      payload: {
        title: 'Reduce Ocean Plastic Pollution',
        description: 'Develop ML models to track and predict ocean plastic accumulation.',
        domain: 'environment',
        priority: 'HIGH',
        requiredCapabilities: ['data-analysis', 'computer-vision'],
        sdgAlignment: ['SDG 14: Life Below Water'],
        successCondition: 'Model achieves >90% accuracy in plastic accumulation prediction.',
      },
    })
    assert.equal(res.statusCode, 201)
    const body = JSON.parse(res.payload)
    assert.equal(body.title, 'Reduce Ocean Plastic Pollution')
    assert.equal(body.slug, 'reduce-ocean-plastic-pollution')
    assert.equal(body.status, 'OPEN')
  })

  it('POST /missions rejects duplicate title', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/missions',
      payload: {
        title: 'Duplicate Test',
        description: 'First',
        domain: 'climate',
      },
    })
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/missions',
      payload: {
        title: 'Duplicate Test',
        description: 'Second',
        domain: 'climate',
      },
    })
    assert.equal(res2.statusCode, 409)
  })

  it('POST /missions rejects invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/missions',
      payload: {},
    })
    assert.equal(res.statusCode, 400)
  })

  it('GET /missions lists missions', async () => {
    await createMission(app, { title: 'List Test A' })
    await createMission(app, { title: 'List Test B', domain: 'health' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/missions' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.data.length >= 2)
    assert.ok(body.pagination)
    assert.ok(body.pagination.total >= 2)
  })

  it('GET /missions?domain=health filters by domain', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/missions?domain=health' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    for (const m of body.data) {
      assert.equal(m.domain, 'health')
    }
  })

  it('GET /missions?search=plastic filters by search', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/missions?search=plastic' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    for (const m of body.data) {
      assert.ok(
        m.title.toLowerCase().includes('plastic') ||
        m.description.toLowerCase().includes('plastic') ||
        m.slug.toLowerCase().includes('plastic'),
      )
    }
  })

  it('GET /missions/:id returns mission detail', async () => {
    const { mission } = await createMission(app, {
      title: 'Detail Test Mission',
      tasks: [
        { title: 'Subtask 1', description: 'Do thing 1' },
        { title: 'Subtask 2', description: 'Do thing 2' },
      ],
    })

    const res = await app.inject({ method: 'GET', url: `/api/v1/missions/${mission.id}` })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.equal(body.title, 'Detail Test Mission')
    assert.equal(body.tasks.length, 2)
  })

  it('GET /missions/:id returns 404 for unknown mission', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/missions/nonexistent-id' })
    assert.equal(res.statusCode, 404)
  })

  it('GET /missions/match returns scored matches for agent', async () => {
    const { agentId } = await testAgent(app, 'match-agent', 'openclaw', ['data-analysis', 'nlp'])
    await createMission(app, {
      title: 'Match Test Mission',
      requiredCapabilities: ['data-analysis'],
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/missions/match?agent=${agentId}`,
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.matched.length >= 1)
    assert.ok(body.matched[0].score >= 40)
  })

  it('GET /missions/match rejects missing agent param', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/missions/match' })
    assert.equal(res.statusCode, 400)
  })

  it('GET /missions?sdg=SDG+13 filters by SDG alignment', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/missions?sdg=SDG 13' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    for (const m of body.data) {
      assert.ok(m.sdgAlignment.some((s: string) => s.includes('SDG 13')))
    }
  })

  it('GET /missions respects pagination', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/missions?limit=2&offset=0' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.data.length <= 2)
    assert.equal(body.pagination.limit, 2)
    assert.equal(body.pagination.offset, 0)
  })
})
