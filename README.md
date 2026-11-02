# KAI Documents

Documents owns the complete writing workspace and its native service. The plugin contains document storage, revision checks, native text/Markdown import and export, AI suggestion streams, cancellation, and the editor UI. Core supplies only the documented Foundation API for shared model inference, desktop approvals and plugin lifecycle.

The writing experience includes a document rail, autosave, word count, a local model selector, Improve, Fix grammar, Shorten, Expand, Continue and custom instructions. Selecting a passage applies changes only to that passage. Suggestions remain separate until Apply; Discard and Stop remain available. Generation and autosave checks prevent delayed work from changing another document or overwriting newer edits.

## Trust and data

This is a **native plugin**. Installation explicitly grants full computer and application access. The renderer remains sandboxed, but the native service is trusted code, not an adversarial isolation boundary. Install native plugins only from publishers you trust.

Documents uses its own `api.plugin.dataDir/docs` directory. Foundation starts a new profile; this release does not read or migrate documents from the older app. Existing older files remain untouched. Saves retain a revision fence, use atomic replacement, preserve unknown metadata, and refuse unreadable, linked, oversized or stale records. The request budget is 10 MiB.

## Public Foundation integration

- `models.list`, `api.models.request` and `api.models.chat` provide local inference.
- `api.settings` stores plugin preferences; `api.desktop.confirm` owns destructive-action review.
- The declared `kai.documents` service exposes `list`, `get`, `save` and `remove` to installed, authorized local plugins. Save/remove require revisions; remove still requires native confirmation. Remote jobs are denied.
- No imports from the Core source tree, feature-specific Core broker, shared companion store or private publisher-only API are used.

The entry point is `plugin/service/index.js`. The package has no external runtime dependencies. Native file dialogs use Electron, which the native runtime provides. All feature code is included before signing; nothing is installed from npm on the user's machine.

Run `npm test`. After packing a new immutable release, run `node scripts/verify-package.js` to compare every signed file against the source and verify its publisher signature.

## Foundation package publication

Requires KAI Core **0.7.0 or later**, manifest schema 2/API 3 and native API v1. Source lives in `plugin/`, including its service and all runtime dependencies. Runtime installation never runs npm or dependency hooks.

Before signing, install any author dependencies with `npm ci --ignore-scripts` when this repository has a lockfile, run `npm run build --if-present`, then `node scripts/verify-package.js --source` and `npm test`. The source-only check uses a temporary in-memory test signature; it does not claim a publisher release was signed.

Pack the complete plugin using Core's `scripts/core/pack-plugin.js`, keeping the publisher private key outside every repository. Place the new immutable signed asset at `dist/<repository-name>-<manifest-version>.kaiplugin`, then run `node scripts/verify-package.js`. The release verifier checks the actual publisher signature and exact source/assets/dependency contents against the same package rules as Core. Its standalone format snapshot and SHA-256 provenance are under `scripts/package-format-v3*`; it never imports or executes submitted plugin code.

CI tests source on `foundation-v1`, pull requests and `main` on Windows, macOS and Linux. It checks any signed asset present for the current version. Publication runs only from `main`, only when that exact signed asset exists, and only after every check passes. Existing release assets must match byte-for-byte and are never overwritten. Branch builds cannot publish releases. Native device/integration checks remain necessary before a release; unit tests do not replace them.

## Interface language

This plugin follows the language saved in KAI Core Settings and applies changes to open views. English, Spanish, Brazilian Portuguese, French and German are supported through bundled offline catalogs. User content and identifiers stay literal. These source changes require Core 0.7.17+ for the live locale API; release the Core update before publishing a new signed plugin package and catalog entry. See the [public localization API](https://github.com/therexdev/kai-core/blob/main/docs/foundation/PLUGIN_AUTHOR_GUIDE.md#shared-language-and-localization-core-0717).
