import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { whatsappService } from '../lib/whatsapp'
import { authMiddleware } from '../middlewares/auth'
import { checkRole } from '../middlewares/checkRole'

export async function whatsappRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)

  // Criar ou conectar instância — apenas ADMIN
  app.post('/connect', { preHandler: [checkRole(['ADMIN'])] }, async (request) => {
    const instanceName = `barber_${request.user.shopId.replace(/-/g, '')}`

    try {
      await whatsappService.createInstance(instanceName)
      const qrData = await whatsappService.getQRCode(instanceName)
      return { qrCode: qrData.base64 || qrData.code }
    } catch {
      const qrData = await whatsappService.getQRCode(instanceName)
      return { qrCode: qrData.base64 || qrData.code }
    }
  })

  // Verificar status da conexão — apenas ADMIN
  app.get('/status', { preHandler: [checkRole(['ADMIN'])] }, async (request) => {
    const instanceName = `barber_${request.user.shopId.replace(/-/g, '')}`
    const status = await whatsappService.getStatus(instanceName)
    return { status: status.instance?.state || 'DISCONNECTED' }
  })

  // Enviar mensagem de teste — apenas ADMIN
  app.post('/send-test', { preHandler: [checkRole(['ADMIN'])] }, async (request, reply) => {
    const sendTestSchema = z.object({
      number: z.string().min(10),
      message: z.string().min(1),
    })

    const { number, message } = sendTestSchema.parse(request.body)
    const instanceName = `barber_${request.user.shopId.replace(/-/g, '')}`

    const result = await whatsappService.sendMessage(instanceName, number, message)
    return reply.send({ success: !!result, result })
  })
}
