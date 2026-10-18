import {listLinks} from "./links";
import {listNotes} from "./notes";
import {parseWikiReferences,resolveReference} from "../documents/markdown";

export async function readGraph(){
    const [knowledges, relations] = await Promise.all([
      listNotes(),
      listLinks(),
    ]);
    const knowledgeIds = new Set(knowledges.map((knowledge) => knowledge.id));

    const formalEdges = relations.filter(r=>knowledgeIds.has(r.sourceId)&&knowledgeIds.has(r.targetId)).map(r=>({id:r.id,source:r.sourceId,target:r.targetId,type:r.type,reason:r.reason}));
    const pairs=new Set(formalEdges.map(e=>[e.source,e.target].sort().join("→")));
    const wikiEdges=knowledges.flatMap(note=>parseWikiReferences(note.markdown??"").flatMap(ref=>{
      const target=resolveReference(ref.target,knowledges);
      if(!target || target.id===note.id)return [];
      const pair=[note.id,target.id].sort().join("→");if(pairs.has(pair))return [];pairs.add(pair);
      return [{id:`wiki:${note.id}:${target.id}`,source:note.id,target:target.id,type:"related",reason:"正文 wikilink"}];
    }));
    return {
      nodes: knowledges.map((knowledge) => ({
        id: knowledge.id,
        title: knowledge.title,
        rawId: knowledge.rawId,
      })),
      edges:[...formalEdges,...wikiEdges],
    };
}
