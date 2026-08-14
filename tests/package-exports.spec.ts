import { describe, expect, it } from 'vitest'

describe('published Host exports', () => {
  it('loads the settings service and tool entry from their package paths', async () => {
    const root = await import('dsh-deepseek-vision')
    const tool = await import('dsh-deepseek-vision/tool')

    expect(root.default).toBeTypeOf('function')
    expect(root.SEE_IMAGE_MODEL_SETTINGS_NAMESPACE).toBe('see-image-model')
    expect(tool.name).toBe('deepseek-vision-tool')
    expect(tool.apply).toBeTypeOf('function')
    expect(tool.inject).toEqual(['tools', 'subagents', 'llm', 'seeImageModel', 'systemPrompt'])
  })
})
