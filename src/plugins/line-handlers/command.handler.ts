import type { User } from '../../db/schema.ts'
import { buildCategoriesFlexMessage } from '../../utils/category-flex-message.ts'
import { getCurrentDateInBangkok } from '../../utils/date-helper.ts'
import { definePlugin } from '../../utils/factories.ts'
import {
  ReplyFlexMessage,
  ReplyTextMessage,
  type TextMessageEvent,
} from '../../utils/line-helper.ts'
import {
  buildEmptyTodaySummaryFlexMessage,
  buildTodaySummaryFlexMessage,
} from '../../utils/today-summary-flex-message.ts'

declare module 'fastify' {
  interface FastifyInstance {
    getLineCommandHandler: (command: string) => LineCommandHandler
  }
}

export type LineCommandHandler = (
  user: User,
  event: TextMessageEvent,
  args: string[],
) => Promise<void>

const plugin = definePlugin(
  {
    name: 'line-command-handler',
    dependencies: [
      'line',
      'invite-code-repository',
      'category-repository',
      'transaction-repository',
    ],
  },
  async (app) => {
    const commands: Record<string, LineCommandHandler> = {
      '/help': handleHelp,
      '/join': handleJoin,
      '/categories': handleCategories,
      '/category': handleCategories,
      '/today': handleToday,
      '/model': withOwnerGuard(handleModel),
    }

    async function handleHelp(_user: User, event: TextMessageEvent, _args: string[]) {
      const reply = new ReplyTextMessage(app, event.replyToken)
      await reply.execute(
        'คำสั่งที่ใช้ได้:\n/help ดูคำสั่งทั้งหมด\n/join <code> ใช้โค้ดเชิญเพื่อเข้าร่วม\n/categories ดูหมวดหมู่ทั้งหมด\n/today ดูสรุปรายการวันนี้',
      )
    }

    async function handleJoin(user: User, event: TextMessageEvent, args: string[]) {
      app.log.info({ args }, 'Join command')

      const reply = new ReplyTextMessage(app, event.replyToken)

      if (user.status === 'active') {
        await reply.execute('บัญชีของคุณเข้าร่วมเรียบร้อยแล้ว')
        return
      }

      if (user.status === 'banned') {
        await reply.execute('บัญชีนี้ถูกระงับการใช้งาน')
        return
      }

      if (!args.length) {
        await reply.execute('กรุณาระบุโค้ดเชิญ เช่น /join ABC123')
        return
      }

      const code = args[0]
      const inviteCode = await app.inviteCodeRepository.findAvailable(code)

      if (!inviteCode) {
        await reply.execute('ไม่พบโค้ดเชิญนี้ กรุณาตรวจสอบแล้วลองอีกครั้ง')
        return
      }

      // check if invite code is expired
      if (inviteCode.expiresAt && inviteCode.expiresAt < new Date()) {
        await reply.execute('โค้ดเชิญนี้หมดอายุแล้ว กรุณาขอโค้ดใหม่')
        return
      }

      try {
        await app.inviteCodeRepository.incrementUsedCountAndUpdateUser(code, user.id)
      } catch (err) {
        app.log.error({ err }, 'Failed to increment invite code count')
        await reply.execute('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
        return
      }

      await reply.execute('เข้าร่วมเรียบร้อยแล้ว ยินดีต้อนรับ')
    }

    async function handleCategories(user: User, event: TextMessageEvent, _args: string[]) {
      const categories = await app.categoryRepository.findByUserId(user.id)

      if (categories.length === 0) {
        const reply = new ReplyTextMessage(app, event.replyToken)
        await reply.execute('ยังไม่มีหมวดหมู่ในบัญชีของคุณ')
        return
      }

      const reply = new ReplyFlexMessage(app, event.replyToken)
      await reply.execute(buildCategoriesFlexMessage(categories))
    }

    async function handleToday(user: User, event: TextMessageEvent, _args: string[]) {
      const reply = new ReplyFlexMessage(app, event.replyToken)
      const today = getCurrentDateInBangkok()
      const transactions = await app.transactionRepository.findByUserIdAndDate(user.id, today)

      if (transactions.length === 0) {
        await reply.execute(buildEmptyTodaySummaryFlexMessage(today))
        return
      }

      await reply.execute(
        buildTodaySummaryFlexMessage({
          date: today,
          transactions,
        }),
      )
    }

    async function handleModel(_user: User, event: TextMessageEvent, _args: string[]) {
      const reply = new ReplyTextMessage(app, event.replyToken)
      const model = await app.gemini.getModel()
      await reply.execute(`Current Gemini model: ${model}`)
    }

    async function handleUnknown(_user: User, event: TextMessageEvent, args: string[]) {
      app.log.info({ args }, 'Unknown command')

      const reply = new ReplyTextMessage(app, event.replyToken)
      await reply.execute('ไม่พบคำสั่งนี้ ลองพิมพ์ /help เพื่อดูคำสั่งที่ใช้ได้')
    }

    function withOwnerGuard(handler: LineCommandHandler): LineCommandHandler {
      return async (user, event, args) => {
        if (user.role !== 'owner') {
          const reply = new ReplyTextMessage(app, event.replyToken)
          await reply.execute('คำสั่งนี้สำหรับ owner เท่านั้น')
          return
        }

        await handler(user, event, args)
      }
    }

    app.decorate('getLineCommandHandler', (command: string) => {
      return commands[command] || handleUnknown
    })
  },
)

export default plugin
