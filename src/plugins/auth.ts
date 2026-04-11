import { createSigner, createVerifier, TokenError } from 'fast-jwt'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { User, UserRole } from '../db/schema.ts'
import { definePlugin } from '../utils/factories.ts'

const kUser = Symbol('user:context')

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
    authenticate: (request: FastifyRequest) => Promise<void>
    authorizeRoles: (...roles: UserRole[]) => (request: FastifyRequest) => Promise<void>
    clearAccessTokenCookie: (reply: FastifyReply) => void
    setAccessTokenCookie: (reply: FastifyReply, token: string) => void
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
    [kUser]: User | null
    getUser(): User
  }

  interface FastifyContextConfig {
    auth?: boolean
    roles?: UserRole[]
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

    function getTokenFromRequest(request: FastifyRequest) {
      const authorization = request.headers.authorization
      if (authorization?.startsWith('Bearer ')) {
        return authorization.slice('Bearer '.length).trim()
      }

      const cookieToken = request.cookies[accessTokenCookieName]
      return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : null
    }

    const accessTokenCookieMaxAgeMs = parseDurationMs(config.jwt.accessTokenTTL)

    function setAccessTokenCookie(reply: FastifyReply, token: string) {
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

    function clearAccessTokenCookie(reply: FastifyReply) {
      reply.clearCookie(accessTokenCookieName, {
        path: '/',
        sameSite: 'lax',
        secure: config.enableCookieSecure,
      })
    }

    async function authenticate(request: FastifyRequest) {
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

      request[kUser] = user
    }

    function authorizeRoles(...roles: UserRole[]) {
      return async function ensureRole(request: FastifyRequest) {
        const user = request.getUser()
        if (!roles.includes(user.role)) {
          throw app.httpErrors.forbidden('Insufficient permissions')
        }
      }
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
    app.decorate('authorizeRoles', authorizeRoles)
    app.decorate('clearAccessTokenCookie', clearAccessTokenCookie)
    app.decorate('setAccessTokenCookie', setAccessTokenCookie)
    app.decorate('signAccessToken', signAccessToken)
    app.decorate('verifyAccessToken', verifyAccessToken)
    app.decorate('verifyLineIdToken', verifyLineIdToken)
    app.decorateRequest(kUser, null)

    app.decorateRequest('getUser', function (this: FastifyRequest) {
      if (!this[kUser]) {
        throw app.httpErrors.unauthorized('Not authenticated')
      }
      return this[kUser]
    })
  },
)

export default plugin
