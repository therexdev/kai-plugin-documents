"use strict";
const $ = id => document.getElementById(id), call = (method, input) => window.kai.call(method, input), model = window.DocumentModel;
const banner = window.KaiPluginNotice.attach($("message"), { focusTarget: () => $("content") });
let rows = [], current = {}, dirty = false, proposal = "", editVersion = 0, documentGeneration = 0, proposalTarget = null, drafting = false, readyModels = false;
const actions = {
  improve: ["Improve", "Improve this text: tighten the wording, fix awkward phrasing, keep the author's voice and meaning."],
  grammar: ["Fix grammar", "Fix spelling, grammar, and punctuation only. Change nothing else about the wording."],
  shorten: ["Shorten", "Rewrite this text at roughly half the length without losing its key points."],
  expand: ["Expand", "Expand this text with more detail and concrete examples, keeping the author's voice."],
  continue: ["Continue", "Continue writing from where this text ends, matching its tone and style. Return ONLY the continuation."],
};
function message(value, error = false) { banner.show(value, { error, force: true }); }
async function act(button, fn) { if (button) button.disabled = true; try { return await fn(); } catch (e) { message(e.message, true); } finally { if (button) button.disabled = false; } }
function canLeave() { return !dirty || window.confirm("Discard unsaved document changes?"); }
function clearProposal() { $("proposal").hidden = true; proposal = ""; proposalTarget = null; }
function show() {
  $("title").value = current.title || ""; $("content").value = current.content || "";
  $("export").disabled = !current.id; $("remove").disabled = !current.id;
  dirty = false; editVersion++; documentGeneration++; clearProposal(); status(); draw();
}
function status() {
  $("status").textContent = `${model.wordCount($("content").value)} words · ${dirty ? "Unsaved changes" : current.id ? "Saved" : "New document"}`;
  if (proposalTarget) {
    const stale = proposalTarget.generation !== documentGeneration || proposalTarget.content !== $("content").value;
    $("apply-draft").disabled = stale;
    $("proposal-target").textContent = stale ? "Document changed · generate a new suggestion" : proposalTarget.label;
  }
}
function draw() {
  const box = $("list"); box.replaceChildren(); const found = model.filterDocuments(rows, $("search").value);
  $("count").textContent = `${found.length} document${found.length === 1 ? "" : "s"}`;
  if (!found.length) { const empty = document.createElement("p"); empty.textContent = "Documents you write live here — on this machine, nowhere else."; box.append(empty); }
  for (const doc of found) {
    const button = document.createElement("button"), title = document.createElement("strong"), preview = document.createElement("small");
    title.textContent = doc.title; preview.textContent = `${doc.words} words`; button.title = doc.preview || doc.title;
    button.append(title, preview); button.classList.toggle("selected", doc.id === current.id);
    button.onclick = () => act(button, async () => { if (!canLeave()) return; const generation = documentGeneration, version = editVersion, loaded = await call("documents.get", { id: doc.id }); if (generation !== documentGeneration || version !== editVersion) return; current = loaded; show(); banner.clear(); });
    box.append(button);
  }
}
async function load() {
  const result = await call("documents.list", {}); rows = result.documents; draw();
  if (result.errors.length) message(`${result.errors.length} unreadable document(s) were preserved. They were not overwritten.`, true);
}
$("new").onclick = () => { if (canLeave()) { current = {}; show(); banner.clear(); $("title").focus(); } }; $("search").oninput = draw;
$("document-form").oninput = () => { dirty = true; editVersion++; status(); };
$("document-form").onsubmit = event => {
  event.preventDefault(); const version = editVersion, generation = documentGeneration;
  void act(event.submitter, async () => {
    const saved = await call("documents.save", { id: current.id, revision: current.revision, title: $("title").value, content: $("content").value });
    if (generation === documentGeneration) {
      current = saved; $("export").disabled = false; $("remove").disabled = false;
      if (editVersion === version) dirty = false; status();
      message(editVersion === version ? "Document saved." : "Saved the submitted version. Your newer edits are still unsaved.");
    }
    await load();
  });
};
$("remove").onclick = event => act(event.currentTarget, async () => { const generation = documentGeneration, result = await call("documents.remove", { id: current.id, revision: current.revision }); if (!result.cancelled) { if (generation === documentGeneration) { current = {}; show(); } await load(); message("Document deleted."); } });
$("export").onclick = event => act(event.currentTarget, async () => { if (dirty) throw Error("Save your changes before exporting."); const result = await call("documents.export", { id: current.id, revision: current.revision }); if (!result.cancelled) message(`Exported ${result.name}.`); });
$("import").onclick = event => act(event.currentTarget, async () => { if (!canLeave()) return; const generation = documentGeneration, version = editVersion, result = await call("documents.import", {}); if (!result.cancelled) { if (generation === documentGeneration && version === editVersion) { current = result; show(); } await load(); message("Document imported."); } });
function draftControls() { for (const button of document.querySelectorAll("[data-action],#draft")) button.disabled = drafting || !readyModels; $("model").disabled = drafting || !readyModels; }
async function generate(instruction, label, mode = "replace") {
  if (drafting || !readyModels) return;
  if (!instruction.trim()) { message("Describe what you want to write or change.", true); return; }
  const content = $("content").value, start = $("content").selectionStart, end = $("content").selectionEnd, selection = end > start;
  const target = { generation: documentGeneration, content, start: selection ? start : 0, end: selection ? end : content.length, mode, label: selection ? "on your selection" : "on the whole document" };
  const context = content.slice(target.start, target.end);
  if (instruction.length + context.length > 15000) { message("Select a shorter section. Instructions and draft context together must be under 15,000 characters.", true); return; }
  clearProposal(); drafting = true; draftControls(); $("draft-status").textContent = "Preparing suggestion with your local model…";
  try {
    const result = await call("documents.draft", { model: $("model").value, prompt: instruction, content: context });
    if (documentGeneration !== target.generation) return;
    proposal = result.text; proposalTarget = target; $("draft-text").textContent = proposal;
    $("proposal-label").textContent = label; $("proposal").hidden = false; status();
  } catch (error) { if (documentGeneration === target.generation) message(error.message, true); }
  finally { drafting = false; draftControls(); $("draft-status").textContent = "Suggestions use a local model. Apply, then Save, to keep your changes."; }
}
$("draft").onclick = () => { void generate($("prompt").value, "Suggestion"); };
$("prompt").onkeydown = event => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); void generate(event.target.value, "Suggestion"); } };
for (const button of document.querySelectorAll("[data-action]")) button.onclick = () => { const [label, instruction] = actions[button.dataset.action]; void generate(instruction, label, button.dataset.action === "continue" ? "append" : "replace"); };
$("apply-draft").onclick = () => {
  try {
    if (!proposalTarget || proposalTarget.generation !== documentGeneration) throw Error("This suggestion belongs to another document. Generate a new suggestion.");
    $("content").value = model.applySuggestion($("content").value, proposal, proposalTarget);
    dirty = true; editVersion++; clearProposal(); status(); message("Suggestion applied to the editor. Save when ready.");
  } catch (error) { message(error.message, true); }
};
$("discard-draft").onclick = clearProposal; $("close-proposal").onclick = clearProposal;
show(); draftControls();
void act(null, async () => {
  await load(); const list = await call("models.list");
  for (const item of list.filter(item => item.status === "ready")) { const option = document.createElement("option"); option.value = item.alias; option.textContent = item.label || item.alias; $("model").append(option); }
  readyModels = !!$("model").options.length;
  if (!readyModels) { const option = document.createElement("option"); option.textContent = "Install a local model in KAI Core first"; $("model").append(option); }
  draftControls();
});
