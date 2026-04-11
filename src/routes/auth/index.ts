import Type from 'typebox'
import type { TypedRoutePlugin } from '../../utils/factories.ts'
import { hashPassword, verifyPassword } from '../../utils/password.ts'

const lineAuthBodySchema = Type.Object({
  idToken: Type.String({ minLength: 1 }),
})

const localAuthBodySchema = Type.Object({
  username: Type.String({ minLength: 1, maxLength: 255 }),
  password: Type.String({ minLength: 1, maxLength: 255 }),
})

const createLocalAuthCredentialBodySchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  username: Type.String({ minLength: 1, maxLength: 255 }),
  password: Type.String({ minLength: 1, maxLength: 255 }),
})

const authUserSchema = Type.Object({
  id: Type.String(),
  lineUserId: Type.String(),
  displayName: Type.String(),
  pictureUrl: Type.Union([Type.String(), Type.Null()]),
  role: Type.Enum(['user', 'admin', 'owner']),
  status: Type.Enum(['pending', 'active', 'banned']),
})

const authSuccessSchema = Type.Object({
  accessToken: Type.String(),
  tokenType: Type.Literal('Bearer'),
  user: authUserSchema,
})

const meResponseSchema = Type.Object({
  user: authUserSchema,
})

const localAuthCredentialResponseSchema = Type.Object({
  user: authUserSchema,
  credential: Type.Object({
    username: Type.String(),
  }),
})

const route: TypedRoutePlugin = async (app) => {
  app.post(
    '/auth/local/credentials',
    {
      schema: {
        tags: ['auth'],
        summary: 'Create local auth credential',
        description: 'Create a local username and password for a user',
        body: createLocalAuthCredentialBodySchema,
        response: {
          201: localAuthCredentialResponseSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
          403: { $ref: 'responses#/properties/forbidden', description: 'Forbidden' },
          404: { $ref: 'responses#/properties/notFound', description: 'Not Found' },
          409: { $ref: 'responses#/properties/conflict', description: 'Conflict' },
        },
      },
      config: {
        auth: true,
        roles: ['owner'],
      },
    },
    async (request, reply) => {
      const username = request.body.username.trim()
      if (!username) {
        throw app.httpErrors.badRequest('Username is required')
      }

      const user = await app.userRepository.findById(request.body.userId)
      if (!user) {
        throw app.httpErrors.notFound('User not found')
      }

      const existingCredentialForUser = await app.localAuthCredentialRepository.findByUserId(
        user.id,
      )
      if (existingCredentialForUser) {
        throw app.httpErrors.conflict('User already has local auth credentials')
      }

      const existingCredentialForUsername =
        await app.localAuthCredentialRepository.findByUsername(username)
      if (existingCredentialForUsername) {
        throw app.httpErrors.conflict('Username is already in use')
      }

      const credential = await app.localAuthCredentialRepository.createForUser(user.id, {
        username,
        passwordHash: await hashPassword(request.body.password),
      })

      reply.code(201)
      return {
        user: {
          id: user.id,
          lineUserId: user.lineUserId,
          displayName: user.displayName,
          pictureUrl: user.pictureUrl,
          role: user.role,
          status: user.status,
        },
        credential: {
          username: credential.username,
        },
      }
    },
  )

  app.post(
    '/auth/local',
    {
      schema: {
        tags: ['auth'],
        summary: 'Local login',
        description: 'Login with local username and password',
        body: localAuthBodySchema,
        response: {
          200: authSuccessSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
        },
      },
      config: {
        auth: false,
      },
    },
    async (request, reply) => {
      const username = request.body.username.trim()
      const password = request.body.password
      if (!username) {
        throw app.httpErrors.badRequest('Username is required')
      }

      const authRecord = await app.localAuthCredentialRepository.findUserByUsername(username)
      if (!authRecord) {
        throw app.httpErrors.unauthorized('Invalid username or password')
      }

      const isPasswordValid = await verifyPassword(password, authRecord.credential.passwordHash)
      if (!isPasswordValid) {
        throw app.httpErrors.unauthorized('Invalid username or password')
      }

      const accessToken = app.signAccessToken({
        userId: authRecord.user.id,
        lineUserId: authRecord.user.lineUserId,
      })

      app.setAccessTokenCookie(reply, accessToken)

      return {
        accessToken,
        tokenType: 'Bearer' as const,
        user: {
          id: authRecord.user.id,
          lineUserId: authRecord.user.lineUserId,
          displayName: authRecord.user.displayName,
          pictureUrl: authRecord.user.pictureUrl,
          role: authRecord.user.role,
          status: authRecord.user.status,
        },
      }
    },
  )

  app.post(
    '/auth/line',
    {
      schema: {
        tags: ['auth'],
        summary: 'LINE OAuth callback',
        description: 'Exchange LINE ID token for access token and user info',
        body: lineAuthBodySchema,
        response: {
          200: authSuccessSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
        },
      },
      config: {
        auth: false,
      },
    },
    async (request, reply) => {
      const verified = await app.verifyLineIdToken(request.body.idToken)

      let user = await app.userRepository.findByLineUserId(verified.sub)

      if (!user) {
        user = await app.userRepository.create({
          lineUserId: verified.sub,
          displayName: verified.name || 'LINE User',
          pictureUrl: verified.picture || null,
          status: 'pending',
        })
      } else if (
        (verified.name && user.displayName !== verified.name) ||
        user.pictureUrl !== (verified.picture || null)
      ) {
        user = await app.userRepository.updateProfile(user.id, {
          displayName: verified.name || user.displayName,
          pictureUrl: verified.picture || null,
        })
      }

      const accessToken = app.signAccessToken({
        userId: user.id,
        lineUserId: user.lineUserId,
      })

      app.setAccessTokenCookie(reply, accessToken)

      return {
        accessToken,
        tokenType: 'Bearer' as const,
        user: {
          id: user.id,
          lineUserId: user.lineUserId,
          displayName: user.displayName,
          pictureUrl: user.pictureUrl,
          role: user.role,
          status: user.status,
        },
      }
    },
  )

  app.get(
    '/auth/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'Get current user',
        description: 'Get the authenticated user information',
        response: {
          200: meResponseSchema,
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
        },
      },
      config: {
        auth: true,
      },
    },
    async (request) => {
      const user = request.getUser()
      return {
        user: {
          id: user.id,
          lineUserId: user.lineUserId,
          displayName: user.displayName,
          pictureUrl: user.pictureUrl,
          role: user.role,
          status: user.status,
        },
      }
    },
  )

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Logout',
        description: 'Logout and clear access token cookie',
        response: {
          204: Type.Null(),
        },
      },
      config: {
        auth: false,
      },
    },
    async (_request, reply) => {
      app.clearAccessTokenCookie(reply)
      reply.code(204).send(null)
    },
  )
}

export default route
