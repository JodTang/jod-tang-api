import type { messagingApi } from '@line/bot-sdk'
import type { FastifyInstance } from 'fastify'
import type { webhook } from 'fastify-line'

export interface TextMessageEvent extends webhook.MessageEvent {
  message: webhook.TextMessageContent
  replyToken: string
}

export class ReplyTextMessage {
  #app: FastifyInstance
  #replyToken: string

  constructor(app: FastifyInstance, replyToken: string) {
    this.#app = app
    this.#replyToken = replyToken
  }

  async execute(messages: string | string[]) {
    const messageArray = Array.isArray(messages) ? messages : [messages]
    await this.#app.line.client.replyMessage({
      replyToken: this.#replyToken,
      messages: messageArray.map((message) => ({
        type: 'text',
        text: message,
      })),
    })
  }
}

export class ReplyFlexMessage {
  #app: FastifyInstance
  #replyToken: string

  constructor(app: FastifyInstance, replyToken: string) {
    this.#app = app
    this.#replyToken = replyToken
  }

  async execute(message: messagingApi.FlexMessage) {
    await this.#app.line.client.replyMessage({
      replyToken: this.#replyToken,
      messages: [message],
    })
  }
}

export function isCommand(text: string): boolean {
  return text.startsWith('/')
}
