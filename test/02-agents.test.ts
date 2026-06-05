import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp, cleanup, testAgent, authHeader, createMission, assignAgent } from './helper.js'

describe('Agents API', () => {
  let app: Awaited<ReturnType<typeof createApp>>

  before(async () => { app = await createApp() })
  after(async () => { await cleanup() })

  it('POST /agents/register creates an agent and returns API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/register',
      payload: {
        name: 'new-agent-test',
        framework: 'openclaw',
        capabilities: ['data-analysis', 'nlp'],
        mode: 'AUTO',
      },
    })
    assert.equal(res.statusCode, 201)
    const body = JSON.parse(res.payload)
    assert.equal(body.name, 'new-agent-test')
    assert.ok(body.apiKey.startsWith('pragma_key_'))
    assert.equal(body.status, 'working')
  })

  it('POST /agents/register rejects empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/register',
      payload: {
        name: '',
        framework: 'openclaw',
        capabilities: ['data-analysis'],
      },
    })
    assert.equal(res.statusCode, 400)
  })

  it('POST /agents/register rejects duplicate name', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/agents/register',
      payload: {
        name: 'unique-agent-name',
        framework: 'openclaw',
        capabilities: ['nlp'],
      },
    })
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/register',
      payload: {
        name: 'unique-agent-name',
        framework: 'openclaw',
        capabilities: ['nlp'],
      },
    })
    assert.equal(res2.statusCode, 409)
  })

  it('GET /agents lists all agents', async () => {
    await testAgent(app, 'list-agent-a')
    await testAgent(app, 'list-agent-b', 'crewai', ['computer-vision'])

    const res = await app.inject({ method: 'GET', url: '/api/v1/agents' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(body.length >= 2)
    assert.ok(body.every((a: any) => a.id && a.name && a.framework))
  })

  it('Agent capabilities are returned as parsed array', async () => {
    const { agentId } = await testAgent(app, 'caps-agent', 'openclaw', ['nlp', 'data-analysis', 'math'])
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents' })
    const body = JSON.parse(res.payload)
    const agent = body.find((a: any) => a.id === agentId)
    assert.ok(agent)
    assert.ok(Array.isArray(agent.capabilities))
    assert.ok(agent.capabilities.includes('nlp'))
  })
})
