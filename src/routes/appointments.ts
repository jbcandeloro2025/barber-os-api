import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middlewares/auth'
import dayjs from 'dayjs'
import { whatsappService } from '../lib/whatsapp'

export async function appointmentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)

  // Listar agendamentos da barbearia
  app.get('/', async (request) => {
    const { start, end } = z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).parse(request.query)

    let professionalIdFilter = undefined

    // Se for PROFISSIONAL, ele só vê a própria agenda
    if (request.user.role === 'PROFISSIONAL') {
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { professional_id: true }
      })
      professionalIdFilter = user?.professional_id || 'none'
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        shop_id: request.user.shopId,
        professional_id: professionalIdFilter,
        scheduled_at: {
          gte: start ? new Date(start) : undefined,
          lte: end ? new Date(end) : undefined,
        }
      },
      include: {
        client: { select: { name: true, phone: true } },
        service: { select: { title: true, price: true, duration: true } },
        professional: { select: { name: true } }
      },
      orderBy: {
        scheduled_at: 'asc'
      }
    })

    return { appointments }
  })

  // Criar novo agendamento com validação de conflito
  app.post('/', async (request, reply) => {
    const createAppointmentSchema = z.object({
      client_id: z.string().uuid(),
      service_id: z.string().uuid(),
      professional_id: z.string().uuid(),
      scheduled_at: z.string().datetime(), // ISO string
      notes: z.string().optional(),
    })

    const { client_id, service_id, professional_id, scheduled_at, notes } = createAppointmentSchema.parse(request.body)

    // 1. Buscar duração do serviço
    const service = await prisma.service.findFirst({
      where: { id: service_id, shop_id: request.user.shopId }
    })

    if (!service) {
      return reply.status(404).send({ message: 'Service not found.' })
    }

    const startTime = dayjs(scheduled_at)
    const endTime = startTime.add(service.duration, 'minute')

    // 2. Verificar conflito de horário para o profissional
    // (StartA < EndB) AND (EndA > StartB)
    const appointmentsOnDay = await prisma.appointment.findMany({
      where: {
        professional_id,
        status: { in: ['PENDING', 'CONFIRMED'] },
        scheduled_at: {
          gte: startTime.startOf('day').toDate(),
          lte: startTime.endOf('day').toDate(),
        }
      },
      include: { service: true }
    })

    const hasConflict = appointmentsOnDay.some(app => {
      const appStart = dayjs(app.scheduled_at)
      const appEnd = appStart.add(app.service.duration, 'minute')
      
      return (startTime.isBefore(appEnd) && endTime.isAfter(appStart))
    })

    if (hasConflict) {
      return reply.status(409).send({ message: 'Professional already has an appointment at this time.' })
    }

    // 3. Criar agendamento
    const appointment = await prisma.appointment.create({
      data: {
        client_id,
        service_id,
        professional_id,
        scheduled_at: startTime.toDate(),
        notes,
        shop_id: request.user.shopId,
        status: 'CONFIRMED'
      },
      include: {
        client: true,
        professional: true,
        service: true,
        shop: { select: { name: true } }
      }
    })

    // 🚀 4. Notificar via WhatsApp (Assíncrono para não travar a resposta)
    const instanceName = `barber_${request.user.shopId.replace(/-/g, '')}`
    const message = `✅ *Agendamento Confirmado!*\n\nOlá ${appointment.client.name}, seu horário na *${appointment.shop.name}* foi confirmado:\n\n📅 *Data:* ${dayjs(appointment.scheduled_at).format('DD/MM/YYYY')}\n⏰ *Hora:* ${dayjs(appointment.scheduled_at).format('HH:mm')}\n💈 *Serviço:* ${appointment.service.title}\n👤 *Barbeiro:* ${appointment.professional.name}\n\nTe esperamos lá! ✂️`

    if (appointment.client.phone) {
      whatsappService.sendMessage(instanceName, appointment.client.phone, message).catch(console.error)
    }

    return reply.status(201).send({ appointment })
  })

  // Atualizar status do agendamento
  app.patch('/:id/status', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const { status } = z.object({ 
      status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELED']) 
    }).parse(request.body)

    const existing = await prisma.appointment.findFirst({
      where: { id, shop_id: request.user.shopId }
    })

    if (!existing) {
      return reply.status(404).send({ message: 'Appointment not found.' })
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: { status }
    })

    return { appointment }
  })
}
