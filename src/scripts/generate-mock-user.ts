import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { db } from '../db/index.ts'
import {
  localAuthCredentialsTable,
  type UserRole,
  type UserStatus,
  usersTable,
} from '../db/schema.ts'
import { hashPassword } from '../utils/password.ts'

type CliOptions = {
  count: number
  displayNamePrefix: string
  help: boolean
  password?: string
  prefix: string
  role: UserRole
  status: UserStatus
}

const allowedRoles = ['user', 'admin', 'owner'] as const satisfies readonly UserRole[]
const allowedStatuses = ['pending', 'active', 'banned'] as const satisfies readonly UserStatus[]

async function main() {
  try {
    const options = parseCliArgs()

    if (options.help) {
      printHelp()
      return
    }

    const createdUsers = []
    const batchId = Date.now().toString(36)

    for (let index = 0; index < options.count; index += 1) {
      const sequence = `${batchId}-${index + 1}-${randomUUID().slice(0, 8)}`
      const username = `${options.prefix}-${sequence}`
      const lineUserId = `mock:${options.prefix}:${sequence}`
      const password = options.password || `mock-${randomUUID().slice(0, 12)}`
      const displayName =
        options.count === 1
          ? options.displayNamePrefix
          : `${options.displayNamePrefix} ${String(index + 1).padStart(2, '0')}`

      const user = await db.transaction(async (tx) => {
        const insertedUser = (
          await tx
            .insert(usersTable)
            .values({
              lineUserId,
              displayName,
              role: options.role,
              status: options.status,
              activatedAt: options.status === 'active' ? new Date() : null,
            })
            .returning()
        )[0]

        await tx.insert(localAuthCredentialsTable).values({
          userId: insertedUser.id,
          username,
          passwordHash: await hashPassword(password),
        })

        return {
          id: insertedUser.id,
          displayName: insertedUser.displayName,
          lineUserId: insertedUser.lineUserId,
          role: insertedUser.role,
          status: insertedUser.status,
          username,
          password,
        }
      })

      createdUsers.push(user)
    }

    console.log(`Created ${createdUsers.length} mock user${createdUsers.length === 1 ? '' : 's'}`)
    for (const user of createdUsers) {
      console.log(
        JSON.stringify(
          {
            id: user.id,
            displayName: user.displayName,
            lineUserId: user.lineUserId,
            role: user.role,
            status: user.status,
            username: user.username,
            password: user.password,
          },
          null,
          2,
        ),
      )
    }

    const logFilePath = await writeResultLog({
      createdAt: new Date().toISOString(),
      options: {
        count: options.count,
        displayNamePrefix: options.displayNamePrefix,
        prefix: options.prefix,
        role: options.role,
        status: options.status,
        usedFixedPassword: Boolean(options.password),
      },
      users: createdUsers,
    })

    console.log(`Saved result log: ${logFilePath}`)
  } finally {
    await db.$client.end()
  }
}

function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      count: { type: 'string', short: 'c', default: '1' },
      'display-name-prefix': { type: 'string', default: 'Mock User' },
      help: { type: 'boolean', short: 'h', default: false },
      password: { type: 'string' },
      prefix: { type: 'string', short: 'p', default: 'mock-user' },
      role: { type: 'string', short: 'r', default: 'user' },
      status: { type: 'string', short: 's', default: 'active' },
    },
  })

  const count = Number.parseInt(values.count, 10)
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('`--count` must be an integer greater than 0')
  }

  const role = values.role as UserRole
  if (!allowedRoles.includes(role)) {
    throw new Error(`\`--role\` must be one of: ${allowedRoles.join(', ')}`)
  }

  const status = values.status as UserStatus
  if (!allowedStatuses.includes(status)) {
    throw new Error(`\`--status\` must be one of: ${allowedStatuses.join(', ')}`)
  }

  return {
    count,
    displayNamePrefix: values['display-name-prefix'],
    help: values.help,
    password: values.password,
    prefix: values.prefix,
    role,
    status,
  }
}

function printHelp() {
  console.log(`Usage:
  npm run mock:user -- [options]

Options:
  --count, -c                 Number of mock users to create (default: 1)
  --role, -r                  User role: user, admin, owner (default: user)
  --status, -s                User status: pending, active, banned (default: active)
  --prefix, -p                Prefix for generated username/lineUserId (default: mock-user)
  --display-name-prefix       Display name prefix (default: Mock User)
  --password                  Reuse the same password for every generated user
  --help, -h                  Show this help

Examples:
  npm run mock:user
  npm run mock:user -- --role admin --count 3
  npm run mock:user -- --prefix qa --password secret123
`)
}

async function writeResultLog(payload: {
  createdAt: string
  options: {
    count: number
    displayNamePrefix: string
    prefix: string
    role: UserRole
    status: UserStatus
    usedFixedPassword: boolean
  }
  users: Array<{
    id: string
    displayName: string
    lineUserId: string
    role: UserRole
    status: UserStatus
    username: string
    password: string
  }>
}) {
  const logsDir = resolve(process.cwd(), 'logs/mock-users')
  await mkdir(logsDir, { recursive: true })

  const fileName = `mock-users-${new Date().toISOString().replaceAll(':', '-').replace('.', '-')}.json`
  const filePath = resolve(logsDir, fileName)
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  return filePath
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
