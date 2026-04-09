import { db } from '../../db/index.ts'
import { type NewTransaction, transactionsTable } from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'

declare module 'fastify' {
  interface FastifyInstance {
    transactionRepository: TransactionRepository
  }
}

export class TransactionRepository {
  async create(transaction: NewTransaction) {
    return (await db.insert(transactionsTable).values(transaction).returning())[0]
  }
}

const plugin = definePlugin(
  {
    name: 'transaction-repository',
    dependencies: ['db'],
  },
  async (app) => {
    app.decorate('transactionRepository', new TransactionRepository())
  },
)

export default plugin
