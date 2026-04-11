import Type from 'typebox'

export const lineAuthBodySchema = Type.Object({
  idToken: Type.String({ minLength: 1 }),
})

export const localAuthBodySchema = Type.Object({
  username: Type.String({ minLength: 1, maxLength: 255 }),
  password: Type.String({ minLength: 1, maxLength: 255 }),
})

export const createLocalAuthCredentialBodySchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  username: Type.String({ minLength: 1, maxLength: 255 }),
  password: Type.String({ minLength: 1, maxLength: 255 }),
})

export const authUserSchema = Type.Object({
  id: Type.String(),
  lineUserId: Type.String(),
  displayName: Type.String(),
  pictureUrl: Type.Union([Type.String(), Type.Null()]),
  role: Type.Enum(['user', 'admin', 'owner']),
  status: Type.Enum(['pending', 'active', 'banned']),
})

export const authSuccessSchema = Type.Object({
  accessToken: Type.String(),
  tokenType: Type.Literal('Bearer'),
  user: authUserSchema,
})

export const meResponseSchema = Type.Object({
  user: authUserSchema,
})

export const localAuthCredentialResponseSchema = Type.Object({
  user: authUserSchema,
  credential: Type.Object({
    username: Type.String(),
  }),
})

export const logoutResponseSchema = Type.Null()
