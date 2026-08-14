# dsh-deepseek-vision

[![CI](https://github.com/Argonaut790/dsh-deepseek-vision/actions/workflows/ci.yml/badge.svg)](https://github.com/Argonaut790/dsh-deepseek-vision/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A DSH-native visual evidence workspace that gives text-only DeepSeek Harness
models controlled access to images without changing the parent model.

Unlike provider-pool or CLI interception tools, this plugin keeps DeepSeek
Harness in charge of models, attachments, sessions, and UI. It adds:

- `see_image` with latest, all, and explicit image selection
- one conversation-scoped vision analyst with follow-up memory
- structured summaries, question answers, exhaustive OCR, and uncertainties
- a read-only **Evidence** tab and per-call evidence cards
- a global `Vision: …` provider/model picker beside **Choose Model**
- live route changes; changing the route starts a new analyst

## Requirements

- Node.js `^22.19.0` or `>=24`
- DeepSeek Harness `0.1.0-rc.6`
- an image-capable model registered in the Harness catalog
- the DSH `spawn` subagent provider

The Harness must provide `delegated-image` prompt admission, model input
modalities, the `see-image-model` settings namespace, and the Web conversation
slots. This plugin cannot retrofit those contracts into an older release.

Do not mount this package while equivalent in-tree `see-image-model`,
`tool-subagent-image`, or vision-picker rows are enabled. Duplicate services
and tools will conflict.

## Install from GitHub

This project is not published to npm. Build a checkout and add that local
package to the Web profile:

```sh
git clone https://github.com/Argonaut790/dsh-deepseek-vision.git
cd dsh-deepseek-vision
corepack yarn install --frozen-lockfile
corepack yarn build
dsh plugin --profile web add .
```

The included `cordis.patch.yml` mounts the global route service and
`see_image`; its package metadata exposes the Web picker and Evidence UI.

## Configure

Open a conversation and select an image-capable route from the `Vision: …`
chip. Models are listed only when the Harness catalog explicitly declares
`image` input.

For a headless profile, configure the same global route in
`$DSH_HOME/settings.yaml`:

```yaml
see-image-model:
  provider: openrouter-grok
  model: x-ai/grok-4.6
  maxTokens: 8192
```

The provider and model names are examples. They must match routes registered
in your Harness. The supported output-token range is 1–32768.

An optional static fallback may be set on the tool row:

```yaml
- id: deepseek-vision-tool
  name: dsh-deepseek-vision/tool
  config:
    provider: spawn
    agentOptions:
      provider: openrouter-grok
      model: x-ai/grok-4.6
      maxTokens: 8192
```

The global picker takes precedence when it contains a complete route.

## How it works

1. Harness retains pasted images as durable `delegated-image` attachments.
2. The text-only parent calls `see_image` with questions and an image
   selection.
3. The plugin reuses the newest matching vision analyst for that conversation,
   forwarding only images the analyst has not already received.
4. The analyst receives no tools, uses a fixed anti-prompt-injection persona,
   and must return strict JSON.
5. The parent receives concise model-facing text while the complete structured
   record is retained for evidence cards and the Evidence tab.
6. If durable continuation is unavailable, the plugin performs an isolated
   one-shot structured readback.

Calls are serialized per conversation by the Harness tool runtime. A route
change creates a new analyst rather than mutating the model behind an existing
child.

## Privacy, trust, and cost

- Selected images are sent to the configured vision provider. Review that
  provider's retention, region, and privacy terms before use.
- Each analyst turn consumes the selected model's tokens and may incur
  provider charges. Follow-ups can reuse visual context but are still model
  calls.
- OCR and visual conclusions are model-generated evidence, not guaranteed
  facts. Verify high-impact decisions independently.
- Text found inside images is treated as untrusted data, never as
  instructions. The analyst has no tools or external-action authority.
- Evidence records keep attachment identifiers and derived text in the
  conversation history; they do not embed image bytes.

## Image selection

`see_image` supports:

- `latest` (default): images from the newest conversation event containing
  delegated images
- `all`: the de-duplicated conversation image catalog
- `ids`: exact attachment IDs already present in that catalog

A call accepts up to 12 questions, 2,000 characters per question, and 8,000
characters in total.

## Development

Use Corepack-managed Yarn:

```sh
corepack yarn install --frozen-lockfile
corepack yarn typecheck
corepack yarn build
corepack yarn test
```

The build emits Host entries at `lib/index.js` and `lib/tool.js`, declarations
under `lib/types`, and a browser `__ModuleLoader__` bundle at `lib/client.js`.
See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[CHANGELOG.md](CHANGELOG.md).
