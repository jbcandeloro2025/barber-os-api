import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is missing.')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-01-27' as any, // Mantendo compatibilidade com a versão mais recente estável
  appInfo: {
    name: 'BarberOS SaaS',
    version: '1.0.0',
  },
})
