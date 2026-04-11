import { eq } from 'drizzle-orm'
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

  async findById(id: string) {
    return db.query.usersTable.findFirst({
      where: { id },
    })
  }

  async findByLineUserId(id: string) {
    return db.query.usersTable.findFirst({
      where: { lineUserId: id },
    })
  }

  async findFirstOwner() {
    return db.query.usersTable.findFirst({
      where: { role: 'owner' },
    })
  }

  async updateProfile(id: string, profile: Pick<NewUser, 'displayName' | 'pictureUrl'>) {
    return (await db.update(usersTable).set(profile).where(eq(usersTable.id, id)).returning())[0]
  }

  async updateRoleAndStatus(id: string, payload: Pick<NewUser, 'role' | 'status' | 'activatedAt'>) {
    return (await db.update(usersTable).set(payload).where(eq(usersTable.id, id)).returning())[0]
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
