import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import visionPlugin, {
  createVisionSelectionHandler,
  DEFAULT_SEE_IMAGE_MAX_TOKENS,
  VISION_SELECTION_PATH,
} from '../src/index.ts'

const servers: ReturnType<typeof createServer>[] = []

class MemorySettings extends SettingsProvider {
  get writable(): boolean { return true }
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

class MemoryWebServer extends Service {
  route: { path: string; handler: unknown } | undefined
  constructor(ctx: Context) { super(ctx, 'webServer') }
  register(route: { path: string; handler: unknown }): () => void {
    this.route = route
    return () => { this.route = undefined }
  }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

async function routeUrl(handler: ReturnType<typeof createVisionSelectionHandler>): Promise<string> {
  const server = createServer((request, response) => { void handler(request, response) })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('test server did not bind TCP')
  return `http://127.0.0.1:${String(address.port)}/dsh-deepseek-vision/selection`
}

describe('vision selection route', () => {
  it('reads and writes the registered settings scope', async () => {
    let selection = { provider: 'one', model: 'vision-one', maxTokens: 8192 }
    const update = vi.fn(async (patch: object) => { selection = { ...selection, ...patch } })
    const url = await routeUrl(createVisionSelectionHandler(
      { get: () => selection, update },
      () => true,
    ))

    const current = await fetch(url)
    expect(await current.json()).toEqual({ selection, writable: true })

    const changed = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: new URL(url).origin },
      body: JSON.stringify({ provider: 'two', model: 'vision-two' }),
    })
    expect(changed.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ provider: 'two', model: 'vision-two' })
  })

  it('rejects forwarded and cross-origin writes', async () => {
    const update = vi.fn()
    const url = await routeUrl(createVisionSelectionHandler(
      { get: () => ({ maxTokens: 8192 }), update },
      () => true,
    ))
    const request = (headers: Record<string, string>) => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ provider: 'one', model: 'vision-one' }),
    })

    expect((await request({ origin: 'http://evil.test' })).status).toBe(403)
    expect((await request({ origin: 'http://evil.test', host: 'evil.test' })).status).toBe(403)
    expect((await request({ origin: new URL(url).origin, 'x-forwarded-for': '127.0.0.1' })).status).toBe(403)
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps persistence failures distinct from invalid requests', async () => {
    const selection = { provider: 'one', model: 'vision-one', maxTokens: 8192 }
    const url = await routeUrl(createVisionSelectionHandler(
      { get: () => selection, update: vi.fn().mockRejectedValue(new Error('disk unavailable')) },
      () => true,
    ))
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: new URL(url).origin },
      body: JSON.stringify({ provider: 'two', model: 'vision-two' }),
    })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'disk unavailable' })
  })

  it('registers and disposes its Host route with the plugin fiber', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings)
    await ctx.plugin(MemoryWebServer)
    const fiber = await ctx.plugin(visionPlugin, { maxTokens: DEFAULT_SEE_IMAGE_MAX_TOKENS })
    const webServer = ctx.get('webServer') as MemoryWebServer

    expect(webServer.route?.path).toBe(VISION_SELECTION_PATH)
    await fiber.dispose()
    expect(webServer.route).toBeUndefined()
    await ctx.fiber.dispose()
  })
})
