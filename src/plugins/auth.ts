import { createSigner, createVerifier, TokenError } from 'fast-jwt'
import type { User } from '../db/schema.ts'
import { definePlugin } from '../utils/factories.ts'

const accessTokenCookieName = 'access_token'
const accessTokenIssuer = 'jod-tang-api'
const accessTokenAudience = 'jod-tang-api-client'

interface AuthTokenPayload {
  lineUserId: string
  userId: string
}

interface VerifyLineIdTokenResult {
  aud: string
  exp: number
  iat: number
  iss: string
  name?: string
  picture?: string
  sub: string
}

declare module 'fastify' {
  interface FastifyInstance {
    accessTokenCookieName: string
    authenticate: (request: import('fastify').FastifyRequest) => Promise<void>
    clearAccessTokenCookie: (reply: import('fastify').FastifyReply) => void
    setAccessTokenCookie: (reply: import('fastify').FastifyReply, token: string) => void
    signAccessToken: (payload: AuthTokenPayload) => string
    verifyAccessToken: (token: string) => AuthTokenPayload & {
      aud?: string | string[]
      exp?: number
      iat?: number
      iss?: string
      sub?: string
    }
    verifyLineIdToken: (idToken: string) => Promise<VerifyLineIdTokenResult>
  }

  interface FastifyRequest {
    authUser: User | null
  }
}

function parseDurationMs(value: string) {
  const normalized = value.trim()
  const matched = normalized.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i)

  if (!matched) {
    return null
  }

  const amount = Number(matched[1])
  const unit = (matched[2] || 'ms').toLowerCase()

  switch (unit) {
    case 'ms':
      return amount
    case 's':
      return amount * 1000
    case 'm':
      return amount * 60 * 1000
    case 'h':
      return amount * 60 * 60 * 1000
    case 'd':
      return amount * 24 * 60 * 60 * 1000
    default:
      return null
  }
}

const plugin = definePlugin(
  {
    name: 'auth',
    dependencies: ['cookie', 'user-repository'],
  },
  async (app, { config }) => {
    const signAccessToken = createSigner<AuthTokenPayload>({
      key: config.jwt.accessTokenSecret,
      expiresIn: config.jwt.accessTokenTTL,
      aud: accessTokenAudience,
      iss: accessTokenIssuer,
    })

    const verifyAccessToken = createVerifier({
      key: config.jwt.accessTokenSecret,
      allowedAud: accessTokenAudience,
      allowedIss: accessTokenIssuer,
    })

    function getTokenFromRequest(request: import('fastify').FastifyRequest) {
      const authorization = request.headers.authorization
      if (authorization?.startsWith('Bearer ')) {
        return authorization.slice('Bearer '.length).trim()
      }

      const cookieToken = request.cookies[accessTokenCookieName]
      return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : null
    }

    const accessTokenCookieMaxAgeMs = parseDurationMs(config.jwt.accessTokenTTL)

    function setAccessTokenCookie(reply: import('fastify').FastifyReply, token: string) {
      reply.setCookie(accessTokenCookieName, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.enableCookieSecure,
        ...(accessTokenCookieMaxAgeMs
          ? { maxAge: Math.floor(accessTokenCookieMaxAgeMs / 1000) }
          : {}),
      })
    }

    function clearAccessTokenCookie(reply: import('fastify').FastifyReply) {
      reply.clearCookie(accessTokenCookieName, {
        path: '/',
        sameSite: 'lax',
        secure: config.enableCookieSecure,
      })
    }

    async function authenticate(request: import('fastify').FastifyRequest) {
      const token = getTokenFromRequest(request)
      if (!token) {
        throw app.httpErrors.unauthorized('Missing access token')
      }

      let payload: ReturnType<typeof verifyAccessToken>
      try {
        payload = verifyAccessToken(token)
      } catch (error) {
        if (error instanceof TokenError) {
          throw app.httpErrors.unauthorized('Invalid access token')
        }

        throw error
      }

      const user = await app.userRepository.findById(payload.userId)
      if (!user) {
        throw app.httpErrors.unauthorized('User not found')
      }

      request.authUser = user
    }

    async function verifyLineIdToken(idToken: string) {
      const response = await fetch(new URL('/oauth2/v2.1/verify', config.line.endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          id_token: idToken,
          client_id: config.line.channelId,
        }),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw app.httpErrors.unauthorized(errorBody || 'Failed to verify LINE ID token')
      }

      return (await response.json()) as VerifyLineIdTokenResult
    }

    app.decorate('accessTokenCookieName', accessTokenCookieName)
    app.decorate('authenticate', authenticate)
    app.decorate('clearAccessTokenCookie', clearAccessTokenCookie)
    app.decorate('setAccessTokenCookie', setAccessTokenCookie)
    app.decorate('signAccessToken', signAccessToken)
    app.decorate('verifyAccessToken', verifyAccessToken)
    app.decorate('verifyLineIdToken', verifyLineIdToken)
    app.decorateRequest('authUser', null)
  },
)

export default plugin
