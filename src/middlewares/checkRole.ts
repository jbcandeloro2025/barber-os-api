import { FastifyReply, FastifyRequest } from 'fastify'

export function checkRole(roles: ('ADMIN' | 'ATENDENTE' | 'PROFISSIONAL')[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userRole = request.user.role as 'ADMIN' | 'ATENDENTE' | 'PROFISSIONAL'

    if (!roles.includes(userRole)) {
      return reply.status(403).send({ 
        message: 'Forbidden: You do not have permission to access this resource.' 
      })
    }
  }
}
