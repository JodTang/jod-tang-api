import type { FastifyInstance, FastifySchema, RouteOptions } from 'fastify'
import { definePlugin } from '../utils/factories.ts'

function ensureSchema(routeOptions: RouteOptions) {
  routeOptions.schema ??= {}
  return routeOptions.schema
}

function ensureResponseSchema(schema: FastifySchema) {
  schema.response ??= {}
  return schema.response as Record<number, unknown>
}

function applyAuth(app: FastifyInstance, routeOptions: RouteOptions) {
  const schema = ensureSchema(routeOptions)
  const isAuthEnabled = routeOptions.config?.auth !== false

  if (isAuthEnabled) {
    const roles = routeOptions.config?.roles || []

    const existing = routeOptions.onRequest ?? []
    routeOptions.onRequest = [
      // Apply authentication first
      app.authenticate,
      ...(roles.length > 0 ? [app.authorizeRoles(...roles)] : []),
      ...(Array.isArray(existing) ? existing : [existing]),
    ]
    schema.security = [{ bearerAuth: [] }]

    // Add 401 response schema for authenticated routes
    const responseSchema = ensureResponseSchema(schema)
    responseSchema[401] = {
      $ref: 'responses#/properties/unauthorized',
      description: 'Unauthorized',
    }
  } else {
    schema.security = []
  }
}

const plugin = definePlugin(
  {
    name: 'route-preset',
    dependencies: ['auth'],
  },
  async (app) => {
    app.addHook('onRoute', (routeOptions) => {
      if (!routeOptions.url.startsWith('/api')) {
        return
      }

      if (routeOptions.url.startsWith('/api/docs')) {
        return
      }

      applyAuth(app, routeOptions)
    })
  },
)

export default plugin
