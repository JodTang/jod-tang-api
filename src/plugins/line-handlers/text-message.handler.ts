import type { Category, User } from '../../db/schema.ts'
import {
  getAssignableCategories,
  type ParsedTransaction,
  resolveChosenCategory,
} from '../../services/transaction-text-parser.service.ts'
import { definePlugin } from '../../utils/factories.ts'
import {
  ReplyFlexMessage,
  ReplyTextMessage,
  type TextMessageEvent,
} from '../../utils/line-helper.ts'
import { buildTransactionCategoryFlexMessage } from '../../utils/transaction-category-postback.ts'
import { buildTransactionResultFlexMessage } from '../../utils/transaction-result-flex-message.ts'

declare module 'fastify' {
  interface FastifyInstance {
    textMessageHandler: (user: User, event: TextMessageEvent, text: string) => Promise<void>
  }
}

interface CreatedTransactionResult {
  availableCategories: Pick<Category, 'icon' | 'id' | 'name' | 'type'>[]
  category: Pick<Category, 'icon' | 'name'> | null
  transaction: {
    amount: string
    id: string
    note: string | null
    transactedAt: string
    type: 'expense' | 'income'
  }
}

interface CreateTransactionsOptions {
  allowCategorySelection: boolean
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
    dependencies: [
      'category-repository',
      'line',
      'transaction-repository',
      'transaction-text-parser',
    ],
  },
  async (app) => {
    async function createTransactionsFromText(
      user: User,
      event: TextMessageEvent,
      text: string,
      parsedTransactions: ParsedTransaction[],
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

      try {
        const categories = await app.categoryRepository.findByUserId(user.id)
        const parseResult = await app.transactionTextParser.parse(text, categories)

        if (!parseResult) {
          await reply.execute(buildTransactionInputHintMessages())
          return
        }

        await createTransactionsFromText(user, event, text, parseResult.transactions, {
          allowCategorySelection: parseResult.source === 'bank-notification',
        })
      } catch (err) {
        app.log.warn(
          { err, text, userId: user.id },
          'Failed to parse transaction candidate from text message',
        )
        await reply.execute('เกิดข้อผิดพลาดชั่วคราว กรุณาลองใหม่อีกครั้ง')
      }
    }

    app.decorate('textMessageHandler', handleTextMessage)
  },
)

export default plugin
