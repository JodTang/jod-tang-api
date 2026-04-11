import { and, asc, desc, eq, gt, sql } from 'drizzle-orm'
import { buildDefaultCategoriesForUser } from '../../db/default-categories.ts'
import { db } from '../../db/index.ts'
import {
  categoriesTable,
  inviteCodesTable,
  type NewInviteCode,
  usersTable,
} from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'

export type InviteCodeListStatus = 'active' | 'expired' | 'exhausted'
export type InviteCodeListSortBy = 'code' | 'createdAt' | 'expiresAt' | 'maxUses' | 'usedCount'

export interface ListInviteCodesParams {
  code?: string
  page: number
  pageSize: number
  sortBy: InviteCodeListSortBy
  sortOrder: 'asc' | 'desc'
  status?: InviteCodeListStatus
}

declare module 'fastify' {
  interface FastifyInstance {
    inviteCodeRepository: InviteCodeRepository
  }
}

export class InviteCodeRepository {
  async create(inviteCode: NewInviteCode) {
    return (await db.insert(inviteCodesTable).values(inviteCode).returning())[0]
  }

  async findByCode(code: string) {
    return db.query.inviteCodesTable.findFirst({
      where: { code },
    })
  }

  async findAvailable(code: string) {
    return db.query.inviteCodesTable.findFirst({
      where: { code, RAW: (t) => gt(t.maxUses, t.usedCount) },
    })
  }

  async list(params: ListInviteCodesParams) {
    const now = new Date()
    const where = this.#buildListWhere(params, now)
    const orderBy = this.#buildOrderBy(params.sortBy, params.sortOrder)

    const items = await db
      .select()
      .from(inviteCodesTable)
      .where(where)
      .orderBy(...orderBy)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)

    const [{ totalItems }] = await db
      .select({
        totalItems: sql<number>`count(*)::int`,
      })
      .from(inviteCodesTable)
      .where(where)

    return {
      items,
      totalItems,
    }
  }

  async incrementUsedCountAndUpdateUser(code: string, userId: string) {
    return db.transaction(async (tx) => {
      const inviteCode = await tx
        .update(inviteCodesTable)
        .set({ usedCount: sql`${inviteCodesTable.usedCount} + 1` })
        .where(eq(inviteCodesTable.code, code))
        .returning()

      await tx
        .update(usersTable)
        .set({
          inviteCodeId: inviteCode[0].id,
          status: 'active',
          activatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId))

      const existingCategories = await tx.query.categoriesTable.findMany({
        where: { userId },
      })

      const existingCategoryKeys = new Set(
        existingCategories.map((category) => `${category.type}:${category.name}`),
      )

      const missingDefaultCategories = buildDefaultCategoriesForUser(userId).filter(
        (category) => !existingCategoryKeys.has(`${category.type}:${category.name}`),
      )

      if (missingDefaultCategories.length > 0) {
        await tx.insert(categoriesTable).values(missingDefaultCategories)
      }
    })
  }

  #buildListWhere(params: ListInviteCodesParams, now: Date) {
    const filters = []

    if (params.code) {
      filters.push(sql`${inviteCodesTable.code} ilike ${`%${params.code}%`}`)
    }

    if (params.status === 'active') {
      filters.push(
        sql`(${inviteCodesTable.expiresAt} is null or ${inviteCodesTable.expiresAt} > ${now})`,
      )
      filters.push(sql`${inviteCodesTable.usedCount} < ${inviteCodesTable.maxUses}`)
    }

    if (params.status === 'expired') {
      filters.push(
        sql`${inviteCodesTable.expiresAt} is not null and ${inviteCodesTable.expiresAt} <= ${now}`,
      )
    }

    if (params.status === 'exhausted') {
      filters.push(
        sql`(${inviteCodesTable.expiresAt} is null or ${inviteCodesTable.expiresAt} > ${now})`,
      )
      filters.push(sql`${inviteCodesTable.usedCount} >= ${inviteCodesTable.maxUses}`)
    }

    if (filters.length === 0) {
      return undefined
    }

    return and(...filters)
  }

  #buildOrderBy(sortBy: InviteCodeListSortBy, sortOrder: 'asc' | 'desc') {
    const direction = sortOrder === 'asc' ? asc : desc
    switch (sortBy) {
      case 'code':
        return [direction(inviteCodesTable.code), desc(inviteCodesTable.createdAt)] as const
      case 'createdAt':
        return [direction(inviteCodesTable.createdAt), desc(inviteCodesTable.createdAt)] as const
      case 'expiresAt':
        return [direction(inviteCodesTable.expiresAt), desc(inviteCodesTable.createdAt)] as const
      case 'maxUses':
        return [direction(inviteCodesTable.maxUses), desc(inviteCodesTable.createdAt)] as const
      case 'usedCount':
        return [direction(inviteCodesTable.usedCount), desc(inviteCodesTable.createdAt)] as const
      default:
        return [desc(inviteCodesTable.createdAt)] as const
    }
  }
}

const plugin = definePlugin(
  {
    name: 'invite-code-repository',
    dependencies: ['db'],
  },
  async (app) => {
    app.decorate('inviteCodeRepository', new InviteCodeRepository())
  },
)

export default plugin
