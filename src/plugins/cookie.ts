import fastifyCookie from '@fastify/cookie'
import { definePlugin } from '../utils/factories.ts'

const plugin = definePlugin(
  {
    name: 'cookie',
  },
  async (app, { config }) => {
    await app.register(fastifyCookie, {
      secret: config.jwt.accessTokenSecret,
      hook: 'onRequest',
    })
  },
)

export default plugin
