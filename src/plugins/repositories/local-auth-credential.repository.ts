import { eq } from 'drizzle-orm'
import { db } from '../../db/index.ts'
import { type LocalAuthCredential, localAuthCredentialsTable } from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'

declare module 'fastify' {
  interface FastifyInstance {
    localAuthCredentialRepository: LocalAuthCredentialRepository
  }
}

export class LocalAuthCredentialRepository {
  async findByUsername(username: string) {
    return db.query.localAuthCredentialsTable.findFirst({
      where: { username },
    })
  }

  async upsertForUser(
    userId: string,
    payload: Pick<LocalAuthCredential, 'passwordHash' | 'username'>,
  ) {
    return (
      await db
        .insert(localAuthCredentialsTable)
        .values({
          userId,
          username: payload.username,
          passwordHash: payload.passwordHash,
        })
        .onConflictDoUpdate({
          target: localAuthCredentialsTable.userId,
          set: {
            username: payload.username,
            passwordHash: payload.passwordHash,
          },
        })
        .returning()
    )[0]
  }

  async findUserByUsername(username: string) {
    const credential = await this.findByUsername(username)
    if (!credential) {
      return null
    }

    const user = await db.query.usersTable.findFirst({
      where: { id: credential.userId },
    })

    if (!user) {
      return null
    }

    return { credential, user }
  }

  async deleteByUserId(userId: string) {
    return db
      .delete(localAuthCredentialsTable)
      .where(eq(localAuthCredentialsTable.userId, userId))
      .returning()
  }
}

const plugin = definePlugin(
  {
    name: 'local-auth-credential-repository',
    dependencies: ['db'],
  },
  async (app) => {
    app.decorate('localAuthCredentialRepository', new LocalAuthCredentialRepository())
  },
)

export default plugin
