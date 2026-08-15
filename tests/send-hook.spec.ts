// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { installVisionSendHook } from '../src/client/send-hook.ts'

const ref = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png',
  bytes: 8,
  width: 1,
  height: 1,
  name: 'screen.png',
}
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

afterEach(() => {
  vi.unstubAllGlobals()
})

function fixture(prompt = vi.fn(async () => ({ ok: true }))) {
  const original = vi.fn(async () => undefined)
  const releaseDraftImage = vi.fn()
  const conversation = {
    sendSession: original,
    draftImages: () => [{ id: 'draft-one', file: new File([png], 'screen.png', { type: 'image/png' }) }],
    releaseDraftImage,
  }
  const session = { sessionId: 'session-one', prompt }
  return { conversation, original, prompt, releaseDraftImage, session }
}

describe('vision composer send hook', () => {
  it('uploads image drafts and submits only text with durable refs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      attachments: [{ ...ref, serverInternal: 'must-not-enter-session' }],
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })))
    const { conversation, original, prompt, releaseDraftImage, session } = fixture()
    const dispose = installVisionSendHook(conversation)

    await conversation.sendSession(session, 'What is shown?', ['draft-one'], 'queue')

    expect(original).not.toHaveBeenCalled()
    expect(prompt).toHaveBeenCalledOnce()
    const content = prompt.mock.calls[0]?.[0]
    expect(content).toHaveLength(1)
    expect(content?.[0]).toMatchObject({ type: 'text' })
    expect(content?.[0]?.text).toContain('What is shown?')
    expect(content?.[0]?.text).toContain(`${window.location.origin}/dsh-deepseek-vision/media/raw/`)
    expect(content?.[0]?.text).toContain('/dsh-deepseek-vision/media/raw/session-one/')
    expect(content?.[0]?.text).toContain('[image attachment {"attachmentId":"sha256:')
    expect(content?.[0]?.text).not.toContain('serverInternal')
    expect(releaseDraftImage).toHaveBeenCalledWith('draft-one')

    dispose()
    expect(conversation.sendSession).toBe(original)
  })

  it('blocks send and retains drafts when upload fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid image' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })))
    const { conversation, original, prompt, releaseDraftImage, session } = fixture()
    installVisionSendHook(conversation)

    await expect(conversation.sendSession(session, '', ['draft-one'], 'queue'))
      .rejects.toThrow('Image upload failed: invalid image')
    expect(original).not.toHaveBeenCalled()
    expect(prompt).not.toHaveBeenCalled()
    expect(releaseDraftImage).not.toHaveBeenCalled()
  })

  it('retains drafts when prompt admission fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ attachments: [ref] }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })))
    const prompt = vi.fn(async () => ({ ok: false, error: { code: 'offline', message: 'try again' } }))
    const { conversation, releaseDraftImage, session } = fixture(prompt)
    installVisionSendHook(conversation)

    await expect(conversation.sendSession(session, '', ['draft-one'], 'queue'))
      .rejects.toThrow(/offline/)
    expect(releaseDraftImage).not.toHaveBeenCalled()
  })

  it('keeps its marker when a later wrapper owns sendSession', () => {
    const { conversation } = fixture()
    const dispose = installVisionSendHook(conversation)
    const visionWrapper = conversation.sendSession
    const laterWrapper = vi.fn((...args: Parameters<typeof visionWrapper>) =>
      visionWrapper.call(conversation, ...args))
    conversation.sendSession = laterWrapper

    dispose()
    const duplicateDispose = installVisionSendHook(conversation)
    expect(conversation.sendSession).toBe(laterWrapper)
    duplicateDispose()
  })
})
