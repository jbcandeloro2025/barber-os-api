import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware } from '../middlewares/auth'

export async function inventoryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)

  // Listar estoque
  app.get('/', async (request) => {
    const products = await prisma.product.findMany({
      where: {
        shop_id: request.user.shopId
      },
      orderBy: {
        name: 'asc'
      }
    })

    return { products }
  })

  // Criar produto
  app.post('/', async (request, reply) => {
    const createProductSchema = z.object({
      name: z.string(),
      price: z.number(),
      stock: z.number().int().nonnegative(),
      min_stock: z.number().int().nonnegative(),
      description: z.string().optional(),
    })

    const data = createProductSchema.parse(request.body)

    const product = await prisma.product.create({
      data: {
        ...data,
        shop_id: request.user.shopId
      }
    })

    return reply.status(201).send({ product })
  })

  // Editar produto
  app.put('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const schema = z.object({
      name:        z.string().optional(),
      price:       z.number().optional(),
      stock:       z.number().int().nonnegative().optional(),
      min_stock:   z.number().int().nonnegative().optional(),
      description: z.string().optional(),
    })
    const data = schema.parse(request.body)

    const existing = await prisma.product.findFirst({ where: { id, shop_id: request.user.shopId } })
    if (!existing) return reply.status(404).send({ message: 'Product not found.' })

    const product = await prisma.product.update({ where: { id }, data })
    return { product }
  })

  // Atualizar estoque (Venda ou reposição)
  app.patch('/:id/stock', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const { quantity, action } = z.object({
      quantity: z.number().int().positive(),
      action: z.enum(['add', 'subtract'])
    }).parse(request.body)

    const product = await prisma.product.findFirst({
      where: { id, shop_id: request.user.shopId }
    })

    if (!product) {
      return reply.status(404).send({ message: 'Product not found.' })
    }

    if (action === 'subtract' && product.stock < quantity) {
      return reply.status(409).send({ message: 'Insufficient stock.' })
    }

    const updated = await prisma.product.update({
      where: {
        id,
        // Garante atomicidade: se o estoque mudou entre a leitura e a escrita, a query não encontra o registro
        stock: action === 'subtract' ? { gte: quantity } : undefined,
      },
      data: {
        stock: action === 'add' ? { increment: quantity } : { decrement: quantity },
      },
    })

    return { product: updated }
  })
}
