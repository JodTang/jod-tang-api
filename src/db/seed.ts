import type { FastifyInstance } from 'fastify'
import { db } from './index.ts'
import { inviteCodesTable } from './schema.ts'

export async function seed(app: FastifyInstance) {
  app.log.info('Seeding database...')

  const inviteCode = await db.query.inviteCodesTable.findFirst()
  if (!inviteCode) {
    app.log.info('No invite codes found, creating default invite code...')

    await db.insert(inviteCodesTable).values({
      code: process.env.DEFAULT_INVITE_CODE!,
      maxUses: 1,
      usedCount: 0,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    })
    app.log.info('Default invite code created')
  }

  app.log.info('Database seeding completed')
}
