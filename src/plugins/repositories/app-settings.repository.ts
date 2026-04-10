import { db } from '../../db/index.ts'
import { appSettingsTable } from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'

const geminiModelSettingKey = 'gemini_model'

declare module 'fastify' {
  interface FastifyInstance {
    appSettingsRepository: AppSettingsRepository
  }
}

export class AppSettingsRepository {
  async get(key: string) {
    return db.query.appSettingsTable.findFirst({
      where: { key },
    })
  }

  async set(key: string, value: string) {
    return (
      await db
        .insert(appSettingsTable)
        .values({ key, value })
        .onConflictDoUpdate({
          target: appSettingsTable.key,
          set: { value },
        })
        .returning()
    )[0]
  }

  async getGeminiModel() {
    return db.query.appSettingsTable.findFirst({
      where: { key: geminiModelSettingKey },
    })
  }

  async setGeminiModel(model: string) {
    return this.set(geminiModelSettingKey, model)
  }
}

const plugin = definePlugin(
  {
    name: 'app-settings-repository',
    dependencies: ['db'],
  },
  async (app) => {
    app.decorate('appSettingsRepository', new AppSettingsRepository())
  },
)

export default plugin
