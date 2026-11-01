import {FEEDS,aggregate} from './aggregate.js';
const $=id=>document.getElementById(id);
const safeUrl=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}};
const text=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n};
let all=[],latest=null;
const msk=v=>{if(!v)return 'Не указано';const d=new Date(v);return Number.isNaN(d.getTime())?'Не указано':d.toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК'};
const dateKey=e=>e.event_date||(e.start_at?new Date(e.start_at).toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'}):'');
function render(){
 const date=$('all-predictions-date').value,sport=$('all-predictions-sport').value,status=$('all-predictions-status').value,feed=$('all-predictions-feed').value;
 const items=all.filter(e=>(!date||dateKey(e)===date)&&(!sport||e.sport===sport)&&(!status||e.status===status)&&(!feed||e.feed_id===feed)).sort((a,b)=>(b.start_at||b.event_date||'').localeCompare(a.start_at||a.event_date||''));
 $('all-predictions-count').textContent='('+items.length+' / '+all.length+')';
 const root=$('all-predictions-rows');root.replaceChildren();
 if(!items.length){root.append(text('p','Событий по выбранным фильтрам нет.','live-empty'));return}
 for(const e of items){const article=text('article','','all-prediction-card'),head=text('div','','all-prediction-head');
 head.append(text('strong',e.event||'Неизвестное событие'),text('span',e.status||'Нет данных','all-prediction-status'));
 article.append(head,text('p',(e.sport||'Вид спорта не указан')+' · '+(e.competition||'Турнир не указан')+' · '+msk(e.start_at),'all-prediction-meta'));
 article.append(text('p','Прогноз: '+(e.market||'Рынок не выбран'),'all-prediction-market'));
 const odds=e.odds!=null?Number(e.odds).toFixed(2):'не подтверждён';
 article.append(text('p','Коэффициент: '+odds+' · Счёт: '+(e.score||'—')+' · Итог: '+(e.forecast_result||'без итога'),'all-prediction-meta'));
 if(e.selection_reason)article.append(text('p',e.selection_reason,'all-prediction-reason'));
 const links=text('div','','live-sources'),sources=[...(Array.isArray(e.selection_sources)?e.selection_sources:[]),...(e.source_url?[{name:e.source_name||'Источник',url:e.source_url}]:[]),...(e.result_source_url?[{name:'Результат',url:e.result_source_url}]:[])],seen=new Set();
 for(const s of sources){const url=safeUrl(s?.url);if(!url||seen.has(url))continue;seen.add(url);const a=text('a',s.name||'Источник');a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(a)}
 if(!seen.size)links.append(text('span','Подтверждённые ссылки отсутствуют'));article.append(links);
 article.append(text('small','Источник: '+(e.task_name||e.feed_id||'—')+' · Проверка: '+msk(e.checked_at)));
 root.append(article)}
}
async function load(){const btn=$('all-predictions-refresh');btn.disabled=true;try{
 const res=await Promise.allSettled(FEEDS.map(async f=>{const r=await fetch('data/feeds/'+f.id+'.json',{cache:'no-store'});if(!r.ok)throw Error(f.id+': HTTP '+r.status);const v=await r.json();if(!Array.isArray(v.events))throw Error(f.id+': неверный формат');return v}));
 const ok=res.filter(x=>x.status==='fulfilled').map(x=>x.value),errors=res.filter(x=>x.status==='rejected').map(x=>x.reason.message);
 if(!ok.length)throw Error(errors.join('; '));const combined=aggregate(ok);all=combined.events;latest=combined.generated_at;
 const sport=$('all-predictions-sport'),old=sport.value;const values=[...new Set(all.map(x=>x.sport).filter(Boolean))].sort();sport.replaceChildren(new Option('Все виды спорта',''),...values.map(x=>new Option(x,x)));sport.value=values.includes(old)?old:'';
 $('all-predictions-updated').textContent='Последний отчёт: '+msk(latest)+(errors.length?' · Недоступны: '+errors.join(', '):'')+'. Данные обновляются при публикации новых отчётов.';
 render();
 }catch(e){$('all-predictions-updated').textContent='Ошибка загрузки: '+e.message+'; предыдущие данные сохранены.'}finally{btn.disabled=false}}
for(const id of ['all-predictions-date','all-predictions-sport','all-predictions-status','all-predictions-feed'])$(id).addEventListener('change',render);
$('all-predictions-reset').addEventListener('click',()=>{for(const id of ['all-predictions-date','all-predictions-sport','all-predictions-status','all-predictions-feed'])$(id).value='';render()});
$('all-predictions-refresh').addEventListener('click',load);load();setInterval(()=>{if(!document.hidden)load()},60000);
