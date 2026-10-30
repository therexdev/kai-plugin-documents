# Foundation plugin development

This plugin owns its UI, feature engine, dependencies and data. The renderer remains sandboxed. The native service runs as explicitly trusted Electron main-process code with full computer/application access; never describe native execution as an isolation boundary.

Use only the public Foundation API for shared models, network policy, settings, secrets, UI and declared service RPC. Do not import files from Core or another plugin. Keep data within api.plugin.dataDir; old profiles are neither read nor migrated. Never put secrets or publisher keys in this repository. Unreadable data must not be silently replaced.

Agent/service inputs are untrusted data. They must not gain ambient native authority, private account access or access to another plugin's records. Any change to the isolated job runtime requires capability-denial and resource-bound tests.

Dependencies are pinned and bundled at build time, before package signing. Never install npm packages or run installation scripts on the user's machine. Run npm test and the package verifier before publication. New immutable release versions only.
