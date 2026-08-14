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

describe('see_image tool contract', () => {
  it('uses delegated images from the newest matching event', () => {
    expect(latestDelegatedImages([
      {
        data: {
          content: [{ type: 'delegated-image', attachment: image('old') }],
        },
      },
      { data: { content: [{ type: 'text', text: 'later text' }] } },
      {
        data: {
          content: [
            { type: 'delegated-image', attachment: image('new-one') },
            { type: 'delegated-image', attachment: image('new-two') },
          ],
        },
      },
    ])).toEqual([image('new-one'), image('new-two')])
  })

  it('selects latest, all unique, and explicit delegated images', () => {
    const events = [
      { data: { content: [{ type: 'delegated-image', attachment: image('one') }] } },
      {
        data: {
          content: [
            { type: 'delegated-image', attachment: image('one') },
            { type: 'delegated-image', attachment: image('two') },
          ],
        },
      },
    ]
    expect(allDelegatedImages(events)).toEqual([image('one'), image('two')])
    expect(selectDelegatedImages(events, { mode: 'latest' })).toEqual([image('one'), image('two')])
    expect(selectDelegatedImages(events, { mode: 'ids', ids: ['two'] })).toEqual([image('two')])
    expect(() => selectDelegatedImages(events, { mode: 'ids', ids: ['missing'] }))
      .toThrow(/missing/)
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
