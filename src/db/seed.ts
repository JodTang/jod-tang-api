import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { IConfig } from '../config/index.ts'
import { db } from './index.ts'
import { appSettingsTable, inviteCodesTable, usersTable } from './schema.ts'

export async function seed(app: FastifyInstance, config: IConfig) {
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

  const geminiModelSetting = await db.query.appSettingsTable.findFirst({
    where: { key: 'gemini_model' },
  })
  if (!geminiModelSetting) {
    app.log.info(
      { model: config.gemini.model },
      'No Gemini model setting found, creating default...',
    )

    await db.insert(appSettingsTable).values({
      key: 'gemini_model',
      value: config.gemini.model,
    })
    app.log.info('Default Gemini model setting created')
  }

  const existingOwner = await db.query.usersTable.findFirst({
    where: { role: 'owner' },
  })
  if (!existingOwner && config.bootstrapOwnerLineUserId) {
    const bootstrapOwner = await db.query.usersTable.findFirst({
      where: { lineUserId: config.bootstrapOwnerLineUserId },
    })

    if (bootstrapOwner) {
      await db
        .update(usersTable)
        .set({
          role: 'owner',
          status: 'active',
          activatedAt: bootstrapOwner.activatedAt || new Date(),
        })
        .where(eq(usersTable.id, bootstrapOwner.id))

      app.log.info(
        { lineUserId: config.bootstrapOwnerLineUserId },
        'Bootstrap owner promoted from existing user',
      )
    } else {
      await db.insert(usersTable).values({
        lineUserId: config.bootstrapOwnerLineUserId,
        displayName: 'Owner',
        status: 'active',
        role: 'owner',
        activatedAt: new Date(),
      })

      app.log.info(
        { lineUserId: config.bootstrapOwnerLineUserId },
        'Bootstrap owner created from config',
      )
    }
  }

  app.log.info('Database seeding completed')
}
