import type { User } from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'
import { ReplyTextMessage, type TextMessageEvent } from '../../utils/line-helper.ts'

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
    dependencies: ['line', 'invite-code-repository'],
  },
  async (app) => {
    const commands: Record<string, LineCommandHandler> = {
      '/help': handleHelp,
      '/join': handleJoin,
    }

    async function handleHelp(_user: User, event: TextMessageEvent, _args: string[]) {
      const reply = new ReplyTextMessage(app, event.replyToken)
      await reply.execute('Help message')
    }

    async function handleJoin(user: User, event: TextMessageEvent, args: string[]) {
      app.log.info({ args }, 'Join command')

      const reply = new ReplyTextMessage(app, event.replyToken)

      if (user.status === 'active') {
        await reply.execute('คุณได้เข้าร่วมแล้ว')
        return
      }

      if (user.status === 'banned') {
        await reply.execute('คุณถูกแบน')
        return
      }

      if (!args.length) {
        await reply.execute('กรุณาระบุโค้ด')
        return
      }

      const code = args[0]
      const inviteCode = await app.inviteCodeRepository.findAvailable(code)

      if (!inviteCode) {
        await reply.execute('Invalid invite code')
        return
      }

      // check if invite code is expired
      if (inviteCode.expiresAt && inviteCode.expiresAt < new Date()) {
        await reply.execute('Invite code is expired')
        return
      }

      await app.inviteCodeRepository.incrementUsedCountAndUpdateUser(code, user.id)
      await reply.execute('คุณได้เข้าร่วมแล้ว')
    }

    async function handleUnknown(_user: User, event: TextMessageEvent, args: string[]) {
      app.log.info({ args }, 'Unknown command')

      const reply = new ReplyTextMessage(app, event.replyToken)
      await reply.execute('ไม่พบคำสั่งที่ระบุ')
    }

    app.decorate('getLineCommandHandler', (command: string) => {
      return commands[command] || handleUnknown
    })
  },
)

export default plugin
