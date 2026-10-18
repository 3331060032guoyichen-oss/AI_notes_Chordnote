"use client";
import { useEffect, useState } from "react";
type Item = { id:string;kind:"raw"|"knowledge"|"relation";title:string|null;path:string;dependencies:{revisions:number;relations:number;proposals:number} };
export function ArchivePanel() {
  const [items,setItems] = useState<Item[]>([]), [chosen,setChosen] = useState<Item|null>(null), [reason,setReason] = useState(""), [consent,setConsent] = useState(false), [status,setStatus] = useState("");
  const [busy,setBusy] = useState(false);
  async function load() { const r = await fetch("/api/archive"); const p = await r.json(); if (!r.ok) throw new Error("归档读取失败"); setItems(p.items); }
  useEffect(() => { void load().catch(e => setStatus(e.message)); }, []);
  async function act(item:Item, purge:boolean) {
    if(busy)return;
    setBusy(true);
    try {
    const r = await fetch("/api/archive", {method:purge?"DELETE":"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({...item,reason,confirmDependencies:consent})}); const p = await r.json();
    if (!r.ok) {setStatus(p.error?.message??"操作失败");return;} setChosen(null);setReason("");setConsent(false);setStatus(purge?"已永久删除":item.kind==="relation"?"关系已恢复":"已恢复原路径");await load();window.dispatchEvent(new Event("chordnote-documents-changed"));
    } catch(e) {setStatus(e instanceof Error ? e.message : "操作失败");} finally {setBusy(false);}
  }
  return <section className="archive-panel"><h1>归档</h1>{items.map(item => <article className="archive-row" key={item.id}><div><strong>{item.title || "未命名"}</strong><p>{item.path}</p></div><button disabled={busy} onClick={() => void act(item,false)}>恢复</button><button disabled={busy} onClick={() => {setChosen(item);setConsent(false);setReason("");}}>永久删除</button></article>)}
    {!items.length ? <p>归档为空</p>:null}
    {chosen ? <form className="purge-confirm" onSubmit={e => {e.preventDefault();void act(chosen,true);}}><h2>永久删除 {chosen.title||"未命名"}</h2><p>{chosen.kind==="relation"?"将永久清除这条正式关系。":`将同时清除 ${chosen.dependencies.revisions} 个修订、${chosen.dependencies.relations} 个正式关系和 ${chosen.dependencies.proposals} 个关联提议。正文中的引用会成为未解析链接。`}</p><label>删除原因<input value={reason} required onChange={e=>setReason(e.target.value)} /></label><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />确认清除以上内容，无法恢复</label><button type="submit" disabled={busy||!consent||!reason.trim()}>确认永久删除</button><button type="button" onClick={()=>setChosen(null)}>取消</button></form>:null}
    <p role="status">{status}</p></section>;
}
