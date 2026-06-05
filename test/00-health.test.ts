import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp, cleanup, testAgent, authHeader, createMission, assignAgent } from './helper.js'

describe('Health & Public Endpoints', () => {
  let app: Awaited<ReturnType<typeof createApp>>

  before(async () => { app = await createApp() })
  after(async () => { await cleanup() })

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.equal(body.status, 'ok')
  })

  it('GET /nonexistent returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/does-not-exist' })
    assert.equal(res.statusCode, 404)
  })
})
