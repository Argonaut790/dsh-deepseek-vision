import { describe, expect, it } from 'vitest'
import {
  imageAttachmentNote,
  imageAttachmentNotes,
  parseImageAttachmentRef,
  parseImageUpload,
} from '../src/media.ts'

const limits = {
  maxImageBytes: 1024,
  maxImagesPerMessage: 2,
  maxMessageImageBytes: 1536,
  maxImagePixels: 1_000_000,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
}
const id = `sha256:${'a'.repeat(64)}`
const ref = {
  attachmentId: id as never,
  mediaType: 'image/png' as const,
  bytes: 8,
  width: 1,
  height: 1,
  name: 'screen.png',
}
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')

describe('vision media admission', () => {
  it('accepts canonical base64 with matching MIME and strips local paths', () => {
    const parsed = parseImageUpload({
      sessionId: 'session-one',
      images: [{ data: png, mediaType: 'image/png', name: String.raw`C:\private\screen.png` }],
    }, limits)
    expect(parsed.sessionId).toBe('session-one')
    expect(parsed.images).toEqual([{
      data: Buffer.from(png, 'base64'),
      mediaType: 'image/png',
      name: 'screen.png',
    }])
  })

  it('rejects noncanonical data, MIME spoofing, and unexpected fields', () => {
    expect(() => parseImageUpload({
      sessionId: 'session-one',
      images: [{ data: `${png}\n`, mediaType: 'image/png' }],
    }, limits)).toThrow(/canonical base64/)
    expect(() => parseImageUpload({
      sessionId: 'session-one',
      images: [{ data: png, mediaType: 'image/jpeg' }],
    }, limits)).toThrow(/does not match/)
    expect(() => parseImageUpload({
      sessionId: 'session-one',
      images: [{ data: png, mediaType: 'image/png', path: 'secret' }],
    }, limits)).toThrow(/invalid image entry/)
  })
})

describe('durable image attachment notes', () => {
  it('round-trips strict full refs and ignores malformed notes', () => {
    const note = imageAttachmentNote(ref)
    expect(imageAttachmentNotes(`before\n${note}\nafter`)).toEqual([ref])
    expect(imageAttachmentNotes('[image attachment {"attachmentId":"sha256:nope"}]')).toEqual([])
    expect(parseImageAttachmentRef({ ...ref, extra: true })).toBeUndefined()
  })
})
