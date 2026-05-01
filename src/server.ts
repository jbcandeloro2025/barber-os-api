import fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { ZodError } from 'zod'
import { prisma } from './lib/prisma'
import { shopRoutes } from './routes/shops'
import { userRoutes } from './routes/users'
import { authRoutes } from './routes/auth'
import { clientRoutes } from './routes/clients'
import { serviceRoutes } from './routes/services'
import { professionalRoutes } from './routes/professionals'
import { appointmentRoutes } from './routes/appointments'
import { transactionRoutes } from './routes/transactions'
import { inventoryRoutes } from './routes/inventory'
import { subscriptionPlanRoutes } from './routes/plans'
import fastifyMultipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { resolve } from 'node:path'
import { reportRoutes } from './routes/reports'
import { uploadRoutes } from './routes/uploads'
import { subscriptionRoutes } from './routes/subscriptions'
import { webhookRoutes } from './routes/webhooks'
import { whatsappRoutes } from './routes/whatsapp'
import { bookingRoutes } from './routes/booking'

const app = fastify({ 
  logger: true,
  bodyLimit: 2 * 1024 * 1024 // Limite de 2MB (Inspirado no back-delivery)
})

// 🛡️ Camada de Segurança: Helmet (Headers HTTP)
app.register(helmet)
app.register(fastifyMultipart)
app.register(fastifyStatic, {
  root: resolve(__dirname, '../uploads'),
  prefix: '/uploads',
})

// 🛡️ Camada de Segurança: Rate Limit (Proteção contra brute-force/DDoS)
app.register(rateLimit, {
  max: 100, // máximo de 100 requisições
  timeWindow: '1 minute' // por minuto por IP
})

// Configuração de CORS
app.register(cors, {
  origin: process.env.ALLOWED_ORIGIN || true,
})

// Registrar rotas
app.register(shopRoutes, { prefix: '/shops' })
app.register(authRoutes, { prefix: '/auth' })
app.register(clientRoutes, { prefix: '/clients' })
app.register(serviceRoutes, { prefix: '/services' })
app.register(professionalRoutes, { prefix: '/professionals' })
app.register(appointmentRoutes, { prefix: '/appointments' })
app.register(transactionRoutes, { prefix: '/transactions' })
app.register(inventoryRoutes, { prefix: '/inventory' })
app.register(subscriptionPlanRoutes, { prefix: '/plans' })
app.register(userRoutes, { prefix: '/users' })
app.register(reportRoutes, { prefix: '/reports' })
app.register(uploadRoutes, { prefix: '/uploads' })
app.register(subscriptionRoutes, { prefix: '/subscriptions' })
app.register(whatsappRoutes, { prefix: '/whatsapp' })
app.register(bookingRoutes, { prefix: '/booking' })

// Webhook precisa de tratamento especial de corpo bruto (Raw Body)
app.register(async (instance) => {
  instance.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    done(null, body)
  })
  instance.register(webhookRoutes)
}, { prefix: '/webhooks' })

// 🚑 Global Error Handler
app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    return reply
      .status(400)
      .send({ message: 'Validation error.', issues: error.format() })
  }

  // Erro de duplicidade do Prisma (ex: e-mail já cadastrado)
  if ((error as any).code === 'P2002') {
    return reply.status(409).send({ message: 'Conflict: This email or unique record already exists.' })
  }

  // Erros HTTP explícitos (statusCode definido, ex: reply.status(404).send(...) via throw)
  if (error instanceof Error && 'statusCode' in error) {
    const httpError = error as Error & { statusCode: number }
    return reply.status(httpError.statusCode).send({ message: httpError.message })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(error)
  }

  return reply.status(500).send({ message: 'Internal server error.' })
})

// Rota de teste
app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

const start = async () => {
  try {
    await app.listen({ port: 3333, host: '0.0.0.0' })
    console.log('🚀 BarberOS API running on http://localhost:3333')
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
