import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middlewares/auth'

export async function clientRoutes(app: FastifyInstance) {
  // Aplicar middleware em todas as rotas de clientes
  app.addHook('onRequest', authMiddleware)

  // Listar clientes da barbearia logada
  app.get('/', async (request) => {
    const clients = await prisma.client.findMany({
      where: {
        shop_id: request.user.shopId
      },
      orderBy: {
        name: 'asc'
      },
      include: {
        subscriptions: {
          where: { active: true, end_date: { gte: new Date() } },
          include: { plan: { select: { id: true, name: true } } },
          take: 1,
        }
      }
    })

    return { clients }
  })

  // Criar novo cliente
  app.post('/', async (request, reply) => {
    const createClientSchema = z.object({
      name: z.string(),
      phone: z.string(),
      email: z.string().email().optional(),
    })

    const { name, phone, email } = createClientSchema.parse(request.body)

    const client = await prisma.client.create({
      data: {
        name,
        phone,
        email,
        shop_id: request.user.shopId
      }
    })

    return reply.status(201).send({ client })
  })

  // Histórico de agendamentos de um cliente
  app.get('/:id/appointments', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const client = await prisma.client.findFirst({ where: { id, shop_id: request.user.shopId } })
    if (!client) return reply.status(404).send({ message: 'Client not found.' })

    const appointments = await prisma.appointment.findMany({
      where: { client_id: id, shop_id: request.user.shopId },
      orderBy: { scheduled_at: 'desc' },
      include: {
        service:      { select: { title: true, price: true } },
        professional: { select: { name: true } },
      }
    })

    return { appointments }
  })
}
