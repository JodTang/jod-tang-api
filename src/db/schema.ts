import type { NodePgTransaction } from 'drizzle-orm/node-postgres'
import {
  boolean,
  date,
  decimal,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

const msTimestamp = (name: string) => timestamp(name, { precision: 3 })

export const userStatusEnum = pgEnum('user_status', ['pending', 'active', 'banned'])
export const categoryTypeEnum = pgEnum('category_type', ['expense', 'income', 'both'])
export const transactionTypeEnum = pgEnum('transaction_type', ['expense', 'income'])
export const transactionSourceEnum = pgEnum('transaction_source', ['web', 'line'])

export const inviteCodesTable = pgTable(
  'invite_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 255 }).notNull().unique(),
    maxUses: integer('max_uses').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    expiresAt: msTimestamp('expires_at'),
    createdAt: msTimestamp('created_at').notNull().defaultNow(),
    updatedAt: msTimestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('invite_codes_code_idx').on(table.code)],
)

export const appSettingsTable = pgTable(
  'app_settings',
  {
    key: varchar('key', { length: 255 }).primaryKey(),
    value: text('value').notNull(),
    createdAt: msTimestamp('created_at').notNull().defaultNow(),
    updatedAt: msTimestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('app_settings_key_idx').on(table.key)],
)

export const usersTable = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lineUserId: varchar('line_user_id', { length: 255 }).notNull().unique(),
    inviteCodeId: uuid('invite_code_id').references(() => inviteCodesTable.id, {
      onDelete: 'set null',
    }),
    displayName: varchar('display_name').notNull(),
    status: userStatusEnum('status').notNull().default('pending'),
    activatedAt: msTimestamp('activated_at'),
    createdAt: msTimestamp('created_at').notNull().defaultNow(),
    updatedAt: msTimestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('users_line_user_id_idx').on(table.lineUserId),
    index('users_invite_code_id_idx').on(table.inviteCodeId),
  ],
)

export const categoriesTable = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    icon: varchar('icon'),
    type: categoryTypeEnum('type').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: msTimestamp('created_at').notNull().defaultNow(),
    updatedAt: msTimestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('categories_user_id_idx').on(table.userId),
    index('categories_type_idx').on(table.type),
  ],
)

export const transactionsTable = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categoriesTable.id, { onDelete: 'set null' }),
    type: transactionTypeEnum('type').notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    note: text('note'),
    sourceText: text('source_text'),
    transactedAt: date('transacted_at').notNull(),
    source: transactionSourceEnum('source'),
    createdAt: msTimestamp('created_at').notNull().defaultNow(),
    updatedAt: msTimestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('transactions_user_date_idx').on(table.userId, table.transactedAt),
    index('transactions_user_category_idx').on(table.userId, table.categoryId),
    index('transactions_user_type_date_idx').on(table.userId, table.type, table.transactedAt),
  ],
)

export type PgTransaction = NodePgTransaction<any, any, any>

export type InviteCode = typeof inviteCodesTable.$inferSelect
export type NewInviteCode = typeof inviteCodesTable.$inferInsert
export type AppSetting = typeof appSettingsTable.$inferSelect
export type NewAppSetting = typeof appSettingsTable.$inferInsert
export type User = typeof usersTable.$inferSelect
export type NewUser = typeof usersTable.$inferInsert
export type Category = typeof categoriesTable.$inferSelect
export type NewCategory = typeof categoriesTable.$inferInsert
export type Transaction = typeof transactionsTable.$inferSelect
export type NewTransaction = typeof transactionsTable.$inferInsert

export type UserStatus = (typeof userStatusEnum.enumValues)[number]
export type CategoryType = (typeof categoryTypeEnum.enumValues)[number]
export type TransactionType = (typeof transactionTypeEnum.enumValues)[number]
export type TransactionSource = (typeof transactionSourceEnum.enumValues)[number]
