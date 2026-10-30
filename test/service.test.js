"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { create } = require("../plugin/service/index"), { create: createDocuments, MAX_REQUEST_BYTES } = require("../plugin/service/documents");
function fixture(t, extra = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kai-documents-native-")), services = new Map(), controller = new AbortController();
  const api = { version: 1, plugin: { dataDir }, signal: controller.signal,
    models: { request: async () => new Response('data: {"choices":[{"delta":{"content":"A suggestion"}}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } }), chat: async () => ({ choices: [{ message: { content: "A draft" } }] }) },
    settings: { get: (_key, fallback) => fallback }, desktop: { confirm: async () => true, preferences: () => ({ language: "en" }) },
    services: { provide(name, spec) { services.set(name, spec); } }, ...extra };
  const service = create(api); t.after(async () => { await service.dispose(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { api, service, dataDir, services, controller, call: (...args) => service.call(...args) };
}
test("native service owns its files and enforces revision updates and cancellation", async t => {
  const f = fixture(t), first = await f.call("documents.save", { title: "Draft", content: "Private text" });
  assert.equal((await f.call("documents.list")).documents.length, 1);
  const edited = await f.call("documents.save", { ...first, content: "Changed" });
  await assert.rejects(f.call("documents.save", { ...first, content: "Stale" }), /changed/);
  f.api.desktop.confirm = async () => false;
  assert.deepEqual(await f.call("documents.remove", { id: edited.id, revision: edited.revision }), { cancelled: true });
  assert.equal((await f.call("documents.get", { id: first.id })).content, "Changed");
  assert.equal(fs.readdirSync(f.dataDir).join(), "docs");
});
test("invalid records, paths and oversized writes cannot replace valid files", async t => {
  const f = fixture(t), first = await f.call("documents.save", { title: "Keep", content: "Original" });
  const file = path.join(f.dataDir, "docs", first.id + ".json"), before = fs.readFileSync(file);
  await assert.rejects(f.call("documents.get", { id: "../../private" }), /bad doc id/);
  await assert.rejects(f.call("documents.save", { ...first, content: "🙂".repeat(Math.ceil(MAX_REQUEST_BYTES / 4)) }), /10 MiB/);
  assert.deepEqual(fs.readFileSync(file), before);
  fs.writeFileSync(file, "invalid data"); await assert.rejects(f.call("documents.save", first), /unreadable/);
  assert.equal(fs.readFileSync(file, "utf8"), "invalid data");
});
test("large document metadata remains intact across a supported update", async t => {
  const f = fixture(t), content = "Document line.\n".repeat(150000), saved = await f.call("documents.save", { content });
  const opened = await f.call("documents.get", { id: saved.id }); assert.equal(opened.content, content);
  const updated = await f.call("documents.save", { ...opened, content: content + "Final line" });
  assert.equal(updated.createdAt, saved.createdAt); assert.equal(updated.content, content + "Final line");
});
test("AI suggestions stream from the public inference API and never save without applying", async t => {
  const f = fixture(t), stream = await f.call("documents.ai", { model: "local", messages: [{ role: "user", content: "Improve selected passage" }] });
  let result, text = "";
  for (let count = 0; count < 20; count++) { result = await f.call("documents.poll", { streamId: stream.streamId }); text += result.chunks.join(""); if (result.done) break; await new Promise(resolve => setTimeout(resolve, 1)); }
  assert.equal(result.done, true); assert.match(text, /A suggestion/); assert.deepEqual((await f.call("documents.list")).documents, []);
  assert.deepEqual(await f.call("documents.draft", { model: "local", prompt: "Write a draft" }), { text: "A draft", saved: false });
});
test("stream cancellation and plugin shutdown abort pending model generation", async t => {
  const signals = [];
  const f = fixture(t, { models: { request: async (_input, signal) => { signals.push(signal); return new Response(new ReadableStream({ cancel() {} }), { headers: { "content-type": "text/event-stream" } }); } } });
  const a = await f.call("documents.ai", { model: "local", messages: [] });
  await f.call("documents.cancel", { streamId: a.streamId }); assert.equal(signals[0].aborted, true);
  await assert.rejects(f.call("documents.poll", { streamId: a.streamId }), /Unknown/);
  await f.call("documents.ai", { model: "local", messages: [] }); await f.service.dispose(); assert.equal(signals[1].aborted, true);
  await assert.rejects(f.call("documents.list"), /abort/i);
});
test("shared Documents service denies remote jobs and preserves revision requirements", async t => {
  const f = fixture(t), exported = f.services.get("kai.documents");
  assert.deepEqual(exported.methods, ["list", "get", "save", "remove"]);
  assert.throws(() => exported.call("list", {}, { remote: true }), /Remote jobs/);
  const saved = await exported.call("save", { content: "Local authorized text" });
  await assert.rejects(exported.call("save", { id: saved.id, content: "No revision" }), /changed/);
});
test("native import and export retain content and use chosen paths", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kai-doc-files-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, "chosen.md"), output = path.join(dir, "export.md"); fs.writeFileSync(input, "# Selected file\nContent");
  const service = createDocuments({ dataDir: dir, electron: { dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [input] }), showSaveDialog: async () => ({ canceled: false, filePath: output }) } }, getWindow: () => null, confirm: async () => true });
  t.after(() => service.dispose());
  const imported = await service.call("documents.import"); assert.equal(imported.content, "# Selected file\nContent");
  assert.equal((await service.call("documents.export", { id: imported.id, revision: imported.revision })).exported, true);
  assert.equal(fs.readFileSync(output, "utf8"), imported.content);
});
