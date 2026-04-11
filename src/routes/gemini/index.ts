import Type from 'typebox'
import type { TypedRoutePlugin } from '../../utils/factories.ts'

const generateGeminiBodySchema = Type.Object({
  prompt: Type.String({ minLength: 1, maxLength: 20000 }),
  systemInstruction: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
  model: Type.Optional(Type.String({ minLength: 1 })),
  temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
  maxOutputTokens: Type.Optional(Type.Number({ minimum: 1, maximum: 65536 })),
})

const generateGeminiResponseSchema = Type.Object({
  model: Type.String(),
  text: Type.String(),
})

const updateGeminiModelBodySchema = Type.Object({
  model: Type.String({ minLength: 1, maxLength: 255 }),
})

const geminiModelResponseSchema = Type.Object({
  model: Type.String(),
})

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
      preHandler: app.authenticate,
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
      preHandler: [app.authenticate, app.authorizeRoles('owner')],
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
