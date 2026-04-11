import { randomBytes } from 'node:crypto'
import Type from 'typebox'
import type { InviteCodeListStatus } from '../../plugins/repositories/invite-code.repository.ts'
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

const inviteCodeParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

const inviteCodeListStatusSchema = Type.Enum(['active', 'expired', 'exhausted'])

const inviteCodeListSortBySchema = Type.Enum([
  'code',
  'createdAt',
  'expiresAt',
  'maxUses',
  'usedCount',
])

const inviteCodeListQuerySchema = Type.Object({
  code: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  status: Type.Optional(inviteCodeListStatusSchema),
  page: OptionalWithDefault(Type.Integer({ minimum: 1 }), { default: 1 }),
  pageSize: OptionalWithDefault(Type.Integer({ minimum: 1, maximum: 100 }), { default: 20 }),
  sortBy: OptionalWithDefault(inviteCodeListSortBySchema, { default: 'createdAt' }),
  sortOrder: OptionalWithDefault(Type.Enum(['asc', 'desc']), { default: 'desc' }),
})

const inviteCodeListItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  code: Type.String(),
  maxUses: Type.Integer(),
  usedCount: Type.Integer(),
  remainingUses: Type.Integer({ minimum: 0 }),
  status: inviteCodeListStatusSchema,
  expiresAt: Type.Union([TDate, Type.Null()]),
  createdAt: TDate,
  updatedAt: TDate,
})

const inviteCodeListResponseSchema = Type.Object({
  items: Type.Array(inviteCodeListItemSchema),
  meta: Type.Object({
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({ minimum: 1 }),
    totalItems: Type.Integer({ minimum: 0 }),
    totalPages: Type.Integer({ minimum: 0 }),
  }),
})

const updateInviteCodeBodySchema = Type.Object(
  {
    code: Type.Optional(
      Type.String({
        minLength: 4,
        maxLength: 32,
        pattern: '^[A-Z0-9-]+$',
      }),
    ),
    maxUses: Type.Optional(Type.Integer({ minimum: 1 })),
    expiresAt: Type.Optional(Type.Union([TDate, Type.Null()])),
  },
  {
    minProperties: 1,
  },
)

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

  function getInviteCodeStatus(inviteCode: {
    expiresAt: Date | null
    maxUses: number
    usedCount: number
  }): InviteCodeListStatus {
    const now = Date.now()

    if (inviteCode.expiresAt && inviteCode.expiresAt.getTime() <= now) {
      return 'expired'
    }

    if (inviteCode.usedCount >= inviteCode.maxUses) {
      return 'exhausted'
    }

    return 'active'
  }

  function toInviteCodeListItem(inviteCode: {
    id: string
    code: string
    maxUses: number
    usedCount: number
    expiresAt: Date | null
    createdAt: Date
    updatedAt: Date
  }) {
    return {
      id: inviteCode.id,
      code: inviteCode.code,
      maxUses: inviteCode.maxUses,
      usedCount: inviteCode.usedCount,
      remainingUses: Math.max(inviteCode.maxUses - inviteCode.usedCount, 0),
      status: getInviteCodeStatus(inviteCode),
      expiresAt: inviteCode.expiresAt,
      createdAt: inviteCode.createdAt,
      updatedAt: inviteCode.updatedAt,
    }
  }

  app.get(
    '/invite-codes',
    {
      schema: {
        tags: ['invite-codes'],
        summary: 'List invite codes',
        description: 'List invite codes with filtering, sorting, and pagination',
        querystring: inviteCodeListQuerySchema,
        response: {
          200: inviteCodeListResponseSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
          403: { $ref: 'responses#/properties/forbidden', description: 'Forbidden' },
        },
      },
      preHandler: [app.authenticate, app.authorizeRoles('admin', 'owner')],
    },
    async (request) => {
      const filters = {
        code: request.query.code?.trim(),
        status: request.query.status,
        page: request.query.page,
        pageSize: request.query.pageSize,
        sortBy: request.query.sortBy,
        sortOrder: request.query.sortOrder,
      }

      const { items, totalItems } = await app.inviteCodeRepository.list(filters)
      const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / filters.pageSize)

      return {
        items: items.map(toInviteCodeListItem),
        meta: {
          page: filters.page,
          pageSize: filters.pageSize,
          totalItems,
          totalPages,
        },
      }
    },
  )

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

  app.patch(
    '/invite-codes/:id',
    {
      schema: {
        tags: ['invite-codes'],
        summary: 'Update invite code',
        description: 'Update an existing invite code',
        params: inviteCodeParamsSchema,
        body: updateInviteCodeBodySchema,
        response: {
          200: createInviteCodeResponseSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
          403: { $ref: 'responses#/properties/forbidden', description: 'Forbidden' },
          404: { $ref: 'responses#/properties/notFound', description: 'Not Found' },
          409: { $ref: 'responses#/properties/conflict', description: 'Conflict' },
        },
      },
      preHandler: [app.authenticate, app.authorizeRoles('admin', 'owner')],
    },
    async (request) => {
      const existingInviteCode = await app.inviteCodeRepository.findById(request.params.id)
      if (!existingInviteCode) {
        throw app.httpErrors.notFound('Invite code not found')
      }

      const requestedCode = request.body.code?.trim().toUpperCase()
      if (request.body.code !== undefined && !requestedCode) {
        throw app.httpErrors.badRequest('Invite code is required')
      }

      if (requestedCode && requestedCode !== existingInviteCode.code) {
        const duplicateCode = await app.inviteCodeRepository.findByCode(requestedCode)
        if (duplicateCode) {
          throw app.httpErrors.conflict('Invite code already exists')
        }
      }

      if (
        request.body.maxUses !== undefined &&
        request.body.maxUses < existingInviteCode.usedCount
      ) {
        throw app.httpErrors.badRequest('maxUses cannot be lower than usedCount')
      }

      const updatePayload = {
        ...(requestedCode ? { code: requestedCode } : {}),
        ...(request.body.maxUses !== undefined ? { maxUses: request.body.maxUses } : {}),
        ...(request.body.expiresAt !== undefined
          ? { expiresAt: normalizeExpiresAt(request.body.expiresAt as string | Date | null) }
          : {}),
      }

      try {
        const inviteCode = await app.inviteCodeRepository.updateById(
          request.params.id,
          updatePayload,
        )
        if (!inviteCode) {
          throw app.httpErrors.notFound('Invite code not found')
        }

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

  app.delete(
    '/invite-codes/:id',
    {
      schema: {
        tags: ['invite-codes'],
        summary: 'Delete invite code',
        description: 'Delete an existing invite code',
        params: inviteCodeParamsSchema,
        response: {
          204: Type.Null(),
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
          403: { $ref: 'responses#/properties/forbidden', description: 'Forbidden' },
          404: { $ref: 'responses#/properties/notFound', description: 'Not Found' },
        },
      },
      preHandler: [app.authenticate, app.authorizeRoles('admin', 'owner')],
    },
    async (request, reply) => {
      const inviteCode = await app.inviteCodeRepository.deleteById(request.params.id)
      if (!inviteCode) {
        throw app.httpErrors.notFound('Invite code not found')
      }

      reply.code(204).send(null)
    },
  )
}

export default route
