/**
 * Test helper — boots the Fastify app against a fresh in-memory SQLite DB.
 *
 * Usage:
 *   import { createApp, cleanup, testAgent, authHeader } from '../test/helper.js'
 *
 * Each test file should call createApp() in a suite setup and cleanup() in teardown.
 */
import Fastify from 'fastify'
import { PrismaClient } from '@prisma/client'
import fastifyCors from '@fastify/cors'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const execFileAsync = promisify(execFile)

let testPrisma: PrismaClient | null = null
let testApp: FastifyInstance | null = null
let tempDbPath: string | null = null

export async function createApp(): Promise<FastifyInstance> {
  // Use a temp file-based SQLite DB so prisma db push can initialize the schema
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pragma-test-'))
  tempDbPath = path.join(tmpDir, 'test.db')

  testPrisma = new PrismaClient({
    datasources: {
      db: { url: `file:${tempDbPath}` },
    },
  })

  // Push the Prisma schema to create all tables
  const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')
  await execFileAsync('npx', ['prisma', 'db', 'push', '--accept-data-loss', '--schema', schemaPath], {
    env: { ...process.env, DATABASE_URL: `file:${tempDbPath}` },
  })

  const app = Fastify()
  await app.register(fastifyCors, { origin: true })
  app.decorate('prisma', testPrisma)
  // Re-import routes (were moved above the imports block)
  const missionsRoutes = (await import('../src/routes/missions.js')).default
  const agentsRoutes = (await import('../src/routes/agents.js')).default
  const assignmentRoutes = (await import('../src/routes/assignments.js')).default
  const matchingRoutes = (await import('../src/routes/matching.js')).default
  const outputRoutes = (await import('../src/routes/outputs.js')).default
  const consensusRoutes = (await import('../src/routes/consensus.js')).default
  const workspaceRoutes = (await import('../src/routes/workspace.js')).default
  const advocacyRoutes = (await import('../src/routes/advocacy.js')).default

  await app.register(missionsRoutes, { prefix: '/api/v1' })
  await app.register(agentsRoutes, { prefix: '/api/v1' })
  await app.register(assignmentRoutes, { prefix: '/api/v1' })
  await app.register(matchingRoutes, { prefix: '/api/v1' })
  await app.register(outputRoutes, { prefix: '/api/v1' })
  await app.register(consensusRoutes, { prefix: '/api/v1' })
  await app.register(workspaceRoutes, { prefix: '/api/v1' })
  await app.register(advocacyRoutes, { prefix: '/api/v1' })

  app.setErrorHandler((err, req, reply) => {
    return reply.code(500).send({ error: 'Internal server error', message: err.message })
  })

  app.get('/health', async () => ({ status: 'ok' }))

  testApp = app
  return app
}

export async function cleanup(): Promise<void> {
  if (testApp) {
    await testApp.close()
    testApp = null
  }
  if (testPrisma) {
    await testPrisma.$disconnect()
    testPrisma = null
  }
  // Clean up temp DB file
  if (tempDbPath) {
    try {
      const tmpDir = path.dirname(tempDbPath)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
    tempDbPath = null
  }
}

/**
 * Register a test agent and return its raw API key and agent record.
 */
export async function testAgent(
  app: FastifyInstance,
  name: string = 'test-agent',
  framework: string = 'openclaw',
  capabilities: string[] = ['data-analysis', 'nlp'],
  mode: 'AUTO' | 'NOTIFY_FIRST' | 'DOMAIN_LOCKED' = 'AUTO',
): Promise<{ agentId: string; rawKey: string }> {
  const crypto = await import('crypto')
  const rawKey = 'pragma_key_' + Math.random().toString(36).slice(2, 18) + Math.random().toString(36).slice(2, 18)
  const apiKeyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

  const agent = await app.prisma.agent.create({
    data: {
      name,
      framework,
      capabilities: JSON.stringify(capabilities),
      apiKeyHash,
      mode,
    },
  })

  return { agentId: agent.id, rawKey }
}

/**
 * Build an Authorization header from a raw API key.
 */
export function authHeader(rawKey: string): string {
  return `Bearer ${rawKey}`
}

/**
 * Seed decision-makers for advocacy tests.
 */
export async function seedDecisionMakers(
  app: FastifyInstance,
  count: number = 5,
): Promise<any[]> {
  const dms = [
    { name: 'Dr. Elena Vasquez', role: 'Climate Policy Director', org: 'IPCC', email: 'e.vasquez@ipcc.ch', domains: JSON.stringify(['climate', 'energy', 'environment']), orgType: 'UN', seniority: 'DIRECTOR' },
    { name: 'Sarah Chen', role: 'Sustainability VP', org: 'UNEP', email: 's.chen@unep.org', domains: JSON.stringify(['climate', 'environment', 'sustainability']), orgType: 'UN', seniority: 'EXECUTIVE' },
    { name: 'Carlos Rivera', role: 'Food Systems Lead', org: 'FAO', email: 'c.rivera@fao.org', domains: JSON.stringify(['agriculture', 'food', 'nutrition']), orgType: 'UN', seniority: 'DIRECTOR' },
    { name: 'Dr. Amara Diallo', role: 'Global Health Programs', org: 'WHO', email: 'a.diallo@who.int', domains: JSON.stringify(['health', 'medical', 'epidemiology']), orgType: 'UN', seniority: 'DIRECTOR' },
    { name: 'Lisa Thompson', role: 'Program Director', org: 'UN Development Programme', email: 'l.thompson@undp.org', domains: JSON.stringify(['development', 'policy', 'governance']), orgType: 'UN', seniority: 'DIRECTOR' },
  ]
  const created: any[] = []
  for (const dm of dms.slice(0, count)) {
    const existing = await app.prisma.decisionMaker.findFirst({
      where: { email: dm.email },
    })
    if (existing) {
      await app.prisma.decisionMaker.update({
        where: { id: existing.id },
        data: { verified: true, updatedAt: new Date() },
      })
      created.push({ ...existing, verified: true })
    } else {
      const dm2 = await app.prisma.decisionMaker.create({ data: { ...dm, verified: true } })
      created.push(dm2)
    }
  }
  return created
}

/**
 * Create a mission with optional tasks.
 */
export async function createMission(
  app: FastifyInstance,
  overrides: {
    title?: string
    domain?: string
    priority?: string
    requiredCapabilities?: string[]
    tasks?: Array<{ title: string; description: string }>
  } = {},
): Promise<{ mission: any; tasks: any[] }> {
  const title = overrides.title || 'Test Mission'
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const mission = await app.prisma.mission.create({
    data: {
      slug,
      title,
      description: 'A test mission for API testing.',
      domain: overrides.domain || 'climate',
      priority: (overrides.priority as any) || 'MEDIUM',
      sdgAlignment: JSON.stringify(['SDG 13: Climate Action']),
      requiredCapabilities: JSON.stringify(overrides.requiredCapabilities || ['data-analysis']),
      successCondition: 'Test success condition.',
      status: 'OPEN',
    },
  })

  const tasks: any[] = []
  if (overrides.tasks) {
    for (const t of overrides.tasks) {
      const task = await app.prisma.task.create({
        data: {
          missionId: mission.id,
          title: t.title,
          description: t.description,
          requiredCapabilities: JSON.stringify(overrides.requiredCapabilities || []),
        },
      })
      tasks.push(task)
    }
  }

  return { mission, tasks }
}

/**
 * Assign an agent to a mission.
 */
export async function assignAgent(
  app: FastifyInstance,
  missionId: string,
  agentId: string,
): Promise<void> {
  await app.prisma.assignment.create({
    data: { missionId, agentId, status: 'ACTIVE' },
  })
}

/**
 * Submit and approve an output for a mission (used to set up consensus tests).
 */
export async function createApprovedOutput(
  app: FastifyInstance,
  missionId: string,
  agentId: string,
  title: string,
  description: string,
): Promise<any> {
  const output = await app.prisma.output.create({
    data: {
      missionId,
      agentId,
      type: 'ANALYSIS',
      title,
      description,
      status: 'APPROVED',
    },
  })
  return output
}
