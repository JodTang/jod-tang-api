import type { Category, TransactionType } from '../db/schema.ts'
import type { GeminiService } from '../plugins/gemini.ts'
import { getCurrentDateInBangkok } from '../utils/date-helper.ts'
import { canAssignCategoryToTransaction } from '../utils/transaction-category-postback.ts'

export interface ParsedTransaction {
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

type GeminiParsedTransactionItem = GeminiParsedTransactionResponse['transactions'][number]

interface ValidGeminiParsedTransaction {
  amount: string
  categoryId: string | null
  note: string | null
  transactedAt: string
  type: TransactionType
}

export interface ParseTransactionTextResult {
  source: 'bank-notification' | 'gemini'
  transactions: ParsedTransaction[]
}

const bankTransactionRegex =
  /^(?<day>\d{2})-(?<month>\d{2})@\d{2}:\d{2}\s+.+?:\s*(?<action>เงินออก|เงินเข้า|ปรับปรุง)\s*(?<sign>[+-])?\s*(?<amount>[\d,]+\.\d{2})บ(?:\s+ใช้ได้\s+[\d,]+\.\d{2}บ)?$/u
const containsDigitRegex = /\d/u

export const geminiTransactionResponseSchema = {
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

export class TransactionTextParserService {
  #gemini: GeminiService

  constructor(gemini: GeminiService) {
    this.#gemini = gemini
  }

  async parse(
    text: string,
    categories: Pick<Category, 'id' | 'name' | 'icon' | 'type'>[],
  ): Promise<ParseTransactionTextResult | null> {
    const parsedBankTransaction = parseBankTransactionMessage(text)
    if (parsedBankTransaction) {
      return {
        source: 'bank-notification',
        transactions: [parsedBankTransaction],
      }
    }

    if (!containsDigitRegex.test(text) || !this.#gemini.isConfigured()) {
      return null
    }

    const result = await this.#gemini.generateJson<GeminiParsedTransactionResponse>(
      buildGeminiTransactionPromptWithCategories(text, getCurrentDateInBangkok(), categories),
      {
        responseJsonSchema: geminiTransactionResponseSchema,
        temperature: 0,
        maxOutputTokens: 900,
        timeoutMs: 15000,
      },
    )

    const transactions = normalizeGeminiParsedTransactions(result)
    if (!transactions) {
      return null
    }

    return {
      source: 'gemini',
      transactions,
    }
  }
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

export function parseBankTransactionMessage(text: string): ParsedTransaction | null {
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
  } satisfies ParsedTransaction
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

export function resolveChosenCategory(
  categoryId: string | null,
  categories: Pick<Category, 'id' | 'name' | 'icon' | 'type'>[],
  transaction: Pick<ParsedTransaction, 'type'>,
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

export function getAssignableCategories(
  categories: Pick<Category, 'icon' | 'id' | 'name' | 'type'>[],
  transaction: Pick<ParsedTransaction, 'type'>,
) {
  return categories.filter((category) => canAssignCategoryToTransaction(category, transaction))
}
