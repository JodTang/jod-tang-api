import assert from 'node:assert'
import fp from 'fastify-plugin'
import type { IConfig } from '../config/index.ts'
import type { FastifyPluginAsyncTypebox } from './type-provider.ts'

export interface RouteOptions {
  [key: string]: unknown
  config: IConfig
}

export interface PluginOptions {
  name?: string
  dependencies?: string[]
  encapsulate?: boolean
}

export type TypedRoutePlugin = FastifyPluginAsyncTypebox<RouteOptions>

type Plugin<T extends RouteOptions = RouteOptions> = FastifyPluginAsyncTypebox<T>

const isPlugin = <T extends RouteOptions>(value: unknown): value is Plugin<T> =>
  typeof value === 'function'

function definePlugin<T extends RouteOptions>(plugin: Plugin<T>): Plugin<T>
function definePlugin<T extends RouteOptions>(options: PluginOptions, plugin: Plugin<T>): Plugin<T>
function definePlugin<T extends RouteOptions>(
  optionsOrPlugin: PluginOptions | Plugin<T>,
  plugin?: Plugin<T>,
): Plugin<T> {
  if (isPlugin<T>(optionsOrPlugin)) {
    return fp(optionsOrPlugin)
  }

  assert(plugin, 'definePlugin requires a plugin when options are provided')

  return fp(plugin, optionsOrPlugin)
}

export { definePlugin }
