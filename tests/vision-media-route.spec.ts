import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createVisionMediaRawHandler,
  createVisionMediaUploadHandler,
} from '../src/index.ts'
import { VISION_MEDIA_RAW_ROUTE, visionMediaRawPath } from '../src/shared.ts'

const servers: ReturnType<typeof createServer>[] = []
const limits = {
  maxImageBytes: 1024,
  maxImagesPerMessage: 2,
  maxMessageImageBytes: 1536,
  maxImagePixels: 1_000_000,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
}
const ref = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png' as const,
  bytes: 8,
  width: 1,
  height: 1,
  name: 'screen.png',
}
const note = `[image attachment ${JSON.stringify(ref)}]`
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

async function routeUrl(handler: (request: never, response: never) => void): Promise<string> {
  const server = createServer((request, response) => { handler(request as never, response as never) })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('test server did not bind TCP')
  return `http://127.0.0.1:${String(address.port)}`
}

function host(events: unknown[] = []) {
  return {
    agents: {
      get: (sessionId: string) => sessionId === 'session-one' ? { session: { events } } : undefined,
    },
    attachments: {
      imageLimits: limits,
      validateImage: vi.fn(async () => undefined),
      saveImage: vi.fn(async () => ref),
      readImage: vi.fn(async () => ({ ref, data: png })),
    },
  }
}

describe('vision media upload route', () => {
  it('validates the complete batch before saving it', async () => {
    const service = host()
    const url = await routeUrl(createVisionMediaUploadHandler(service as never))
    const response = await fetch(`${url}/dsh-deepseek-vision/media/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: url },
      body: JSON.stringify({
        sessionId: 'session-one',
        images: [{ data: png.toString('base64'), mediaType: 'image/png', name: 'screen.png' }],
      }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ attachments: [ref] })
    expect(service.attachments.validateImage).toHaveBeenCalledOnce()
    expect(service.attachments.saveImage).toHaveBeenCalledOnce()
    expect(service.attachments.validateImage.mock.invocationCallOrder[0])
      .toBeLessThan(service.attachments.saveImage.mock.invocationCallOrder[0] as number)
  })

  it('rejects cross-origin, forwarded, and inactive-session uploads', async () => {
    const service = host()
    const url = await routeUrl(createVisionMediaUploadHandler(service as never))
    const request = (sessionId: string, headers: Record<string, string>) => fetch(`${url}/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({
        sessionId,
        images: [{ data: png.toString('base64'), mediaType: 'image/png' }],
      }),
    })
    expect((await request('session-one', { origin: 'http://evil.test' })).status).toBe(403)
    expect((await request('session-one', { origin: url, 'x-forwarded-for': '127.0.0.1' })).status).toBe(403)
    expect((await request('missing', { origin: url })).status).toBe(404)
    expect(service.attachments.saveImage).not.toHaveBeenCalled()
  })
})

describe('vision media raw route', () => {
  it('registers a prefix without the matcher-breaking trailing slash', () => {
    expect(VISION_MEDIA_RAW_ROUTE).toBe('/dsh-deepseek-vision/media/raw')
    expect(visionMediaRawPath('session-one', ref.attachmentId))
      .toMatch(/^\/dsh-deepseek-vision\/media\/raw\/session-one\//)
  })

  it('serves only exact refs already present in user session events', async () => {
    const service = host([{
      type: 'user/message',
      data: { content: [{ type: 'text', text: note }] },
    }])
    const url = await routeUrl(createVisionMediaRawHandler(service as never))
    const authorized = await fetch(`${url}${visionMediaRawPath('session-one', ref.attachmentId)}`, {
      headers: { 'sec-fetch-site': 'same-origin' },
    })
    expect(authorized.status).toBe(200)
    expect(authorized.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await authorized.arrayBuffer())).toEqual(png)

    const missing = await fetch(`${url}${visionMediaRawPath('session-one', `sha256:${'b'.repeat(64)}`)}`, {
      headers: { origin: url },
    })
    expect(missing.status).toBe(404)
    const wrongSession = await fetch(`${url}${visionMediaRawPath('session-two', ref.attachmentId)}`, {
      headers: { origin: url },
    })
    expect(wrongSession.status).toBe(404)
    expect(service.attachments.readImage).toHaveBeenCalledOnce()
  })

  it('does not authorize refs copied into assistant text', async () => {
    const service = host([{
      type: 'assistant/message',
      data: { content: [{ type: 'text', text: note }] },
    }])
    const url = await routeUrl(createVisionMediaRawHandler(service as never))
    const response = await fetch(`${url}${visionMediaRawPath('session-one', ref.attachmentId)}`, {
      headers: { origin: url },
    })
    expect(response.status).toBe(404)
    expect(service.attachments.readImage).not.toHaveBeenCalled()
  })

  it('authorizes validated native image blocks only in user messages', async () => {
    const userService = host([{
      type: 'user/message',
      data: { content: [{ type: 'image', attachment: ref }] },
    }])
    const userUrl = await routeUrl(createVisionMediaRawHandler(userService as never))
    expect((await fetch(`${userUrl}${visionMediaRawPath('session-one', ref.attachmentId)}`, {
      headers: { origin: userUrl },
    })).status).toBe(200)

    const assistantService = host([{
      type: 'assistant/message',
      data: { content: [{ type: 'image', attachment: ref }] },
    }])
    const assistantUrl = await routeUrl(createVisionMediaRawHandler(assistantService as never))
    expect((await fetch(`${assistantUrl}${visionMediaRawPath('session-one', ref.attachmentId)}`, {
      headers: { origin: assistantUrl },
    })).status).toBe(404)
  })

  it('rejects cross-origin and forwarded image reads', async () => {
    const service = host([{
      type: 'user/message',
      data: { content: [{ type: 'text', text: note }] },
    }])
    const url = await routeUrl(createVisionMediaRawHandler(service as never))
    const path = `${url}${visionMediaRawPath('session-one', ref.attachmentId)}`
    expect((await fetch(path, {
      headers: { origin: 'http://evil.test', 'sec-fetch-site': 'same-origin' },
    })).status).toBe(403)
    expect((await fetch(path, { headers: { origin: url, 'x-forwarded-for': '127.0.0.1' } })).status).toBe(403)
    expect(service.attachments.readImage).not.toHaveBeenCalled()
  })
})
