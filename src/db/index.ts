import { drizzle } from 'drizzle-orm/node-postgres'
import { relations } from './relations.ts'

export const db = drizzle(process.env.POSTGRES_URL!, { relations })
