import type { Category, TransactionType, User } from '../../db/schema.ts'
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
  transaction: {
    type: TransactionType | null
    amount: string | null
    categoryId: string | null
    transactedAt: string | null
    note: string | null
  } | null
}

const bankTransactionRegex =
  /^(?<day>\d{2})-(?<month>\d{2})@\d{2}:\d{2}\s+.+?:\s*(?<action>เงินออก|เงินเข้า|ปรับปรุง)\s*(?<sign>[+-])?\s*(?<amount>[\d,]+\.\d{2})บ(?:\s+ใช้ได้\s+[\d,]+\.\d{2}บ)?$/u
const containsDigitRegex = /\d/u
const geminiTransactionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['isTransaction', 'reason', 'transaction'],
  properties: {
    isTransaction: { type: 'boolean' },
    reason: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    transaction: {
      anyOf: [
        {
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
        { type: 'null' },
      ],
    },
  },
} as const

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

function getCurrentDateInBangkok() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('Failed to format current date in Asia/Bangkok')
  }

  return `${year}-${month}-${day}`
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

Your task is to read one LINE message and decide whether it clearly describes exactly one real income or expense transaction that should be saved to the database.

Return JSON only.
Do not wrap in markdown.
Do not add any explanation.

Output schema:
{
  "isTransaction": boolean,
  "reason": string | null,
  "transaction": {
    "type": "expense" | "income" | null,
    "amount": string | null,
    "categoryId": string | null,
    "transactedAt": string | null,
    "note": string | null
  } | null
}

Rules:
1. Be conservative. If the message is ambiguous, incomplete, or may not represent a real transaction, return isTransaction=false.
2. Parse only when the message clearly refers to exactly one transaction for the sender.
3. The transaction type is from the sender's point of view:
   - money paid, spent, bought, transferred to another person, withdrew for spending = "expense"
   - money received, earned, sold, refunded, cashback received = "income"
4. Internal transfers between the sender's own accounts, wallets, investments, savings, debt payments, or credit card payments are NOT transactions. Return isTransaction=false.
5. If the message contains multiple transactions or multiple candidate amounts and the main amount is unclear, return isTransaction=false.
6. amount must be a positive decimal string with exactly 2 digits after the decimal point and no commas. Example: "120.00"
7. transactedAt must be in YYYY-MM-DD format.
8. If the message does not specify a date, use current_date.
9. If the message uses relative dates like today, yesterday, วันนี้, เมื่อวาน, infer the exact date using:
   - current_date: ${currentDate}
   - timezone: Asia/Bangkok
10. If the message includes day/month but no year, infer the most recent valid date that is not in the future in Asia/Bangkok.
11. note should be a short useful description of what the transaction was for, preserving the user's intent. If unclear, set note to null.
12. Ignore bank notification format messages because another parser handles them separately.
13. Choose categoryId only from the available categories list below.
14. categoryId must match the transaction type:
   - expense can use expense or both
   - income can use income or both
15. If no available category clearly matches, set categoryId to null.
16. If isTransaction=false, set transaction to null and give a short reason.
17. Output valid JSON that strictly matches the schema.

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

function normalizeGeminiParsedTransaction(result: GeminiParsedTransactionResponse) {
  if (!result.isTransaction || !result.transaction) {
    return null
  }

  const { transaction } = result
  if (
    !isValidTransactionType(transaction.type) ||
    !isValidAmount(transaction.amount) ||
    !isValidDate(transaction.transactedAt)
  ) {
    return null
  }

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

function buildTransactionInputHintMessages() {
  return [
    'ยังไม่แน่ใจว่าข้อความนี้เป็นรายการรายรับหรือรายจ่ายที่ต้องการบันทึก',
    'ลองพิมพ์ให้มี "รายการ + จำนวนเงิน" ใน 1 ข้อความ เช่น\n- ข้าวกลางวัน 80\n- ค่าแท็กซี่ 120\n- เงินเดือน 25000\n- แม่โอนให้ 500\n\nถ้ามีวันที่ก็ใส่เพิ่มได้ เช่น\n- กาแฟ 65 เมื่อวาน\n- ค่าของใช้ 450 09/04\n\nแนะนำให้ส่งทีละ 1 รายการต่อ 1 ข้อความ',
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
          maxOutputTokens: 500,
        },
      )

      return normalizeGeminiParsedTransaction(result)
    }

    async function createTransactionFromText(
      user: User,
      event: TextMessageEvent,
      text: string,
      parsedTransaction: ParsedBankTransaction,
    ) {
      const categories = await app.categoryRepository.findByUserIdAndTransactionType(
        user.id,
        parsedTransaction.type,
      )
      const chosenCategory = resolveChosenCategory(
        parsedTransaction.categoryId,
        categories,
        parsedTransaction,
      )

      try {
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

        if (chosenCategory || categories.length === 0) {
          const replyFlex = new ReplyFlexMessage(app, event.replyToken)
          await replyFlex.execute(
            buildTransactionResultFlexMessage(transaction, {
              category: chosenCategory,
            }),
          )
          return
        }

        const replyFlex = new ReplyFlexMessage(app, event.replyToken)
        await replyFlex.execute(buildTransactionCategoryFlexMessage(transaction, categories))
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
        await createTransactionFromText(user, event, text, parsedTransaction)
        return
      }

      let geminiParsedTransaction: ParsedBankTransaction | null = null
      if (containsDigitRegex.test(text)) {
        try {
          const categories = await app.categoryRepository.findByUserId(user.id)
          geminiParsedTransaction = await parseTransactionWithGemini(text, categories)
        } catch (err) {
          app.log.warn(
            { err, text, userId: user.id },
            'Failed to parse transaction candidate with Gemini',
          )
        }
      }

      if (!geminiParsedTransaction) {
        await reply.execute(buildTransactionInputHintMessages())
        return
      }

      await createTransactionFromText(user, event, text, geminiParsedTransaction)
    }

    app.decorate('textMessageHandler', handleTextMessage)
  },
)

export default plugin
