import Type from 'typebox'
import { OptionalWithDefault, TDate } from '../../plugins/shared-schemas.ts'

const TDateOnly = Type.String({ format: 'date' })
const TAmountString = Type.String({
  pattern: '^\\d+(?:\\.\\d{1,2})?$',
})

export const transactionTypeSchema = Type.Enum(['expense', 'income'])
export const transactionSourceSchema = Type.Enum(['web', 'line'])
export const transactionSortBySchema = Type.Enum(['transactedAt', 'createdAt', 'amount'])

export const transactionCategorySchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  icon: Type.Union([Type.String(), Type.Null()]),
  type: Type.Enum(['expense', 'income', 'both']),
})

export const transactionDetailSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  type: transactionTypeSchema,
  amount: Type.String(),
  note: Type.Union([Type.String(), Type.Null()]),
  sourceText: Type.Union([Type.String(), Type.Null()]),
  transactedAt: TDateOnly,
  source: Type.Union([transactionSourceSchema, Type.Null()]),
  categoryId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  createdAt: TDate,
  updatedAt: TDate,
  category: Type.Union([transactionCategorySchema, Type.Null()]),
})

export const transactionResponseSchema = Type.Object({
  transaction: transactionDetailSchema,
})

export const transactionListQuerySchema = Type.Object({
  transactedAt: Type.Optional(TDateOnly),
  dateFrom: Type.Optional(TDateOnly),
  dateTo: Type.Optional(TDateOnly),
  type: Type.Optional(transactionTypeSchema),
  categoryId: Type.Optional(Type.String({ format: 'uuid' })),
  source: Type.Optional(transactionSourceSchema),
  q: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  page: OptionalWithDefault(Type.Integer({ minimum: 1 }), { default: 1 }),
  pageSize: OptionalWithDefault(Type.Integer({ minimum: 1, maximum: 100 }), { default: 20 }),
  sortBy: OptionalWithDefault(transactionSortBySchema, { default: 'transactedAt' }),
  sortOrder: OptionalWithDefault(Type.Enum(['asc', 'desc']), { default: 'desc' }),
})

export const transactionListResponseSchema = Type.Object({
  items: Type.Array(transactionDetailSchema),
  meta: Type.Object({
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({ minimum: 1 }),
    totalItems: Type.Integer({ minimum: 0 }),
    totalPages: Type.Integer({ minimum: 0 }),
  }),
})

export const transactionSummaryQuerySchema = Type.Object({
  transactedAt: Type.Optional(TDateOnly),
  dateFrom: Type.Optional(TDateOnly),
  dateTo: Type.Optional(TDateOnly),
  type: Type.Optional(transactionTypeSchema),
  categoryId: Type.Optional(Type.String({ format: 'uuid' })),
  source: Type.Optional(transactionSourceSchema),
  q: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
})

export const transactionSummaryResponseSchema = Type.Object({
  incomeTotal: Type.String(),
  expenseTotal: Type.String(),
  netTotal: Type.String(),
  totalItems: Type.Integer({ minimum: 0 }),
})

export const transactionParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const createTransactionBodySchema = Type.Object({
  type: transactionTypeSchema,
  amount: TAmountString,
  transactedAt: TDateOnly,
  categoryId: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])),
  note: Type.Optional(Type.Union([Type.String({ maxLength: 5000 }), Type.Null()])),
})

export const updateTransactionBodySchema = Type.Object(
  {
    type: Type.Optional(transactionTypeSchema),
    amount: Type.Optional(TAmountString),
    transactedAt: Type.Optional(TDateOnly),
    categoryId: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])),
    note: Type.Optional(Type.Union([Type.String({ maxLength: 5000 }), Type.Null()])),
  },
  {
    minProperties: 1,
  },
)

export const updateTransactionCategoryBodySchema = Type.Object({
  categoryId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
})

export const deleteTransactionResponseSchema = Type.Null()
