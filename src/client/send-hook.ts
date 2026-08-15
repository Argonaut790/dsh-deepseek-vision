import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { VISION_MEDIA_ATTACH_PATH, visionMediaRawPath } from '../shared.ts'

interface DraftImageFace {
  readonly id: string
  readonly file: File
}

interface PromptResult {
  ok: boolean
  error?: { code: string; message?: string }
}

interface SessionPromptFace {
  readonly sessionId: string
  prompt(content: Array<{ type: 'text'; text: string }>, mode: string): Promise<PromptResult>
}

interface ConversationSendFace {
  sendSession(session: SessionPromptFace, text: string, imageIds: readonly string[], mode: string): Promise<void>
  draftImages(ids: readonly string[]): readonly DraftImageFace[]
  releaseDraftImage(id: string): void
}

const HOOK_MARKER = '__dshDeepseekVisionSendHook'

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`could not read ${file.name || 'image'}`))
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      const comma = value.indexOf(',')
      if (comma < 0) reject(new Error(`could not read ${file.name || 'image'}`))
      else resolve(value.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

function isAttachmentRef(value: unknown): value is ImageAttachmentRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const ref = value as Partial<Record<keyof ImageAttachmentRef, unknown>>
  return typeof ref.attachmentId === 'string' && /^sha256:[0-9a-f]{64}$/i.test(ref.attachmentId)
    && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(ref.mediaType))
    && Number.isSafeInteger(ref.bytes) && Number(ref.bytes) > 0
    && Number.isSafeInteger(ref.width) && Number(ref.width) > 0
    && Number.isSafeInteger(ref.height) && Number(ref.height) > 0
    && (ref.name === undefined || typeof ref.name === 'string')
}

function canonicalAttachmentRef(ref: ImageAttachmentRef): ImageAttachmentRef {
  return {
    attachmentId: ref.attachmentId,
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
    ...(ref.name === undefined ? {} : { name: ref.name }),
  }
}

async function uploadImages(sessionId: string, images: readonly DraftImageFace[]): Promise<ImageAttachmentRef[]> {
  const body = {
    sessionId,
    images: await Promise.all(images.map(async ({ file }) => ({
      data: await readFileAsBase64(file),
      mediaType: file.type,
      ...(file.name === '' ? {} : { name: file.name }),
    }))),
  }
  let response: Response
  try {
    response = await fetch(VISION_MEDIA_ATTACH_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Image upload failed: Harness is unreachable')
  }
  let envelope: unknown
  try {
    envelope = await response.json()
  } catch {
    throw new Error('Image upload failed: Harness returned an invalid response')
  }
  if (!response.ok) {
    const message = typeof envelope === 'object' && envelope !== null
      && typeof (envelope as { error?: unknown }).error === 'string'
      ? (envelope as { error: string }).error
      : `HTTP ${String(response.status)}`
    throw new Error(`Image upload failed: ${message}`)
  }
  const attachments = typeof envelope === 'object' && envelope !== null
    ? (envelope as { attachments?: unknown }).attachments
    : undefined
  if (!Array.isArray(attachments) || attachments.length !== images.length || !attachments.every(isAttachmentRef)) {
    throw new Error('Image upload failed: Harness returned invalid attachment references')
  }
  return attachments.map(canonicalAttachmentRef)
}

function imageText(sessionId: string, ref: ImageAttachmentRef): string {
  const name = (ref.name ?? 'image').replace(/[\[\]]/g, '_')
  const rawUrl = new URL(visionMediaRawPath(sessionId, String(ref.attachmentId)), window.location.origin)
  const markdown = `![${name}](${rawUrl.href})`
  return `${markdown}\n[image attachment ${JSON.stringify(ref)}]`
}

/**
 * Rewrite image-bearing composer submissions into one text-only prompt whose
 * full durable refs can be replayed by `see_image`.
 */
export function installVisionSendHook(conversation: unknown): () => void {
  const face = conversation as ConversationSendFace
  if (face === null || typeof face !== 'object'
    || typeof face.sendSession !== 'function'
    || typeof face.draftImages !== 'function'
    || typeof face.releaseDraftImage !== 'function') return () => undefined
  const record = face as unknown as Record<string, unknown>
  if (record[HOOK_MARKER] === true) return () => undefined

  const original = face.sendSession
  const wrapped: ConversationSendFace['sendSession'] = async (session, text, imageIds, mode) => {
    if (imageIds.length === 0) return original.call(face, session, text, imageIds, mode)
    const drafts = face.draftImages(imageIds)
    if (drafts.length !== imageIds.length) {
      throw new Error('Image upload failed: one or more draft images are no longer available')
    }
    const refs = await uploadImages(session.sessionId, drafts)
    const fullText = [text.trim(), ...refs.map(ref => imageText(session.sessionId, ref))]
      .filter(value => value.length > 0)
      .join('\n\n')
    const result = await session.prompt([{ type: 'text', text: fullText }], mode)
    if (!result.ok) {
      throw new Error(`conversation.send failed: ${result.error?.code ?? 'unknown'}: ${result.error?.message ?? ''}`)
    }
    for (const id of imageIds) face.releaseDraftImage(id)
  }
  face.sendSession = wrapped
  record[HOOK_MARKER] = true
  return () => {
    if (face.sendSession === wrapped) {
      face.sendSession = original
      delete record[HOOK_MARKER]
    }
  }
}
