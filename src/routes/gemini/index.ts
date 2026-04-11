import type { TypedRoutePlugin } from '../../utils/factories.ts'
import {
  geminiModelResponseSchema,
  generateGeminiBodySchema,
  generateGeminiResponseSchema,
  updateGeminiModelBodySchema,
} from './schema.ts'

const route: TypedRoutePlugin = async (app) => {
  app.post(
    '/gemini/generate',
    {
      schema: {
        tags: ['gemini'],
        body: generateGeminiBodySchema,
        response: {
          200: generateGeminiResponseSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
        },
      },
      config: {
        auth: true,
      },
    },
    async (request) => {
      return app.gemini.generateText(request.body.prompt, {
        systemInstruction: request.body.systemInstruction,
        model: request.body.model,
        temperature: request.body.temperature,
        maxOutputTokens: request.body.maxOutputTokens,
      })
    },
  )

  app.patch(
    '/gemini/model',
    {
      schema: {
        tags: ['gemini'],
        summary: 'Update Gemini model',
        description: 'Update the application-wide default Gemini model',
        body: updateGeminiModelBodySchema,
        response: {
          200: geminiModelResponseSchema,
          400: { $ref: 'responses#/properties/badRequest', description: 'Bad Request' },
          401: { $ref: 'responses#/properties/unauthorized', description: 'Unauthorized' },
          403: { $ref: 'responses#/properties/forbidden', description: 'Forbidden' },
        },
      },
      config: {
        auth: true,
        roles: ['owner'],
      },
    },
    async (request) => {
      const model = request.body.model.trim()
      if (!model) {
        throw app.httpErrors.badRequest('Gemini model is required')
      }

      const setting = await app.appSettingsRepository.setGeminiModel(model)

      return {
        model: setting.value,
      }
    },
  )
}

export default route
