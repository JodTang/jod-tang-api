import type { User } from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'
import { type PostbackEvent, ReplyTextMessage } from '../../utils/line-helper.ts'
import {
  canAssignCategoryToTransaction,
  parseTransactionCategoryPostbackData,
} from '../../utils/transaction-category-postback.ts'

declare module 'fastify' {
  interface FastifyInstance {
    postbackHandler: (user: User, event: PostbackEvent) => Promise<void>
  }
}

const plugin = definePlugin(
  {
    name: 'line-postback-handler',
    dependencies: ['category-repository', 'line', 'transaction-repository'],
  },
  async (app) => {
    async function handlePostback(user: User, event: PostbackEvent) {
      const reply = new ReplyTextMessage(app, event.replyToken)
      const payload = parseTransactionCategoryPostbackData(event.postback.data)

      if (!payload) {
        await reply.execute('ไม่สามารถประมวลผลคำสั่งนี้ได้')
        return
      }

      const transaction = await app.transactionRepository.findByIdAndUserId(
        payload.transactionId,
        user.id,
      )

      if (!transaction) {
        await reply.execute('ไม่พบรายการที่ต้องการอัปเดต')
        return
      }

      const category = await app.categoryRepository.findByIdAndUserId(payload.categoryId, user.id)

      if (!category) {
        await reply.execute('ไม่พบหมวดหมู่ที่เลือก')
        return
      }

      if (!canAssignCategoryToTransaction(category, transaction)) {
        await reply.execute('หมวดหมู่นี้ใช้กับรายการประเภทนี้ไม่ได้')
        return
      }

      await app.transactionRepository.updateCategory(transaction.id, user.id, category.id)
      await reply.execute(`อัปเดตหมวดหมู่เป็น ${category.name} เรียบร้อยแล้ว`)
    }

    app.decorate('postbackHandler', handlePostback)
  },
)

export default plugin
