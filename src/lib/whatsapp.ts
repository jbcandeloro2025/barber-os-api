import axios from 'axios'

const apiUrl = process.env.WHATSAPP_API_URL
const globalApiKey = process.env.WHATSAPP_GLOBAL_API_KEY

export const whatsappApi = axios.create({
  baseURL: apiUrl,
  headers: {
    'apikey': globalApiKey,
    'Content-Type': 'application/json'
  }
})

export const whatsappService = {
  // Criar uma nova instância (Padrão V2)
  async createInstance(instanceName: string) {
    try {
      const { data } = await whatsappApi.post('/instance/create', {
        instanceName,
        token: instanceName, 
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS' // Explicitando para V2
      })
      return data
    } catch (error: any) {
      // Se a instância já existe, a V2 pode retornar 403 ou 400
      console.error('Error creating WhatsApp instance:', error?.response?.data || error.message)
      return null
    }
  },

  // Pegar o QR Code (Padrão V2)
  async getQRCode(instanceName: string) {
    try {
      const { data } = await whatsappApi.get(`/instance/connect/${instanceName}`)
      return data
    } catch (error: any) {
      console.error('Error getting QR Code:', error?.response?.data || error.message)
      throw new Error('Failed to get QR Code.')
    }
  },

  // Enviar mensagem de texto (Padrão V2)
  async sendMessage(instanceName: string, number: string, message: string) {
    try {
      const formattedNumber = number.replace(/\D/g, '') // Remove tudo que não é número

      const { data } = await whatsappApi.post(`/message/sendText/${instanceName}`, {
        number: formattedNumber,
        text: message, // Na V2 simplificou para 'text' direto ou dentro de textMessage
        options: {
          delay: 1200,
          presence: 'composing'
        }
      })
      return data
    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error?.response?.data || error.message)
      return null
    }
  },

  // Verificar status (Padrão V2)
  async getStatus(instanceName: string) {
    try {
      const { data } = await whatsappApi.get(`/instance/connectionState/${instanceName}`)
      return data
    } catch (error) {
      return { instance: { state: 'DISCONNECTED' } }
    }
  }
}
