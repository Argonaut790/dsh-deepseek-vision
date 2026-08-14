// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { EvidenceView, SeeImageEvidenceCard } from '../src/client/EvidenceWorkspace.tsx'
import { VisionModelSelect } from '../src/client/VisionModelSelect.tsx'
import { apply, inject } from '../src/client/index.ts'
import { en } from '../src/client/locales.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconCheckOutline16: () => null,
  IconChevronDownOutline14: () => null,
  IconWarningOutline16: () => null,
  Toast: () => null,
}))

interface Registration {
  options: {
    name: string
    key?: string
    id?: string
    order?: number
    locale?: string
    label?: () => string
    inject?: (sessionId: SessionId) => unknown
  }
  component: unknown
}

function context() {
  const registrations: Registration[] = []
  const resolveImage = vi.fn(async () => 'blob:authorized')
  const connection = {
    api: {
      llm: {
        models: async () => ({
          result: { ok: true as const, value: { groups: [], failures: [] } },
        }),
      },
      settings: {
        describe: async () => ({
          result: {
            ok: true as const,
            value: { writable: true, hasDocument: true, namespaces: [] },
          },
        }),
        mutate: vi.fn(),
      },
    },
  }
  const remote = { $on: vi.fn(() => () => {}) }
  const slots = {
    inject: vi.fn((_name: string, register: () => unknown) => register()),
    register: vi.fn((options: Registration['options'], component: unknown) => {
      registrations.push({ options, component })
      return () => {}
    }),
  }
  const locale = {
    register: vi.fn(() => () => {}),
    bind: vi.fn(() => (key: keyof typeof en) => en[key]),
  }
  const ctx = {
    locale,
    remote,
    slots,
    effect: (effect: () => unknown) => effect(),
    inject: (_services: readonly string[], callback: (scope: ClientContext) => unknown) =>
      callback(ctx as unknown as ClientContext),
    get: (key: string) => key === 'connection' ? connection : { resolveImage },
    on: vi.fn(() => () => {}),
  } as unknown as ClientContext
  return { ctx, registrations, resolveImage }
}

describe('client slot registration', () => {
  it('registers the Evidence card and tab while preserving the global picker', async () => {
    const b = context()
    apply(b.ctx)

    expect(inject).toContain('conversation')
    expect(b.registrations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        options: expect.objectContaining({
          name: 'tool.call.toolview',
          key: 'see_image',
          locale: 'deepseekVision',
        }),
        component: SeeImageEvidenceCard,
      }),
      expect.objectContaining({
        options: expect.objectContaining({
          name: 'conversation.view',
          id: 'evidence',
          order: 20,
          locale: 'deepseekVision',
        }),
        component: EvidenceView,
      }),
      expect.objectContaining({
        options: expect.objectContaining({
          name: 'conversation.input.right',
          id: 'deepseek-vision-model',
          order: 100,
        }),
        component: VisionModelSelect,
      }),
    ]))

    const tab = b.registrations.find(entry => entry.options.name === 'conversation.view')!
    expect(tab.options.label?.()).toBe('Evidence')
    const injected = tab.options.inject?.('session-1' as SessionId) as {
      loadImage: (attachment: object) => Promise<string>
    }
    const attachment = {
      attachmentId: 'image-1',
      mediaType: 'image/png',
      bytes: 1,
      width: 1,
      height: 1,
    }
    await expect(injected.loadImage(attachment)).resolves.toBe('blob:authorized')
    expect(b.resolveImage).toHaveBeenCalledWith('session-1', attachment)
  })
})
