import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middlewares/auth'
import { checkRole } from '../middlewares/checkRole'
import dayjs from 'dayjs'

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)
  app.addHook('preHandler', checkRole(['ADMIN']))

  // Dashboard Overview
  app.get('/dashboard', async (request) => {
    const shopId = request.user.shopId
    const now = dayjs()
    const startOfMonth = now.startOf('month').toDate()

    // 1. Faturamento do Mês
    const monthlyTransactions = await prisma.transaction.findMany({
      where: {
        shop_id: shopId,
        type: 'INCOME',
        created_at: { gte: startOfMonth }
      }
    })
    const monthlyRevenue = monthlyTransactions.reduce((acc, t) => acc + Number(t.amount), 0)

    // 2. Agendamentos de hoje
    const todayAppointments = await prisma.appointment.count({
      where: {
        shop_id: shopId,
        scheduled_at: {
          gte: now.startOf('day').toDate(),
          lte: now.endOf('day').toDate()
        }
      }
    })

    // 3. Novos clientes no mês
    const newClients = await prisma.client.count({
      where: {
        shop_id: shopId,
        created_at: { gte: startOfMonth }
      }
    })

    // 4. Top 5 Serviços — agrupado no banco, sem N+1
    const serviceGroups = await prisma.appointment.groupBy({
      by: ['service_id'],
      where: { shop_id: shopId },
      _count: { service_id: true },
      orderBy: { _count: { service_id: 'desc' } },
      take: 5,
    })

    const serviceIds = serviceGroups.map(g => g.service_id)
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, title: true },
    })
    const serviceMap = Object.fromEntries(services.map(s => [s.id, s.title]))

    const topServices = serviceGroups.map(g => ({
      title: serviceMap[g.service_id] ?? 'Unknown',
      count: g._count.service_id,
    }))

    return {
      monthlyRevenue,
      todayAppointments,
      newClients,
      topServices
    }
  })

  // Faturamento por Profissional (Performance) — agrupado no banco, sem N+1
  app.get('/performance', async (request) => {
    const shopId = request.user.shopId

    const groups = await prisma.appointment.groupBy({
      by: ['professional_id'],
      where: { shop_id: shopId, status: 'COMPLETED' },
      _count: { professional_id: true },
    })

    const professionalIds = groups.map(g => g.professional_id)
    const professionals = await prisma.professional.findMany({
      where: { id: { in: professionalIds } },
      select: { id: true, name: true },
    })
    const profMap = Object.fromEntries(professionals.map(p => [p.id, p.name]))

    // Busca receita real via transações vinculadas a agendamentos completados
    const revenues = await prisma.transaction.groupBy({
      by: ['appointment_id'],
      where: {
        shop_id: shopId,
        type: 'INCOME',
        appointment_id: { in: await prisma.appointment.findMany({
          where: { shop_id: shopId, status: 'COMPLETED' },
          select: { id: true },
        }).then(apps => apps.map(a => a.id)) },
      },
      _sum: { amount: true },
    })

    // Monta map appointmentId -> revenue
    const revenueMap = Object.fromEntries(
      revenues.map(r => [r.appointment_id, Number(r._sum.amount ?? 0)])
    )

    // Agrega por profissional
    const appointmentsByPro = await prisma.appointment.findMany({
      where: { shop_id: shopId, status: 'COMPLETED' },
      select: { id: true, professional_id: true },
    })

    const performance: Record<string, { name: string, total: number, count: number }> = {}
    for (const appt of appointmentsByPro) {
      const name = profMap[appt.professional_id] ?? 'Unknown'
      if (!performance[appt.professional_id]) {
        performance[appt.professional_id] = { name, total: 0, count: 0 }
      }
      performance[appt.professional_id].total += revenueMap[appt.id] ?? 0
      performance[appt.professional_id].count++
    }

    return { performance: Object.values(performance) }
  })
}
