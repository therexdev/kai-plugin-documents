"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../plugin/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../plugin/index.html"), "utf8");
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
function fixture() {
  const elements = new Map(), calls = [], messages = [];
  let resolveGet;
  const saved = [{ id: "first", revision: "first-revision", title: "First document", content: "First saved text", words: 3 }, { id: "second", revision: "second-revision", title: "Second document", content: "Second saved text", words: 3 }];
  function element(tagName = "div") {
    return { tagName, value: "", textContent: "", hidden: false, disabled: false, children: [], dataset: {},
      classList: { toggle() {} }, append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
      get options() { return this.children; }, focus() {} };
  }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, element());
  const $ = id => { assert.ok(elements.has(id), `Missing DOM element ${id}`); return elements.get(id); };
  const context = vm.createContext({
    window: { DocumentModel: require("../plugin/model"), confirm: () => true, KaiPluginNotice: { attach: () => ({ show: message => messages.push(message), clear() {} }) },
      kai: { async call(method, input) {
        calls.push({ method, input });
        if (method === "documents.list") return { documents: saved, errors: [] };
        if (method === "models.list") return [];
        if (method === "documents.get") return input.id === "first" ? { ...saved[0] } : new Promise(resolve => { resolveGet = resolve; });
        if (method === "documents.save") return { ...input, revision: "saved-revision" };
        throw Error(`Unexpected broker method ${method}`);
      } },
    },
    document: { getElementById: $, createElement: element, querySelectorAll: selector => selector === "[data-action],#draft" ? [$("draft")] : [] },
  });
  vm.runInContext(source, context, { filename: "app.js" });
  return { $, calls, messages, finishGet: () => resolveGet({ ...saved[1] }), async openFirst() { await flush(); await $("list").children[0].onclick(); } };
}

for (const [field, changed] of [["content", "Text typed while the next document loads"], ["title", "Title typed while the next document loads"]]) {
  test(`delayed document switching preserves newer ${field} edits and the original save identity`, async () => {
    const f = fixture(); await f.openFirst();
    const switching = f.$("list").children[1].onclick();
    f.$(field).value = changed; f.$("document-form").oninput();
    f.finishGet(); await switching;
    assert.equal(f.$(field).value, changed);
    assert.equal(f.$(field === "content" ? "title" : "content").value, field === "content" ? "First document" : "First saved text");
    assert.match(f.$("status").textContent, /Unsaved changes/);
    assert.equal(f.calls.filter(call => call.method === "documents.save").length, 0);
    f.$("document-form").onsubmit({ preventDefault() {}, submitter: f.$("save") }); await flush();
    const write = f.calls.find(call => call.method === "documents.save");
    assert.equal(write.input.id, "first"); assert.equal(write.input.revision, "first-revision"); assert.equal(write.input[field], changed);
  });
}

test("a delayed document switch still opens the chosen document when no edits intervene", async () => {
  const f = fixture(); await f.openFirst();
  const switching = f.$("list").children[1].onclick(); f.finishGet(); await switching;
  assert.equal(f.$("title").value, "Second document"); assert.equal(f.$("content").value, "Second saved text");
  assert.match(f.$("status").textContent, /Saved/);
});
