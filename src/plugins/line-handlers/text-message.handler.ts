import type { User } from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'
import { ReplyTextMessage, type TextMessageEvent } from '../../utils/line-helper.ts'

declare module 'fastify' {
  interface FastifyInstance {
    textMessageHandler: (user: User, event: TextMessageEvent, text: string) => Promise<void>
  }
}

const plugin = definePlugin(
  {
    name: 'line-text-message-handler',
    dependencies: ['line'],
  },
  async (app) => {
    async function handleTextMessage(_user: User, event: TextMessageEvent, text: string) {
      app.log.info({ text }, 'Text message')

      const reply = new ReplyTextMessage(app, event.replyToken)
      await reply.execute(text)
    }

    app.decorate('textMessageHandler', handleTextMessage)
  },
)

export default plugin
