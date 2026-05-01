import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../middlewares/auth'
import { whatsappService } from '../lib/whatsapp'
import { prisma } from '../lib/prisma'

export async function whatsappRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)

  app.get('/status', async (request, reply) => {
    const shopId = request.user.shopId
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { config: true }
    })

    const config = (shop?.config as any) || {}
    const integration = config.integracoes?.whatsapp

    if (!integration?.instance || !integration?.token) {
      return { connected: false, message: 'Configuração ausente' }
    }

    try {
      // Usamos a URL global ou a do shop se existir
      const baseUrl = process.env.WHATSAPP_API_URL || integration.url
      const response = await fetch(`${baseUrl}/instance/connectionState/${integration.instance}`, {
        headers: { 'apikey': integration.token }
      })
      
      const data = await response.json()
      return { 
        connected: data.instance?.state === 'open',
        state: data.instance?.state,
        message: data.instance?.state === 'open' ? 'Conectado' : 'Desconectado'
      }
    } catch (error) {
      return { connected: false, message: 'Erro ao consultar API' }
    }
  })

  app.post('/logout', async (request, reply) => {
    const shopId = request.user.shopId
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { config: true }
    })

    const config = (shop?.config as any) || {}
    const integration = config.integracoes?.whatsapp

    if (!integration?.instance || !integration?.token) {
      return { success: false, message: 'Configuração ausente' }
    }

    try {
      const baseUrl = process.env.WHATSAPP_API_URL || integration.url
      await fetch(`${baseUrl}/instance/logout/${integration.instance}`, {
        method: 'DELETE',
        headers: { 'apikey': integration.token }
      })
      return { success: true }
    } catch (error) {
      return { success: false, message: 'Erro ao desconectar' }
    }
  })
}
