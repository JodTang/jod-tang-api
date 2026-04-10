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
    this.#logRequest({
      kind: 'text',
      model,
      prompt,
      systemInstruction: options.systemInstruction,
      maxOutputTokens: options.maxOutputTokens,
    })

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

    this.#logResponse({
      kind: 'text',
      model,
      text,
    })

    return { model, text }
  }

  async generateJson<T>(prompt: string, options: GeminiGenerateJsonOptions): Promise<T> {
    const { client, model } = await this.#getClientAndModel(options.model)
    this.#logRequest({
      kind: 'json',
      model,
      prompt,
      systemInstruction: options.systemInstruction,
      maxOutputTokens: options.maxOutputTokens,
      responseJsonSchema: options.responseJsonSchema,
    })

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

    this.#logResponse({
      kind: 'json',
      model,
      text,
    })

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

  #logRequest(payload: {
    kind: 'json' | 'text'
    model: string
    prompt: string
    systemInstruction?: string
    maxOutputTokens?: number
    responseJsonSchema?: unknown
  }) {
    const schemaText =
      payload.responseJsonSchema === undefined ? '' : JSON.stringify(payload.responseJsonSchema)

    this.#app.log.info(
      {
        kind: payload.kind,
        model: payload.model,
        promptChars: payload.prompt.length,
        promptApproxTokens: estimateTokenCount(payload.prompt),
        systemInstructionChars: payload.systemInstruction?.length || 0,
        systemInstructionApproxTokens: estimateTokenCount(payload.systemInstruction || ''),
        responseSchemaChars: schemaText.length,
        responseSchemaApproxTokens: estimateTokenCount(schemaText),
        maxOutputTokens: payload.maxOutputTokens || null,
      },
      'Gemini request',
    )
  }

  #logResponse(payload: { kind: 'json' | 'text'; model: string; text: string }) {
    this.#app.log.info(
      {
        kind: payload.kind,
        model: payload.model,
        responseChars: payload.text.length,
        responseApproxTokens: estimateTokenCount(payload.text),
      },
      'Gemini response',
    )
  }
}

function estimateTokenCount(text: string) {
  if (!text) {
    return 0
  }

  return Math.ceil(text.length / 4)
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
