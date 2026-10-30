# KAI Documents plugin

Local writing workspace for KAI Core 0.2.0. Opens the existing `core/docs` document files created by Alpha/Test, preserving their IDs and creation dates.

## Available now

- Search, create, edit, save, and delete plain-text/Markdown documents.
- Import text or Markdown through a native file picker and export through a native save dialog.
- Generate local AI writing proposals with an installed model.
- Review a proposal, explicitly apply it to the editor, then save it. Generation never silently modifies a saved document.
- Atomic saves and revision checks protect against stale overwrites. Unreadable or symlinked files are reported and preserved.

This version edits text/Markdown; it does not import Word/PDF formats, render arbitrary HTML, sync cloud drives, or send document content to network models. Draft instructions and included context are limited to 15,000 characters combined; document storage supports up to one million characters.

## Installation and permissions

Install the signed `.kaiplugin` release through KAI Core. The reviewed publisher pin is required for private `documents.*` capabilities. The renderer uses the allowlisted host broker and never receives Node, filesystem paths, wallet keys, or account credentials. Local inference requires an installed model and the model-list permission.

Run `npm test` for the document model tests. Broker integration tests live in `kai-core/core/test-core/private-data-services.test.js`. Signing and release packaging are managed from the Core workspace; publisher private keys must never enter this repository.
