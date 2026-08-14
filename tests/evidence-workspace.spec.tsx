// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import {
  EvidenceView, SeeImageEvidenceCard,
} from '../src/client/EvidenceWorkspace.tsx'
import { en } from '../src/client/locales.ts'

const t: ComponentProps<typeof SeeImageEvidenceCard>['t'] = (key, params) => {
  const template = (en as Record<string, string>)[key] ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match)
}

const attachment = {
  attachmentId: 'image-1',
  mediaType: 'image/png',
  bytes: 12,
  width: 100,
  height: 50,
  name: 'screen.png',
} as ImageAttachmentRef

function block(): ToolResultNode {
  return {
    kind: 'tool-result',
    seq: 2,
    time: 20,
    callId: 'vision-call',
    call: { name: 'see_image', argsRaw: '{}' },
    callTime: 10,
    content: [{ type: 'text', text: 'readback' }],
    isError: false,
    meta: {
      version: 1,
      selection: 'latest',
      summary: 'A settings screen.',
      ocr: 'Settings\nPrivacy',
      questions: ['What is shown?'],
      answers: [{ question: 'What is shown?', answer: 'A settings screen.' }],
      uncertainties: ['Small footer text is unclear.'],
      images: [attachment],
      route: { provider: 'openrouter', model: 'vision-model' },
      origin: 'persistent',
    },
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

afterEach(cleanup)

describe('Evidence workspace UI', () => {
  it('renders an accessible see_image card with authorized thumbnails and collapsed OCR', async () => {
    const loadImage = vi.fn(async () => 'blob:authorized-image')
    render(<SeeImageEvidenceCard {...({
      block: block(),
      loadImage,
      t,
    } as ComponentProps<typeof SeeImageEvidenceCard>)} />)

    expect(screen.getByRole('article', { name: 'Image evidence' })).toBeTruthy()
    expect(screen.getByText('What is shown?')).toBeTruthy()
    expect(screen.getAllByText('A settings screen.')).toHaveLength(2)
    expect(screen.getByText('Small footer text is unclear.')).toBeTruthy()
    expect(screen.getByText('openrouter / vision-model')).toBeTruthy()
    const ocrSummary = screen.getByText('Full OCR (16 characters)')
    expect((ocrSummary.parentElement as HTMLDetailsElement).open).toBe(false)

    await waitFor(() => {
      const image = screen.getByRole('img', { name: 'Image 1: screen.png' }) as HTMLImageElement
      expect(image.src).toBe('blob:authorized-image')
    })
    expect(loadImage).toHaveBeenCalledWith(attachment)
  })

  it('renders running and malformed calls without exposing generic JSON', () => {
    const base = {
      loadImage: vi.fn(),
      t,
    }
    const { rerender } = render(<SeeImageEvidenceCard {...({
      ...base,
      block: {
        callId: 'running',
        name: 'see_image',
        argsRaw: '{}',
        turn: 1,
        step: 1,
        time: 10,
        callView: null,
        subCalls: [],
      },
    } as ComponentProps<typeof SeeImageEvidenceCard>)} />)
    expect(screen.getByLabelText('Analyzing image…').getAttribute('aria-busy')).toBe('true')

    rerender(<SeeImageEvidenceCard {...({
      ...base,
      block: { ...block(), meta: null },
    } as ComponentProps<typeof SeeImageEvidenceCard>)} />)
    expect(screen.getByText('Structured evidence is unavailable for this call.')).toBeTruthy()
  })

  it('shows the read-only Evidence tab empty state', () => {
    const useSession = (selector: (snapshot: { nodes: readonly [] }) => unknown) =>
      selector({ nodes: [] })
    render(<EvidenceView {...({
      useSession,
      loadImage: vi.fn(),
      t,
    } as unknown as ComponentProps<typeof EvidenceView>)} />)

    expect(screen.getByRole('region', { name: 'Image evidence workspace' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('No image evidence yet')
  })

  it('folds loaded conversation results into the read-only tab', async () => {
    const settled = block()
    const useSession = (selector: (snapshot: { nodes: readonly ToolResultNode[] }) => unknown) =>
      selector({ nodes: [settled] })
    render(<EvidenceView {...({
      useSession,
      loadImage: async () => 'blob:tab-image',
      t,
    } as unknown as ComponentProps<typeof EvidenceView>)} />)

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('article', { name: 'Image evidence' })).toBeTruthy()
    expect(screen.getByText('Persistent analyst')).toBeTruthy()
    await waitFor(() => {
      expect((screen.getByRole('img', { name: 'Image 1: screen.png' }) as HTMLImageElement).src)
        .toBe('blob:tab-image')
    })
  })
})
