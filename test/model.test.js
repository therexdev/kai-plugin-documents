"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),m=require("../plugin/model");
test("document search matches titles and previews without altering saved order",()=>{const rows=[{id:"1",title:"KAI plan",preview:"core migration"},{id:"2",title:"Notes",preview:"private Brain"}];assert.deepEqual(m.filterDocuments(rows," BRAIN "),[rows[1]]);assert.equal(m.filterDocuments(rows,"").length,2);assert.equal(rows[0].id,"1");});
test("draft proposal preserves document identity and revision without mutating saved content",()=>{const d={id:"old",revision:"version",content:"saved"};const next=m.applyProposal(d,"proposed");assert.equal(next.id,"old");assert.equal(next.revision,"version");assert.equal(next.content,"proposed");assert.equal(d.content,"saved");});
test("invalid and oversized proposals cannot enter the editor",()=>{assert.throws(()=>m.applyProposal({},{}),/Invalid/);assert.throws(()=>m.applyProposal({},"x".repeat(1000001)),/Invalid/);});
test("word count handles empty drafts and mixed whitespace",()=>{assert.equal(m.wordCount(" \n\t"),0);assert.equal(m.wordCount("one\ntwo\tthree"),3);});
