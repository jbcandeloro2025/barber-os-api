import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middlewares/auth'

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const loginBodySchema = z.object({
      email: z.string().email(),
      password: z.string(),
    })

    const { email, password } = loginBodySchema.parse(request.body)

    // 1. Buscar usuário
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            subscription_status: true
          }
        }
      }
    })

    if (!user) {
      return reply.status(401).send({ message: 'Invalid credentials.' })
    }

    // 2. Verificar senha
    const isPasswordValid = await bcrypt.compare(password, user.password_hash)

    if (!isPasswordValid) {
      return reply.status(401).send({ message: 'Invalid credentials.' })
    }

    // 3. Gerar Token JWT
    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        shopId: user.shop_id
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    return reply.status(200).send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        shop: user.shop
      },
      token
    })
  })

  app.get('/me', { onRequest: [authMiddleware] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      include: { shop: true }
    })

    if (!user) {
      return reply.status(404).send({ message: 'User not found.' })
    }

    return { user }
  })

  app.patch('/me', { onRequest: [authMiddleware] }, async (request, reply) => {
    const schema = z.object({
      name:     z.string().min(2).optional(),
      email:    z.string().email().optional(),
      password: z.string().min(6).optional(),
    })
    const { name, email, password } = schema.parse(request.body)

    const updateData: Record<string, unknown> = {}
    if (name)     updateData.name = name
    if (email)    updateData.email = email
    if (password) updateData.password_hash = await bcrypt.hash(password, 6)

    const user = await prisma.user.update({
      where: { id: request.user.id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true },
    })

    return { user }
  })
}
