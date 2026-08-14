/**
 * Global model selection used by the DeepSeek vision bridge.
 *
 * @module dsh-deepseek-vision
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  DEFAULT_SEE_IMAGE_MAX_TOKENS,
  MAX_SEE_IMAGE_MAX_TOKENS,
  SEE_IMAGE_MODEL_SETTINGS_NAME,
  type SeeImageModelSelection,
  type SeeImageModelSettings,
} from './shared.ts'

export * from './shared.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Global provider/model route used by delegated image readback. */
    seeImageModel: SeeImageModelConfig
  }
}

/** Settings namespace carrying the global delegated-image model selection. */
export const SEE_IMAGE_MODEL_SETTINGS_NAMESPACE = settingsNamespace(SEE_IMAGE_MODEL_SETTINGS_NAME)

/** Schema for the global delegated-image model settings section. */
export const SEE_IMAGE_MODEL_SETTINGS_SCHEMA: z<SeeImageModelSettings> = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  maxTokens: z.number().step(1).min(1).max(MAX_SEE_IMAGE_MAX_TOKENS).default(DEFAULT_SEE_IMAGE_MAX_TOKENS),
})

/** Composition defaults for delegated image readback. */
export interface Config {
  /** Output budget inherited until settings override it. */
  maxTokens: number
}

/**
 * Owns the global vision route independently of agent presets. Settings are
 * read live, so the next `see_image` call observes a newly selected model.
 */
export class SeeImageModelConfig extends Service {
  static Config: z<Config> = z.object({
    maxTokens: z.number().step(1).min(1).max(MAX_SEE_IMAGE_MAX_TOKENS).default(DEFAULT_SEE_IMAGE_MAX_TOKENS),
  })

  private source: () => SeeImageModelSettings

  constructor(ctx: Context, config: Config) {
    super(ctx, 'seeImageModel')
    const entry: SeeImageModelSettings = { maxTokens: config.maxTokens }
    this.source = () => entry
    installSettingsSection(
      ctx,
      SEE_IMAGE_MODEL_SETTINGS_NAMESPACE,
      SEE_IMAGE_MODEL_SETTINGS_SCHEMA,
      entry,
      {
        setSource: current => { this.source = current },
        onChange: () => {},
      },
    )
  }

  /**
   * Read the complete current route.
   * @returns a detached selection, or undefined until provider and model are both configured.
   */
  currentSelection(): SeeImageModelSelection | undefined {
    const current = this.source()
    if (current.provider === undefined || current.model === undefined) return undefined
    return {
      provider: current.provider,
      model: current.model,
      maxTokens: current.maxTokens,
    }
  }
}

export default SeeImageModelConfig
