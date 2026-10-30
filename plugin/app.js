"use strict";

/* Documents view + custom model import — loaded after app.js/app-extras.js,
 * sharing their top-level scope. */

// ---------- documents ----------

const doc = { id: null, dirty: false, saveTimer: null, abort: null, target: null, generation: 0, version: 0, saveChain: Promise.resolve() };

async function renderDocs() {
  // Model select mirrors the chat picker.
  const sel = $("doc-model");
  const prev = sel.value;
  sel.innerHTML = "";
  for (const w of pickable) {
    const o = document.createElement("option");
    o.value = w.v;
    o.textContent = w.label;
    sel.appendChild(o);
  }
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  await refreshDocList();
  updateDocWords();
}

async function refreshDocList() {
  let j;
  try { j = await coreGet("/core/docs"); } catch { return; }
  const host = $("doc-list");
  const docs = j.docs || [];
  host.innerHTML = docs.length
    ? docs
        .map(
          (d) => KaiI18n.html`<div class="doc-row${d.id === doc.id ? " active" : ""}" data-id="${esc2(d.id)}">
            <div class="doc-row-title">${esc2(d.title)}</div>
            <div class="doc-row-sub">${d.words} words</div>
            <button class="chat-del" data-del="${esc2(d.id)}" title="Delete document">×</button>
          </div>`
        )
        .join("")
    : KaiI18n.html`<div class="chat-list-empty">Documents you write live here — on this machine, nowhere else.</div>`;
}

function updateDocWords() {
  const t = $("doc-body").value.trim();
  $("doc-words").textContent = t ? `${t.split(/\s+/).length} words` : "";
}

async function saveDoc(now) {
  clearTimeout(doc.saveTimer);
  const run = () => {
    const generation = doc.generation;
    doc.saveChain = doc.saveChain.catch(() => {}).then(async () => {
      if (generation !== doc.generation) return false;
      const content = $("doc-body").value, title = $("doc-title").value.trim(), version = doc.version;
      if (!content && !title && !doc.id) return true;
      try {
        const response = await fetch("/core/docs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: doc.id, title, content }) });
        const result = await response.json(); if (!result.ok) throw Error(result.error || "Document was not saved");
        if (generation !== doc.generation) return false;
        doc.id = result.id; doc.dirty = version !== doc.version;
        if (!$("doc-title").value && result.title !== "Untitled") $("doc-title").placeholder = result.title;
        $("doc-saved").textContent = doc.dirty ? "Saving newer changes…" : "Saved ✓";
        await refreshDocList(); return !doc.dirty;
      } catch (error) { if (generation === doc.generation) { doc.dirty = true; $("doc-saved").textContent = "Not saved: " + error.message; } return false; }
    });
    return doc.saveChain;
  };
  if (now) return run();
  doc.saveTimer = setTimeout(run, 800);
}
function documentEdited() {
  doc.dirty = true; doc.version++; updateDocWords(); $("doc-saved").textContent = "Saving…";
  if (doc.target && (doc.target.generation !== doc.generation || doc.target.content !== $("doc-body").value)) { $("doc-apply").disabled = true; $("doc-suggest-target").textContent = "Document changed · generate a new suggestion"; }
  saveDoc();
}

$("doc-body").addEventListener("input", documentEdited);
$("doc-title").addEventListener("input", documentEdited);

$("btn-new-doc").addEventListener("click", async () => {
  if (!await saveDoc(true)) return;
  doc.generation++; doc.version++; doc.dirty = false;
  doc.id = null;
  $("doc-title").value = "";
  $("doc-title").placeholder = "Title";
  $("doc-body").value = "";
  hideSuggest();
  updateDocWords();
  refreshDocList();
  $("doc-body").focus();
});

$("doc-list").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    e.stopPropagation();
    const response = await fetch(`/core/docs/${del.dataset.del}`, { method: "DELETE" });
    const result = await response.json(); if (result.cancelled || !result.ok) return;
    if (doc.id === del.dataset.del) {
      doc.generation++; doc.version++; doc.dirty = false; hideSuggest();
      doc.id = null;
      $("doc-title").value = "";
      $("doc-body").value = "";
      updateDocWords();
    }
    refreshDocList();
    return;
  }
  const row = e.target.closest(".doc-row");
  if (!row) return;
  if (!await saveDoc(true)) return;
  const generation = doc.generation, version = doc.version;
  try {
    const j = await coreGet(`/core/docs/${row.dataset.id}`);
    if (generation !== doc.generation || version !== doc.version) return;
    doc.generation++; doc.version++; doc.dirty = false;
    doc.id = j.doc.id;
    $("doc-title").value = j.doc.title === "Untitled" ? "" : j.doc.title;
    $("doc-body").value = j.doc.content || "";
    hideSuggest();
    updateDocWords();
    refreshDocList();
  } catch (error) { $("doc-saved").textContent = error.message; }
});

// ----- AI assist: preview first, Apply is the only thing that writes -----

const DOC_ACTIONS = {
  improve: "Improve this text: tighten the wording, fix awkward phrasing, keep the author's voice and meaning.",
  grammar: "Fix spelling, grammar, and punctuation only. Change nothing else about the wording.",
  shorten: "Rewrite this text at roughly half the length without losing its key points.",
  expand: "Expand this text with more detail and concrete examples, keeping the author's voice.",
  continue: "Continue writing from where this text ends, matching its tone and style. Return ONLY the continuation.",
};

function hideSuggest() {
  doc.abort?.abort(); doc.abort = null;
  $("doc-suggest").hidden = true;
  $("doc-suggest-body").textContent = "";
  doc.target = null;
}

async function runDocAction(instruction, label) {
  if (!$("doc-body").value.trim()) return;
  const ta = $("doc-body");
  const selStart = ta.selectionStart;
  const selEnd = ta.selectionEnd;
  const hasSel = selEnd > selStart;
  const target = hasSel ? { start: selStart, end: selEnd } : { start: 0, end: ta.value.length };
  const text = ta.value.slice(target.start, target.end);
  hideSuggest();
  doc.target = { ...target, content: ta.value, generation: doc.generation, mode: label === "Continue" ? "append" : "replace" };
  const proposalTarget = doc.target;

  $("doc-suggest").hidden = false;
  $("doc-suggest-label").textContent = label;
  KaiI18n.setText($("doc-suggest-target"), hasSel ? "on your selection" : "on the whole document");
  $("doc-suggest-body").textContent = "";
  $("doc-apply").disabled = true;
  $("doc-suggest-stop").hidden = false;
  doc.abort = new AbortController();
  try {
    const resp = await fetch("/core/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: doc.abort.signal,
      body: JSON.stringify({
        model: $("doc-model").value || state.alias,
        stream: true,
        messages: [
          {
            role: "system",
            content:
              "You are a precise writing assistant. Reply with ONLY the revised text — no preamble, no explanations, no quotation marks around it.",
          },
          { role: "user", content: `${instruction}\n\n---\n${text}` },
        ],
      }),
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => null);
      throw new Error(j?.error?.message || `Core answered ${resp.status}`);
    }
    let acc = "";
    let lastPaint = 0;
    for await (const { content } of sseDeltas(resp.body)) {
      if (!content) continue;
      if (doc.target !== proposalTarget) return;
      acc += content;
      const now = performance.now();
      if (now - lastPaint > 80) {
        $("doc-suggest-body").textContent = acc;
        lastPaint = now;
      }
    }
    if (doc.target !== proposalTarget) return;
    $("doc-suggest-body").textContent = acc.trim();
    $("doc-apply").disabled = !acc.trim() || doc.target.content !== $("doc-body").value || doc.target.generation !== doc.generation;
  } catch (e) {
    if (doc.target === proposalTarget && e.name !== "AbortError") KaiI18n.setText($("doc-suggest-body"), KaiI18n.message`Couldn't get a suggestion: ${e.message}`);
  } finally {
    if (doc.target === proposalTarget) { $("doc-suggest-stop").hidden = true; doc.abort = null; }
  }
}

document.querySelectorAll(".doc-act[data-act]").forEach((b) =>
  b.addEventListener("click", () => runDocAction(DOC_ACTIONS[b.dataset.act], b.textContent))
);
$("doc-custom-go").addEventListener("click", () => {
  const inst = $("doc-custom").value.trim();
  if (inst) runDocAction(inst, "Custom edit");
});
$("doc-custom").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("doc-custom-go").click();
});

$("doc-apply").addEventListener("click", () => {
  const s = $("doc-suggest-body").textContent;
  if (!s || !doc.target) return;
  if (doc.target.generation !== doc.generation || doc.target.content !== $("doc-body").value) { $("doc-apply").disabled = true; $("doc-suggest-target").textContent = "Document changed · generate a new suggestion"; return; }
  const ta = $("doc-body");
  const v = ta.value;
  if (doc.target.mode === "append") {
    const glue = v.endsWith("\n") || !v ? "" : v.endsWith(" ") ? "" : " ";
    ta.value = v.slice(0, doc.target.end) + glue + s + v.slice(doc.target.end);
  } else {
    ta.value = v.slice(0, doc.target.start) + s + v.slice(doc.target.end);
  }
  hideSuggest();
  documentEdited();
  saveDoc(true);
});
$("doc-discard").addEventListener("click", hideSuggest);
$("doc-suggest-stop").addEventListener("click", () => doc.abort?.abort());


$("doc-import").addEventListener("click", async () => {
  if (!await saveDoc(true)) return;
  const generation = doc.generation, version = doc.version;
  try { const result = await call("documents.import", {}); if (result.cancelled) return;
    documentRevisions.set(result.id, result.revision);
    if (generation === doc.generation && version === doc.version) { doc.generation++; doc.version++; doc.id = result.id; doc.dirty = false; $("doc-title").value = result.title; $("doc-body").value = result.content; hideSuggest(); updateDocWords(); }
    await refreshDocList();
  } catch (error) { $("doc-saved").textContent = error.message; }
});
$("doc-export").addEventListener("click", async () => {
  if (!await saveDoc(true) || !doc.id) return;
  try { const result = await call("documents.export", {id:doc.id,revision:documentRevisions.get(doc.id)}); if (!result.cancelled) $("doc-saved").textContent = "Exported " + result.name; }
  catch (error) { $("doc-saved").textContent = error.message; }
});
(async () => {
  try { const preferences = await call("desktop.preferencesRead", {keys:["kai-interface-language"]}); if (preferences["kai-interface-language"]) KaiI18n.setLanguage(preferences["kai-interface-language"]); const models = await call("models.list", {}); pickable = models.filter(model => model.status === "ready").map(model => ({v:model.alias,label:model.label||model.alias})); state.alias = pickable[0]?.v || ""; await renderDocs(); }
  catch (error) { $("doc-saved").textContent = error.message; }
})();
