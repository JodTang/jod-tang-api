import { randomBytes } from 'node:crypto'
import Type from 'typebox'
import { OptionalWithDefault, TDate } from '../../plugins/shared-schemas.ts'
import type { TypedRoutePlugin } from '../../utils/factories.ts'

const createInviteCodeBodySchema = Type.Object({
  code: Type.Optional(
    Type.String({
      minLength: 4,
      maxLength: 32,
      pattern: '^[A-Z0-9-]+$',
    }),
  ),
  maxUses: OptionalWithDefault(Type.Integer({ minimum: 1 }), { default: 1 }),
  expiresAt: Type.Optional(Type.Union([TDate, Type.Null()])),
})

const inviteCodeSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  code: Type.String(),
  maxUses: Type.Integer(),
  usedCount: Type.Integer(),
  expiresAt: Type.Union([TDate, Type.Null()]),
  createdAt: TDate,
  updatedAt: TDate,
})

const createInviteCodeResponseSchema = Type.Object({
  inviteCode: inviteCodeSchema,
})

const route: TypedRoutePlugin = async (app) => {
  function normalizeExpiresAt(expiresAt?: string | Date | null) {
    if (expiresAt === undefined || expiresAt === null) {
      return null
    }

    const normalized = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
    if (Number.isNaN(normalized.getTime())) {
      throw app.httpErrors.badRequest('Invite code expiration is invalid')
    }

    if (normalized.getTime() <= Date.now()) {
      throw app.httpErrors.badRequest('Invite code expiration must be in the future')
    }

    return normalized
  }

  async function generateUniqueInviteCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = randomBytes(4).toString('hex').toUpperCase()
      const existingCode = await app.inviteCodeRepository.findByCode(code)
      if (!existingCode) {
        return code
      }
    }

    throw app.httpErrors.internalServerError('Failed to generate a unique invite code')
  }

  function isUniqueViolation(error: unknown) {
    if (!error || typeof error !== 'object') {
      return false
    }

    return 'code' in error && error.code === '23505'
  }

  app.post(
    '/invite-codes',
    {
      schema: {
        tags: ['invite-codes'],
        summary: 'Create invite code',
        description: 'Create an invite code for onboarding users',
        body: createInviteCodeBodySchema,
        response: {
          201: createInviteCodeResponseSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
          403: { $ref: 'responses#/properties/forbidden', description: 'Forbidden' },
          409: { $ref: 'responses#/properties/conflict', description: 'Conflict' },
        },
      },
      preHandler: [app.authenticate, app.authorizeRoles('admin', 'owner')],
    },
    async (request, reply) => {
      const requestedCode = request.body.code?.trim().toUpperCase()
      const expiresAt = normalizeExpiresAt(request.body.expiresAt as string | Date | null)

      if (requestedCode && (await app.inviteCodeRepository.findByCode(requestedCode))) {
        throw app.httpErrors.conflict('Invite code already exists')
      }

      const code = requestedCode || (await generateUniqueInviteCode())

      try {
        const inviteCode = await app.inviteCodeRepository.create({
          code,
          maxUses: request.body.maxUses,
          expiresAt,
        })

        reply.code(201)
        return {
          inviteCode,
        }
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw app.httpErrors.conflict('Invite code already exists')
        }

        throw error
      }
    },
  )
}

export default route
