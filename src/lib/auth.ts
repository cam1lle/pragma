import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

/**
 * Agent API key verification middleware.
 *
 * Agents authenticate via the `Authorization` header:
 *   Authorization: Bearer pragma_key_<raw_key>
 *
 * The raw key is hashed (SHA-256) and compared against the stored apiKeyHash.
 * Only endpoints that need auth should use this — the /agents/register and
 * /health routes remain public.
 */
export async function authMiddleware(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid Authorization header' })
  }

  const rawKey = authHeader.slice(7)
  const crypto = await import('crypto')
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex')

  const agent = await app.prisma.agent.findFirst({
    where: { apiKeyHash: hash },
    select: { id: true, name: true, isActive: true, capabilities: true, framework: true },
  })

  if (!agent) {
    return reply.code(401).send({ error: 'Invalid API key' })
  }
  if (!agent.isActive) {
    return reply.code(403).send({ error: 'Agent account is deactivated' })
  }

  // Attach resolved agent to request
  ;(req as any).agent = agent
}
