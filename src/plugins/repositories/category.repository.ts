import { db } from '../../db/index.ts'
import type { Category, TransactionType } from '../../db/schema.ts'
import { definePlugin } from '../../utils/factories.ts'

declare module 'fastify' {
  interface FastifyInstance {
    categoryRepository: CategoryRepository
  }
}

export class CategoryRepository {
  async findByUserId(userId: string) {
    const categories = await db.query.categoriesTable.findMany({
      where: { userId },
    })

    return categories.sort(sortCategories)
  }

  async findByIdAndUserId(id: string, userId: string) {
    return db.query.categoriesTable.findFirst({
      where: { id, userId },
    })
  }

  async findByUserIdAndTransactionType(userId: string, transactionType: TransactionType) {
    const categories = await this.findByUserId(userId)
    return categories.filter(
      (category) => category.type === transactionType || category.type === 'both',
    )
  }
}

function getCategoryTypeOrder(category: Category) {
  switch (category.type) {
    case 'expense':
      return 0
    case 'income':
      return 1
    case 'both':
      return 2
    default:
      return 99
  }
}

function sortCategories(a: Category, b: Category) {
  const typeDiff = getCategoryTypeOrder(a) - getCategoryTypeOrder(b)
  if (typeDiff !== 0) {
    return typeDiff
  }

  if (a.isDefault !== b.isDefault) {
    return Number(b.isDefault) - Number(a.isDefault)
  }

  return a.name.localeCompare(b.name, 'th')
}

const plugin = definePlugin(
  {
    name: 'category-repository',
    dependencies: ['db'],
  },
  async (app) => {
    app.decorate('categoryRepository', new CategoryRepository())
  },
)

export default plugin
