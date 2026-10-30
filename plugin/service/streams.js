"use strict";
const crypto = require("node:crypto");
// Owned pull streams: bounded memory, cancellation, idle expiry and shutdown.
function createStreams(request, lifetime) {
  const streams = new Map(), MAX = 8 * 1024 * 1024;
  let closed = false;
  function stop(record, message = "Writing stopped") {
    if (!record) return;
    record.error = message; record.done = true; record.controller.abort();
    void record.reader?.cancel().catch(() => {});
  }
  const timer = setInterval(() => {
    for (const [id, record] of streams) if (Date.now() - record.lastPoll > 120000) {
      stop(record, "Writing request expired because the editor stopped reading"); streams.delete(id);
    }
  }, 30000); timer.unref?.();
  return {
    async request(input, signal) {
      if (closed) throw Error("Writing service is closed");
      if (streams.size >= 8) throw Error("Finish an active writing request first");
      const controller = new AbortController();
      const both = AbortSignal.any([controller.signal, ...(lifetime ? [lifetime] : []), ...(signal ? [signal] : [])]);
      const record = { controller, reader: null, chunks: [], bytes: 0, done: false, error: null, lastPoll: Date.now(), task: null };
      const id = crypto.randomUUID(); streams.set(id, record);
      try {
        const response = await request(input, both); both.throwIfAborted();
        if (closed) throw Error("Writing service is closed");
        const headers = Object.fromEntries(response.headers.entries());
        if (!response.body) { streams.delete(id); return { ok: response.ok, status: response.status, headers, body: "" }; }
        record.reader = response.body.getReader(); const decoder = new TextDecoder();
        record.task = (async () => {
          try {
            for (;;) {
              both.throwIfAborted(); const next = await record.reader.read();
              if (next.done) { const tail = decoder.decode(); if (tail) record.chunks.push(tail); break; }
              record.bytes += next.value.byteLength;
              if (record.bytes > MAX) throw Error("Writing response buffer is full. Stop and retry the suggestion");
              record.chunks.push(decoder.decode(next.value, { stream: true }));
            }
          } catch (error) { record.error = both.aborted ? "Writing stopped" : error.message; controller.abort(); await record.reader.cancel().catch(() => {}); }
          finally { record.done = true; }
        })();
        return { ok: response.ok, status: response.status, headers, streamId: id };
      } catch (error) { stop(record); streams.delete(id); throw error; }
    },
    poll(id) {
      if (closed) throw Error("Writing service is closed");
      const record = streams.get(id); if (!record) throw Error("Unknown writing request");
      const chunks = []; let size = 0;
      while (record.chunks.length && size < 256 * 1024) { const text = record.chunks.shift(); chunks.push(text); const bytes = Buffer.byteLength(text); size += bytes; record.bytes = Math.max(0, record.bytes - bytes); }
      record.lastPoll = Date.now(); const done = record.done && !record.chunks.length;
      if (done) streams.delete(id);
      return { chunks, done, ...(record.error ? { error: record.error } : {}) };
    },
    cancel(id) { const record = streams.get(id); if (!record) throw Error("Unknown writing request"); stop(record); streams.delete(id); return { stopped: true }; },
    async dispose() { closed = true; clearInterval(timer); const pending = [...streams.values()]; pending.forEach(record => stop(record)); streams.clear(); await Promise.allSettled(pending.map(record => record.task)); }
  };
}
module.exports = { createStreams };
