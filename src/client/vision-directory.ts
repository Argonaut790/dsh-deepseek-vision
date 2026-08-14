/**
 * Process-wide image-capable model directory and revision-safe settings writer.
 */

import type {
  IApiClient, ModelCatalogFailure, ModelProviderGroup, ModelSelection, SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { SEE_IMAGE_MODEL_SETTINGS_NAME } from '../shared.ts'
import { createSnapshotStore, type SnapshotStore } from './store.ts'

/** Global vision-picker snapshot. */
export interface VisionModelDirectoryState {
  /** Current global selection, or null while unset. */
  current: ModelSelection | null
  /** Provider groups reduced to models that explicitly accept image input. */
  groups: readonly ModelProviderGroup[]
  /** Provider-local catalog failures from the last load. */
  failures: readonly ModelCatalogFailure[]
  /** Whether the Host exposes the global vision settings service. */
  available: boolean | null
  /** Whether the backing settings provider accepts writes. */
  writable: boolean
  /** Latest raw-section revision used for compare-and-swap mutations. */
  revision: number | undefined
  /** Lifecycle of the in-flight operation. */
  status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
  /** Whole-request or selection failure text. */
  error: string | null
}

/** Decode the current route from one Host settings view. */
function selectionOf(view: SettingsNamespaceView): ModelSelection | null {
  if (typeof view.value !== 'object' || view.value === null || Array.isArray(view.value)) return null
  const value = view.value as { provider?: unknown; model?: unknown }
  if (typeof value.provider !== 'string' || typeof value.model !== 'string') return null
  return { provider: value.provider, model: value.model }
}

/** Keep only models whose exact route explicitly declares image input. */
export function imageModelGroups(groups: readonly ModelProviderGroup[]): ModelProviderGroup[] {
  return groups.flatMap((group) => {
    // `inputModalities` is present on Harness builds carrying delegated-image
    // admission. Keep the local structural extension so the plugin can still
    // compile against older published API typings and degrade to an empty list.
    const models = group.models.filter((model) => {
      const candidate = model as typeof model & { inputModalities?: readonly string[] }
      return candidate.inputModalities?.includes('image') === true
    })
    return models.length === 0 ? [] : [{ ...group, models }]
  })
}

/** Shared process-wide controller used by every composer vision chip. */
export class VisionModelDirectory {
  /** Reactive store rendered by the chip. */
  readonly store: SnapshotStore<VisionModelDirectoryState> = createSnapshotStore<VisionModelDirectoryState>({
    current: null,
    groups: [],
    failures: [],
    available: null,
    writable: false,
    revision: undefined,
    status: 'idle',
    error: null,
  })

  private generation = 0
  private disposed = false

  /**
   * @param api - loopback Host model-catalog and settings faces.
   */
  constructor(private readonly api: Pick<IApiClient, 'llm' | 'settings'>) {}

  /**
   * Refresh the catalog and global selection together.
   * @returns fulfillment after the newest response is published.
   */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.update((state) => { state.status = 'loading'; state.error = null })
    let responses: [
      Awaited<ReturnType<IApiClient['llm']['models']>>,
      Awaited<ReturnType<IApiClient['settings']['describe']>>,
    ]
    try {
      responses = await Promise.all([
        this.api.llm.models({}),
        this.api.settings.describe({}),
      ])
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.fail(error instanceof Error ? error.message : String(error))
      }
      return
    }
    const [catalogResponse, settingsResponse] = responses
    if (this.disposed || generation !== this.generation) return
    if (!catalogResponse.result.ok) {
      this.fail(`llm.models failed: ${catalogResponse.result.error.code}: ${catalogResponse.result.error.message}`)
      return
    }
    if (!settingsResponse.result.ok) {
      this.fail(`settings.describe failed: ${settingsResponse.result.error.code}: ${settingsResponse.result.error.message}`)
      return
    }
    const catalog = catalogResponse.result.value
    const settings = settingsResponse.result.value
    const view = settings.namespaces.find(candidate => candidate.ns === SEE_IMAGE_MODEL_SETTINGS_NAME)
    this.store.update((state) => {
      state.groups = imageModelGroups(catalog.groups)
      state.failures = catalog.failures
      state.available = view !== undefined
      state.writable = settings.writable
      state.revision = view?.revision
      state.current = view === undefined ? null : selectionOf(view)
      state.status = 'ready'
      state.error = null
    })
  }

  /**
   * Atomically save provider and model against the latest known revision.
   * @param selection - image-capable route chosen from the loaded directory.
   * @returns fulfillment after the Host accepts and echoes the selection.
   */
  async select(selection: ModelSelection): Promise<void> {
    const generation = ++this.generation
    const revision = this.store.getSnapshot().revision
    this.store.update((state) => { state.status = 'selecting'; state.error = null })
    let response: Awaited<ReturnType<IApiClient['settings']['mutate']>>
    try {
      response = await this.api.settings.mutate({
        ns: SEE_IMAGE_MODEL_SETTINGS_NAME,
        ops: [
          { op: 'set', path: ['provider'], value: selection.provider },
          { op: 'set', path: ['model'], value: selection.model },
        ],
        ...(revision === undefined ? {} : { expectedRevision: revision }),
      })
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.fail(error instanceof Error ? error.message : String(error))
      }
      throw error
    }
    if (this.disposed || generation !== this.generation) return
    if (!response.result.ok) {
      const message = `${response.result.error.code}: ${response.result.error.message}`
      this.fail(message)
      throw new Error(`settings.mutate failed: ${message}`)
    }
    const view = response.result.value
    this.store.update((state) => {
      state.current = selectionOf(view)
      state.available = true
      state.revision = view.revision
      state.status = 'ready'
      state.error = null
    })
  }

  /** Reset stale Host projections after reconnection and pull the new process state. */
  resetConnected(): void {
    if (this.disposed) return
    ++this.generation
    this.store.update((state) => {
      state.current = null
      state.groups = []
      state.failures = []
      state.available = null
      state.revision = undefined
      state.status = 'idle'
      state.error = null
    })
    void this.load()
  }

  /** Prevent late responses from publishing after plugin teardown. */
  dispose(): void {
    this.disposed = true
    this.generation += 1
  }

  private fail(message: string): void {
    this.store.update((state) => {
      state.status = 'error'
      state.error = message
    })
  }
}
