import { describe, expect, it, vi } from 'vitest'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { VisionModelDirectory } from '../src/client/vision-directory.ts'

describe('VisionModelDirectory', () => {
  it('lists every model and writes the selected route through the plugin endpoint', async () => {
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
    const describe = vi.fn().mockResolvedValue({
      writable: true,
      selection: { provider: 'provider', model: 'vision', maxTokens: 8192 },
    })
    const select = vi.fn().mockResolvedValue({
      writable: true,
      selection: { provider: 'other', model: 'other-vision', maxTokens: 8192 },
    })
    const directory = new VisionModelDirectory(
      { llm: { models } as unknown as IApiClient['llm'] },
      { describe, select },
    )

    await directory.load()
    expect(directory.store.getSnapshot()).toMatchObject({
      current: { provider: 'provider', model: 'vision' },
      available: true,
      writable: true,
      groups: [{
        id: 'provider',
        models: [
          { id: 'text', name: 'Text', inputModalities: ['text'] },
          { id: 'vision', name: 'Vision', inputModalities: ['text', 'image'] },
          { id: 'unknown', name: 'Unknown' },
        ],
      }],
    })

    await directory.select({ provider: 'other', model: 'other-vision' })
    expect(select).toHaveBeenCalledWith({ provider: 'other', model: 'other-vision' })
    expect(directory.store.getSnapshot()).toMatchObject({
      current: { provider: 'other', model: 'other-vision' },
      status: 'ready',
    })
  })

  it('reports an endpoint failure without publishing a stale selection', async () => {
    const directory = new VisionModelDirectory(
      { llm: {
        models: vi.fn().mockResolvedValue({
          result: { ok: true, value: { groups: [], failures: [] } },
        }),
      } as unknown as IApiClient['llm'] },
      {
        describe: vi.fn().mockRejectedValue(new Error('endpoint unavailable')),
        select: vi.fn(),
      },
    )

    await directory.load()
    expect(directory.store.getSnapshot()).toMatchObject({
      available: null,
      status: 'error',
      error: 'endpoint unavailable',
    })
  })
})
