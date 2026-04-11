import Type from 'typebox'
import { OptionalWithDefault, TDate } from '../../plugins/shared-schemas.ts'

export const createInviteCodeBodySchema = Type.Object({
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

export const inviteCodeSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  code: Type.String(),
  maxUses: Type.Integer(),
  usedCount: Type.Integer(),
  expiresAt: Type.Union([TDate, Type.Null()]),
  createdAt: TDate,
  updatedAt: TDate,
})

export const createInviteCodeResponseSchema = Type.Object({
  inviteCode: inviteCodeSchema,
})

export const inviteCodeParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const inviteCodeListStatusSchema = Type.Enum(['active', 'expired', 'exhausted'])

export const inviteCodeListSortBySchema = Type.Enum([
  'code',
  'createdAt',
  'expiresAt',
  'maxUses',
  'usedCount',
])

export const inviteCodeListQuerySchema = Type.Object({
  code: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  status: Type.Optional(inviteCodeListStatusSchema),
  page: OptionalWithDefault(Type.Integer({ minimum: 1 }), { default: 1 }),
  pageSize: OptionalWithDefault(Type.Integer({ minimum: 1, maximum: 100 }), { default: 20 }),
  sortBy: OptionalWithDefault(inviteCodeListSortBySchema, { default: 'createdAt' }),
  sortOrder: OptionalWithDefault(Type.Enum(['asc', 'desc']), { default: 'desc' }),
})

export const inviteCodeListItemSchema = Type.Object({
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

export const inviteCodeListResponseSchema = Type.Object({
  items: Type.Array(inviteCodeListItemSchema),
  meta: Type.Object({
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({ minimum: 1 }),
    totalItems: Type.Integer({ minimum: 0 }),
    totalPages: Type.Integer({ minimum: 0 }),
  }),
})

export const updateInviteCodeBodySchema = Type.Object(
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

export const deleteInviteCodeResponseSchema = Type.Null()
