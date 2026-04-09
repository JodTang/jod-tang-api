import type { TransactionType, User } from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'
import { ReplyTextMessage, type TextMessageEvent } from '../../utils/line-helper.ts'

declare module 'fastify' {
  interface FastifyInstance {
    textMessageHandler: (user: User, event: TextMessageEvent, text: string) => Promise<void>
  }
}

interface ParsedBankTransaction {
  amount: string
  transactedAt: string
  type: TransactionType
}

const bankTransactionRegex =
  /^(?<day>\d{2})-(?<month>\d{2})@\d{2}:\d{2}\s+.+?:\s*(?<action>เงินออก|เงินเข้า|ปรับปรุง)\s*(?<sign>[+-])?\s*(?<amount>[\d,]+\.\d{2})บ(?:\s+ใช้ได้\s+[\d,]+\.\d{2}บ)?$/u

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
    transactedAt,
    type,
  }
}

const plugin = definePlugin(
  {
    name: 'line-text-message-handler',
    dependencies: ['line', 'transaction-repository'],
  },
  async (app) => {
    async function handleTextMessage(user: User, event: TextMessageEvent, text: string) {
      app.log.info({ text }, 'Text message')

      const reply = new ReplyTextMessage(app, event.replyToken)
      const parsedTransaction = parseBankTransactionMessage(text)

      if (!parsedTransaction) {
        await reply.execute(text)
        return
      }

      try {
        await app.transactionRepository.create({
          userId: user.id,
          type: parsedTransaction.type,
          amount: parsedTransaction.amount,
          sourceText: text,
          transactedAt: parsedTransaction.transactedAt,
          source: 'line',
        })
      } catch (err) {
        app.log.error({ err, text, userId: user.id }, 'Failed to create transaction from text')
        await reply.execute('บันทึกรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        return
      }

      const transactionLabel = parsedTransaction.type === 'expense' ? 'รายจ่าย' : 'รายรับ'
      await reply.execute(
        `บันทึก${transactionLabel} ${Number(parsedTransaction.amount).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} บาท เรียบร้อยแล้ว`,
      )
    }

    app.decorate('textMessageHandler', handleTextMessage)
  },
)

export default plugin
