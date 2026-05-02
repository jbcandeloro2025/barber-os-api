import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import dayjs from 'dayjs'
import { prisma } from '../lib/prisma'
import { whatsappService } from '../lib/whatsapp'

// Rotas públicas para a página de agendamento do cliente
// Não requerem JWT — usam shop_id como contexto
export async function bookingRoutes(app: FastifyInstance) {

  // Resolve slug → shop id
  app.get('/resolve/:slug', async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params)
    const shop = await prisma.shop.findFirst({
      where: { slug },
      select: { id: true, name: true, logo_url: true, config: true }
    })
    if (!shop) return reply.status(404).send({ message: 'Shop not found.' })
    return { shop }
  })

  // Config pública da loja (nome, logo, cores)
  app.get('/:shopId/config', async (request, reply) => {
    const { shopId } = z.object({ shopId: z.string().uuid() }).parse(request.params)

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, name: true, logo_url: true, config: true }
    })

    if (!shop) return reply.status(404).send({ message: 'Shop not found.' })

    return { shop }
  })

  // Serviços ativos da loja
  app.get('/:shopId/services', async (request, reply) => {
    const { shopId } = z.object({ shopId: z.string().uuid() }).parse(request.params)

    const services = await prisma.service.findMany({
      where: { shop_id: shopId, active: true },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, price: true, duration: true, description: true }
    })

    return { services }
  })

  // Profissionais ativos da loja
  app.get('/:shopId/professionals', async (request, reply) => {
    const { shopId } = z.object({ shopId: z.string().uuid() }).parse(request.params)

    const professionals = await prisma.professional.findMany({
      where: { shop_id: shopId, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, specialties: true, avatar_url: true }
    })

    return { professionals }
  })

  // Identificar cliente pelo telefone (cria se não existir)
  app.post('/:shopId/identify', async (request, reply) => {
    const { shopId } = z.object({ shopId: z.string().uuid() }).parse(request.params)
    const { phone } = z.object({ phone: z.string().min(10) }).parse(request.body)

    const shop = await prisma.shop.findUnique({ where: { id: shopId } })
    if (!shop) return reply.status(404).send({ message: 'Shop not found.' })

    let client = await prisma.client.findFirst({
      where: { shop_id: shopId, phone },
      include: {
        subscriptions: {
          where: { active: true, end_date: { gte: new Date() } },
          include: { plan: { select: { id: true, name: true, benefits: true } } }
        }
      }
    })

    if (!client) {
      client = await prisma.client.create({
        data: { shop_id: shopId, phone, name: '' },
        include: {
          subscriptions: {
            where: { active: true, end_date: { gte: new Date() } },
            include: { plan: { select: { id: true, name: true, benefits: true } } }
          }
        }
      })
    }

    // Gerar Token para o cliente (sessão curta ou longa conforme preferência)
    const token = jwt.sign(
      { sub: client.id, shopId, role: 'CLIENT' },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )

    reply.setCookie('client_token', token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 60 * 60 * 24 * 30, // 30 dias
    })

    return {
      client: {
        id:            client.id,
        name:          client.name,
        phone:         client.phone,
        email:         client.email,
        subscription:  client.subscriptions[0] ?? null,
      },
      token // Retrocompatibilidade
    }
  })

  // Horários ocupados do profissional num dado dia
  app.get('/:shopId/slots', async (request, reply) => {
    const { shopId } = z.object({ shopId: z.string().uuid() }).parse(request.params)
    const { professional_id, date } = z.object({
      professional_id: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.query)

    const start = new Date(`${date}T00:00:00.000Z`)
    const end   = new Date(`${date}T23:59:59.999Z`)

    const appointments = await prisma.appointment.findMany({
      where: {
        professional_id,
        shop_id: shopId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        scheduled_at: { gte: start, lte: end }
      },
      select: { 
        scheduled_at: true, 
        service: { 
          select: { duration: true } 
        } 
      }
    })

    const blocked = appointments.map(ap => {
      const d = new Date(ap.scheduled_at)
      const h = String(d.getUTCHours()).padStart(2, '0')
      const m = String(d.getUTCMinutes()).padStart(2, '0')
      return `${h}:${m}`
    })

    return { blocked }
  })

  // Criar agendamento (cliente público)
  app.post('/:shopId/appointment', async (request, reply) => {
    const { shopId } = z.object({ shopId: z.string().uuid() }).parse(request.params)

    const schema = z.object({
      client_id:       z.string().uuid(),
      client_name:     z.string().optional(),
      service_id:      z.string().uuid(),
      professional_id: z.string().uuid(),
      scheduled_at:    z.string().datetime(),
      notes:           z.string().optional(),
    })

    const { client_id, client_name, service_id, professional_id, scheduled_at, notes } = schema.parse(request.body)

    // Atualiza nome do cliente se informado
    if (client_name?.trim()) {
      await prisma.client.update({
        where: { id: client_id },
        data: { name: client_name.trim() }
      })
    }

    const service = await prisma.service.findFirst({
      where: { id: service_id, shop_id: shopId }
    })
    if (!service) return reply.status(404).send({ message: 'Service not found.' })

    const appointment = await prisma.appointment.create({
      data: {
        shop_id:        shopId,
        client_id,
        service_id,
        professional_id,
        scheduled_at:   new Date(scheduled_at),
        notes,
        status:         'CONFIRMED',
      },
      include: {
        client:       { select: { name: true, phone: true } },
        service:      { select: { title: true, price: true } },
        professional: { select: { name: true } },
        shop:         { select: { name: true } }
      }
    })

    // 🚀 Notificar via WhatsApp (Assíncrono)
    const instanceName = `barber_${shopId.replace(/-/g, '')}`
    const msg = `✅ *Agendamento Confirmado!*\n\nOlá ${appointment.client.name}, seu horário na *${appointment.shop.name}* foi confirmado:\n\n📅 *Data:* ${dayjs(appointment.scheduled_at).format('DD/MM/YYYY')}\n⏰ *Hora:* ${dayjs(appointment.scheduled_at).format('HH:mm')}\n💈 *Serviço:* ${appointment.service.title}\n👤 *Barbeiro:* ${appointment.professional.name}\n\nTe esperamos lá! ✂️`

    if (appointment.client.phone) {
      whatsappService.sendMessage(instanceName, appointment.client.phone, msg).catch(console.error)
    }

    return reply.status(201).send({ appointment })
  })

  // Histórico de agendamentos do cliente
  app.get('/:shopId/history/:clientId', async (request, reply) => {
    const { shopId, clientId } = z.object({
      shopId:   z.string().uuid(),
      clientId: z.string().uuid(),
    }).parse(request.params)

    const appointments = await prisma.appointment.findMany({
      where: { shop_id: shopId, client_id: clientId },
      orderBy: { scheduled_at: 'desc' },
      include: {
        service:      { select: { title: true, price: true } },
        professional: { select: { name: true } },
      }
    })

    return { appointments }
  })
}
