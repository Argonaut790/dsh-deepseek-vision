import { describe, expect, it } from 'vitest'
import {
  allDelegatedImages,
  latestDelegatedImages,
  normalizeImageSelection,
  normalizeQuestions,
  parseVisionEvidence,
  parseVisionReadbackOutput,
  presentVisionEvidence,
  renderVisionReadback,
  selectDelegatedImages,
} from '../src/readback.ts'

function image(attachmentId: string) {
  return {
    attachmentId,
    mediaType: 'image/png' as const,
    bytes: 100,
    width: 10,
    height: 10,
  }
}

const ids = {
  old: `sha256:${'0'.repeat(64)}`,
  newOne: `sha256:${'1'.repeat(64)}`,
  newTwo: `sha256:${'2'.repeat(64)}`,
  one: `sha256:${'3'.repeat(64)}`,
  two: `sha256:${'4'.repeat(64)}`,
}

describe('see_image tool contract', () => {
  it('uses delegated images from the newest matching event', () => {
    expect(latestDelegatedImages([
      {
        type: 'user/message',
        data: {
          content: [{ type: 'delegated-image', attachment: image(ids.old) }],
        },
      },
      { data: { content: [{ type: 'text', text: 'later text' }] } },
      {
        type: 'user/message',
        data: {
          content: [
            { type: 'delegated-image', attachment: image(ids.newOne) },
            { type: 'delegated-image', attachment: image(ids.newTwo) },
          ],
        },
      },
    ])).toEqual([image(ids.newOne), image(ids.newTwo)])
  })

  it('selects latest, all unique, and explicit delegated images', () => {
    const events = [
      {
        type: 'user/message',
        data: { content: [{ type: 'delegated-image', attachment: image(ids.one) }] },
      },
      {
        type: 'user/message',
        data: {
          content: [
            { type: 'delegated-image', attachment: image(ids.one) },
            { type: 'delegated-image', attachment: image(ids.two) },
          ],
        },
      },
    ]
    expect(allDelegatedImages(events)).toEqual([image(ids.one), image(ids.two)])
    expect(selectDelegatedImages(events, { mode: 'latest' })).toEqual([image(ids.one), image(ids.two)])
    expect(selectDelegatedImages(events, { mode: 'ids', ids: [ids.two] })).toEqual([image(ids.two)])
    expect(() => selectDelegatedImages(events, { mode: 'ids', ids: ['missing'] }))
      .toThrow(/missing/)
  })

  it('accepts strict attachment notes only from user-message text', () => {
    const noted = image(`sha256:${'a'.repeat(64)}`)
    const note = `[image attachment ${JSON.stringify(noted)}]`
    expect(allDelegatedImages([
      { type: 'assistant/message', data: { content: [{ type: 'text', text: note }] } },
      { type: 'user/message', data: { content: [{ type: 'text', text: note }] } },
    ])).toEqual([noted])
    expect(allDelegatedImages([
      { type: 'assistant/message', data: { content: [{ type: 'text', text: note }] } },
    ])).toEqual([])
  })

  it('accepts validated native image blocks only from user messages', () => {
    const native = image(`sha256:${'b'.repeat(64)}`)
    expect(allDelegatedImages([
      { type: 'assistant/message', data: { content: [{ type: 'image', attachment: native }] } },
      { type: 'user/message', data: { content: [{ type: 'image', attachment: native }] } },
    ])).toEqual([native])
    expect(allDelegatedImages([
      {
        type: 'user/message',
        data: { content: [{ type: 'image', attachment: { ...native, extra: true } }] },
      },
    ])).toEqual([])
  })

  it('strictly parses analyst JSON and rejects wrapped or extra fields', () => {
    const value = {
      summary: 'screen',
      ocr: 'text',
      answers: [{ question: 'q', answer: 'a' }],
      uncertainties: [],
    }
    expect(parseVisionReadbackOutput([{ type: 'text', text: JSON.stringify(value) }])).toEqual(value)
    expect(() => parseVisionReadbackOutput([{
      type: 'text',
      text: `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``,
    }])).toThrow(/malformed JSON/)
    expect(() => parseVisionReadbackOutput([{
      type: 'text',
      text: JSON.stringify({ ...value, injected: true }),
    }])).toThrow(/invalid evidence JSON/)
  })

  it('normalizes bounded questions and unambiguous image selection', () => {
    expect(normalizeQuestions(['  What is shown?  '])).toEqual(['What is shown?'])
    expect(normalizeImageSelection(undefined, undefined)).toEqual({ mode: 'latest' })
    expect(normalizeImageSelection('ids', [' one '])).toEqual({ mode: 'ids', ids: ['one'] })
    expect(() => normalizeImageSelection('all', ['one'])).toThrow(/only be used/)
    expect(() => normalizeImageSelection('ids', ['one', 'one'])).toThrow(/duplicates/)
    expect(() => normalizeQuestions(Array.from({ length: 13 }, () => 'q'))).toThrow(/at most 12/)
  })

  it('defensively validates replayed evidence metadata', () => {
    const evidence = {
      version: 1,
      origin: 'persistent',
      analystId: 'child',
      route: { provider: 'openrouter', model: 'vision' },
      selection: 'latest',
      images: [image('one')],
      questions: ['What?'],
      summary: 'screen',
      ocr: 'text',
      answers: [{ question: 'What?', answer: 'A screen.' }],
      uncertainties: [],
    }
    expect(parseVisionEvidence(evidence)).toEqual(evidence)
    expect(presentVisionEvidence(evidence, false)).toEqual({
      card: 'generic',
      title: 'Vision evidence · 1 image',
    })
    expect(presentVisionEvidence(evidence, true)).toBeUndefined()
    expect(parseVisionEvidence({ ...evidence, extra: true })).toBeUndefined()
  })

  it('renders a stable parent readback', () => {
    expect(renderVisionReadback({
      summary: 'A settings screen.',
      ocr: 'Vision: Grok 4.6',
      answers: [{ question: 'Which model?', answer: 'Grok 4.6.' }],
      uncertainties: [],
    })).toBe(
      'Visual summary:\nA settings screen.\n\n'
      + 'Full-screen OCR:\nVision: Grok 4.6\n\n'
      + 'Answers:\n1. Which model?\nGrok 4.6.\n\n'
      + 'Uncertainties:\n(none reported)',
    )
  })
})
