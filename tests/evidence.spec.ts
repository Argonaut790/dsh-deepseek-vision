import { describe, expect, it } from 'vitest'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ConversationNode, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import {
  evidenceFromResult, evidenceMeta, foldEvidenceNodes,
} from '../src/client/evidence.ts'

const image = {
  attachmentId: 'image-1',
  mediaType: 'image/png',
  bytes: 32,
  width: 80,
  height: 60,
  name: 'screen.png',
} as ImageAttachmentRef

const meta = {
  version: 1,
  selection: 'latest',
  summary: 'A settings screen.',
  ocr: 'Settings',
  questions: ['What is shown?'],
  answers: [{ question: 'What is shown?', answer: 'A settings screen.' }],
  uncertainties: ['The footer is blurred.'],
  images: [image],
  route: { provider: 'openrouter', model: 'vision-model' },
  origin: 'persistent',
}

function result(overrides: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result',
    seq: 4,
    time: 100,
    callId: 'call-1',
    call: { name: 'see_image', argsRaw: '{"questions":["What is shown?"]}' },
    callTime: 90,
    content: [{ type: 'text', text: 'Visual summary: A settings screen.' }],
    isError: false,
    meta,
    callView: null,
    resultView: null,
    subCalls: [],
    ...overrides,
  }
}

describe('Evidence metadata fold', () => {
  it('validates direct and namespaced presentation metadata', () => {
    expect(evidenceMeta(meta)).toMatchObject({
      summary: 'A settings screen.',
      images: [{ attachmentId: 'image-1' }],
      route: { provider: 'openrouter', model: 'vision-model' },
    })
    expect(evidenceMeta({ evidence: meta })).toEqual(evidenceMeta(meta))
    expect(evidenceMeta({ ...meta, images: [{ ...image, width: 0 }] })).toBeUndefined()
  })

  it('folds successful see_image calls and preserves conversation identity', () => {
    expect(evidenceFromResult(result())).toMatchObject({
      callId: 'call-1',
      seq: 4,
      time: 100,
      summary: 'A settings screen.',
    })
    expect(evidenceFromResult(result({ isError: true }))).toBeUndefined()
    expect(evidenceFromResult(result({
      call: { name: 'other_tool', argsRaw: '{}' },
      meta: { ...meta, version: 2 },
    }))).toBeUndefined()
  })

  it('walks nested Tool calls and orders evidence by result sequence', () => {
    const nested = result({ seq: 2, callId: 'nested' })
    const root = result({
      seq: 5,
      callId: 'root',
      call: { name: 'other_tool', argsRaw: '{}' },
      meta: undefined,
      subCalls: [nested],
    })
    const earlier = result({ seq: 1, callId: 'earlier' })
    const nodes = [root, earlier] as ConversationNode[]

    expect(foldEvidenceNodes(nodes).map(item => item.callId)).toEqual(['earlier', 'nested'])
  })
})
