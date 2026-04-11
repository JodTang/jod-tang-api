import type { Category, TransactionType, User } from '../../db/schema.ts'
import { getCurrentDateInBangkok } from '../../utils/date-helper.ts'
import { definePlugin } from '../../utils/factories.ts'
import {
  ReplyFlexMessage,
  ReplyTextMessage,
  type TextMessageEvent,
} from '../../utils/line-helper.ts'
import {
  buildTransactionCategoryFlexMessage,
  canAssignCategoryToTransaction,
} from '../../utils/transaction-category-postback.ts'
import { buildTransactionResultFlexMessage } from '../../utils/transaction-result-flex-message.ts'

declare module 'fastify' {
  interface FastifyInstance {
    textMessageHandler: (user: User, event: TextMessageEvent, text: string) => Promise<void>
  }
}

interface ParsedBankTransaction {
  amount: string
  categoryId: string | null
  note: string | null
  transactedAt: string
  type: TransactionType
}

interface GeminiParsedTransactionResponse {
  isTransaction: boolean
  reason: string | null
  transactions: {
    type: TransactionType | null
    amount: string | null
    categoryId: string | null
    transactedAt: string | null
    note: string | null
  }[]
}

const bankTransactionRegex =
  /^(?<day>\d{2})-(?<month>\d{2})@\d{2}:\d{2}\s+.+?:\s*(?<action>เงินออก|เงินเข้า|ปรับปรุง)\s*(?<sign>[+-])?\s*(?<amount>[\d,]+\.\d{2})บ(?:\s+ใช้ได้\s+[\d,]+\.\d{2}บ)?$/u
const containsDigitRegex = /\d/u
const geminiTransactionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['isTransaction', 'reason', 'transactions'],
  properties: {
    isTransaction: { type: 'boolean' },
    reason: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'amount', 'categoryId', 'transactedAt', 'note'],
        properties: {
          type: {
            anyOf: [{ type: 'string', enum: ['expense', 'income'] }, { type: 'null' }],
          },
          amount: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
          categoryId: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
          transactedAt: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
          note: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
        },
      },
    },
  },
} as const

interface CreatedTransactionResult {
  availableCategories: Pick<Category, 'icon' | 'id' | 'name' | 'type'>[]
  category: Pick<Category, 'icon' | 'name'> | null
  transaction: {
    amount: string
    id: string
    note: string | null
    transactedAt: string
    type: TransactionType
  }
}

type GeminiParsedTransactionItem = GeminiParsedTransactionResponse['transactions'][number]

interface ValidGeminiParsedTransaction {
  amount: string
  categoryId: string | null
  note: string | null
  transactedAt: string
  type: TransactionType
}

interface CreateTransactionsOptions {
  allowCategorySelection: boolean
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function createUtcDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

function inferTransactedAt(day: number, month: number) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const today = new Date(Date.UTC(currentYear, now.getMonth(), now.getDate()))
  const currentYearDate = createUtcDate(currentYear, month, day)

  if (currentYearDate && currentYearDate <= today) {
    return formatDate(currentYear, month, day)
  }

  const previousYear = currentYear - 1
  const previousYearDate = createUtcDate(previousYear, month, day)

  if (previousYearDate) {
    return formatDate(previousYear, month, day)
  }

  return null
}

function inferTransactionType(action: string, sign?: string): TransactionType | null {
  if (action === 'เงินออก') return 'expense'
  if (action === 'เงินเข้า') return 'income'
  if (action === 'ปรับปรุง') {
    if (sign === '+') return 'income'
    if (sign === '-') return 'expense'
  }

  return null
}

function parseBankTransactionMessage(text: string): ParsedBankTransaction | null {
  const match = bankTransactionRegex.exec(text.trim())
  if (!match?.groups) {
    return null
  }

  const day = Number(match.groups.day)
  const month = Number(match.groups.month)
  const type = inferTransactionType(match.groups.action, match.groups.sign)
  const transactedAt = inferTransactedAt(day, month)

  if (!type || !transactedAt) {
    return null
  }

  return {
    amount: match.groups.amount.replaceAll(',', ''),
    categoryId: null,
    note: null,
    transactedAt,
    type,
  }
}

function buildGeminiTransactionPromptWithCategories(
  text: string,
  currentDate: string,
  categories: Pick<Category, 'id' | 'name' | 'icon' | 'type'>[],
) {
  const categoriesJson = JSON.stringify(
    categories.map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon || null,
      type: category.type,
    })),
  )

  return `
You are a transaction parser for a Thai personal finance LINE bot.

Your task is to read one LINE message and decide whether it clearly describes one or more real income or expense transactions that should be saved to the database.

Return JSON only.
Do not wrap in markdown.
Do not add any explanation.

Output schema:
{
  "isTransaction": boolean,
  "reason": string | null,
  "transactions": [
    {
      "type": "expense" | "income" | null,
      "amount": string | null,
      "categoryId": string | null,
      "transactedAt": string | null,
      "note": string | null
    }
  ]
}

Rules:
1. Be conservative. If the message is ambiguous, incomplete, or may not represent a real transaction, return isTransaction=false.
2. Parse only when the message clearly refers to one or more transactions for the sender.
3. If multiple transactions are present, return every clear transaction in the same order they appear in the message.
4. If the message mixes clear transactions with ambiguous candidate transactions, return isTransaction=false.
5. The transaction type is from the sender's point of view:
   - money paid, spent, bought, transferred to another person, withdrew for spending = "expense"
   - money received, earned, sold, refunded, cashback received = "income"
6. Internal transfers between the sender's own accounts, wallets, investments, savings, debt payments, or credit card payments are NOT transactions. Return isTransaction=false.
7. amount must be a positive decimal string with exactly 2 digits after the decimal point and no commas. Example: "120.00"
8. transactedAt must be in YYYY-MM-DD format.
9. If a transaction does not specify a date, use current_date.
10. If the message uses relative dates like today, yesterday, วันนี้, เมื่อวาน, infer the exact date using:
   - current_date: ${currentDate}
   - timezone: Asia/Bangkok
11. If a transaction includes day/month but no year, infer the most recent valid date that is not in the future in Asia/Bangkok.
12. note should be a short useful description of what each transaction was for, preserving the user's intent. If unclear, set note to null.
13. Ignore bank notification format messages because another parser handles them separately.
14. Choose categoryId only from the available categories list below.
15. categoryId must match the transaction type:
   - expense can use expense or both
   - income can use income or both
16. If no available category clearly matches, set categoryId to null.
17. If isTransaction=false, set transactions to [] and give a short reason.
18. Output valid JSON that strictly matches the schema.

Available categories:
${categoriesJson}

Now parse this message:
${JSON.stringify(text)}
`.trim()
}

function isValidTransactionType(value: unknown): value is TransactionType {
  return value === 'expense' || value === 'income'
}

function isValidAmount(value: unknown): value is string {
  return typeof value === 'string' && /^\d+(?:\.\d{2})$/u.test(value)
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
}

function isValidParsedTransaction(
  transaction: GeminiParsedTransactionItem,
): transaction is ValidGeminiParsedTransaction {
  return (
    isValidTransactionType(transaction.type) &&
    isValidAmount(transaction.amount) &&
    isValidDate(transaction.transactedAt)
  )
}

function normalizeParsedTransaction(transaction: ValidGeminiParsedTransaction) {
  return {
    type: transaction.type,
    amount: transaction.amount,
    categoryId: typeof transaction.categoryId === 'string' ? transaction.categoryId : null,
    transactedAt: transaction.transactedAt,
    note:
      typeof transaction.note === 'string' && transaction.note.trim().length > 0
        ? transaction.note.trim()
        : null,
  } satisfies ParsedBankTransaction
}

function normalizeGeminiParsedTransactions(result: GeminiParsedTransactionResponse) {
  if (!result.isTransaction || result.transactions.length === 0) {
    return null
  }

  if (!result.transactions.every(isValidParsedTransaction)) {
    return null
  }

  return result.transactions.map(normalizeParsedTransaction)
}

function resolveChosenCategory(
  categoryId: string | null,
  categories: Pick<Category, 'id' | 'name' | 'icon' | 'type'>[],
  transaction: Pick<ParsedBankTransaction, 'type'>,
) {
  if (!categoryId) {
    return null
  }

  const category = categories.find((item) => item.id === categoryId)
  if (!category || !canAssignCategoryToTransaction(category, transaction)) {
    return null
  }

  return category
}

function getAssignableCategories(
  categories: Pick<Category, 'icon' | 'id' | 'name' | 'type'>[],
  transaction: Pick<ParsedBankTransaction, 'type'>,
) {
  return categories.filter((category) => canAssignCategoryToTransaction(category, transaction))
}

function buildTransactionInputHintMessages() {
  return [
    'ยังไม่แน่ใจว่าข้อความนี้เป็นรายการรายรับหรือรายจ่ายที่ต้องการบันทึก',
    'ลองพิมพ์ให้มี "รายการ + จำนวนเงิน" เช่น\n- ข้าวกลางวัน 80\n- ค่าแท็กซี่ 120\n- เงินเดือน 25000\n- แม่โอนให้ 500\n\nถ้ามีวันที่ก็ใส่เพิ่มได้ เช่น\n- กาแฟ 65 เมื่อวาน\n- ค่าของใช้ 450 09/04\n\nถ้าจะส่งหลายรายการในข้อความเดียวก็ได้ เช่น\n- ข้าว 80\n- กาแฟ 65\n- รถไฟฟ้า 45',
  ]
}

const plugin = definePlugin(
  {
    name: 'line-text-message-handler',
    dependencies: ['category-repository', 'gemini', 'line', 'transaction-repository'],
  },
  async (app) => {
    async function parseTransactionWithGemini(
      text: string,
      categories: Pick<Category, 'id' | 'name' | 'icon' | 'type'>[],
    ) {
      if (!app.gemini.isConfigured()) {
        return null
      }

      const result = await app.gemini.generateJson<GeminiParsedTransactionResponse>(
        buildGeminiTransactionPromptWithCategories(text, getCurrentDateInBangkok(), categories),
        {
          responseJsonSchema: geminiTransactionResponseSchema,
          temperature: 0,
          maxOutputTokens: 900,
        },
      )

      return normalizeGeminiParsedTransactions(result)
    }

    async function createTransactionsFromText(
      user: User,
      event: TextMessageEvent,
      text: string,
      parsedTransactions: ParsedBankTransaction[],
      options: CreateTransactionsOptions,
    ) {
      try {
        const allCategories = await app.categoryRepository.findByUserId(user.id)
        const results: CreatedTransactionResult[] = []

        for (const parsedTransaction of parsedTransactions) {
          const availableCategories = getAssignableCategories(allCategories, parsedTransaction)
          const chosenCategory = resolveChosenCategory(
            parsedTransaction.categoryId,
            availableCategories,
            parsedTransaction,
          )
          const transaction = await app.transactionRepository.create({
            userId: user.id,
            type: parsedTransaction.type,
            amount: parsedTransaction.amount,
            categoryId: chosenCategory?.id,
            note: parsedTransaction.note,
            sourceText: text,
            transactedAt: parsedTransaction.transactedAt,
            source: 'line',
          })

          results.push({
            transaction,
            category: chosenCategory,
            availableCategories,
          })
        }

        if (
          options.allowCategorySelection &&
          results.length === 1 &&
          !results[0].category &&
          results[0].availableCategories.length > 0
        ) {
          const replyFlex = new ReplyFlexMessage(app, event.replyToken)
          await replyFlex.execute(
            buildTransactionCategoryFlexMessage(
              results[0].transaction,
              results[0].availableCategories,
            ),
          )
          return
        }

        const replyFlex = new ReplyFlexMessage(app, event.replyToken)
        await replyFlex.execute(
          buildTransactionResultFlexMessage(
            results.map((result) => ({
              transaction: result.transaction,
              category: result.category,
            })),
          ),
        )
      } catch (err) {
        app.log.error({ err, text, userId: user.id }, 'Failed to create transaction from text')
        const reply = new ReplyTextMessage(app, event.replyToken)
        await reply.execute('บันทึกรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      }
    }

    async function handleTextMessage(user: User, event: TextMessageEvent, text: string) {
      app.log.info({ text }, 'Text message')

      const reply = new ReplyTextMessage(app, event.replyToken)
      const parsedTransaction = parseBankTransactionMessage(text)

      if (parsedTransaction) {
        await createTransactionsFromText(user, event, text, [parsedTransaction], {
          allowCategorySelection: true,
        })
        return
      }

      let geminiParsedTransactions: ParsedBankTransaction[] | null = null
      if (containsDigitRegex.test(text)) {
        try {
          const categories = await app.categoryRepository.findByUserId(user.id)
          geminiParsedTransactions = await parseTransactionWithGemini(text, categories)
        } catch (err) {
          app.log.warn(
            { err, text, userId: user.id },
            'Failed to parse transaction candidate with Gemini',
          )
        }
      }

      if (!geminiParsedTransactions) {
        await reply.execute(buildTransactionInputHintMessages())
        return
      }

      await createTransactionsFromText(user, event, text, geminiParsedTransactions, {
        allowCategorySelection: false,
      })
    }

    app.decorate('textMessageHandler', handleTextMessage)
  },
)

export default plugin
