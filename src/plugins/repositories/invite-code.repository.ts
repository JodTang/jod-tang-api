import { eq, gt, sql } from 'drizzle-orm'
import { db } from '../../db/index.ts'
import { inviteCodesTable, type NewInviteCode, usersTable } from '../../db/schema.ts'
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
