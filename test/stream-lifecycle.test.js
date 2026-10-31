"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { createStreams } = require("../plugin/service/streams");
const fixture = require("./bridge-fixture");
const source = fs.readFileSync(path.join(__dirname, "../plugin/bridge.js"), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));
const frame = text => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

async function within(promise, ms = 1500) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Writing stream stalled")), ms); })]); }
  finally { clearTimeout(timer); }
}

test("renderer keeps polling through delayed first text and gaps between tokens", async () => {
  let polls = 0;
  const f = fixture(source, async method => {
    if (method === "documents.ai") return { status: 200, streamId: "draft" };
    polls++;
    if (polls === 4) return { chunks: [frame("First ")], done: false };
    if (polls === 7) return { chunks: [frame("second")], done: true };
    return { chunks: [], done: false };
  });
  const response = await f.window.fetch("/core/chat/completions", { method: "POST", body: '{"messages":[]}' });
  let text = "";
  await within((async () => { for await (const part of f.context.sseDeltas(response.body)) text += part.content; })());
  assert.equal(text, "First second"); assert.equal(polls, 7);
});

test("Stop while waiting for a first token cancels the native stream and pending read", async () => {
  const controller = new AbortController(); let cancelled = 0, polls = 0;
  const f = fixture(source, async method => {
    if (method === "documents.ai") return { streamId: "draft" };
    if (method === "documents.cancel") { cancelled++; return {}; }
    polls++; return { chunks: [], done: false };
  });
  const response = await f.window.fetch("/core/chat/completions", { method: "POST", body: '{"messages":[]}', signal: controller.signal });
  const read = response.body.getReader().read(); await tick(); controller.abort();
  await assert.rejects(within(read), { name: "AbortError" });
  const stoppedPolls = polls; await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(cancelled, 1); assert.equal(polls, stoppedPolls);
});

test("native writing handle is immediately cancellable while model headers are pending", async t => {
  let signal, rejectRequest;
  const streams = createStreams((_input, s) => { signal = s; return new Promise((_, reject) => { rejectRequest = reject; s.addEventListener("abort", () => reject(Error("aborted")), { once: true }); }); });
  t.after(() => streams.dispose());
  const handle = await within(streams.request({}), 100);
  assert.equal(streams.poll(handle.streamId).state, "waiting");
  streams.cancel(handle.streamId); assert.equal(signal.aborted, true);
  await streams.dispose(); assert.throws(() => streams.poll(handle.streamId), /closed/);
  assert.equal(typeof rejectRequest, "function");
});

test("late model response after cancellation is discarded and its body closed", async t => {
  let resolveRequest, cancelled = 0;
  const streams = createStreams(() => new Promise(resolve => { resolveRequest = resolve; })); t.after(() => streams.dispose());
  const handle = await streams.request({}); streams.cancel(handle.streamId);
  resolveRequest(new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await streams.dispose(); assert.equal(cancelled, 1);
});

test("one cancelled suggestion does not cancel another owned request", async t => {
  const signals = [];
  const streams = createStreams((_input, signal) => {
    signals.push(signal);
    return new Promise((resolve, reject) => { signal.addEventListener("abort", () => reject(Error("Stopped")), { once: true }); });
  }); t.after(() => streams.dispose());
  const a = await streams.request({}), b = await streams.request({});
  streams.cancel(a.streamId); assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false);
  assert.equal(streams.poll(b.streamId).state, "waiting");
  await streams.dispose(); assert.equal(signals[1].aborted, true);
});

test("model HTTP failures reach the editor as actionable errors", async t => {
  const streams = createStreams(async () => new Response(JSON.stringify({ error: { message: "Choose an installed local model" } }), { status: 400, headers: { "content-type": "application/json" } }));
  t.after(() => streams.dispose());
  const f = fixture(source, (method, input) => method === "documents.ai" ? streams.request(input) : method === "documents.poll" ? streams.poll(input.streamId) : streams.cancel(input.streamId));
  const response = await f.window.fetch("/core/chat/completions", { method: "POST", body: '{"messages":[]}' });
  await assert.rejects(within(response.text()), /Choose an installed local model/);
});

test("SSE supports CRLF split across chunks, data without a space and final unterminated frames", async () => {
  const f = fixture(source, () => {}), encoder = new TextEncoder();
  const parts = ['data:{"choices":[{"delta":{"content":"One "}}]}\r', '\n\r', '\ndata: {"choices":[{"delta":{"content":"two"}}]}'];
  const body = new ReadableStream({ start(c) { parts.forEach(part => c.enqueue(encoder.encode(part))); c.close(); } });
  let result = ""; for await (const part of f.context.sseDeltas(body)) result += part.content;
  assert.equal(result, "One two");
});

test("SSE errors and malformed frames fail visibly instead of ending as an empty suggestion", async () => {
  for (const value of ['data: {"error":{"message":"The model stopped responding"}}\n\n', 'data: {broken}\n\n']) {
    const f = fixture(source, () => {});
    await assert.rejects((async () => { for await (const _ of f.context.sseDeltas(new Response(value).body)) {} })(), /model stopped responding|invalid suggestion stream/);
  }
});
