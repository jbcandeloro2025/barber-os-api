import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middlewares/auth'

export async function shopRoutes(app: FastifyInstance) {
  // Buscar dados da loja autenticada
  app.get('/me', { preHandler: [authMiddleware] }, async (request) => {
    const shop = await prisma.shop.findUnique({
      where: { id: request.user.shopId },
      select: { 
        id: true, 
        name: true, 
        slug: true, 
        logo_url: true, 
        config: true,
        subscription_status: true,
        stripe_customer_id: true
      }
    })
    return { shop }
  })

  // Atualizar dados da loja (nome, logo, config de booking)
  app.patch('/me', { preHandler: [authMiddleware] }, async (request) => {
    const schema = z.object({
      name:      z.string().min(1).optional(),
      slug:      z.string().min(3).optional(),
      logo_url:  z.string().optional(),
      config:    z.any().optional(),
    })
    const data = schema.parse(request.body)
    const shop = await prisma.shop.update({
      where: { id: request.user.shopId },
      data: {
        name: data.name,
        slug: data.slug,
        logo_url: data.logo_url,
        config: data.config,
      },
      select: { id: true, name: true, slug: true, logo_url: true, config: true }
    })
    return { shop }
  })

  app.post('/register', async (request, reply) => {
    const registerBodySchema = z.object({
      shopName: z.string().min(3),
      ownerName: z.string().min(3),
      email: z.string().email(),
      password: z.string().min(6),
    })

    const { shopName, ownerName, email, password } = registerBodySchema.parse(request.body)

    // 1. Verificar se o e-mail já existe
    const userWithSameEmail = await prisma.user.findUnique({
      where: { email }
    })

    if (userWithSameEmail) {
      return reply.status(409).send({ message: 'Email already exists.' })
    }

    // 2. Hash da senha
    const passwordHash = await bcrypt.hash(password, 6)

    // 3. Criar Shop e Admin em uma transação
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Criar a Shop
        const shop = await tx.shop.create({
          data: {
            name: shopName,
            owner_id: 'temp-id', // Será atualizado logo abaixo
          }
        })

        // Criar o Usuário Admin vinculado à Shop
        const user = await tx.user.create({
          data: {
            name: ownerName,
            email,
            password_hash: passwordHash,
            role: 'ADMIN',
            shop_id: shop.id
          }
        })

        // Atualizar o owner_id da Shop com o ID do usuário criado
        await tx.shop.update({
          where: { id: shop.id },
          data: { owner_id: user.id }
        })

        return { shop, user }
      })

      // 4. Gerar Token JWT
      const token = jwt.sign(
        { 
          sub: result.user.id,
          role: result.user.role,
          shopId: result.shop.id 
        },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      )

      // 5. Set Secure Cookie
      reply.setCookie('auth_token', token, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 60 * 60 * 24 * 7,
      })

      return reply.status(201).send({
        shop: {
          id: result.shop.id,
          name: result.shop.name
        },
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email
        },
        token // Mantido para retrocompatibilidade
      })

    } catch (err) {
      console.error(err)
      return reply.status(500).send({ message: 'Internal server error during registration.' })
    }
  })
}
