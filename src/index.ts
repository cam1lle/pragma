import Fastify from 'fastify'
import cors from 'fastify-cors'
import { prisma } from './lib/prisma.js'
import missionsRoutes from './routes/missions.js'
import agentsRoutes from './routes/agents.js'

const app = Fastify({
  logger: {
    transport: {
      target: '@fastify/one-and-only',
      options: { target: 'stdout' },
    },
  },
})

// Register plugins
await app.register(cors, { origin: true })
await app.register(missionsRoutes, { prefix: '/api/v1' })
await app.register(agentsRoutes, { prefix: '/api/v1' })

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
