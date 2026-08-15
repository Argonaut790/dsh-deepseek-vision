/**
 * Process-wide image-capable model directory and revision-safe settings writer.
 */

import type {
  IApiClient, ModelCatalogFailure, ModelProviderGroup, ModelSelection,
} from '@deepseek-ai/dsh-api-remotes/client'
import { VISION_SELECTION_PATH } from '../shared.ts'
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

export interface VisionSelectionView {
  selection: unknown
  writable: boolean
}

export interface VisionSelectionClient {
  describe(): Promise<VisionSelectionView>
  select(selection: ModelSelection): Promise<VisionSelectionView>
}

async function selectionView(response: Response, action: string): Promise<VisionSelectionView> {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null
  if (!response.ok) {
    const detail = typeof payload?.error === 'string' ? `: ${payload.error}` : ''
    throw new Error(`${action} failed (HTTP ${String(response.status)})${detail}`)
  }
  if (payload === null || typeof (payload as VisionSelectionView).writable !== 'boolean') {
    throw new Error(`${action} returned an invalid response`)
  }
  return payload as VisionSelectionView
}

const browserSelectionClient: VisionSelectionClient = {
  async describe() {
    const response = await fetch(VISION_SELECTION_PATH, { cache: 'no-store' })
    return await selectionView(response, 'Vision settings')
  },
  async select(selection) {
    const response = await fetch(VISION_SELECTION_PATH, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selection),
    })
    return await selectionView(response, 'Vision selection')
  },
}

/** Decode the current route from one Host selection response. */
function selectionOf(value: unknown): ModelSelection | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const candidate = value as { provider?: unknown; model?: unknown }
  if (typeof candidate.provider !== 'string' || typeof candidate.model !== 'string') return null
  return { provider: candidate.provider, model: candidate.model }
}

/** Keep every catalog model; some adapters omit modality metadata entirely. */
export function imageModelGroups(groups: readonly ModelProviderGroup[]): ModelProviderGroup[] {
  return groups.flatMap(group =>
    group.models.length === 0 ? [] : [{ ...group, models: [...group.models] }],
  )
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
  constructor(
    private readonly api: Pick<IApiClient, 'llm'>,
    private readonly selectionClient: VisionSelectionClient = browserSelectionClient,
  ) {}

  /**
   * Refresh the catalog and global selection together.
   * @returns fulfillment after the newest response is published.
   */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.update((state) => { state.status = 'loading'; state.error = null })
    let responses: [
      Awaited<ReturnType<IApiClient['llm']['models']>>,
      VisionSelectionView,
    ]
    try {
      responses = await Promise.all([
        this.api.llm.models({}),
        this.selectionClient.describe(),
      ])
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.fail(error instanceof Error ? error.message : String(error))
      }
      return
    }
    const [catalogResponse, selectionResponse] = responses
    if (this.disposed || generation !== this.generation) return
    if (!catalogResponse.result.ok) {
      this.fail(`llm.models failed: ${catalogResponse.result.error.code}: ${catalogResponse.result.error.message}`)
      return
    }
    const catalog = catalogResponse.result.value
    this.store.update((state) => {
      state.groups = imageModelGroups(catalog.groups)
      state.failures = catalog.failures
      state.available = true
      state.writable = selectionResponse.writable
      state.revision = undefined
      state.current = selectionOf(selectionResponse.selection)
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
    this.store.update((state) => { state.status = 'selecting'; state.error = null })
    let response: VisionSelectionView
    try {
      response = await this.selectionClient.select(selection)
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.fail(error instanceof Error ? error.message : String(error))
      }
      throw error
    }
    if (this.disposed || generation !== this.generation) return
    this.store.update((state) => {
      state.current = selectionOf(response.selection)
      state.available = true
      state.writable = response.writable
      state.revision = undefined
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
