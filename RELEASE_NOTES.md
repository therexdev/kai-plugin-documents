# 0.3.0 — Foundation plugins

Documents now owns its native engine, storage, import/export and streaming model adapter. It uses Foundation API v1 and package schema 2/API 3. The full writing UI remains available.

This is a native plugin with explicit full-computer trust. It starts with its own plugin data; older app documents are not read, moved or deleted. No private Core feature API or shared-profile migration is required.

Tests cover standalone service calls, revisions, corrupt and oversized documents, streaming cancellation and shutdown, native import/export, remote-service denial and the existing editor interactions.
