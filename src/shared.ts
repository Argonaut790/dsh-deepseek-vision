/** Default output budget for one delegated image readback. */
export const DEFAULT_SEE_IMAGE_MAX_TOKENS = 8192

/** Upper output budget accepted from settings or static configuration. */
export const MAX_SEE_IMAGE_MAX_TOKENS = 32768

/** Maximum number of questions accepted by one `see_image` call. */
export const MAX_SEE_IMAGE_QUESTIONS = 12

/** Maximum UTF-16 length of one caller question. */
export const MAX_SEE_IMAGE_QUESTION_CHARS = 2000

/** Maximum combined UTF-16 length of all questions in one call. */
export const MAX_SEE_IMAGE_TOTAL_QUESTION_CHARS = 8000

/** Stable settings namespace recognized by the DeepSeek Harness Host proxy. */
export const SEE_IMAGE_MODEL_SETTINGS_NAME = 'see-image-model'

/** Durable evidence shape version. */
export const VISION_EVIDENCE_VERSION = 1

/** Which delegated images a `see_image` call addresses. */
export type SeeImageSelection = 'latest' | 'all' | 'ids'

/** Complete model route and output budget consumed by `see_image`. */
export interface SeeImageModelSelection {
  /** Registered LLM provider route. */
  provider: string
  /** Provider-owned image-capable model id. */
  model: string
  /** Positive maximum output tokens for one image readback. */
  maxTokens: number
}

/** Stored settings; provider and model remain absent until the user selects a route. */
export interface SeeImageModelSettings {
  /** Registered LLM provider route. */
  provider?: string
  /** Provider-owned image-capable model id. */
  model?: string
  /** Positive maximum output tokens for one image readback. */
  maxTokens: number
}

/** Image metadata retained in a replayable evidence result. */
export interface VisionEvidenceImage {
  /** Opaque attachment-store identity used by explicit image selection. */
  attachmentId: string
  /** Verified encoded media type. */
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
  /** Optional display name with no local path information. */
  name?: string
}

/** One direct answer preserved with the question that produced it. */
export interface VisionEvidenceAnswer {
  question: string
  answer: string
}

/**
 * Canonical result of one `see_image` call. This object is both the validated
 * tool value and the replayable presentation payload used by Host clients.
 */
export interface VisionEvidence {
  version: typeof VISION_EVIDENCE_VERSION
  /** Persistent analyst turn, or compatibility one-shot fallback. */
  origin: 'persistent' | 'one-shot'
  /** Durable child id when a continuable analyst handled the call. */
  analystId?: string
  /** Exact model route used for this evidence. */
  route: {
    provider: string
    model: string
  }
  /** Image-selection policy requested by the parent. */
  selection: SeeImageSelection
  /** Selected images, including already-seen images used from analyst memory. */
  images: VisionEvidenceImage[]
  /** Validated questions sent to the analyst. */
  questions: string[]
  summary: string
  ocr: string
  answers: VisionEvidenceAnswer[]
  uncertainties: string[]
}
