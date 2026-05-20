import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import { prisma } from './lib/prisma.js'
import missionsRoutes from './routes/missions.js'
import agentsRoutes from './routes/agents.js'
import assignmentRoutes from './routes/assignments.js'
import outputRoutes from './routes/outputs.js'
import consensusRoutes from './routes/consensus.js'
import workspaceRoutes from './routes/workspace.js'

const app = Fastify()

// Register plugins
await app.register(fastifyCors, { origin: true })

// Attach Prisma to the app instance
app.decorate('prisma', prisma)
await app.register(missionsRoutes, { prefix: '/api/v1' })
await app.register(agentsRoutes, { prefix: '/api/v1' })
await app.register(assignmentRoutes, { prefix: '/api/v1' })
await app.register(outputRoutes, { prefix: '/api/v1' })
await app.register(consensusRoutes, { prefix: '/api/v1' })
await app.register(workspaceRoutes, { prefix: '/api/v1' })

// Global error handler
app.setErrorHandler((err, req, reply) => {
  console.error('ERROR:', err.message)
  return reply.code(500).send({ error: 'Internal server error', message: err.message })
})

// Health check
app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }))

// 404 handler
app.setNotFoundHandler(async (req, reply) => {
  return reply.code(404).send({ error: 'Not Found', path: req.url })
})

// Graceful shutdown
const shutdown = async () => {
  await app.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

const PORT = parseInt(process.env.PORT || '3000', 10)
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Pragma API running on http://localhost:${PORT}`)
