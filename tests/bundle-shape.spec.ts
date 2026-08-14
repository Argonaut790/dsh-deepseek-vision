import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('published bundle shape', () => {
  it('emits the browser entry as a DeepSeek Harness module factory', async () => {
    const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    expect(bundle).toMatch(
      /window\.__ModuleLoader__\.load\(\{\s*id:\s*"dsh-deepseek-vision",\s*factory:\s*\(require\)\s*=>\s*\{/,
    )
    expect(bundle).toMatch(/return module\.exports;\s*}\s*}\);/)
  })

  it('emits the fixed see_image tool and structured readback contract', async () => {
    const bundle = await readFile(new URL('../lib/tool.js', import.meta.url), 'utf8')
    expect(bundle).toContain('name: "see_image"')
    expect(bundle).toMatch(/required:\s*\[\s*"summary",\s*"ocr",\s*"answers",\s*"uncertainties"\s*\]/)
    expect(bundle).toMatch(
      /const inject = \[\s*"tools",\s*"subagents",\s*"llm",\s*"seeImageModel",\s*"systemPrompt"\s*\]/,
    )
  })
})
