import type { Static } from 'typebox'
import type { NewTransaction, TransactionType } from '../../db/schema.ts'
import type {
  ListTransactionsParams,
  SummarizeTransactionsParams,
  TransactionListSortBy,
  TransactionWithCategory,
} from '../../plugins/repositories/transaction.repository.ts'
import type { TypedRoutePlugin } from '../../utils/factories.ts'
import { canAssignCategoryToTransaction } from '../../utils/transaction-category-postback.ts'
import {
  createTransactionBodySchema,
  deleteTransactionResponseSchema,
  type transactionDetailSchema,
  transactionListQuerySchema,
  transactionListResponseSchema,
  transactionParamsSchema,
  transactionResponseSchema,
  transactionSummaryQuerySchema,
  transactionSummaryResponseSchema,
  updateTransactionBodySchema,
  updateTransactionCategoryBodySchema,
} from './schema.ts'

type TransactionDetail = Static<typeof transactionDetailSchema>

const route: TypedRoutePlugin = async (app) => {
  function isValidDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
      return false
    }

    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
  }

  function normalizeDate(value: string, fieldName: string) {
    const normalized = value.trim()
    if (!isValidDateOnly(normalized)) {
      throw app.httpErrors.badRequest(`${fieldName} must be a valid date in YYYY-MM-DD format`)
    }

    return normalized
  }

  function normalizeAmount(value: string) {
    const normalized = value.trim()
    if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized)) {
      throw app.httpErrors.badRequest('Amount must be a positive decimal with up to 2 decimals')
    }

    const amount = Number(normalized)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw app.httpErrors.badRequest('Amount must be greater than 0')
    }

    return amount.toFixed(2)
  }

  function formatMoney(value: string) {
    const amount = Number(value)
    if (!Number.isFinite(amount)) {
      throw app.httpErrors.internalServerError('Transaction total is invalid')
    }

    return amount.toFixed(2)
  }

  function normalizeOptionalNote(note?: string | null) {
    if (note === undefined) {
      return undefined
    }

    if (note === null) {
      return null
    }

    const normalized = note.trim()
    return normalized.length > 0 ? normalized : null
  }

  function assertValidDateFilterRange(dateFrom?: string, dateTo?: string, transactedAt?: string) {
    if (transactedAt && (dateFrom || dateTo)) {
      throw app.httpErrors.badRequest('Use either transactedAt or dateFrom/dateTo, not both')
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw app.httpErrors.badRequest('dateFrom must be earlier than or equal to dateTo')
    }
  }

  async function resolveCategory(
    userId: string,
    categoryId: string | null | undefined,
    transactionType: TransactionType,
  ) {
    if (categoryId === undefined) {
      return undefined
    }

    if (categoryId === null) {
      return null
    }

    const category = await app.categoryRepository.findByIdAndUserId(categoryId, userId)
    if (!category) {
      throw app.httpErrors.badRequest('Category not found')
    }

    if (!canAssignCategoryToTransaction(category, { type: transactionType })) {
      throw app.httpErrors.badRequest('Category is not compatible with transaction type')
    }

    return category
  }

  function toTransactionResponse(item: TransactionWithCategory): TransactionDetail {
    return {
      id: item.transaction.id,
      type: item.transaction.type,
      amount: item.transaction.amount,
      note: item.transaction.note,
      sourceText: item.transaction.sourceText,
      transactedAt: item.transaction.transactedAt,
      source: item.transaction.source,
      categoryId: item.transaction.categoryId,
      createdAt: item.transaction.createdAt,
      updatedAt: item.transaction.updatedAt,
      category: item.category,
    }
  }

  function getListFilters(
    userId: string,
    query: Static<typeof transactionListQuerySchema>,
  ): ListTransactionsParams {
    const transactedAt = query.transactedAt
      ? normalizeDate(query.transactedAt, 'transactedAt')
      : undefined
    const dateFrom = query.dateFrom ? normalizeDate(query.dateFrom, 'dateFrom') : undefined
    const dateTo = query.dateTo ? normalizeDate(query.dateTo, 'dateTo') : undefined

    assertValidDateFilterRange(dateFrom, dateTo, transactedAt)

    return {
      userId,
      transactedAt,
      dateFrom,
      dateTo,
      type: query.type,
      categoryId: query.categoryId,
      source: query.source,
      q: query.q?.trim(),
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy as TransactionListSortBy,
      sortOrder: query.sortOrder,
    }
  }

  function getSummaryFilters(
    userId: string,
    query: Static<typeof transactionSummaryQuerySchema>,
  ): SummarizeTransactionsParams {
    const transactedAt = query.transactedAt
      ? normalizeDate(query.transactedAt, 'transactedAt')
      : undefined
    const dateFrom = query.dateFrom ? normalizeDate(query.dateFrom, 'dateFrom') : undefined
    const dateTo = query.dateTo ? normalizeDate(query.dateTo, 'dateTo') : undefined

    assertValidDateFilterRange(dateFrom, dateTo, transactedAt)

    return {
      userId,
      transactedAt,
      dateFrom,
      dateTo,
      type: query.type,
      categoryId: query.categoryId,
      source: query.source,
      q: query.q?.trim(),
    }
  }

  app.get(
    '/transactions',
    {
      schema: {
        tags: ['transactions'],
        summary: 'List transactions',
        description: 'List the authenticated user transactions with filtering and pagination',
        querystring: transactionListQuerySchema,
        response: {
          200: transactionListResponseSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
        },
      },
      config: {
        auth: true,
      },
    },
    async (request) => {
      const user = request.getUser()
      const filters = getListFilters(user.id, request.query)
      const { items, totalItems } = await app.transactionRepository.list(filters)
      const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / filters.pageSize)

      return {
        items: items.map((item) => toTransactionResponse(item)),
        meta: {
          page: filters.page,
          pageSize: filters.pageSize,
          totalItems,
          totalPages,
        },
      }
    },
  )

  app.get(
    '/transactions/summary',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Get transaction summary',
        description: 'Get totals for the authenticated user transactions',
        querystring: transactionSummaryQuerySchema,
        response: {
          200: transactionSummaryResponseSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
        },
      },
      config: {
        auth: true,
      },
    },
    async (request) => {
      const user = request.getUser()
      const summary = await app.transactionRepository.summarize(
        getSummaryFilters(user.id, request.query),
      )

      return {
        incomeTotal: formatMoney(summary.incomeTotal),
        expenseTotal: formatMoney(summary.expenseTotal),
        netTotal: formatMoney(summary.netTotal),
        totalItems: summary.totalItems,
      }
    },
  )

  app.post(
    '/transactions',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Create transaction',
        description: 'Create a new transaction for the authenticated user',
        body: createTransactionBodySchema,
        response: {
          201: transactionResponseSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
        },
      },
      config: {
        auth: true,
      },
    },
    async (request, reply) => {
      const user = request.getUser()
      const type = request.body.type
      const amount = normalizeAmount(request.body.amount)
      const transactedAt = normalizeDate(request.body.transactedAt, 'transactedAt')
      const category = await resolveCategory(user.id, request.body.categoryId, type)

      const created = await app.transactionRepository.create({
        userId: user.id,
        type,
        amount,
        transactedAt,
        categoryId: category?.id ?? null,
        note: normalizeOptionalNote(request.body.note) ?? null,
        source: 'web',
      })

      const detailed = await app.transactionRepository.findDetailedByIdAndUserId(
        created.id,
        user.id,
      )

      return reply.code(201).send({
        transaction: toTransactionResponse(detailed),
      })
    },
  )

  app.get(
    '/transactions/:id',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Get transaction',
        description: 'Get a transaction by id for the authenticated user',
        params: transactionParamsSchema,
        response: {
          200: transactionResponseSchema,
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
          404: { $ref: 'responses#/properties/notFound', description: 'Not Found' },
        },
      },
      config: {
        auth: true,
      },
    },
    async (request, reply) => {
      const user = request.getUser()
      const transaction = await app.transactionRepository.findDetailedByIdAndUserId(
        request.params.id,
        user.id,
      )

      if (!transaction) {
        throw app.httpErrors.notFound('Transaction not found')
      }

      return reply.code(200).send({
        transaction: toTransactionResponse(transaction),
      })
    },
  )

  app.patch(
    '/transactions/:id/category',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Update transaction category',
        description: 'Update or clear the category for a transaction',
        params: transactionParamsSchema,
        body: updateTransactionCategoryBodySchema,
        response: {
          200: transactionResponseSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
          404: { $ref: 'responses#/properties/notFound', description: 'Not Found' },
        },
      },
      config: {
        auth: true,
      },
    },
    async (request, reply) => {
      const user = request.getUser()
      const existing = await app.transactionRepository.findByIdAndUserId(request.params.id, user.id)
      if (!existing) {
        throw app.httpErrors.notFound('Transaction not found')
      }

      const category = await resolveCategory(user.id, request.body.categoryId, existing.type)

      await app.transactionRepository.updateByIdAndUserId(existing.id, user.id, {
        categoryId: category?.id ?? null,
      })

      const detailed = await app.transactionRepository.findDetailedByIdAndUserId(
        existing.id,
        user.id,
      )

      return reply.code(200).send({
        transaction: toTransactionResponse(detailed),
      })
    },
  )

  app.patch(
    '/transactions/:id',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Update transaction',
        description: 'Update a transaction for the authenticated user',
        params: transactionParamsSchema,
        body: updateTransactionBodySchema,
        response: {
          200: transactionResponseSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
          404: { $ref: 'responses#/properties/notFound', description: 'Not Found' },
        },
      },
      config: {
        auth: true,
      },
    },
    async (request, reply) => {
      const user = request.getUser()
      const existing = await app.transactionRepository.findByIdAndUserId(request.params.id, user.id)
      if (!existing) {
        throw app.httpErrors.notFound('Transaction not found')
      }

      const nextType = request.body.type ?? existing.type

      if (
        request.body.type !== undefined &&
        existing.categoryId &&
        request.body.categoryId === undefined
      ) {
        const existingCategory = await app.categoryRepository.findByIdAndUserId(
          existing.categoryId,
          user.id,
        )
        if (
          existingCategory &&
          !canAssignCategoryToTransaction(existingCategory, { type: nextType })
        ) {
          throw app.httpErrors.badRequest(
            'Changing transaction type requires updating or clearing category when incompatible',
          )
        }
      }

      let nextCategoryId = existing.categoryId
      if (request.body.categoryId !== undefined) {
        const category = await resolveCategory(user.id, request.body.categoryId, nextType)
        nextCategoryId = category ? category.id : null
      }

      const updatePayload: Partial<NewTransaction> = {
        ...(request.body.type !== undefined ? { type: nextType } : {}),
        ...(request.body.amount !== undefined
          ? { amount: normalizeAmount(request.body.amount) }
          : {}),
        ...(request.body.transactedAt !== undefined
          ? { transactedAt: normalizeDate(request.body.transactedAt, 'transactedAt') }
          : {}),
        ...(request.body.note !== undefined
          ? { note: normalizeOptionalNote(request.body.note) ?? null }
          : {}),
        ...(request.body.categoryId !== undefined || request.body.type !== undefined
          ? { categoryId: nextCategoryId }
          : {}),
      }

      await app.transactionRepository.updateByIdAndUserId(existing.id, user.id, updatePayload)

      const detailed = await app.transactionRepository.findDetailedByIdAndUserId(
        existing.id,
        user.id,
      )

      return reply.code(200).send({
        transaction: toTransactionResponse(detailed),
      })
    },
  )

  app.delete(
    '/transactions/:id',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Delete transaction',
        description: 'Delete a transaction for the authenticated user',
        params: transactionParamsSchema,
        response: {
          204: deleteTransactionResponseSchema,
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
          404: { $ref: 'responses#/properties/notFound', description: 'Not Found' },
        },
      },
      config: {
        auth: true,
      },
    },
    async (request, reply) => {
      const user = request.getUser()
      const deleted = await app.transactionRepository.deleteByIdAndUserId(
        request.params.id,
        user.id,
      )
      if (!deleted) {
        throw app.httpErrors.notFound('Transaction not found')
      }

      reply.code(204).send(null)
    },
  )
}

export default route
