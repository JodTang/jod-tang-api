import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { LineBotClient, type messagingApi } from '@line/bot-sdk'

type CliOptions = {
  alias?: string
  config?: string
  default?: boolean
  help?: boolean
  image?: string
  validateOnly?: boolean
}

async function main() {
  const options = parseCliArgs()

  if (options.help || !options.config) {
    printHelp()
    process.exit(options.help ? 0 : 1)
  }

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!channelAccessToken) {
    throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN')
  }

  const client = LineBotClient.fromChannelAccessToken({
    channelAccessToken,
    apiBaseURL: process.env.LINE_ENDPOINT || undefined,
  })

  const richMenuPath = resolve(process.cwd(), options.config)
  const richMenu = await loadRichMenuDefinition(richMenuPath)

  await client.validateRichMenuObject(richMenu)
  console.log(`Validated rich menu definition: ${richMenuPath}`)

  if (options.validateOnly) {
    return
  }

  const { richMenuId } = await client.createRichMenu(richMenu)
  console.log(`Created rich menu: ${richMenuId}`)

  if (options.image) {
    const imagePath = resolve(process.cwd(), options.image)
    const imageBlob = await loadImageBlob(imagePath)
    await client.setRichMenuImage(richMenuId, imageBlob)
    console.log(`Uploaded rich menu image: ${imagePath}`)
  }

  if (options.alias) {
    await upsertRichMenuAlias(client, options.alias, richMenuId)
  }

  if (options.default) {
    await client.setDefaultRichMenu(richMenuId)
    console.log(`Set as default rich menu: ${richMenuId}`)
  }
}

function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      config: { type: 'string', short: 'c' },
      image: { type: 'string', short: 'i' },
      alias: { type: 'string', short: 'a' },
      default: { type: 'boolean', default: false },
      'validate-only': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })

  return {
    alias: values.alias,
    config: values.config,
    default: values.default,
    help: values.help,
    image: values.image,
    validateOnly: values['validate-only'],
  }
}

async function loadRichMenuDefinition(path: string): Promise<messagingApi.RichMenuRequest> {
  const content = await readFile(path, 'utf8')
  return JSON.parse(content) as messagingApi.RichMenuRequest
}

async function loadImageBlob(path: string): Promise<Blob> {
  const mimeType = getImageMimeType(path)
  const file = await readFile(path)
  return new Blob([file], { type: mimeType })
}

async function upsertRichMenuAlias(client: LineBotClient, aliasId: string, richMenuId: string) {
  const aliasExists = await hasRichMenuAlias(client, aliasId)

  if (aliasExists) {
    await client.updateRichMenuAlias(aliasId, { richMenuId })
    console.log(`Updated rich menu alias: ${aliasId}`)
    return
  }

  await client.createRichMenuAlias({
    richMenuAliasId: aliasId,
    richMenuId,
  })
  console.log(`Created rich menu alias: ${aliasId}`)
}

async function hasRichMenuAlias(client: LineBotClient, aliasId: string) {
  try {
    await client.getRichMenuAlias(aliasId)
    return true
  } catch (error) {
    if (isNotFoundError(error)) {
      return false
    }

    throw error
  }
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybeError = error as { statusCode?: number; message?: string }
  return maybeError.statusCode === 404 || maybeError.message?.includes('404') === true
}

function getImageMimeType(path: string) {
  switch (extname(path).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    default:
      throw new Error('Unsupported image type. Use .png, .jpg, or .jpeg')
  }
}

function printHelp() {
  console.log(`Usage:
  npm run line:create-rich-menu -- --config <path> [--image <path>] [--alias <id>] [--default]

Options:
  --config, -c         Path to rich menu JSON definition
  --image, -i          Path to rich menu image (.png, .jpg, .jpeg)
  --alias, -a          Rich menu alias ID to create
  --default            Set the created rich menu as default
  --validate-only      Validate the rich menu JSON without creating it
  --help, -h           Show this help

Environment:
  LINE_CHANNEL_ACCESS_TOKEN   Required
  LINE_ENDPOINT               Optional, defaults to LINE API base URL
`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
