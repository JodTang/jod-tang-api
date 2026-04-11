import Type from 'typebox'

export const generateGeminiBodySchema = Type.Object({
  prompt: Type.String({ minLength: 1, maxLength: 20000 }),
  systemInstruction: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
  model: Type.Optional(Type.String({ minLength: 1 })),
  temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
  maxOutputTokens: Type.Optional(Type.Number({ minimum: 1, maximum: 65536 })),
})

export const generateGeminiResponseSchema = Type.Object({
  model: Type.String(),
  text: Type.String(),
})

export const updateGeminiModelBodySchema = Type.Object({
  model: Type.String({ minLength: 1, maxLength: 255 }),
})

export const geminiModelResponseSchema = Type.Object({
  model: Type.String(),
})
