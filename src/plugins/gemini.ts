import { GoogleGenAI } from '@google/genai'
import type { FastifyInstance } from 'fastify'
import { definePlugin } from '../utils/factories.ts'

export interface GeminiGenerateTextOptions {
  model?: string
  systemInstruction?: string
  temperature?: number
  maxOutputTokens?: number
}

export interface GeminiGenerateTextResult {
  model: string
  text: string
}

export interface GeminiGenerateJsonOptions extends GeminiGenerateTextOptions {
  responseJsonSchema: unknown
}

declare module 'fastify' {
  interface FastifyInstance {
    gemini: GeminiService
  }
}

export class GeminiService {
  #app: FastifyInstance
  #client: GoogleGenAI | null
  #defaultModel: string

  constructor(app: FastifyInstance, client: GoogleGenAI | null, defaultModel: string) {
    this.#app = app
    this.#client = client
    this.#defaultModel = defaultModel
  }

  isConfigured() {
    return this.#client !== null
  }

  async getModel() {
    return this.#resolveModel()
  }

  async generateText(
    prompt: string,
    options: GeminiGenerateTextOptions = {},
  ): Promise<GeminiGenerateTextResult> {
    const { client, model } = await this.#getClientAndModel(options.model)
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
        ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
        ...(typeof options.maxOutputTokens === 'number'
          ? { maxOutputTokens: options.maxOutputTokens }
          : {}),
      },
    })

    const text = response.text?.trim()
    if (!text) {
      throw this.#app.httpErrors.badGateway('Gemini returned an empty text response')
    }

    return { model, text }
  }

  async generateJson<T>(prompt: string, options: GeminiGenerateJsonOptions): Promise<T> {
    const { client, model } = await this.#getClientAndModel(options.model)
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: options.responseJsonSchema,
        ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
        ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
        ...(typeof options.maxOutputTokens === 'number'
          ? { maxOutputTokens: options.maxOutputTokens }
          : {}),
      },
    })

    const text = response.text?.trim()
    if (!text) {
      throw this.#app.httpErrors.badGateway('Gemini returned an empty JSON response')
    }

    try {
      return JSON.parse(text) as T
    } catch {
      throw this.#app.httpErrors.badGateway('Gemini returned invalid JSON')
    }
  }

  async #getClientAndModel(modelOverride?: string) {
    if (!this.#client) {
      throw this.#app.httpErrors.serviceUnavailable(
        'Gemini API is not configured. Set GEMINI_API_KEY before using this endpoint.',
      )
    }

    return {
      client: this.#client,
      model: modelOverride || (await this.#resolveModel()),
    }
  }

  async #resolveModel() {
    const setting = await this.#app.appSettingsRepository.getGeminiModel()
    return setting?.value || this.#defaultModel
  }
}

const plugin = definePlugin(
  {
    name: 'gemini',
    dependencies: ['app-settings-repository'],
  },
  async (app, { config }) => {
    const client = config.gemini.apiKey ? new GoogleGenAI({ apiKey: config.gemini.apiKey }) : null

    if (client) {
      const model = await app.appSettingsRepository.getGeminiModel()
      app.log.info(
        { model: model?.value || config.gemini.model },
        'Gemini client configured with database-backed model setting',
      )
    } else {
      app.log.warn('Gemini client is disabled because GEMINI_API_KEY is missing')
    }

    app.decorate('gemini', new GeminiService(app, client, config.gemini.model))
  },
)

export default plugin
