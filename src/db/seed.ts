import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { IConfig } from '../config/index.ts'
import { hashPassword } from '../utils/password.ts'
import { db } from './index.ts'
import {
  appSettingsTable,
  inviteCodesTable,
  localAuthCredentialsTable,
  usersTable,
} from './schema.ts'

interface SeedContext {
  app: FastifyInstance
  config: IConfig
}

interface SeedTask {
  name: string
  run: (context: SeedContext) => Promise<void>
}

export async function seed(app: FastifyInstance, config: IConfig) {
  app.log.info('Seeding database...')

  const context = { app, config } satisfies SeedContext
  const tasks: SeedTask[] = [
    {
      name: 'default-invite-code',
      run: ensureDefaultInviteCode,
    },
    {
      name: 'gemini-model-setting',
      run: ensureGeminiModelSetting,
    },
    {
      name: 'bootstrap-owner',
      run: ensureBootstrapOwner,
    },
    {
      name: 'bootstrap-owner-local-auth',
      run: ensureBootstrapOwnerLocalAuth,
    },
  ]

  for (const task of tasks) {
    app.log.debug({ task: task.name }, 'Running seed task')
    await task.run(context)
  }

  app.log.info('Database seeding completed')
}

async function ensureDefaultInviteCode({ app }: SeedContext) {
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
}

async function ensureGeminiModelSetting({ app, config }: SeedContext) {
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
}

async function ensureBootstrapOwner({ app, config }: SeedContext) {
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
}

async function ensureBootstrapOwnerLocalAuth({ app, config }: SeedContext) {
  const bootstrapOwnerUsername = config.localAuth.bootstrapOwnerUsername?.trim()
  const bootstrapOwnerPassword = config.localAuth.bootstrapOwnerPassword

  if (
    (bootstrapOwnerUsername && !bootstrapOwnerPassword) ||
    (!bootstrapOwnerUsername && bootstrapOwnerPassword)
  ) {
    app.log.warn(
      'Skipping bootstrap owner local auth because BOOTSTRAP_OWNER_USERNAME and BOOTSTRAP_OWNER_PASSWORD must both be set',
    )
  } else if (bootstrapOwnerUsername && bootstrapOwnerPassword) {
    const owner = await db.query.usersTable.findFirst({
      where: { role: 'owner' },
    })

    if (!owner) {
      app.log.warn(
        { username: bootstrapOwnerUsername },
        'Skipping bootstrap owner local auth because no owner user exists',
      )
      return
    }

    const passwordHash = await hashPassword(bootstrapOwnerPassword)

    await db
      .insert(localAuthCredentialsTable)
      .values({
        userId: owner.id,
        username: bootstrapOwnerUsername,
        passwordHash,
      })
      .onConflictDoUpdate({
        target: localAuthCredentialsTable.userId,
        set: {
          username: bootstrapOwnerUsername,
          passwordHash,
        },
      })

    app.log.info(
      { username: bootstrapOwnerUsername, userId: owner.id },
      'Bootstrap owner local auth configured',
    )
  }
}
