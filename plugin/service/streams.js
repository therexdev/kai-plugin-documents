"use strict";
const crypto = require("node:crypto");
// Owned pull streams: bounded memory, cancellation, idle expiry and shutdown.
function createStreams(request, lifetime) {
  const streams = new Map(), pending = new Set(), MAX = 8 * 1024 * 1024;
  let closed = false;
  function stop(record, message = "Writing stopped") {
    if (!record) return;
    record.error = message; record.state = "stopped"; record.done = true; record.controller.abort();
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
      signal?.throwIfAborted(); lifetime?.throwIfAborted();
      if (streams.size >= 8 || pending.size >= 8) throw Error("Finish an active writing request first");
      const controller = new AbortController();
      const both = AbortSignal.any([controller.signal, ...(lifetime ? [lifetime] : []), ...(signal ? [signal] : [])]);
      const record = { controller, reader: null, chunks: [], bytes: 0, done: false, error: null, state: "waiting", lastPoll: Date.now(), task: null };
      const id = crypto.randomUUID(); streams.set(id, record);
      // Return the owned handle before waiting for the model to load, queue or
      // send headers. Stop must also work during those stages, not only once
      // the first response is available.
      const task = record.task = (async () => {
        let response;
        try {
          response = await request(input, both);
          both.throwIfAborted();
          if (closed) throw Error("Writing service is closed");
          if (!response.ok) {
            let detail = "";
            // Core errors are bounded JSON responses. Read through the same
            // bounded reader below so an invalid response cannot fill memory.
            record.reader = response.body?.getReader();
            const decoder = new TextDecoder(); let bytes = 0;
            if (record.reader) for (;;) {
              both.throwIfAborted(); const next = await record.reader.read(); if (next.done) break;
              bytes += next.value.byteLength; if (bytes > 64 * 1024) throw Error(`Model request failed (${response.status})`);
              detail += decoder.decode(next.value, { stream: true });
            }
            detail += decoder.decode();
            let parsed; try { parsed = JSON.parse(detail); } catch {}
            throw Error(parsed?.error?.message || (typeof parsed?.error === "string" ? parsed.error : `Model request failed (${response.status})`));
          }
          if (!response.body) throw Error("The model returned an empty response. Try the suggestion again.");
          record.reader = response.body.getReader(); const decoder = new TextDecoder();
          record.state = "generating";
            for (;;) {
              both.throwIfAborted(); const next = await record.reader.read();
              if (next.done) { const tail = decoder.decode(); if (tail) record.chunks.push(tail); break; }
              record.bytes += next.value.byteLength;
              if (record.bytes > MAX) throw Error("Writing response buffer is full. Stop and retry the suggestion");
              record.chunks.push(decoder.decode(next.value, { stream: true }));
            }
          record.state = "complete";
        } catch (error) {
          record.error = both.aborted ? "Writing stopped" : error.message;
          record.state = both.aborted ? "stopped" : "error";
          controller.abort();
          if (record.reader) await record.reader.cancel().catch(() => {});
          else await response?.body?.cancel().catch(() => {});
        } finally { record.done = true; }
      })();
      pending.add(task); void task.finally(() => pending.delete(task));
      return { ok: true, status: 200, headers: { "content-type": "text/event-stream" }, streamId: id };
    },
    poll(id) {
      if (closed) throw Error("Writing service is closed");
      const record = streams.get(id); if (!record) throw Error("Unknown writing request");
      const chunks = []; let size = 0;
      while (record.chunks.length && size < 256 * 1024) { const text = record.chunks.shift(); chunks.push(text); const bytes = Buffer.byteLength(text); size += bytes; record.bytes = Math.max(0, record.bytes - bytes); }
      record.lastPoll = Date.now(); const done = record.done && !record.chunks.length;
      if (done) streams.delete(id);
      return { chunks, done, state: record.state, ...(record.error ? { error: record.error } : {}) };
    },
    cancel(id) { const record = streams.get(id); if (!record) throw Error("Unknown writing request"); stop(record); streams.delete(id); return { stopped: true }; },
    async dispose() { closed = true; clearInterval(timer); [...streams.values()].forEach(record => stop(record)); streams.clear(); await Promise.allSettled([...pending]); }
  };
}
module.exports = { createStreams };
