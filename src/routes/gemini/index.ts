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

const route: TypedRoutePlugin = async (app) => {
  app.post(
    '/gemini/generate',
    {
      schema: {
        tags: ['gemini'],
        body: generateGeminiBodySchema,
        response: {
          200: generateGeminiResponseSchema,
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
}

export default route
