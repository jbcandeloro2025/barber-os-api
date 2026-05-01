import { FastifyInstance } from 'fastify'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { extname, resolve } from 'node:path'
import { authMiddleware } from '../middlewares/auth'

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware)

  app.post('/', async (request, reply) => {
    const data = await request.file()

    if (!data) {
      return reply.status(400).send({ message: 'No file uploaded.' })
    }

    const fileId = randomUUID()
    const extension = extname(data.filename)
    const fileName = `${fileId}${extension}`

    const uploadPath = resolve(__dirname, '../../uploads', fileName)

    await pipeline(data.file, createWriteStream(uploadPath))

    const fileUrl = `${request.protocol}://${request.hostname}/uploads/${fileName}`

    return reply.status(201).send({ fileUrl })
  })
}
