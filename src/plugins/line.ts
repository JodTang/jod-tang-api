import fastifyLine from 'fastify-line'
import { definePlugin } from '../utils/factories.ts'

const plugin = definePlugin(
  {
    name: 'line',
    dependencies: [],
  },
  async (app, { config }) => {
    await app.register(fastifyLine, {
      channelAccessToken: config.line.accessToken,
      channelSecret: config.line.secret,
    })
  },
)

export default plugin
