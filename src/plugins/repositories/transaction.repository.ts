import { and, eq } from 'drizzle-orm'
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

  async findByIdAndUserId(id: string, userId: string) {
    return db.query.transactionsTable.findFirst({
      where: { id, userId },
    })
  }

  async updateCategory(id: string, userId: string, categoryId: string) {
    return (
      await db
        .update(transactionsTable)
        .set({ categoryId })
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.userId, userId)))
        .returning()
    )[0]
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
