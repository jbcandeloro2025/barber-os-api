import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middlewares/auth'
import { checkRole } from '../middlewares/checkRole'

export async function subscriptionPlanRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)

  // Listar planos disponíveis
  app.get('/', async (request) => {
    const plans = await prisma.subscriptionPlan.findMany({
      where: {
        shop_id: request.user.shopId
      }
    })

    return { plans }
  })

  // Criar novo plano (VIP)
  app.post('/', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const createPlanSchema = z.object({
      name: z.string(),
      price: z.number(),
      benefits: z.array(z.string()).default([]),
      duration_id: z.string(), // ex: 'mensal', 'trimestral'
    })

    const { name, price, benefits, duration_id } = createPlanSchema.parse(request.body)

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name,
        price,
        benefits,
        duration_id,
        shop_id: request.user.shopId
      }
    })

    return reply.status(201).send({ plan })
  })

  // Editar plano
  app.put('/:id', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const schema = z.object({
      name:        z.string().optional(),
      price:       z.number().optional(),
      benefits:    z.array(z.string()).optional(),
      duration_id: z.string().optional(),
    })
    const data = schema.parse(request.body)

    const existing = await prisma.subscriptionPlan.findFirst({ where: { id, shop_id: request.user.shopId } })
    if (!existing) return reply.status(404).send({ message: 'Plan not found.' })

    const plan = await prisma.subscriptionPlan.update({ where: { id }, data })
    return { plan }
  })

  // Excluir plano
  app.delete('/:id', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const existing = await prisma.subscriptionPlan.findFirst({ where: { id, shop_id: request.user.shopId } })
    if (!existing) return reply.status(404).send({ message: 'Plan not found.' })

    await prisma.subscriptionPlan.delete({ where: { id } })
    return reply.status(204).send()
  })

  // Assinar um cliente a um plano
  app.post('/subscribe', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const subscribeSchema = z.object({
      client_id: z.string().uuid(),
      plan_id: z.string().uuid(),
      end_date: z.string().datetime(),
    })

    const { client_id, plan_id, end_date } = subscribeSchema.parse(request.body)

    const [client, plan] = await Promise.all([
      prisma.client.findFirst({ where: { id: client_id, shop_id: request.user.shopId } }),
      prisma.subscriptionPlan.findFirst({ where: { id: plan_id, shop_id: request.user.shopId } })
    ])

    if (!client || !plan) {
      return reply.status(404).send({ message: 'Client or Plan not found.' })
    }

    const subscription = await prisma.subscription.create({
      data: {
        client_id,
        plan_id,
        end_date: new Date(end_date),
        active: true,
      }
    })

    return reply.status(201).send({ subscription })
  })
}
