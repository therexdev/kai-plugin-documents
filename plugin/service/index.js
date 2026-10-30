"use strict";
const { create: createDocuments } = require("./documents");
const { createStreams } = require("./streams");

function create(api) {
  if (api.version !== 1) throw Error("Documents requires Foundation API v1");
  const lifetime = new AbortController();
  const signal = AbortSignal.any([api.signal, lifetime.signal]);
  const streams = createStreams((input, requestSignal) => api.models.request(input, requestSignal), signal);
  const dialog = () => require("electron").dialog;
  const getWindow = () => require("electron").BrowserWindow.fromId(api.desktop.hostWindowId());
  const documents = createDocuments({
    dataDir: api.plugin.dataDir,
    electron: { dialog: {
      showOpenDialog: (...args) => dialog().showOpenDialog(...args),
      showSaveDialog: (...args) => dialog().showSaveDialog(...args)
    } }, getWindow,
    preferences: () => ({ "kai-interface-language": api.desktop.preferences().language }),
    confirm: (title, detail) => api.desktop.confirm(title, detail),
    request: (_feature, input, operationSignal) => streams.request(input.body, operationSignal),
    poll: (_feature, id, operationSignal) => { operationSignal?.throwIfAborted(); return streams.poll(id); },
    cancel: (_feature, id) => streams.cancel(id),
    release: () => streams.dispose(),
    localInference: async (input, operationSignal) => {
      const result = await api.models.chat({ model: input.model, messages: [{ role: "user", content: input.prompt }], max_tokens: input.maxTokens, stream: false }, operationSignal);
      return { text: result.choices?.[0]?.message?.content ?? result.text };
    }
  });
  const methods = ["list", "get", "save", "remove"];
  api.services.provide("kai.documents", { methods, call(method, input, options) {
    if (options?.remote) throw Error("Remote jobs cannot access private documents");
    if (!methods.includes(method)) throw Error("Unknown Documents service method");
    return documents.call("documents." + method, input, signal);
  } });
  return {
    async call(method, input, operationSignal) {
      signal.throwIfAborted();
      return documents.call(method, input, AbortSignal.any([signal, ...(operationSignal ? [operationSignal] : [])]));
    },
    async dispose() { lifetime.abort(); await documents.dispose(); }
  };
}
module.exports = { create };
