import type { webhook } from 'fastify-line'
import type { TypedRoutePlugin } from '../../utils/factories.ts'

const route: TypedRoutePlugin = async (app) => {
  app.post<{ Body: webhook.CallbackRequest }>(
    '/webhook/line',
    { config: { lineWebhook: true } },
    async (request, reply) => {
      const events = request.body
      app.log.info({ events }, 'Received LINE webhook event')
      return reply.send({ status: 'ok' })
    },
  )
}

export default route
