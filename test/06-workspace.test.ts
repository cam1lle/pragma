import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp, cleanup, testAgent, authHeader, createMission, assignAgent } from './helper.js'

describe('Workspace API', () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let agentId: string, rawKey: string, missionId: string

  before(async () => {
    app = await createApp()
    const agent = await testAgent(app, 'workspace-agent', 'openclaw', ['data-analysis'])
    agentId = agent.agentId
    rawKey = agent.rawKey
    const { mission } = await createMission(app, {
      title: 'Workspace Test Mission',
      requiredCapabilities: ['data-analysis'],
      tasks: [
        { title: 'Data Collection', description: 'Collect climate data' },
        { title: 'Analysis', description: 'Analyze patterns' },
      ],
    })
    missionId = mission.id
    await assignAgent(app, missionId, agentId)
  })
  after(async () => { await cleanup() })

  it('POST /missions/:id/workspace/files uploads a file record', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/missions/${missionId}/workspace/files`,
      payload: {
        name: 'climate-data.csv',
        path: 'data/climate-data.csv',
        size: 102400,
        mimeType: 'text/csv',
        checksum: 'abc123',
      },
    })
    assert.equal(res.statusCode, 201)
    const body = JSON.parse(res.payload)
    assert.equal(body.name, 'climate-data.csv')
    assert.equal(body.path, 'data/climate-data.csv')
    assert.equal(body.size, 102400)
  })

  it('POST /missions/:id/workspace/files rejects unknown mission', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/missions/nonexistent-id/workspace/files',
      payload: { name: 'test.txt', path: 'test.txt' },
    })
    assert.equal(res.statusCode, 404)
  })

  it('GET /missions/:id/workspace/files lists files', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/missions/${missionId}/workspace/files` })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.length >= 1)
    assert.ok(body[0].name)
  })

  it('GET /missions/:id/workspace/messages lists messages', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/missions/${missionId}/workspace/messages` })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.data.length >= 1) // file upload creates a SYSTEM message
    assert.ok(body.pagination)
  })

  it('POST /missions/:id/workspace/messages posts a message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/missions/${missionId}/workspace/messages`,
      payload: {
        type: 'INFO',
        content: 'Data collection phase complete.',
      },
    })
    assert.equal(res.statusCode, 201)
    const body = JSON.parse(res.payload)
    assert.equal(body.content, 'Data collection phase complete.')
    assert.equal(body.type, 'INFO')
  })

  it('GET /missions/:id/workspace/summary returns progress summary', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/missions/${missionId}/workspace/summary` })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(typeof body.tasks.total === 'number')
    assert.ok(typeof body.tasks.complete === 'number')
    assert.ok(typeof body.mission.progress === 'number')
    assert.ok(body.assignments)
    assert.ok(body.outputs)
  })
})
