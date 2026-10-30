# KAI Documents plugin

The original Documents writing workspace, installed separately in KAI Core. It retains the document rail, title and writing canvas, automatic saving, word count, model selector, and the original Improve, Fix grammar, Shorten, Expand, Continue and custom-instruction actions.

Select a passage to revise only that passage, or leave it unselected to revise the document. Suggestions stream into the original preview with Apply, Discard and Stop controls. Generation does not modify the document. Apply updates the selected passage and autosaves; a suggestion cannot overwrite text edited after it began. Native text/Markdown import and export are also retained.

Existing documents keep their original `core/docs` files, IDs and creation dates. Atomic saves retain a revision fence, reject concurrent changes and preserve unreadable files. Serial autosaves and generation checks prevent a delayed response from changing the wrong document when switching pages or typing during a save.

The original renderer talks to its publisher-pinned Documents broker rather than an unrestricted HTTP API. The broker retains the original model streaming route while document reads and writes use guarded storage. It never exposes wallet keys or connected account credentials. Interface language follows the original Core preference.

Run `npm test` for transport, revision and streaming cancellation tests. Core owns storage/inference integration tests and native sandboxed UI scenarios. Synthetic tests do not submit real model jobs or access user documents.

Original UI source baseline: `therexdev/kaiapp` commit `34d17faa0526213b8fc0ac7a65aa7f2c186c6547`, the Documents portion of `ui/docs-view.js`, the `view-docs` section of `ui/index.html`, `ui/styles.css`, and `ui/product-experience.css`. The extracted renderer retains its original controls and behavior, with save/lifetime guards around asynchronous work.
