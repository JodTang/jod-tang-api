import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
  FastifyTypeProvider,
  RawServerBase,
  RawServerDefault,
} from 'fastify'
import type { Static, TSchema } from 'typebox'

export interface TypeBoxTypeProvider extends FastifyTypeProvider {
  validator: this['schema'] extends TSchema ? Static<this['schema']> : unknown
  serializer: this['schema'] extends TSchema ? Static<this['schema']> : unknown
}

export type FastifyPluginAsyncTypebox<
  Options extends FastifyPluginOptions = Record<never, never>,
  Server extends RawServerBase = RawServerDefault,
> = FastifyPluginAsync<Options, Server, TypeBoxTypeProvider>
