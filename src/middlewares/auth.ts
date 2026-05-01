import { FastifyReply, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization

  if (!authHeader) {
    return reply.status(401).send({ message: 'Token is missing.' })
  }

  const [, token] = authHeader.split(' ')

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      sub: string
      role: string
      shopId: string
    }

    request.user = {
      id: decoded.sub,
      role: decoded.role,
      shopId: decoded.shopId
    }
  } catch (err) {
    return reply.status(401).send({ message: 'Invalid token.' })
  }
}

// Extender o tipo Request do Fastify para incluir o usuário
declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string
      role: string
      shopId: string
    }
  }
}
