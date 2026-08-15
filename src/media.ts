import type {
  ImageAttachmentLimits,
  ImageAttachmentRef,
  ImageMediaType,
  SaveImageAttachment,
} from '@deepseek-ai/dsh-attachment'

const MEDIA_TYPES = new Set<ImageMediaType>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])
const ATTACHMENT_ID = /^sha256:[0-9a-f]{64}$/i
const NOTE_PREFIX = '[image attachment '
const NOTE_SUFFIX = ']'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => allowed.has(key))
}

function decodeBase64(value: unknown, maxBytes: number): Uint8Array {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('image data must be canonical base64')
  }
  if (value.length > Math.ceil(maxBytes / 3) * 4 + 4) throw new Error('image exceeds the byte limit')
  const data = Buffer.from(value, 'base64')
  if (data.length === 0 || data.length > maxBytes || data.toString('base64') !== value) {
    throw new Error('image data is invalid or exceeds the byte limit')
  }
  return data
}

function detectedMediaType(data: Uint8Array): ImageMediaType | undefined {
  if (data.length >= 8
    && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 6) {
    const signature = Buffer.from(data.subarray(0, 6)).toString('ascii')
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif'
  }
  if (data.length >= 12
    && Buffer.from(data.subarray(0, 4)).toString('ascii') === 'RIFF'
    && Buffer.from(data.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp'
  return undefined
}

function cleanName(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) {
    throw new Error('image name must be 1-255 characters')
  }
  const name = value.split(/[\\/]/).at(-1)?.replace(/[\u0000-\u001f\u007f[\]]/g, '_').trim()
  if (name === undefined || name.length === 0) throw new Error('image name is invalid')
  return name
}

export interface ParsedImageUpload {
  sessionId: string
  images: SaveImageAttachment[]
}

/** Parse and fast-path validate one browser upload batch before storage admission. */
export function parseImageUpload(value: unknown, limits: ImageAttachmentLimits): ParsedImageUpload {
  if (!isRecord(value) || !exactKeys(value, ['sessionId', 'images'], [])) {
    throw new Error('invalid image upload')
  }
  if (typeof value.sessionId !== 'string' || value.sessionId.length === 0 || value.sessionId.length > 256) {
    throw new Error('invalid session id')
  }
  if (!Array.isArray(value.images) || value.images.length === 0
    || value.images.length > limits.maxImagesPerMessage) {
    throw new Error(`image count must be between 1 and ${String(limits.maxImagesPerMessage)}`)
  }
  let total = 0
  const images = value.images.map((candidate) => {
    if (!isRecord(candidate) || !exactKeys(candidate, ['data', 'mediaType'], ['name'])) {
      throw new Error('invalid image entry')
    }
    if (typeof candidate.mediaType !== 'string' || !MEDIA_TYPES.has(candidate.mediaType as ImageMediaType)
      || !limits.mediaTypes.includes(candidate.mediaType as ImageMediaType)) {
      throw new Error('unsupported image media type')
    }
    const data = decodeBase64(candidate.data, limits.maxImageBytes)
    total += data.length
    if (total > limits.maxMessageImageBytes) throw new Error('images exceed the message byte limit')
    const mediaType = candidate.mediaType as ImageMediaType
    if (detectedMediaType(data) !== mediaType) throw new Error('image media type does not match its bytes')
    const name = cleanName(candidate.name)
    return { data, mediaType, ...(name === undefined ? {} : { name }) }
  })
  return { sessionId: value.sessionId, images }
}

/** Validate a durable ref before accepting it from replayed user text. */
export function parseImageAttachmentRef(value: unknown): ImageAttachmentRef | undefined {
  if (!isRecord(value)
    || !exactKeys(value, ['attachmentId', 'mediaType', 'bytes', 'width', 'height'], ['name'])
    || typeof value.attachmentId !== 'string' || !ATTACHMENT_ID.test(value.attachmentId)
    || typeof value.mediaType !== 'string' || !MEDIA_TYPES.has(value.mediaType as ImageMediaType)
    || !Number.isSafeInteger(value.bytes) || (value.bytes as number) <= 0
    || !Number.isSafeInteger(value.width) || (value.width as number) <= 0
    || !Number.isSafeInteger(value.height) || (value.height as number) <= 0
    || (value.name !== undefined && (typeof value.name !== 'string' || value.name.length === 0 || value.name.length > 255))) {
    return undefined
  }
  return value as unknown as ImageAttachmentRef
}

/** Serialize the exact durable reference carried in a user-message text block. */
export function imageAttachmentNote(ref: ImageAttachmentRef): string {
  return `${NOTE_PREFIX}${JSON.stringify(ref)}${NOTE_SUFFIX}`
}

/** Collect strict attachment notes from one user-authored text block. */
export function imageAttachmentNotes(text: string): ImageAttachmentRef[] {
  const refs: ImageAttachmentRef[] = []
  let cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf(NOTE_PREFIX, cursor)
    if (start < 0) break
    const end = text.indexOf(NOTE_SUFFIX, start + NOTE_PREFIX.length)
    if (end < 0) break
    try {
      const ref = parseImageAttachmentRef(JSON.parse(text.slice(start + NOTE_PREFIX.length, end)))
      if (ref !== undefined) refs.push(ref)
    } catch {
      // Invalid user text is ignored; it never becomes an attachment capability.
    }
    cursor = end + NOTE_SUFFIX.length
  }
  return refs
}
