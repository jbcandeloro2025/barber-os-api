import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middlewares/auth'
import { checkRole } from '../middlewares/checkRole'

export async function serviceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)

  // Listar serviços - Aberto para a shop
  app.get('/', async (request) => {
    const services = await prisma.service.findMany({
      where: {
        shop_id: request.user.shopId
      },
      orderBy: {
        title: 'asc'
      }
    })

    return { services }
  })

  // Criar novo serviço - APENAS ADMIN
  app.post('/', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const createServiceSchema = z.object({
      title: z.string(),
      price: z.number(),
      duration: z.number().int().positive(),
      description: z.string().optional(),
    })

    const { title, price, duration, description } = createServiceSchema.parse(request.body)

    const service = await prisma.service.create({
      data: {
        title,
        price,
        duration,
        description,
        shop_id: request.user.shopId
      }
    })

    return reply.status(201).send({ service })
  })

  // Atualizar serviço - APENAS ADMIN
  app.put('/:id', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const updateServiceSchema = z.object({
      title: z.string().optional(),
      price: z.number().optional(),
      duration: z.number().int().positive().optional(),
      description: z.string().optional(),
    })

    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const data = updateServiceSchema.parse(request.body)

    // Verificar se o serviço pertence à shop logada
    const existingService = await prisma.service.findFirst({
      where: { id, shop_id: request.user.shopId }
    })

    if (!existingService) {
      return reply.status(404).send({ message: 'Service not found.' })
    }

    const service = await prisma.service.update({
      where: { id },
      data
    })

    return { service }
  })

  // Remover serviço - APENAS ADMIN
  app.delete('/:id', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const existingService = await prisma.service.findFirst({
      where: { id, shop_id: request.user.shopId }
    })

    if (!existingService) {
      return reply.status(404).send({ message: 'Service not found.' })
    }

    await prisma.service.delete({
      where: { id }
    })

    return reply.status(204).send()
  })
}
