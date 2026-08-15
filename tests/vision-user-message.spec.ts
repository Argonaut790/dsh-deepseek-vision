import { describe, expect, it } from 'vitest'
import { imageAttachmentNote } from '../src/media.ts'
import { projectVisionUserContent } from '../src/client/VisionUserMessage.tsx'

const ref = {
  attachmentId: `sha256:${'a'.repeat(64)}` as const,
  mediaType: 'image/png' as const,
  bytes: 8,
  width: 1,
  height: 1,
  name: 'screen.png',
}

describe('vision user-message projection', () => {
  it('renders durable notes as native image blocks without exposing transport text', () => {
    const note = imageAttachmentNote(ref)
    const legacy = `![screen.png](http://localhost:3080/dsh-deepseek-vision/media/raw/session/${ref.attachmentId})`
    const projection = projectVisionUserContent([{
      type: 'text',
      text: `What is shown?\n\n${legacy}\n${note}`,
    }])

    expect(projection.content).toEqual([
      { type: 'text', text: 'What is shown?' },
      { type: 'image', attachment: ref },
    ])
    expect(projection.attachmentIds).toEqual(new Set([ref.attachmentId]))
  })

  it('does not duplicate a native image that also has a durable note', () => {
    const projection = projectVisionUserContent([
      { type: 'image', attachment: ref },
      { type: 'text', text: imageAttachmentNote(ref) },
    ])

    expect(projection.content).toEqual([{ type: 'image', attachment: ref }])
    expect(projection.attachmentIds).toEqual(new Set([ref.attachmentId]))
  })
})
