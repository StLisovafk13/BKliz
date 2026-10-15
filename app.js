import {amount,price,initialPrice,autoSettlement,calculate,totals,ligaLink} from './calculator.js?v=bank-20261015';
import {eventDate,originalPrice,actualResult,forecastResult,outcomeKey} from './presentation.js?v=outcomes-20261015';
import {FEEDS,aggregate} from './aggregate.js';
const $=id=>document.getElementById(id);
const fmt=v=>v?new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Yekaterinburg',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'Ожидается';
let data={events:[],feeds:[]},busy=false;const retained=new Map();
const storageKey='bkliz-calculator-v1';let ledger={bank:'',entries:{}};try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&typeof saved.entries==='object'&&saved.entries&&!Array.isArray(saved.entries))ledger={bank:saved.bank??'',entries:saved.entries};}catch{}
const rub=v=>v===null?'—':new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(v);
function saveLedger(){try{localStorage.setItem(storageKey,JSON.stringify(ledger));}catch{$('bank-note').textContent='Браузер не сохранил ввод. До закрытия страницы расчёт доступен.';}}
function updateBank(){const t=totals(Object.values(ledger.entries),ledger.bank);for(const key of ['staked','pending','profit','balance','available','potential'])$('bank-'+key).textContent=rub(t[key]);$('bank-weighted').textContent=t.weighted===null?'—':t.weighted.toFixed(2);$('bank-note').textContent=t.available!==null&&t.available<0?'Указанные суммы превышают доступный банк на '+rub(-t.available):'Суммы указаны для '+Object.values(ledger.entries).filter(e=>amount(e.stake)>0).length+' прогнозов. '+(amount(ledger.bank)===null?'Введите начальный банк для расчёта остатка.':'');}
function calculatorCells(row,e){const saved=ledger.entries[e.id],odds=cell(row,''),stake=cell(row,''),result=cell(row,'');const k=document.createElement('input'),s=document.createElement('input'),state=document.createElement('select'),output=document.createElement('strong'),hint=document.createElement('small');
for(const input of [k,s]){input.type='number';input.step='0.01';input.inputMode='decimal';}k.min='1';k.max='99999';s.min='0';s.max='1000000000';k.placeholder='Укажите кэф';s.placeholder='0';k.value=saved?.odds??initialPrice(e)??'';s.value=saved?.stake??'';k.setAttribute('aria-label','Коэффициент расчёта: '+e.event+' · '+e.market);s.setAttribute('aria-label','Сумма: '+e.event+' · '+e.market);
for(const [value,label] of [['auto','Автоитог'],['pending','Ожидается'],['won','Сбылся'],['lost','Не сбылся'],['refund','Возврат']])state.add(new Option(label,value));state.value=saved?.settlement||'auto';state.setAttribute('aria-label','Итог расчёта: '+e.event+' · '+e.market);
const entry=()=>({event:e.event,market:e.market,stake:s.value,odds:k.value,settlement:state.value,auto:autoSettlement(e)});
function update(){const v=calculate(entry());output.textContent=v.stake>0?(v.payout===null?'Возможная: '+rub(v.potential):'Выплата: '+rub(v.payout)):'—';hint.textContent=v.stake>0?(v.profit===null?'Итог ожидается'+(v.odds===null?' · укажите коэффициент':''):'Итог: '+rub(v.profit)):'';}
function changed(){ledger.entries[e.id]=entry();saveLedger();update();updateBank();}for(const input of [k,s])input.addEventListener('input',changed);state.addEventListener('change',changed);odds.append(k);const basis=document.createElement('small');basis.textContent=saved?'Сохранённый для расчёта':initialPrice(e)===null?'Введите коэффициент выбранного исхода':'Из отчёта · можно изменить';odds.append(basis);stake.append(s);result.append(output,hint,state);update();}

let selectedDate='',calendarMonth=new Date(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yekaterinburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'T12:00:00');
const dateKey=e=>e.start_at?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yekaterinburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(e.start_at)):e.event_date||'';
function renderCalendar(){
const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth(),days=new Date(year,month+1,0).getDate(),offset=(new Date(year,month,1).getDay()+6)%7;
$('calendar-month').textContent=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(calendarMonth);$('calendar').replaceChildren();
const dates=new Map();for(const e of data.events){const key=dateKey(e);dates.set(key,(dates.get(key)||0)+1);}
const today=dateKey({start_at:new Date().toISOString()});for(let i=0;i<offset;i++)$('calendar').append(document.createElement('span'));
for(let day=1;day<=days;day++){const key=[year,String(month+1).padStart(2,'0'),String(day).padStart(2,'0')].join('-'),b=document.createElement('button');b.textContent=day;b.className=[dates.has(key)?'has-events':'',selectedDate===key?'selected':'',today===key?'today':''].join(' ');b.setAttribute('aria-label',key+' · событий: '+(dates.get(key)||0));b.setAttribute('aria-pressed',String(selectedDate===key));b.addEventListener('click',()=>{selectedDate=selectedDate===key?'':key;render();});$('calendar').append(b);}
$('date-caption').textContent=selectedDate?selectedDate.split('-').reverse().join('.'):'Все даты';
document.querySelectorAll('[data-sport]').forEach(b=>{b.classList.toggle('active',b.dataset.sport===$('sport').value);b.setAttribute('aria-pressed',String(b.dataset.sport===$('sport').value));});
}
function cell(row,value){const c=document.createElement('td');c.textContent=value??'Нет данных';row.append(c);return c;}
function render(){
const query=$('search').value.trim().toLocaleLowerCase('ru'),task=$('task').value;
const matching=data.events.filter(e=>(!selectedDate||dateKey(e)===selectedDate)&&(!$('audit').value||e.audit_status===$('audit').value)&&(!task||e.feed_id===task)&&(!$('sport').value||e.sport===$('sport').value)&&(!$('status').value||e.status===$('status').value)&&[e.event,e.competition,e.market,e.analysis].join(' ').toLocaleLowerCase('ru').includes(query));
for(const key of ['won','lost','unsettled'])$(key+'-count').textContent=matching.filter(e=>outcomeKey(e)===key).length;
const outcome=$('outcome').value;document.querySelectorAll('[data-outcome]').forEach(b=>{b.classList.toggle('active',b.dataset.outcome===outcome);b.setAttribute('aria-pressed',String(b.dataset.outcome===outcome));});
const events=matching.filter(e=>!outcome||outcomeKey(e)===outcome);
const numericPrice=e=>{const n=e.original_odds??parseFloat(String(e.historical_quote||'').replace('≈',''));return Number.isFinite(n)?n:-1;};const key=$('sort').value;events.sort((a,b)=>key==='odds'?numericPrice(b)-numericPrice(a):key==='checked'?Date.parse(b.checked_at)-Date.parse(a.checked_at):(a.start_at||a.event_date?Date.parse(a.start_at||a.event_date):Infinity)-(b.start_at||b.event_date?Date.parse(b.start_at||b.event_date):Infinity));
$('rows').replaceChildren();renderCalendar();updateBank();
function detail(row,value){const c=cell(row,value.text);if(value.basis){const s=document.createElement('small');s.textContent=value.basis;c.append(s);}return c;}
for(const e of events){
 const r=document.createElement('tr');detail(r,eventDate(e));
 const title=cell(r,''),url=ligaLink(e);if(url){const link=document.createElement('a');link.className='event-link';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=e.event+' ↗';link.title='Открыть событие в Лиге Ставок';title.append(link);}else{title.textContent=e.event;const hint=document.createElement('small');hint.textContent='Прямая ссылка Лиги Ставок пока не найдена';title.append(hint);}const sub=document.createElement('small');sub.textContent=[e.sport,e.competition,e.task_name,e.history_group].filter(Boolean).join(' · ');title.append(sub);
 detail(r,originalPrice(e));cell(r,e.market);calculatorCells(r,e);detail(r,actualResult(e));detail(r,forecastResult(e)).classList.add('result-'+outcomeKey(e));cell(r,e.status);
 const analysis=cell(r,e.analysis);if(e.audit_status){const badge=document.createElement('small');badge.textContent=e.audit_status;analysis.prepend(badge);}
 const c=cell(r,e.source_url?'':e.source_name||'Нет источника');if(e.discussed_on){const p=document.createElement('small');p.textContent='Обсуждалось: '+e.discussed_on;c.append(p);}
 if(e.source_url){try{const u=new URL(e.source_url);if(['https:','http:'].includes(u.protocol)){const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=e.source_name||u.hostname;c.append(a);}}catch{c.textContent='Ошибка ссылки';}}
 const t=document.createElement('small');t.textContent=(e.feed_id==='history'?'Разбор: ':'')+fmt(e.checked_at);c.append(t);$('rows').append(r);
}
$('empty').hidden=events.length>0;$('count').textContent=`${events.length} / ${data.events.length}`;$('updated').textContent=fmt(data.generated_at);
const selected=task?data.feeds.filter(f=>f.feed_id===task):data.feeds;$('notes').textContent=selected.length?selected.map(f=>`${f.task_name}\n${f.summary}`).join('\n\n'):data.summary||'Нет комментария.';
$('health').textContent=$('report').value!=='latest'?'Архивный отчёт':!data.generated_at?'Ожидается отчёт':Date.now()-Date.parse(data.generated_at)>3*3600000?'Есть устаревшие данные':'Данные загружены';
$('feeds').replaceChildren();for(const f of data.feeds){const article=document.createElement('article'),h=document.createElement('h2'),p=document.createElement('p');h.textContent=f.task_name;p.textContent=f.delivery_error?'Ошибка загрузки; показана сохранённая версия':f.generated_at?`${f.events.length} событий · ${fmt(f.generated_at)} · ${f.report_kind==='history'?'Архив обсуждений':f.report_kind==='bootstrap'?'Первичное наполнение':'Отчёт задачи'}`:'Ожидается первый отчёт задачи';article.append(h,p);$('feeds').append(article);}
}
async function json(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
function check(r){if(r.schema_version!==1||!Array.isArray(r.events))throw new Error('Неверный формат отчёта');return r;}
async function load(){if(busy)return;busy=true;$('refresh').disabled=true;try{const name=$('report').value;let next,errors=[];
if(name==='latest'){const results=await Promise.allSettled(FEEDS.map(async f=>{const r=check(await json(`data/feeds/${f.id}.json`));if(r.feed_id!==f.id)throw new Error('Неверная задача');return r;}));const feeds=results.map((r,i)=>{const f=FEEDS[i];if(r.status==='fulfilled'){retained.set(f.id,r.value);return r.value;}errors.push(f.name);return {...(retained.get(f.id)||{feed_id:f.id,task_name:f.name,events:[],generated_at:null,summary:'Данные недоступны.'}),delivery_error:true};});next=aggregate(feeds);
}else{if(!/^\d{8}T\d{6}Z-[a-z0-9-]+\.json$/.test(name))throw new Error('Некорректный путь отчёта');const r=check(await json(`data/reports/${name}`));next=r.feed_id?aggregate([r]):{...r,feeds:[]};}
data=next;if(name==='latest'){for(const e of data.events){if(ledger.entries[e.id])ledger.entries[e.id].auto=autoSettlement(e);}saveLedger();}const selected=$('sport').value;$('sport').replaceChildren(new Option('Все',''),...[...new Set(data.events.map(e=>e.sport))].sort().map(s=>new Option(s,s)));$('sport').value=selected;$('message').textContent=errors.length?`Не удалось обновить: ${errors.join(', ')}. Остальные отчёты доступны.`:'';render();
}catch(e){$('message').textContent=`Не удалось загрузить данные: ${e.message}. Последний загруженный отчёт сохранён на экране.`;$('health').textContent='Ошибка обновления';}finally{busy=false;$('refresh').disabled=false;}}
async function archive(){try{const list=await json('data/index.json'),selected=$('report').value;$('report').replaceChildren(new Option('Все задачи · последние отчёты','latest'),...list.reports.map(r=>new Option(`${fmt(r.generated_at)} · ${r.task_name||r.title}`,r.file)));$('report').value=[...$('report').options].some(o=>o.value===selected)?selected:'latest';}catch{$('message').textContent+=' Архив пока недоступен.';}}
$('bank').value=ledger.bank;$('bank').addEventListener('input',()=>{ledger.bank=$('bank').value;saveLedger();updateBank();});updateBank();
$('prev-month').addEventListener('click',()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);renderCalendar();});
$('next-month').addEventListener('click',()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);renderCalendar();});
$('clear-date').addEventListener('click',()=>{selectedDate='';render();});
document.querySelectorAll('[data-sport]').forEach(b=>b.addEventListener('click',()=>{$('sport').value=b.dataset.sport;render();}));
document.querySelectorAll('[data-outcome]').forEach(b=>b.addEventListener('click',()=>{$('outcome').value=$('outcome').value===b.dataset.outcome?'':b.dataset.outcome;render();}));
$('reset-filters').addEventListener('click',()=>{for(const id of ['search','task','sport','status','audit','outcome'])$(id).value='';$('sort').value='start';selectedDate='';render();});
for(const id of ['search','task','sport','status','audit','sort','outcome'])$(id).addEventListener('input',render);$('report').addEventListener('change',load);$('refresh').addEventListener('click',async()=>{await load();await archive();});await load();await archive();setInterval(async()=>{if(!document.hidden){await load();await archive();}},60000);
