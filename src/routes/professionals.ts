import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middlewares/auth'
import { checkRole } from '../middlewares/checkRole'

export async function professionalRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)

  // Listar equipe
  app.get('/', async (request) => {
    const professionals = await prisma.professional.findMany({
      where: {
        shop_id: request.user.shopId
      },
      orderBy: {
        name: 'asc'
      }
    })

    return { professionals }
  })

  // Cadastrar profissional - APENAS ADMIN
  app.post('/', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const createProfessionalSchema = z.object({
      name: z.string(),
      avatar_url: z.string().url().optional(),
      specialties: z.array(z.string()),
      commission_rate: z.number().min(0).max(100),
      work_hours: z.any().optional(),
    })

    const { name, avatar_url, specialties, commission_rate, work_hours } = createProfessionalSchema.parse(request.body)

    const professional = await prisma.professional.create({
      data: {
        name,
        avatar_url,
        specialties,
        commission_rate,
        work_hours,
        shop_id: request.user.shopId
      }
    })

    return reply.status(201).send({ professional })
  })

  // Atualizar profissional - APENAS ADMIN
  app.put('/:id', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const updateProfessionalSchema = z.object({
      name: z.string().optional(),
      avatar_url: z.string().url().optional(),
      specialties: z.array(z.string()).optional(),
      commission_rate: z.number().min(0).max(100).optional(),
      work_hours: z.any().optional(),
      active: z.boolean().optional(),
    })

    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const data = updateProfessionalSchema.parse(request.body)

    const existing = await prisma.professional.findFirst({
      where: { id, shop_id: request.user.shopId }
    })

    if (!existing) {
      return reply.status(404).send({ message: 'Professional not found.' })
    }

    const professional = await prisma.professional.update({
      where: { id },
      data
    })

    return { professional }
  })

  // Remover profissional - APENAS ADMIN
  app.delete('/:id', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const existing = await prisma.professional.findFirst({
      where: { id, shop_id: request.user.shopId }
    })

    if (!existing) {
      return reply.status(404).send({ message: 'Professional not found.' })
    }

    await prisma.professional.delete({
      where: { id }
    })

    return reply.status(204).send()
  })
}
