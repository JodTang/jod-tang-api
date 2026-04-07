import { existsSync } from 'node:fs'
import { join } from 'node:path'
import fastifyAutoload from '@fastify/autoload'
import fastifySensible from '@fastify/sensible'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import Type from 'typebox'
import packageJson from '../package.json' with { type: 'json' }
import type { IConfig } from './config/index.ts'
import type { TypeBoxTypeProvider } from './utils/type-provider.ts'

export async function buildApp(config: IConfig) {
  const app = Fastify(config.fastifyInit).withTypeProvider<TypeBoxTypeProvider>()

  app.register(fastifySensible)

  app.register(fastifyAutoload, {
    dir: join(import.meta.dirname, 'plugins'),
    forceESM: true,
    options: { config },
  })

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error)
    return reply.send(error)
  })

  // health check
  app.get(
    '/api/health',
    {
      schema: {
        response: {
          200: Type.Object({
            status: Type.String(),
            name: Type.String(),
            description: Type.String(),
            version: Type.String(),
          }),
        },
      },
    },
    async () => {
      return {
        status: 'OK',
        name: packageJson.name,
        description: packageJson.description,
        version: packageJson.version,
      }
    },
  )

  app.register(fastifyAutoload, {
    dir: join(import.meta.dirname, 'routes'),
    forceESM: true,
    dirNameRoutePrefix: false,
    options: { prefix: '/api/v1', config },
  })

  const staticPath = join(import.meta.dirname, '../public')
  if (existsSync(staticPath)) {
    await app.register(fastifyStatic, {
      root: staticPath,
      prefix: '/',
      logLevel: 'silent',
    })

    app.log.info(`Serving static files from ${staticPath}`)

    // SPA fallback for non-API routes. Requests for missing assets should
    // stay 404 so the browser never receives HTML for JS/CSS files.
    app.setNotFoundHandler(async (request, reply) => {
      if (!request.url.startsWith('/api/')) {
        return reply.sendFile('index.html')
      }

      return reply.code(404).send({ error: 'Not found' })
    })
  }

  return app
}
