import { defineRelations } from 'drizzle-orm'
import * as schema from './schema.ts'

export const relations = defineRelations(schema, (r) => ({
  usersTable: {
    inviteCode: r.one.inviteCodesTable({
      from: r.usersTable.inviteCodeId,
      to: r.inviteCodesTable.id,
      optional: true,
    }),
    localAuthCredential: r.one.localAuthCredentialsTable({
      from: r.usersTable.id,
      to: r.localAuthCredentialsTable.userId,
      optional: true,
    }),
  },
  localAuthCredentialsTable: {
    user: r.one.usersTable({
      from: r.localAuthCredentialsTable.userId,
      to: r.usersTable.id,
      optional: false,
    }),
  },
  categoriesTable: {
    user: r.one.usersTable({
      from: r.categoriesTable.userId,
      to: r.usersTable.id,
      optional: false,
    }),
  },
  transactionsTable: {
    user: r.one.usersTable({
      from: r.transactionsTable.userId,
      to: r.usersTable.id,
      optional: false,
    }),
    category: r.one.categoriesTable({
      from: r.transactionsTable.categoryId,
      to: r.categoriesTable.id,
      optional: true,
    }),
  },
}))
