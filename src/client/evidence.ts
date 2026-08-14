import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type {
  ConversationNode, ConversationSnapshot, ToolCallBlock, ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/client'

/** Structured, replay-safe payload persisted as a `see_image` result's metadata. */
export interface SeeImageEvidenceMeta {
  version: 1
  selection: 'latest' | 'all' | 'ids'
  analystId?: string
  summary: string
  ocr: string
  questions: readonly string[]
  answers: ReadonlyArray<{ question: string; answer: string }>
  uncertainties: readonly string[]
  images: readonly ImageAttachmentRef[]
  route: { provider: string; model: string }
  origin: string
}

/** One evidence record folded from a settled conversation Tool node. */
export interface SeeImageEvidence extends SeeImageEvidenceMeta {
  callId: string
  seq: number
  time: number
}

const IMAGE_MEDIA_TYPES = new Set<ImageMediaType>([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isAnswer(value: unknown): value is { question: string; answer: string } {
  return isRecord(value)
    && typeof value.question === 'string'
    && typeof value.answer === 'string'
}

function isImage(value: unknown): value is ImageAttachmentRef {
  if (!isRecord(value)) return false
  return typeof value.attachmentId === 'string'
    && IMAGE_MEDIA_TYPES.has(value.mediaType as ImageMediaType)
    && typeof value.bytes === 'number' && Number.isSafeInteger(value.bytes) && value.bytes >= 0
    && typeof value.width === 'number' && Number.isSafeInteger(value.width) && value.width > 0
    && typeof value.height === 'number' && Number.isSafeInteger(value.height) && value.height > 0
    && (value.name === undefined || typeof value.name === 'string')
}

/**
 * Narrow opaque Tool result metadata to the stable evidence contract.
 * Both the direct payload and an `{ evidence }` envelope are accepted so a
 * Host may namespace presentation metadata without changing the client fold.
 */
export function evidenceMeta(value: unknown): SeeImageEvidenceMeta | undefined {
  if (!isRecord(value)) return undefined
  const candidate = isRecord(value.evidence) ? value.evidence : value
  const {
    version, selection, analystId,
    summary, ocr, questions, answers, uncertainties, images, route, origin,
  } = candidate
  if (version !== 1 || (selection !== 'latest' && selection !== 'all' && selection !== 'ids')) {
    return undefined
  }
  if (analystId !== undefined && typeof analystId !== 'string') return undefined
  if (typeof summary !== 'string' || typeof ocr !== 'string') return undefined
  if (!isStringArray(questions) || !Array.isArray(answers) || !answers.every(isAnswer)) return undefined
  if (!isStringArray(uncertainties) || !Array.isArray(images) || !images.every(isImage)) return undefined
  if (!isRecord(route) || typeof route.provider !== 'string' || typeof route.model !== 'string') {
    return undefined
  }
  if (typeof origin !== 'string') return undefined
  return {
    version,
    selection,
    ...(analystId === undefined ? {} : { analystId }),
    summary,
    ocr,
    questions,
    answers,
    uncertainties,
    images,
    route: { provider: route.provider, model: route.model },
    origin,
  }
}

/** Parse a settled `see_image` node, ignoring errors and malformed metadata. */
export function evidenceFromResult(node: ToolResultNode): SeeImageEvidence | undefined {
  const meta = evidenceMeta(node.meta)
  const tagged = node.call?.name === 'see_image'
    || (isRecord(node.meta) && (node.meta.kind === 'see-image-evidence'
      || node.meta.version === 1
      || (isRecord(node.meta.evidence) && (node.meta.evidence.kind === 'see-image-evidence'
        || node.meta.evidence.version === 1))))
  if (!tagged || node.isError || meta === undefined) return undefined
  return { ...meta, callId: node.callId, seq: node.seq, time: node.time }
}

function appendBlock(block: ToolCallBlock, records: SeeImageEvidence[]): void {
  if ('kind' in block) {
    const evidence = evidenceFromResult(block)
    if (evidence !== undefined) records.push(evidence)
  }
  for (const child of block.subCalls) appendBlock(child, records)
}

/** Fold all loaded `see_image` evidence, including recursively nested calls. */
export function foldEvidenceNodes(nodes: ConversationSnapshot['nodes']): SeeImageEvidence[] {
  const records: SeeImageEvidence[] = []
  for (const node of nodes as readonly ConversationNode[]) {
    if (node.kind === 'tool-result') appendBlock(node, records)
  }
  records.sort((left, right) => left.seq - right.seq)
  return records
}
