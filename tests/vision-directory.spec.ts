import { describe, expect, it, vi } from 'vitest'
import type { IApiClient, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { VisionModelDirectory } from '../src/client/vision-directory.ts'

function settingsView(provider: string, model: string, revision: number): SettingsNamespaceView {
  return {
    ns: 'see-image-model',
    schema: {},
    value: { provider, model, maxTokens: 8192 },
    applies: 'live',
    secrets: [],
    revision,
  }
}

describe('VisionModelDirectory', () => {
  it('filters image models and atomically writes the selected route', async () => {
    const models = vi.fn().mockResolvedValue({
      result: {
        ok: true,
        value: {
          groups: [{
            id: 'provider',
            name: 'Provider',
            models: [
              { id: 'text', name: 'Text', inputModalities: ['text'] },
              { id: 'vision', name: 'Vision', inputModalities: ['text', 'image'] },
              { id: 'unknown', name: 'Unknown' },
            ],
          }],
          failures: [],
        },
      },
    })
    const describeSettings = vi.fn().mockResolvedValue({
      result: {
        ok: true,
        value: {
          writable: true,
          hasDocument: true,
          namespaces: [settingsView('provider', 'vision', 7)],
        },
      },
    })
    const mutate = vi.fn().mockResolvedValue({
      result: { ok: true, value: settingsView('other', 'other-vision', 8) },
    })
    const directory = new VisionModelDirectory({
      llm: { models } as unknown as IApiClient['llm'],
      settings: { describe: describeSettings, mutate } as unknown as IApiClient['settings'],
    })

    await directory.load()
    expect(directory.store.getSnapshot()).toMatchObject({
      current: { provider: 'provider', model: 'vision' },
      available: true,
      writable: true,
      revision: 7,
      groups: [{
        id: 'provider',
        models: [{ id: 'vision', name: 'Vision', inputModalities: ['text', 'image'] }],
      }],
    })

    await directory.select({ provider: 'other', model: 'other-vision' })
    expect(mutate).toHaveBeenCalledWith({
      ns: 'see-image-model',
      ops: [
        { op: 'set', path: ['provider'], value: 'other' },
        { op: 'set', path: ['model'], value: 'other-vision' },
      ],
      expectedRevision: 7,
    })
    expect(directory.store.getSnapshot()).toMatchObject({
      current: { provider: 'other', model: 'other-vision' },
      revision: 8,
      status: 'ready',
    })
  })

  it('hides the picker when the Host does not expose the settings service', async () => {
    const directory = new VisionModelDirectory({
      llm: {
        models: vi.fn().mockResolvedValue({
          result: { ok: true, value: { groups: [], failures: [] } },
        }),
      } as unknown as IApiClient['llm'],
      settings: {
        describe: vi.fn().mockResolvedValue({
          result: {
            ok: true,
            value: { writable: true, hasDocument: true, namespaces: [] },
          },
        }),
      } as unknown as IApiClient['settings'],
    })

    await directory.load()
    expect(directory.store.getSnapshot().available).toBe(false)
  })
})
