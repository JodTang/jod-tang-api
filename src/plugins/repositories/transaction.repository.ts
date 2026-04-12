import { and, asc, desc, eq, gte, lte, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.ts'
import {
  type Category,
  categoriesTable,
  type NewTransaction,
  type Transaction,
  transactionsTable,
} from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'

export type TransactionListSortBy = 'amount' | 'createdAt' | 'transactedAt'

export interface ListTransactionsParams {
  categoryId?: string
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
  q?: string
  sortBy: TransactionListSortBy
  sortOrder: 'asc' | 'desc'
  source?: 'line' | 'web'
  transactedAt?: string
  type?: 'expense' | 'income'
  userId: string
}

export interface SummarizeTransactionsParams {
  categoryId?: string
  dateFrom?: string
  dateTo?: string
  q?: string
  source?: 'line' | 'web'
  transactedAt?: string
  type?: 'expense' | 'income'
  userId: string
}

declare module 'fastify' {
  interface FastifyInstance {
    transactionRepository: TransactionRepository
  }
}

export type TransactionCategorySummary = Pick<Category, 'icon' | 'id' | 'name' | 'type'>

export interface TransactionWithCategory {
  category: TransactionCategorySummary | null
  transaction: Transaction
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

  async findByUserIdAndDate(userId: string, transactedAt: string) {
    return db
      .select()
      .from(transactionsTable)
      .where(
        and(eq(transactionsTable.userId, userId), eq(transactionsTable.transactedAt, transactedAt)),
      )
      .orderBy(desc(transactionsTable.createdAt))
  }

  async findDetailedByIdAndUserId(id: string, userId: string) {
    const [item] = await db
      .select({
        transaction: transactionsTable,
        category: {
          id: categoriesTable.id,
          name: categoriesTable.name,
          icon: categoriesTable.icon,
          type: categoriesTable.type,
        },
      })
      .from(transactionsTable)
      .leftJoin(categoriesTable, eq(transactionsTable.categoryId, categoriesTable.id))
      .where(and(eq(transactionsTable.id, id), eq(transactionsTable.userId, userId)))

    return item
  }

  async list(params: ListTransactionsParams) {
    const where = this.#buildListWhere(params)
    const orderBy = this.#buildOrderBy(params.sortBy, params.sortOrder)

    const items = await db
      .select({
        transaction: transactionsTable,
        category: {
          id: categoriesTable.id,
          name: categoriesTable.name,
          icon: categoriesTable.icon,
          type: categoriesTable.type,
        },
      })
      .from(transactionsTable)
      .leftJoin(categoriesTable, eq(transactionsTable.categoryId, categoriesTable.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)

    const totalItems =
      params.page === 1 && items.length < params.pageSize
        ? items.length
        : (
            await db
              .select({
                totalItems: sql<number>`count(*)::int`,
              })
              .from(transactionsTable)
              .where(where)
          )[0].totalItems

    return {
      items,
      totalItems,
    }
  }

  async summarize(params: SummarizeTransactionsParams) {
    const where = this.#buildListWhere({
      ...params,
      page: 1,
      pageSize: 1,
      sortBy: 'transactedAt',
      sortOrder: 'desc',
    })

    const [summary] = await db
      .select({
        incomeTotal: sql<string>`coalesce(sum(case when ${transactionsTable.type} = 'income' then ${transactionsTable.amount} else 0 end), 0)::text`,
        expenseTotal: sql<string>`coalesce(sum(case when ${transactionsTable.type} = 'expense' then ${transactionsTable.amount} else 0 end), 0)::text`,
        netTotal: sql<string>`coalesce(sum(case when ${transactionsTable.type} = 'income' then ${transactionsTable.amount} else -${transactionsTable.amount} end), 0)::text`,
        totalItems: sql<number>`count(*)::int`,
      })
      .from(transactionsTable)
      .where(where)

    return summary
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

  async updateByIdAndUserId(id: string, userId: string, transaction: Partial<NewTransaction>) {
    return (
      await db
        .update(transactionsTable)
        .set(transaction)
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.userId, userId)))
        .returning()
    )[0]
  }

  async deleteByIdAndUserId(id: string, userId: string) {
    return (
      await db
        .delete(transactionsTable)
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.userId, userId)))
        .returning()
    )[0]
  }

  #buildListWhere(params: ListTransactionsParams | SummarizeTransactionsParams) {
    const filters = [eq(transactionsTable.userId, params.userId)]

    if (params.transactedAt) {
      filters.push(eq(transactionsTable.transactedAt, params.transactedAt))
    }

    if (params.dateFrom) {
      filters.push(gte(transactionsTable.transactedAt, params.dateFrom))
    }

    if (params.dateTo) {
      filters.push(lte(transactionsTable.transactedAt, params.dateTo))
    }

    if (params.type) {
      filters.push(eq(transactionsTable.type, params.type))
    }

    if (params.categoryId) {
      filters.push(eq(transactionsTable.categoryId, params.categoryId))
    }

    if (params.source) {
      filters.push(eq(transactionsTable.source, params.source))
    }

    if (params.q) {
      filters.push(
        or(
          sql`${transactionsTable.note} ilike ${`%${params.q}%`}`,
          sql`${transactionsTable.sourceText} ilike ${`%${params.q}%`}`,
        )!,
      )
    }

    return and(...filters)
  }

  #buildOrderBy(sortBy: TransactionListSortBy, sortOrder: 'asc' | 'desc') {
    const direction = sortOrder === 'asc' ? asc : desc

    switch (sortBy) {
      case 'amount':
        return [
          direction(transactionsTable.amount),
          direction(transactionsTable.transactedAt),
          direction(transactionsTable.createdAt),
          direction(transactionsTable.id),
        ] as const
      case 'createdAt':
        return [
          direction(transactionsTable.createdAt),
          direction(transactionsTable.transactedAt),
          direction(transactionsTable.id),
        ] as const
      case 'transactedAt':
        return [
          direction(transactionsTable.transactedAt),
          direction(transactionsTable.createdAt),
          direction(transactionsTable.id),
        ] as const
      default:
        return [
          desc(transactionsTable.transactedAt),
          desc(transactionsTable.createdAt),
          desc(transactionsTable.id),
        ] as const
    }
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
