import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { stripe } from '../lib/stripe'

export async function webhookRoutes(app: FastifyInstance) {
  // Rota de Webhook do Stripe (Recebe avisos de pagamentos)
  app.post('/', async (request, reply) => {
    const sig = request.headers['stripe-signature'] as string
    let event

    try {
      event = stripe.webhooks.constructEvent(
        request.body as string | Buffer,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      )
    } catch (err: any) {
      return reply.status(400).send(`Webhook Error: ${err.message}`)
    }

    // Lógica para cada tipo de evento — dentro de transação para atomicidade
    await prisma.$transaction(async (tx) => {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as any
          const shopId = session.metadata?.shopId
          if (!shopId) break

          await tx.shop.update({
            where: { id: shopId },
            data: { subscription_status: 'ACTIVE' }
          })
          break
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as any
          const customerId = subscription.customer

          await tx.shop.updateMany({
            where: { stripe_customer_id: customerId },
            data: { subscription_status: 'CANCELED' }
          })
          break
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as any
          const customerId = subscription.customer
          const status = subscription.status

          let mappedStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING' = 'ACTIVE'
          if (status === 'past_due') mappedStatus = 'PAST_DUE'
          if (status === 'canceled' || status === 'unpaid') mappedStatus = 'CANCELED'
          if (status === 'trialing') mappedStatus = 'TRIALING'

          await tx.shop.updateMany({
            where: { stripe_customer_id: customerId },
            data: { subscription_status: mappedStatus }
          })
          break
        }
      }
    })

    return { received: true }
  })
}
