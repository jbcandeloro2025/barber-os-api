import dayjs from 'dayjs'
import { prisma } from './prisma'
import { whatsappService } from './whatsapp'

export async function checkAndSendReminders() {
  const now = dayjs()
  const inOneHourStart = now.add(50, 'minute').toDate()
  const inOneHourEnd = now.add(70, 'minute').toDate()

  try {
    // 1. Buscar agendamentos próximos (aprox. 1 hora) que ainda não receberam lembrete
    const pendingReminders = await prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        reminder_sent: false,
        scheduled_at: {
          gte: inOneHourStart,
          lte: inOneHourEnd,
        },
      },
      include: {
        client: { select: { name: true, phone: true } },
        shop: { select: { name: true, id: true } },
        service: { select: { title: true } },
        professional: { select: { name: true } },
      },
    })

    if (pendingReminders.length === 0) return

    console.log(`[Reminders] Enviando ${pendingReminders.length} lembretes...`)

    for (const appointment of pendingReminders) {
      if (!appointment.client.phone) continue

      const instanceName = `barber_${appointment.shop.id.replace(/-/g, '')}`
      const message = `⏰ *Lembrete de Agendamento*\n\nOlá ${appointment.client.name}, passando para lembrar do seu horário hoje na *${appointment.shop.name}*:\n\n💈 *Serviço:* ${appointment.service.title}\n👤 *Barbeiro:* ${appointment.professional.name}\n⏰ *Horário:* ${dayjs(appointment.scheduled_at).format('HH:mm')}\n\nTe esperamos em breve! ✂️`

      try {
        await whatsappService.sendMessage(instanceName, appointment.client.phone, message)
        
        // Marcar como enviado para não repetir
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { reminder_sent: true },
        })
      } catch (err) {
        console.error(`[Reminders] Falha ao enviar para ${appointment.client.phone}:`, err)
      }
    }
  } catch (err) {
    console.error('[Reminders] Erro ao processar lembretes:', err)
  }
}
