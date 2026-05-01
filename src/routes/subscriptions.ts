import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { stripe } from '../lib/stripe'
import { authMiddleware } from '../middlewares/auth'

export async function subscriptionRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)

  // Criar uma sessão de Checkout do Stripe
  app.post('/checkout', async (request, reply) => {
    const checkoutSchema = z.object({
      priceId: z.string(), // ID do preço criado no dashboard do Stripe
    })

    const { priceId } = checkoutSchema.parse(request.body)
    const shopId = request.user.shopId

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: { users: { where: { role: 'ADMIN' }, take: 1 } }
    })

    if (!shop) {
      return reply.status(404).send({ message: 'Shop not found.' })
    }

    const adminUser = shop.users[0]

    let stripeCustomerId = shop.stripe_customer_id

    // Se a loja não tem um ID de cliente no Stripe, cria um
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: adminUser.email,
        name: shop.name,
        metadata: {
          shopId: shop.id
        }
      })

      stripeCustomerId = customer.id

      await prisma.shop.update({
        where: { id: shopId },
        data: { stripe_customer_id: stripeCustomerId }
      })
    }

    // Criar a sessão de checkout
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing`,
      metadata: {
        shopId: shop.id
      }
    })

    return { checkoutUrl: session.url }
  })

  // Criar link do Portal do Cliente (para gerenciar assinatura/cancelar)
  app.post('/portal', async (request) => {
    const shopId = request.user.shopId
    const shop = await prisma.shop.findUnique({
      where: { id: shopId }
    })

    if (!shop || !shop.stripe_customer_id) {
      throw new Error('Customer does not have a billing history.')
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: shop.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/billing`,
    })

    return { portalUrl: session.url }
  })
}
