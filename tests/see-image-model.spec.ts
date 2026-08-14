import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import SeeImageModelConfig, {
  DEFAULT_SEE_IMAGE_MAX_TOKENS,
  SEE_IMAGE_MODEL_SETTINGS_NAMESPACE,
} from '../src/index.ts'

class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

async function boot() {
  const ctx = new Context()
  await ctx.plugin(MemorySettings)
  await ctx.plugin(SeeImageModelConfig, { maxTokens: DEFAULT_SEE_IMAGE_MAX_TOKENS })
  return ctx
}

describe('SeeImageModelConfig', () => {
  it('stays unselected until a complete route is stored', async () => {
    const ctx = await boot()
    expect(ctx.seeImageModel.currentSelection()).toBeUndefined()

    await ctx.settings.replace(SEE_IMAGE_MODEL_SETTINGS_NAMESPACE, { provider: 'vision' })
    expect(ctx.seeImageModel.currentSelection()).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('observes global route changes live', async () => {
    const ctx = await boot()
    await ctx.settings.replace(SEE_IMAGE_MODEL_SETTINGS_NAMESPACE, {
      provider: 'openrouter',
      model: 'vision-one',
    })
    expect(ctx.seeImageModel.currentSelection()).toEqual({
      provider: 'openrouter',
      model: 'vision-one',
      maxTokens: 8192,
    })

    await ctx.settings.replace(SEE_IMAGE_MODEL_SETTINGS_NAMESPACE, {
      provider: 'other',
      model: 'vision-two',
      maxTokens: 4096,
    })
    expect(ctx.seeImageModel.currentSelection()).toEqual({
      provider: 'other',
      model: 'vision-two',
      maxTokens: 4096,
    })
    await ctx.fiber.dispose()
  })
})
