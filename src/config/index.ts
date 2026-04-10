import type { SwaggerOptions } from '@fastify/swagger'
import envSchema from 'env-schema'
import type { FastifyServerOptions } from 'fastify'
import Type, { type Static } from 'typebox'

export interface IConfig {
  host: string
  port: number
  openapi: SwaggerOptions
  fastifyInit: FastifyServerOptions
  bootstrapOwnerLineUserId?: string
  jwt: {
    accessTokenSecret: string
    refreshTokenSecret: string
    accessTokenTTL: string // e.g., "15m", "1h", "30d"
    slidingTTLMs: number // milliseconds
    nbfGrace: string // e.g., "10s", "1m"
  }
  enableCookieSecure: boolean
  frontendUrl: string
  enableDbConnection?: boolean // default: true
  line: {
    channelId: string
    accessToken: string
    secret: string
    endpoint: string
  }
  gemini: {
    apiKey?: string
    model: string
  }
}

function getLoggerConfig(logLevel: string) {
  if (process.stdout.isTTY) {
    return {
      level: logLevel,
      transport: {
        target: 'pino-pretty',
      },
    }
  }

  return { level: logLevel }
}

const schema = Type.Object({
  PORT: Type.Number({ default: 5000 }),
  HOST: Type.String({ default: '0.0.0.0' }),
  POSTGRES_URL: Type.String(),
  LOG_LEVEL: Type.Union(
    [
      Type.Literal('trace'),
      Type.Literal('debug'),
      Type.Literal('info'),
      Type.Literal('warn'),
      Type.Literal('error'),
      Type.Literal('fatal'),
      Type.Literal('silent'),
    ],
    { default: 'info' },
  ),
  JWT_ACCESS_TOKEN_SECRET: Type.String(),
  JWT_REFRESH_TOKEN_SECRET: Type.String(),
  JWT_ACCESS_TOKEN_TTL: Type.String({ default: '15m' }), // 15 minutes
  JWT_SLIDING_TTL_MS: Type.Number({ default: 30 * 24 * 60 * 60 * 1000 }), // 30 days in milliseconds
  JWT_NBF_GRACE: Type.String({ default: '10s' }), // 10 seconds
  ENABLE_COOKIE_SECURE: Type.Boolean({ default: true }),
  FRONTEND_URL: Type.String({ default: 'http://localhost:3001' }),
  ENABLE_DB_CONNECTION: Type.Boolean({ default: true }),
  LINE_CHANNEL_ID: Type.String(),
  LINE_CHANNEL_SECRET: Type.String(),
  LINE_CHANNEL_ACCESS_TOKEN: Type.String(),
  LINE_ENDPOINT: Type.String({ default: 'https://api.line.me' }),
  DEFAULT_INVITE_CODE: Type.String(),
  BOOTSTRAP_OWNER_LINE_USER_ID: Type.Optional(Type.String()),
  GEMINI_API_KEY: Type.Optional(Type.String()),
  GEMINI_MODEL: Type.String({ default: 'gemini-3.1-flash-lite-preview' }),
})

function getConfig() {
  const env = envSchema<Static<typeof schema>>({
    dotenv: false,
    data: process.env,
    schema,
  })

  const config: IConfig = {
    host: env.HOST,
    port: env.PORT,
    fastifyInit: {
      logger: getLoggerConfig(env.LOG_LEVEL),
      routerOptions: {
        ignoreTrailingSlash: true,
      },
      bodyLimit: 1048576, // 1MB
      connectionTimeout: 60000, // 1 minute
      genReqId: () => crypto.randomUUID(),
      ajv: {
        customOptions: {
          removeAdditional: 'all',
        },
      },
      disableRequestLogging: env.LOG_LEVEL !== 'debug',
    },
    openapi: {
      openapi: {
        info: {
          title: 'Jod Tang API',
          description: 'API documentation for Jod Tang',
          version: '0.0.0',
        },
        tags: [],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              description: 'Bearer token authentication',
            },
          },
        },
        security: [{ bearerAuth: [] }],
      },
      convertConstToEnum: false,
      refResolver: {
        buildLocalReference(json, _baseUri, _fragment, i) {
          return (json.$id || `def-${i}`) as string
        },
      },
    },
    bootstrapOwnerLineUserId: env.BOOTSTRAP_OWNER_LINE_USER_ID,
    jwt: {
      accessTokenSecret: env.JWT_ACCESS_TOKEN_SECRET,
      refreshTokenSecret: env.JWT_REFRESH_TOKEN_SECRET,
      accessTokenTTL: env.JWT_ACCESS_TOKEN_TTL,
      slidingTTLMs: env.JWT_SLIDING_TTL_MS,
      nbfGrace: env.JWT_NBF_GRACE,
    },
    enableCookieSecure: env.ENABLE_COOKIE_SECURE,
    frontendUrl: env.FRONTEND_URL,
    enableDbConnection: env.ENABLE_DB_CONNECTION,
    line: {
      channelId: env.LINE_CHANNEL_ID,
      accessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
      secret: env.LINE_CHANNEL_SECRET,
      endpoint: env.LINE_ENDPOINT,
    },
    gemini: {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
    },
  }

  return config
}

export default getConfig
