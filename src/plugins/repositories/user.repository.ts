import { db } from '../../db/index.ts'
import { type NewUser, usersTable } from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'

declare module 'fastify' {
  interface FastifyInstance {
    userRepository: UserRepository
  }
}

export class UserRepository {
  async create(user: NewUser) {
    return (await db.insert(usersTable).values(user).returning())[0]
  }

  async findByLineUserId(id: string) {
    return db.query.usersTable.findFirst({
      where: { lineUserId: id },
    })
  }
}

const plugin = definePlugin(
  {
    name: 'user-repository',
    dependencies: ['db'],
  },
  async (app) => {
    app.decorate('userRepository', new UserRepository())
  },
)

export default plugin
