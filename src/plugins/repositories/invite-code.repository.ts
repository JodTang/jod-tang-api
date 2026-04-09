import { eq, gt, sql } from 'drizzle-orm'
import { buildDefaultCategoriesForUser } from '../../db/default-categories.ts'
import { db } from '../../db/index.ts'
import {
  categoriesTable,
  inviteCodesTable,
  type NewInviteCode,
  usersTable,
} from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'

declare module 'fastify' {
  interface FastifyInstance {
    inviteCodeRepository: InviteCodeRepository
  }
}

export class InviteCodeRepository {
  async create(inviteCode: NewInviteCode) {
    return (await db.insert(inviteCodesTable).values(inviteCode).returning())[0]
  }

  async findAvailable(code: string) {
    return db.query.inviteCodesTable.findFirst({
      where: { code, RAW: (t) => gt(t.maxUses, t.usedCount) },
    })
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
