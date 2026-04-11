import Type from 'typebox'
import type { TypedRoutePlugin } from '../../utils/factories.ts'

const lineAuthBodySchema = Type.Object({
  idToken: Type.String({ minLength: 1 }),
})

const authUserSchema = Type.Object({
  id: Type.String(),
  lineUserId: Type.String(),
  displayName: Type.String(),
  role: Type.Union([Type.Literal('user'), Type.Literal('admin'), Type.Literal('owner')]),
  status: Type.Union([Type.Literal('pending'), Type.Literal('active'), Type.Literal('banned')]),
})

const authSuccessSchema = Type.Object({
  accessToken: Type.String(),
  tokenType: Type.Literal('Bearer'),
  user: authUserSchema,
})

const meResponseSchema = Type.Object({
  user: authUserSchema,
})

const route: TypedRoutePlugin = async (app) => {
  app.post(
    '/auth/line',
    {
      schema: {
        tags: ['auth'],
        body: lineAuthBodySchema,
        response: {
          200: authSuccessSchema,
        },
      },
    },
    async (request, reply) => {
      const verified = await app.verifyLineIdToken(request.body.idToken)

      let user = await app.userRepository.findByLineUserId(verified.sub)

      if (!user) {
        user = await app.userRepository.create({
          lineUserId: verified.sub,
          displayName: verified.name || 'LINE User',
          status: 'pending',
        })
      } else if (verified.name && user.displayName !== verified.name) {
        user = await app.userRepository.updateProfile(user.id, {
          displayName: verified.name,
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
        response: {
          200: meResponseSchema,
        },
      },
      preHandler: app.authenticate,
    },
    async (request) => {
      const user = request.getUser()
      return {
        user: {
          id: user.id,
          lineUserId: user.lineUserId,
          displayName: user.displayName,
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
        response: {
          204: Type.Null(),
        },
      },
    },
    async (_request, reply) => {
      app.clearAccessTokenCookie(reply)
      reply.code(204).send(null)
    },
  )
}

export default route
