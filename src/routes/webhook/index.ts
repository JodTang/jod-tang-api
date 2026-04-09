import type { webhook } from 'fastify-line'
import type { TypedRoutePlugin } from '../../utils/factories.ts'
import {
  isCommand,
  type PostbackEvent,
  ReplyTextMessage,
  type TextMessageEvent,
} from '../../utils/line-helper.ts'

const route: TypedRoutePlugin = async (app) => {
  const { userRepository, line } = app

  const publicCommand = ['/help', '/join']

  app.post<{ Body: webhook.CallbackRequest }>(
    '/webhook/line',
    { config: { lineWebhook: true } },
    async (request, reply) => {
      reply.code(200).send('OK')

      const { events = [] } = request.body

      await Promise.all(events.map((event) => handleEvent(event)))
    },
  )

  function isTextMessageEvent(event: webhook.Event): event is TextMessageEvent {
    return event.type === 'message' && event.message.type === 'text'
  }

  function isPostbackEvent(event: webhook.Event): event is PostbackEvent {
    return event.type === 'postback' && Boolean(event.replyToken)
  }

  function isAllowedUserNotActive(event: webhook.Event) {
    if (isTextMessageEvent(event)) {
      return isCommand(event.message.text)
        ? publicCommand.includes(event.message.text.trim().split(' ')[0])
        : false
    }

    return false
  }

  async function prepareUser(lineUserId: string) {
    let user = await userRepository.findByLineUserId(lineUserId)

    if (!user) {
      const profile = await line.client.getProfile(lineUserId)
      if (!profile) {
        return null
      }

      user = await userRepository.create({
        lineUserId,
        status: 'pending',
        displayName: profile.displayName || '',
      })
    }

    return user
  }

  async function handleEvent(event: webhook.Event) {
    try {
      app.log.debug({ event }, 'Processing LINE webhook event')

      const lineUserId = event.source?.userId

      if (!lineUserId) {
        app.log.warn({ event }, 'Event source user ID is missing')
        return
      }

      await line.client.showLoadingAnimation({ chatId: lineUserId })

      const user = await prepareUser(lineUserId)
      if (!user) {
        app.log.warn({ lineUserId }, 'Failed to prepare user')
        return
      }

      if (!isAllowedUserNotActive(event) && user.status !== 'active') {
        if ('replyToken' in event && event.replyToken) {
          const reply = new ReplyTextMessage(app, event.replyToken)
          await reply.execute(
            'บัญชีของคุณยังไม่ได้รับสิทธิ์ใช้งานบอท หากมีโค้ดเชิญ สามารถพิมพ์ /join <code> เพื่อเข้าร่วมได้',
          )
        }
        return
      }

      switch (event.type) {
        case 'message':
          app.log.debug('Processing message event')

          if (!event.replyToken) return
          if (event.message.type === 'text') {
            if (isCommand(event.message.text)) {
              const [command, ...args] = event.message.text.trim().split(' ')
              const handler = app.getLineCommandHandler(command.toLowerCase())
              await handler(user, event as TextMessageEvent, args)

              return
            }

            // Handle non-command text messages
            await app.textMessageHandler(user, event as TextMessageEvent, event.message.text)
          }
          break
        case 'postback':
          if (!isPostbackEvent(event)) return
          await app.postbackHandler(user, event)
          break
        default:
          app.log.warn({ event }, 'Unhandled LINE webhook event')
      }
    } catch (error) {
      app.log.error(
        { error: error instanceof Error ? error.message : String(error), event },
        'Failed to process LINE webhook event',
      )
    }
  }
}

export default route
