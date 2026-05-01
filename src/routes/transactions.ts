import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middlewares/auth'
import { checkRole } from '../middlewares/checkRole'

export async function transactionRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)
  
  // Todas as rotas financeiras exigem nível ADMIN
  app.addHook('preHandler', checkRole(['ADMIN']))

  // Listar transações
  app.get('/', async (request) => {
    const transactions = await prisma.transaction.findMany({
      where: {
        shop_id: request.user.shopId
      },
      include: {
        appointment: {
          include: {
            client: { select: { name: true } },
            service: { select: { title: true } }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    })

    return { transactions }
  })

  // Registrar nova transação
  app.post('/', async (request, reply) => {
    const createTransactionSchema = z.object({
      amount: z.number(),
      type: z.enum(['INCOME', 'EXPENSE']),
      payment_method: z.enum(['PIX', 'CARD', 'CASH', 'SUBSCRIPTION_REDEEM']),
      description: z.string().optional(),
      appointment_id: z.string().uuid().optional(),
    })

    const { amount, type, payment_method, description, appointment_id } = createTransactionSchema.parse(request.body)

    const transaction = await prisma.transaction.create({
      data: {
        amount,
        type,
        payment_method,
        description,
        appointment_id,
        shop_id: request.user.shopId
      }
    })

    if (appointment_id) {
      await prisma.appointment.update({
        where: { id: appointment_id },
        data: { 
          payment_status: payment_method === 'SUBSCRIPTION_REDEEM' ? 'PAID_BY_SUBSCRIPTION' : 'PAID_AT_PDV',
          status: 'COMPLETED'
        }
      })
    }

    return reply.status(201).send({ transaction })
  })

  // Resumo financeiro
  app.get('/summary', async (request) => {
    const transactions = await prisma.transaction.findMany({
      where: { shop_id: request.user.shopId }
    })

    const revenue = transactions
      .filter(t => t.type === 'INCOME')
      .reduce((acc, t) => acc + Number(t.amount), 0)

    const expenses = transactions
      .filter(t => t.type === 'EXPENSE')
      .reduce((acc, t) => acc + Number(t.amount), 0)

    return {
      revenue,
      expenses,
      balance: revenue - expenses
    }
  })
}
