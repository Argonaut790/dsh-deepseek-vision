/**
 * Global model selection used by the DeepSeek vision bridge.
 *
 * @module dsh-deepseek-vision
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { AgentRegistry } from '@deepseek-ai/dsh-agent'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import z from '@deepseek-ai/schemastery'
import { parseImageUpload } from './media.ts'
import { authorizedUserImages } from './readback.ts'
import {
  DEFAULT_SEE_IMAGE_MAX_TOKENS,
  DEFAULT_SEE_IMAGE_MODEL,
  DEFAULT_SEE_IMAGE_PROVIDER,
  MAX_SEE_IMAGE_MAX_TOKENS,
  SEE_IMAGE_MODEL_SETTINGS_NAME,
  VISION_MEDIA_ATTACH_PATH,
  VISION_MEDIA_RAW_PREFIX,
  VISION_MEDIA_RAW_ROUTE,
  VISION_SELECTION_PATH,
  type SeeImageModelSelection,
  type SeeImageModelSettings,
} from './shared.ts'

export * from './shared.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Global provider/model route used by delegated image readback. */
    seeImageModel: SeeImageModelConfig
  }
}

/** Settings namespace carrying the global delegated-image model selection. */
export const SEE_IMAGE_MODEL_SETTINGS_NAMESPACE = SEE_IMAGE_MODEL_SETTINGS_NAME

/** Schema for the global delegated-image model settings section. */
export const SEE_IMAGE_MODEL_SETTINGS_SCHEMA: z<SeeImageModelSettings> = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  maxTokens: z.number().step(1).min(1).max(MAX_SEE_IMAGE_MAX_TOKENS).default(DEFAULT_SEE_IMAGE_MAX_TOKENS),
})

/** Composition defaults for delegated image readback. */
export interface Config {
  /** Output budget inherited until settings override it. */
  maxTokens: number
}

/**
 * Owns the global vision route independently of agent presets. Settings are
 * read live, so the next `see_image` call observes a newly selected model.
 */
interface SettingsScope {
  get(): SeeImageModelSettings
  update(patch: object): Promise<void>
}

interface SettingsHostContext extends Context {
  settings: {
    readonly writable: boolean
    register(
      namespace: string,
      schema: z<SeeImageModelSettings>,
      options: { base: SeeImageModelSettings },
    ): SettingsScope
  }
}

interface WebHostContext extends Context {
  webServer: {
    register(route: {
      kind: 'exact' | 'prefix'
      path: string
      handler: (request: IncomingMessage, response: ServerResponse) => void
    }): () => void
  }
}

interface MediaHostContext extends WebHostContext {
  agents: AgentRegistry
  attachments: AttachmentStore
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function directLoopback(request: Pick<IncomingMessage, 'headers' | 'socket'>): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  return !Object.keys(request.headers).some(header =>
    header === 'forwarded'
    || header === 'via'
    || header === 'x-real-ip'
    || header.startsWith('x-forwarded-'))
}

function sameOrigin(request: Pick<IncomingMessage, 'headers'>): boolean {
  const origin = request.headers.origin ?? request.headers.referer
  const host = request.headers.host
  if (host === undefined) return false
  if (origin === undefined) return request.headers['sec-fetch-site'] === 'same-origin'
  try {
    const parsed = new URL(origin)
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '')
    const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    return parsed.protocol === 'http:' && loopback && parsed.host === host
  } catch {
    return false
  }
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

async function readSelection(request: IncomingMessage): Promise<{ provider: string; model: string }> {
  const value = await readJson(request, 2048)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid selection')
  const { provider, model } = value as { provider?: unknown; model?: unknown }
  if (typeof provider !== 'string' || provider.length === 0 || provider.length > 256
    || typeof model !== 'string' || model.length === 0 || model.length > 256) {
    throw new Error('invalid selection')
  }
  return { provider, model }
}

function mediaContentType(request: IncomingMessage): boolean {
  return request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
}

/** Browser image admission. Every image validates before the first object is committed. */
export function createVisionMediaUploadHandler(host: Pick<MediaHostContext, 'agents' | 'attachments'>) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!directLoopback(request) || !sameOrigin(request)) {
      sendJson(response, 403, { error: 'image upload requires a direct same-origin loopback request' })
      return
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' })
      response.end()
      return
    }
    if (!mediaContentType(request)) {
      sendJson(response, 415, { error: 'content-type must be application/json' })
      return
    }
    let upload: ReturnType<typeof parseImageUpload>
    try {
      const maxBodyBytes = Math.ceil(host.attachments.imageLimits.maxMessageImageBytes * 4 / 3) + 65_536
      upload = parseImageUpload(await readJson(request, maxBodyBytes), host.attachments.imageLimits)
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
      return
    }
    const agent = host.agents.get(upload.sessionId as Parameters<AgentRegistry['get']>[0])
    if (agent === undefined) {
      sendJson(response, 404, { error: 'session is not active' })
      return
    }
    try {
      await Promise.all(upload.images.map(image => host.attachments.validateImage(image)))
      const attachments = []
      for (const image of upload.images) attachments.push(await host.attachments.saveImage(image))
      sendJson(response, 201, { attachments })
    } catch (error) {
      sendJson(response, 422, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/** Session-authorized raw image read used by message markdown and evidence thumbnails. */
export function createVisionMediaRawHandler(host: Pick<MediaHostContext, 'agents' | 'attachments'>) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!directLoopback(request) || !sameOrigin(request)) {
      sendJson(response, 403, { error: 'image reads require a direct same-origin loopback request' })
      return
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' })
      response.end()
      return
    }
    let sessionId: string
    let attachmentId: string
    try {
      const pathname = new URL(request.url ?? '', 'http://loopback').pathname
      if (!pathname.startsWith(VISION_MEDIA_RAW_PREFIX)) throw new Error('invalid image path')
      const parts = pathname.slice(VISION_MEDIA_RAW_PREFIX.length).split('/')
      if (parts.length !== 2 || parts.some(part => part.length === 0)) throw new Error('invalid image path')
      sessionId = decodeURIComponent(parts[0] as string)
      attachmentId = decodeURIComponent(parts[1] as string)
    } catch {
      sendJson(response, 400, { error: 'invalid image path' })
      return
    }
    const agent = host.agents.get(sessionId as Parameters<AgentRegistry['get']>[0])
    if (agent === undefined) {
      sendJson(response, 404, { error: 'session is not active' })
      return
    }
    const ref = authorizedUserImages(agent.session.events)
      .find(candidate => String(candidate.attachmentId) === attachmentId)
    if (ref === undefined) {
      sendJson(response, 404, { error: 'image is not referenced by this session' })
      return
    }
    try {
      const stored = await host.attachments.readImage(ref)
      response.writeHead(200, {
        'cache-control': 'private, no-store',
        'content-length': String(stored.data.byteLength),
        'content-type': stored.ref.mediaType,
        'x-content-type-options': 'nosniff',
      })
      response.end(Buffer.from(stored.data))
    } catch (error) {
      sendJson(response, 404, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

export function createVisionSelectionHandler(scope: SettingsScope, writable: () => boolean) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!directLoopback(request)) {
      sendJson(response, 403, { error: 'vision settings are limited to direct loopback requests' })
      return
    }
    if (request.method === 'GET') {
      sendJson(response, 200, { selection: scope.get(), writable: writable() })
      return
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'GET, POST', 'cache-control': 'no-store' })
      response.end()
      return
    }
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: 'vision settings require a same-origin request' })
      return
    }
    if (request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      sendJson(response, 415, { error: 'content-type must be application/json' })
      return
    }
    if (!writable()) {
      sendJson(response, 403, { error: 'vision settings are read-only' })
      return
    }
    let selection: { provider: string; model: string }
    try {
      selection = await readSelection(request)
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
      return
    }
    try {
      await scope.update(selection)
      sendJson(response, 200, { selection: scope.get(), writable: writable() })
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

export class SeeImageModelConfig {
  static Config: z<Config> = z.object({
    maxTokens: z.number().step(1).min(1).max(MAX_SEE_IMAGE_MAX_TOKENS).default(DEFAULT_SEE_IMAGE_MAX_TOKENS),
  })

  private source: () => SeeImageModelSettings

  constructor(ctx: Context, config: Config) {
    const entry: SeeImageModelSettings = {
      provider: DEFAULT_SEE_IMAGE_PROVIDER,
      model: DEFAULT_SEE_IMAGE_MODEL,
      maxTokens: config.maxTokens,
    }
    this.source = () => entry
    ctx.provide('seeImageModel', this)
    ctx.inject(['webServer', 'attachments', 'agents'], (mediaCtx: Context) => {
      const host = mediaCtx as MediaHostContext
      const upload = createVisionMediaUploadHandler(host)
      const raw = createVisionMediaRawHandler(host)
      host.effect(() => host.webServer.register({
        kind: 'exact',
        path: VISION_MEDIA_ATTACH_PATH,
        handler: (request, response) => { void upload(request, response) },
      }), 'see-image-model: media upload route')
      host.effect(() => host.webServer.register({
        kind: 'prefix',
        path: VISION_MEDIA_RAW_ROUTE,
        handler: (request, response) => { void raw(request, response) },
      }), 'see-image-model: media raw route')
    })
    ctx.inject(['settings'], (settingsCtx: Context) => {
      const host = settingsCtx as SettingsHostContext
      const scope = host.settings.register(
        SEE_IMAGE_MODEL_SETTINGS_NAMESPACE,
        SEE_IMAGE_MODEL_SETTINGS_SCHEMA,
        { base: entry },
      )
      this.source = () => scope.get()
      host.effect(() => () => { this.source = () => entry }, 'see-image-model: settings source')
      host.inject(['webServer'], (webCtx: Context) => {
        const webHost = webCtx as WebHostContext
        const handler = createVisionSelectionHandler(scope, () => host.settings.writable)
        webHost.effect(() => webHost.webServer.register({
          kind: 'exact',
          path: VISION_SELECTION_PATH,
          handler: (request, response) => { void handler(request, response) },
        }), 'see-image-model: settings route')
      })
    })
  }

  /**
   * Read the complete current route.
   * @returns a detached selection, or undefined until provider and model are both configured.
   */
  currentSelection(): SeeImageModelSelection | undefined {
    const current = this.source()
    if (current.provider === undefined || current.model === undefined) return undefined
    return {
      provider: current.provider,
      model: current.model,
      maxTokens: current.maxTokens,
    }
  }
}

/** Cordis entry kept as an arrow so linked packages cannot be misclassified as constructor plugins. */
export const apply = Object.assign(
  (ctx: Context, config: Config): void => { new SeeImageModelConfig(ctx, config) },
  { Config: SeeImageModelConfig.Config },
)

export default apply
