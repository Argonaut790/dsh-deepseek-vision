import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { imageAttachmentNotes, parseImageAttachmentRef } from './media.ts'
import {
  MAX_SEE_IMAGE_QUESTION_CHARS,
  MAX_SEE_IMAGE_QUESTIONS,
  MAX_SEE_IMAGE_TOTAL_QUESTION_CHARS,
  VISION_EVIDENCE_VERSION,
  type SeeImageSelection,
  type VisionEvidence,
} from './shared.ts'

/** Structured response returned by the isolated vision child. */
export interface VisionReadback {
  summary: string
  ocr: string
  answers: Array<{
    question: string
    answer: string
  }>
  uncertainties: string[]
}

/** Strict child response contract used on both structured and text JSON paths. */
export const VISION_OUTPUT_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    ocr: { type: 'string' },
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['question', 'answer'],
      },
    },
    uncertainties: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'ocr', 'answers', 'uncertainties'],
}

/** Strict canonical evidence contract persisted as tool presentation metadata. */
export const VISION_EVIDENCE_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    version: { type: 'number', const: VISION_EVIDENCE_VERSION },
    origin: { type: 'string', enum: ['persistent', 'one-shot'] },
    analystId: { type: 'string' },
    route: {
      type: 'object',
      additionalProperties: false,
      properties: {
        provider: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['provider', 'model'],
    },
    selection: { type: 'string', enum: ['latest', 'all', 'ids'] },
    images: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          attachmentId: { type: 'string' },
          mediaType: {
            type: 'string',
            enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
          },
          bytes: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          name: { type: 'string' },
        },
        required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
      },
    },
    questions: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    ocr: { type: 'string' },
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['question', 'answer'],
      },
    },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'version',
    'origin',
    'route',
    'selection',
    'images',
    'questions',
    'summary',
    'ocr',
    'answers',
    'uncertainties',
  ],
}

/** Extract content arrays from every durable event representation that can carry them. */
function eventContents(event: unknown): unknown[] {
  if (typeof event !== 'object' || event === null || Array.isArray(event)) return []
  const data = (event as { data?: unknown }).data
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return []
  const record = data as {
    content?: unknown
    message?: { content?: unknown }
    inserted?: Array<{ content?: unknown }>
    chunk?: { type?: unknown; block?: unknown }
  }
  const contents: unknown[] = []
  if (record.content !== undefined) contents.push(record.content)
  if (record.message?.content !== undefined) contents.push(record.message.content)
  if (Array.isArray(record.inserted)) {
    for (const message of record.inserted) contents.push(message.content)
  }
  if (record.chunk?.type === 'block-end') contents.push([record.chunk.block])
  return contents
}

function isUserMessageEvent(event: unknown): boolean {
  return typeof event === 'object' && event !== null && !Array.isArray(event)
    && (event as { type?: unknown }).type === 'user/message'
}

/** Collect validated image refs from one user-message content array. */
function collectUserImages(content: unknown, refs: ImageAttachmentRef[]): void {
  if (!Array.isArray(content)) return
  for (const value of content) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const block = value as { type?: unknown; attachment?: unknown; content?: unknown; text?: unknown }
    if ((block.type === 'image' || block.type === 'delegated-image')
      && typeof block.attachment === 'object' && block.attachment !== null) {
      const ref = parseImageAttachmentRef(block.attachment)
      if (ref !== undefined) refs.push(ref)
    }
    if (block.type === 'text' && typeof block.text === 'string') {
      refs.push(...imageAttachmentNotes(block.text))
    }
  }
}

function userImagesInEvent(event: unknown): ImageAttachmentRef[] {
  if (!isUserMessageEvent(event)) return []
  const refs: ImageAttachmentRef[] = []
  for (const content of eventContents(event)) collectUserImages(content, refs)
  return refs
}

/** Stable identity of one delegated attachment. */
function imageId(ref: ImageAttachmentRef): string | undefined {
  const id = (ref as { attachmentId?: unknown }).attachmentId
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

/**
 * Find delegated image references in the latest parent event that has any.
 * @param events - parent-session events in ascending sequence order.
 * @returns delegated image references from the newest matching event.
 */
export function latestDelegatedImages(events: readonly unknown[]): ImageAttachmentRef[] {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    const refs = userImagesInEvent(event)
    if (refs.length > 0) return refs
  }
  return []
}

/**
 * Build the conversation's user-authorized image catalog in first-seen order.
 * Repeated references to the same immutable attachment are represented once.
 */
export function authorizedUserImages(events: readonly unknown[]): ImageAttachmentRef[] {
  const refs: ImageAttachmentRef[] = []
  const seen = new Set<string>()
  for (const event of events) {
    const eventRefs = userImagesInEvent(event)
    for (const ref of eventRefs) {
      const id = imageId(ref)
      if (id === undefined || seen.has(id)) continue
      seen.add(id)
      refs.push(ref)
    }
  }
  return refs
}

/** Backward-compatible name for the user-authorized conversation image catalog. */
export function allDelegatedImages(events: readonly unknown[]): ImageAttachmentRef[] {
  return authorizedUserImages(events)
}

/** Explicit image-selection request after tool-argument normalization. */
export interface DelegatedImageSelection {
  mode: SeeImageSelection
  ids?: readonly string[]
}

/**
 * Select delegated images from the parent conversation.
 * @throws when explicit ids are missing from the conversation catalog.
 */
export function selectDelegatedImages(
  events: readonly unknown[],
  selection: DelegatedImageSelection,
): ImageAttachmentRef[] {
  if (selection.mode === 'latest') return latestDelegatedImages(events)
  const catalog = allDelegatedImages(events)
  if (selection.mode === 'all') return catalog
  const ids = selection.ids ?? []
  const byId = new Map(catalog.flatMap(ref => {
    const id = imageId(ref)
    return id === undefined ? [] : [[id, ref] as const]
  }))
  const missing = ids.filter(id => !byId.has(id))
  if (missing.length > 0) {
    throw new Error(`see_image could not find delegated image id(s): ${missing.join(', ')}`)
  }
  return ids.map(id => byId.get(id) as ImageAttachmentRef)
}

/** Collect image attachment ids already present in a child session log. */
export function imageIdsInEvents(events: readonly unknown[]): Set<string> {
  const ids = new Set<string>()
  for (const event of events) {
    for (const content of eventContents(event)) {
      if (!Array.isArray(content)) continue
      for (const value of content) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
        const block = value as { type?: unknown; attachment?: unknown }
        if (block.type !== 'image'
          || typeof block.attachment !== 'object'
          || block.attachment === null) continue
        const id = imageId(block.attachment as ImageAttachmentRef)
        if (id !== undefined) ids.add(id)
      }
    }
  }
  return ids
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value)
  return required.every(key => key in value)
    && keys.every(key => required.includes(key) || optional.includes(key))
}

function isAnswer(value: unknown): value is VisionReadback['answers'][number] {
  return isRecord(value)
    && hasExactKeys(value, ['question', 'answer'])
    && typeof value.question === 'string'
    && typeof value.answer === 'string'
}

/** Validate and normalize caller questions before model or persistence work. */
export function normalizeQuestions(questions: readonly string[]): string[] {
  if (questions.length === 0) {
    throw new Error('see_image questions must contain at least one non-empty string')
  }
  if (questions.length > MAX_SEE_IMAGE_QUESTIONS) {
    throw new Error(`see_image accepts at most ${MAX_SEE_IMAGE_QUESTIONS} questions per call`)
  }
  const normalized = questions.map(question => question.trim())
  if (normalized.some(question => question.length === 0)) {
    throw new Error('see_image questions must contain at least one non-empty string')
  }
  if (normalized.some(question => question.length > MAX_SEE_IMAGE_QUESTION_CHARS)) {
    throw new Error(
      `see_image questions may not exceed ${MAX_SEE_IMAGE_QUESTION_CHARS} characters each`,
    )
  }
  if (normalized.reduce((total, question) => total + question.length, 0)
    > MAX_SEE_IMAGE_TOTAL_QUESTION_CHARS) {
    throw new Error(
      `see_image questions may not exceed ${MAX_SEE_IMAGE_TOTAL_QUESTION_CHARS} total characters`,
    )
  }
  return normalized
}

/** Normalize latest/all/ids arguments and reject ambiguous explicit lists. */
export function normalizeImageSelection(
  selection: SeeImageSelection | undefined,
  imageIds: readonly string[] | undefined,
): { mode: SeeImageSelection; ids?: string[] } {
  const mode = selection ?? 'latest'
  const ids = imageIds?.map(id => id.trim()) ?? []
  if (mode !== 'ids' && ids.length > 0) {
    throw new Error('see_image image_ids may only be used with selection "ids"')
  }
  if (mode === 'ids') {
    if (ids.length === 0 || ids.some(id => id.length === 0)) {
      throw new Error('see_image selection "ids" requires non-empty image_ids')
    }
    if (new Set(ids).size !== ids.length) {
      throw new Error('see_image image_ids must not contain duplicates')
    }
    return { mode, ids }
  }
  return { mode }
}

/** Validate a decoded child value and return its typed detached view. */
export function parseVisionReadbackValue(value: unknown): VisionReadback {
  if (!isRecord(value)
    || !hasExactKeys(value, ['summary', 'ocr', 'answers', 'uncertainties'])
    || typeof value.summary !== 'string'
    || typeof value.ocr !== 'string'
    || !Array.isArray(value.answers)
    || !value.answers.every(isAnswer)
    || !Array.isArray(value.uncertainties)
    || !value.uncertainties.every(item => typeof item === 'string')) {
    throw new Error('vision analyst returned invalid evidence JSON')
  }
  return value as unknown as VisionReadback
}

/**
 * Strictly parse a continuable analyst's final output. Markdown fences,
 * prose, and non-text blocks are rejected rather than heuristically stripped.
 */
export function parseVisionReadbackOutput(output: readonly ContentBlock[]): VisionReadback {
  if (output.length === 0 || output.some(block => block.type !== 'text')) {
    throw new Error('vision analyst must return exactly JSON text with no non-text blocks')
  }
  const text = output.map(block => (block as Extract<ContentBlock, { type: 'text' }>).text).join('')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error: unknown) {
    throw new Error(`vision analyst returned malformed JSON: ${String(error)}`)
  }
  return parseVisionReadbackValue(value)
}

/** Defensively narrow live or replayed presentation metadata. */
export function parseVisionEvidence(value: unknown): VisionEvidence | undefined {
  if (!isRecord(value)
    || !hasExactKeys(value, [
      'version',
      'origin',
      'route',
      'selection',
      'images',
      'questions',
      'summary',
      'ocr',
      'answers',
      'uncertainties',
    ], ['analystId'])
    || value.version !== VISION_EVIDENCE_VERSION
    || (value.origin !== 'persistent' && value.origin !== 'one-shot')
    || ('analystId' in value && typeof value.analystId !== 'string')
    || !isRecord(value.route)
    || !hasExactKeys(value.route, ['provider', 'model'])
    || typeof value.route.provider !== 'string'
    || typeof value.route.model !== 'string'
    || !['latest', 'all', 'ids'].includes(String(value.selection))
    || !Array.isArray(value.images)
    || !value.images.every((image) => {
      if (!isRecord(image)
        || !hasExactKeys(
          image,
          ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
          ['name'],
        )) return false
      return typeof image.attachmentId === 'string'
        && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(image.mediaType))
        && typeof image.bytes === 'number'
        && Number.isSafeInteger(image.bytes)
        && image.bytes >= 0
        && typeof image.width === 'number'
        && Number.isSafeInteger(image.width)
        && image.width > 0
        && typeof image.height === 'number'
        && Number.isSafeInteger(image.height)
        && image.height > 0
        && (image.name === undefined || typeof image.name === 'string')
    })
    || !Array.isArray(value.questions)
    || !value.questions.every(question => typeof question === 'string')
    || typeof value.summary !== 'string'
    || typeof value.ocr !== 'string'
    || !Array.isArray(value.answers)
    || !value.answers.every(isAnswer)
    || !Array.isArray(value.uncertainties)
    || !value.uncertainties.every(item => typeof item === 'string')) return undefined
  if ((value.origin === 'persistent' && typeof value.analystId !== 'string')
    || (value.origin === 'one-shot' && 'analystId' in value)) return undefined
  return value as unknown as VisionEvidence
}

/** Pure replay-safe completed-call presentation derived from durable metadata. */
export function presentVisionEvidence(
  meta: unknown,
  isError: boolean,
): { card: 'generic'; title: string } | undefined {
  if (isError) return undefined
  const evidence = parseVisionEvidence(meta)
  if (evidence === undefined) return undefined
  return {
    card: 'generic',
    title: `Vision evidence · ${evidence.images.length} image${evidence.images.length === 1 ? '' : 's'}`,
  }
}

/**
 * Render a schema-validated vision readback.
 * @param readback - structured child response.
 * @returns stable parent-facing text.
 */
export function renderVisionReadback(readback: VisionReadback): string {
  const answers = readback.answers.length === 0
    ? '(no caller questions)'
    : readback.answers
      .map((item, index) => `${index + 1}. ${item.question}\n${item.answer}`)
      .join('\n\n')
  const uncertainties = readback.uncertainties.length === 0
    ? '(none reported)'
    : readback.uncertainties.map(item => `- ${item}`).join('\n')
  return `Visual summary:\n${readback.summary}\n\nFull-screen OCR:\n${readback.ocr}\n\nAnswers:\n${answers}\n\nUncertainties:\n${uncertainties}`
}

/** Render canonical evidence into concise model-facing text. */
export function renderVisionEvidence(evidence: VisionEvidence): string {
  const imageIds = evidence.images.map(image => image.attachmentId).join(', ')
  return `Vision evidence (${evidence.images.length} image${evidence.images.length === 1 ? '' : 's'}: ${imageIds})\n\n`
    + renderVisionReadback(evidence)
}
