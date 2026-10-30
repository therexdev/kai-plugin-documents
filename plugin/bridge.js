"use strict";
// The sandboxed writing UI calls its own installed native service.
// Shared inference goes through the public Foundation API.
const $ = id => document.getElementById(id);
const state = { alias: "" };
let pickable = [];
const esc2 = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const call = (method, input) => window.kai.call(method, input);
async function pluginResponse(feature, result, signal) {
  if (signal?.aborted) { if(result.streamId) await call(feature + ".cancel", {streamId: result.streamId}).catch(()=>{}); throw new DOMException("Stopped", "AbortError"); }
  if (!result.streamId) return new Response(typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? {}), {status: result.status || 200, headers: result.headers || {"content-type":"application/json"}});
  let stopped = false, controller;
  const cancel = async () => { if (stopped) return; stopped = true; signal?.removeEventListener("abort", abort); await call(feature + ".cancel", {streamId:result.streamId}).catch(()=>{}); };
  const abort = () => { void cancel(); try { controller?.error(new DOMException("Stopped", "AbortError")); } catch {} };
  const body = new ReadableStream({
    start(c) { controller = c; signal?.addEventListener("abort", abort, {once:true}); if(signal?.aborted) abort(); },
    async pull(c) {
      if(stopped)return;
      try {
        const next=await call(feature+".poll",{streamId:result.streamId});
        if(stopped)return;
        for(const text of next.chunks||[])c.enqueue(new TextEncoder().encode(text));
        if(next.error)throw Error(next.error);
        if(next.done){stopped=true;signal?.removeEventListener("abort",abort);c.close();}
        else if(!next.chunks?.length)await new Promise(resolve=>setTimeout(resolve,150));
      } catch(error){if(!stopped){await cancel();c.error(error);}}
    },
    cancel
  });
  return new Response(body,{status:result.status||200,headers:result.headers||{"content-type":"text/event-stream"}});
}
async function* sseDeltas(body) {
  const decoder=new TextDecoder();let buffer="";
  for await(const chunk of body){buffer+=decoder.decode(chunk,{stream:true});let end;
    while((end=buffer.indexOf("\n\n"))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
      for(const line of frame.split("\n")){if(!line.startsWith("data: "))continue;const value=line.slice(6).trim();if(value==="[DONE]")return;
        try{const event=JSON.parse(value);if(event.error)throw Error(event.error.message||event.error);yield{content:event.choices?.[0]?.delta?.content||"",model:event.model||null};}catch(error){if(error.name!=="SyntaxError")throw error;}
      }
    }
  }
}

const documentRevisions = new Map();
window.fetch = async (path, options = {}) => {
  options.signal?.throwIfAborted();
  const method=options.method||"GET", input=options.body?JSON.parse(options.body):{};
  let body;
  if(path==="/core/docs"&&method==="GET") { const r=await call("documents.list",{}); body={ok:true,docs:r.documents,warnings:r.errors}; }
  else if(path==="/core/docs"&&method==="POST") {
    const saved=await call("documents.save",{...input,revision:input.id?documentRevisions.get(input.id):undefined});documentRevisions.set(saved.id,saved.revision);body={ok:true,...saved};
  }
  else if(/^\/core\/docs\/[a-z0-9-]+$/.test(path)&&["GET","DELETE"].includes(method)) {
    const id=path.slice("/core/docs/".length);
    if(method==="GET"){const d=await call("documents.get",{id});documentRevisions.set(id,d.revision);body={ok:true,doc:d};}
    else {if(!documentRevisions.has(id)){const d=await call("documents.get",{id});documentRevisions.set(id,d.revision);}const r=await call("documents.remove",{id,revision:documentRevisions.get(id)});body={ok:!r.cancelled,...r};}
  }
  else if(path==="/core/chat/completions"&&method==="POST") {
    return pluginResponse("documents",await call("documents.ai",{...input,stream:true}),options.signal);
  } else throw Error("Unsupported Documents operation");
  return new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json"}});
};
async function coreGet(path){const response=await window.fetch(path),body=await response.json();if(!response.ok||body.ok===false)throw Error(body.error?.message||body.error||"Document request failed");return body;}
