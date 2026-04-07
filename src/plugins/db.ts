import { db } from '../db/index.ts'
import { definePlugin } from '../utils/factories.ts'

const plugin = definePlugin(
  {
    name: 'db',
  },
  async (app, { config }) => {
    if (config.enableDbConnection) {
      await db.execute('SELECT 1')
      app.log.info('Connected to database')
    }

    app.addHook('onClose', async () => {
      if (!db.$client.ended) {
        await db.$client.end()
        app.log.info('Disconnected from database')
      }
    })
  },
)

export default plugin
