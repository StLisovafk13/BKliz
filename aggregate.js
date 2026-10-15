export const FEEDS=[{id:'cycle',name:'Спортивный аналитик — единый цикл'},{id:'overview',name:'Ежедневный обзор матчей'},{id:'signals',name:'Сигналы по ординарам'}];
export function aggregate(feeds){
const available=feeds.filter(f=>f.generated_at).sort((a,b)=>Date.parse(b.generated_at)-Date.parse(a.generated_at));
return {schema_version:1,generated_at:available[0]?.generated_at??null,feeds,summary:feeds.map(f=>`${f.task_name}\n${f.summary}`).join('\n\n'),events:feeds.flatMap(f=>f.events.map(e=>({...e,id:`${f.feed_id}:${e.id}`,feed_id:f.feed_id,task_name:f.task_name})))};
}
