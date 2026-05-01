import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middlewares/auth'
import { checkRole } from '../middlewares/checkRole'

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)

  // Listar usuários da loja
  app.get('/', { preHandler: [checkRole(['ADMIN'])] }, async (request) => {
    const users = await prisma.user.findMany({
      where: { shop_id: request.user.shopId },
      select: { id: true, name: true, email: true, role: true, created_at: true },
      orderBy: { created_at: 'asc' },
    })
    return { users }
  })

  // Criar usuário
  app.post('/', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const schema = z.object({
      name:     z.string().min(2),
      email:    z.string().email(),
      password: z.string().min(6),
      role:     z.enum(['ADMIN', 'ATENDENTE', 'PROFISSIONAL']),
    })
    const { name, email, password, role } = schema.parse(request.body)

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return reply.status(409).send({ message: 'E-mail já cadastrado.' })

    const password_hash = await bcrypt.hash(password, 6)
    const user = await prisma.user.create({
      data: { name, email, password_hash, role, shop_id: request.user.shopId },
      select: { id: true, name: true, email: true, role: true, created_at: true },
    })
    return reply.status(201).send({ user })
  })

  // Editar usuário (nome e/ou role)
  app.put('/:id', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const schema = z.object({
      name: z.string().min(2).optional(),
      role: z.enum(['ADMIN', 'ATENDENTE', 'PROFISSIONAL']).optional(),
    })
    const data = schema.parse(request.body)

    const existing = await prisma.user.findFirst({ where: { id, shop_id: request.user.shopId } })
    if (!existing) return reply.status(404).send({ message: 'Usuário não encontrado.' })

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, created_at: true },
    })
    return { user }
  })

  // Excluir usuário (não pode excluir a si mesmo)
  app.delete('/:id', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    if (id === request.user.id) {
      return reply.status(400).send({ message: 'Você não pode excluir sua própria conta.' })
    }

    const existing = await prisma.user.findFirst({ where: { id, shop_id: request.user.shopId } })
    if (!existing) return reply.status(404).send({ message: 'Usuário não encontrado.' })

    await prisma.user.delete({ where: { id } })
    return reply.status(204).send()
  })
}
