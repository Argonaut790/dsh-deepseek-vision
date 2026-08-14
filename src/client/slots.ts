import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from './store.ts'
import type { VisionModelDirectoryState } from './vision-directory.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Keyed atomic Tool call renderer declared by the installed Tool UI.
     * Repeated locally because this standalone plugin must not runtime-import
     * another client plugin merely to register its own wire Tool.
     */
    'tool.call.toolview': {
      kind: 'keyed'
      scope: 'session'
      owner: ToolCallOwnerProps
    }
  }
}

/** Exact owner currency of the existing keyed Tool-view slot. */
export interface ToolCallOwnerProps {
  callId: string
  toolName: string
  block: ToolCallBlock
  cwd?: string | undefined
  openFile: (path: string) => void
  inspect?: (() => void) | undefined
}

/** Session-authorized historical-image loader injected into Evidence surfaces. */
export type LoadEvidenceImage = (attachment: ImageAttachmentRef) => Promise<string>

/** Injected image face shared by the atomic card and read-only tab. */
export interface EvidenceImageInjected {
  loadImage: LoadEvidenceImage
}

/** Full props for the keyed `see_image` call renderer. */
export type SeeImageCardProps =
  PropsRuntime<'tool.call.toolview'>
  & InjectFace<EvidenceImageInjected>
  & PropsLocale<'deepseekVision'>

/** Full props for the read-only conversation Evidence tab. */
export type EvidenceViewProps =
  ConvViewProps
  & InjectFace<EvidenceImageInjected>
  & PropsLocale<'deepseekVision'>

/** Injected business face of the global vision-model chip. */
export interface VisionModelSelectInjected {
  /** Process-wide image-capable catalog and saved-selection store. */
  directory: SnapshotStore<VisionModelDirectoryState>
  /** Refresh the model catalog and vision settings section. */
  load: () => void
  /**
   * Persist an image-capable route globally.
   * @param selection - provider/model route selected from the filtered catalog.
   * @returns whether the Host accepted the revision-safe mutation.
   */
  select: (selection: ModelSelection) => Promise<boolean>
}
