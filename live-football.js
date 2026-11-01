// Отдельная панель LIVE: читает опубликованный feed, не меняет архивные данные.
const root=document.getElementById('live-football-rows');
const stamp=document.getElementById('live-football-updated');
const safeUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}};
const isLive=e=>e.live_watch===true||/live/i.test(String(e.id||'')+' '+String(e.market||'')+' '+String(e.category||'')+' '+String(e.tags||''));
const status=e=>e.status==='Идёт'?'В игре':e.status==='Завершён'?'Завершён':e.status==='Ожидается'?'Ожидается':'Не подтверждён';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
function render(items,generated){
 root.replaceChildren();stamp.textContent=generated?'Отчёт: '+new Date(generated).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК':'Нет времени проверки';
 if(!items.length){root.append(el('p','В выбранном отчёте нет LIVE-наблюдений.','live-empty'));return}
 const sorted=[...items].sort((a,b)=>{const rank=x=>x.status==='Идёт'?0:x.status==='Ожидается'?1:x.status==='Завершён'?3:2;return rank(a)-rank(b)||(a.start_at||'').localeCompare(b.start_at||'')});
 for(const e of sorted){const card=el('article',undefined,'live-event'),head=el('div',undefined,'live-event-head'),title=el('strong',e.event||'Матч не указан'),state=el('span',status(e),'live-status');head.append(title,state);
 const meta=el('p',(e.competition||e.sport||'Спорт')+' · '+(e.start_at?new Date(e.start_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК':'Начало не подтверждено'),'live-meta');
 const score=e.score||e.live_score||'—',minute=e.live_minute!=null?String(e.live_minute)+'′':'—';
 const facts=el('p','Счёт: '+score+' · Минута: '+minute+' · Коэффициент: '+(e.odds==null?'не подтверждён':e.odds),'live-facts');
 const market=el('p','Прогноз: '+(e.market||'не выбран')+' · Итог: '+(e.forecast_result||'без итога'),'live-market');
 const sources=el('div',undefined,'live-sources'),links=[...(Array.isArray(e.selection_sources)?e.selection_sources:[]),...(e.source_url?[{name:e.source_name||'Источник отчёта',url:e.source_url}]:[]),...(e.result_source_url?[{name:'Источник результата',url:e.result_source_url}]:[])],seen=new Set();
 for(const s of links){const url=safeUrl(s?.url);if(!url||seen.has(url))continue;seen.add(url);const a=el('a',s.name||'Источник');a.href=url;a.target='_blank';a.rel='noopener noreferrer';sources.append(a)}
 if(!seen.size)sources.append(el('span','Источники не указаны'));
 const checked=el('small',(e.live_checked_at||e.checked_at)?'Проверка: '+new Date(e.live_checked_at||e.checked_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК':'Время проверки не указано');
 card.append(head,meta,facts,market,sources,checked);root.append(card)}
}
async function refresh(){try{const r=await fetch('data/feeds/cycle.json',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const feed=await r.json();render((feed.events||[]).filter(isLive),feed.generated_at)}catch(e){root.replaceChildren(el('p','Не удалось загрузить LIVE: '+e.message,'live-empty'))}}
document.getElementById('live-football-refresh')?.addEventListener('click',refresh);
refresh();setInterval(()=>{if(!document.hidden)refresh()},60000);
