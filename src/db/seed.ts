import type { FastifyInstance } from 'fastify'
import type { IConfig } from '../config/index.ts'
import { db } from './index.ts'
import { appSettingsTable, inviteCodesTable } from './schema.ts'

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

  app.log.info('Database seeding completed')
}
