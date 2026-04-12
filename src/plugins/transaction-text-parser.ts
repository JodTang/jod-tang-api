import type { FastifyInstance } from 'fastify'
import { TransactionTextParserService } from '../services/transaction-text-parser.service.ts'
import { definePlugin } from '../utils/factories.ts'

declare module 'fastify' {
  interface FastifyInstance {
    transactionTextParser: TransactionTextParserService
  }
}

const plugin = definePlugin(
  {
    name: 'transaction-text-parser',
    dependencies: ['gemini'],
  },
  async (app: FastifyInstance) => {
    app.decorate('transactionTextParser', new TransactionTextParserService(app.gemini))
  },
)

export default plugin
