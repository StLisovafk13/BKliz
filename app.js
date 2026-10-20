import {calendarDate,briefReason} from './event-view.js?v=event-layout-20261020';
import {preservedPrice} from './prices.js?v=result-odds-20261020';
import {amount,price,initialPrice,autoSettlement,calculate,totals,ligaLink} from './calculator.js?v=result-odds-20261020';
import {eventDate,originalPrice,actualResult,forecastResult,outcomeKey} from './presentation.js?v=outcomes-20261015';
import {FEEDS,aggregate} from './aggregate.js';
const $=id=>document.getElementById(id);

// Список источников. Котировки загружаются исключительно из проверенных данных отчёта.
const bookmakerAliases={'лига ставок':'Лига Ставок','liga stavok':'Лига Ставок','pari':'PARI','winline':'Winline','betboom':'BetBoom','фонбет':'Фонбет','fonbet':'Фонбет','бетсити':'БЕТСИТИ','betcity':'БЕТСИТИ','марафонбет':'Марафонбет','marathonbet':'Марафонбет','олимпбет':'Олимпбет','olimpbet':'Олимпбет','леон':'Леон','leon':'Леон','балтбет':'Балтбет','baltbet':'Балтбет','1win':'1win'};
function bookmakerName(v){return bookmakerAliases[String(v||'').trim().toLocaleLowerCase('ru')]||null;}
function safeHttp(v){try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function bookmakerQuotes(e){
 const quotes=new Map(),market=String(e.market||'').trim();
 const add=q=>{if(!q||typeof q!=='object')return;const name=bookmakerName(q.bookmaker||q.source_name||q.name),odds=Number(q.odds),url=safeHttp(q.source_url||q.url),qMarket=String(q.market||'').trim(),checked=q.checked_at||null;
 // Важна точная идентичность рынка; без времени проверки котировка не считается текущей.
 if(!name||!market||qMarket!==market||!Number.isFinite(odds)||odds<=1||!url||!checked||!Number.isFinite(Date.parse(checked)))return;
 const old=quotes.get(name);if(!old||Date.parse(checked)>Date.parse(old.checked_at))quotes.set(name,{name,odds,url,checked_at:checked});
 };
 if(Array.isArray(e.bookmaker_odds))e.bookmaker_odds.forEach(add);
 // Основная цена отчёта — подтверждена только если есть прямая ссылка и точное время.
 if(e.odds!==null&&e.odds!==undefined)add({bookmaker:e.source_name,odds:e.odds,source_url:e.source_url,market:e.market,checked_at:e.checked_at});
 return quotes;
}
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
function changed(){ledger.entries[e.id]=entry();saveLedger();update();updateBank();}for(const input of [k,s])input.addEventListener('input',changed);state.addEventListener('change',changed);odds.append(k);const basis=document.createElement('small');basis.className='price-basis';basis.textContent=saved?'Сохранённый для расчёта':initialPrice(e)===null?'Введите коэффициент выбранного исхода':e.original_odds!=null?'K0 · исходный прогноз':preservedPrice(e)?'Архивная цена · '+preservedPrice(e).source_name:'Из отчёта · можно изменить';odds.append(basis);stake.append(s);result.append(output,hint,state);update();}

let selectedDate=calendarDate(),calendarMonth=new Date(selectedDate+'T12:00:00');
const dateKey=e=>e.start_at?calendarDate(e.start_at):e.event_date||'';
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
function renderDashboard(){
 const events=data.events||[];
 const set=(id,value)=>{const el=$(id);if(el)el.textContent=String(value);};
 set('dash-total',events.length);set('dash-upcoming',events.filter(e=>e.status==='Ожидается').length);set('dash-live',events.filter(e=>e.status==='Идёт').length);set('dash-done',events.filter(e=>e.status==='Завершён').length);set('dash-priced',events.filter(e=>bookmakerQuotes(e).size>0).length);
 set('dashboard-time','Последний отчёт: '+fmt(data.generated_at)+' ЕКБ');
 const root=$('task-dashboard');if(!root)return;root.replaceChildren();
 for(const def of FEEDS){const f=data.feeds.find(x=>x.feed_id===def.id);const card=document.createElement('button');card.type='button';card.className='task-status-card'+($('task').value===def.id?' selected':'');
 const age=f?.generated_at?Date.now()-Date.parse(f.generated_at):Infinity;
 const state=f?.delivery_error?'Ошибка загрузки':!f?.generated_at?'Нет отчёта':f.report_kind==='bootstrap'?'Первичное наполнение':f.report_kind==='history'?'Архив':age>3*3600000?'Устарел':'Данные доступны';
 const name=document.createElement('strong');name.textContent=def.name;const status=document.createElement('span');status.textContent=state;status.className='task-state'+(f?.delivery_error?' state-error':age>3*3600000?' state-old':'');
 const meta=document.createElement('small');meta.textContent=(f?.events?.length??0)+' событий · '+(f?.generated_at?fmt(f.generated_at)+' ЕКБ':'время неизвестно');
 card.append(name,status,meta);card.addEventListener('click',()=>{$('task').value=$('task').value===def.id?'':def.id;render();document.querySelector('.events-panel')?.scrollIntoView({behavior:'smooth',block:'start'});});root.append(card);
 }
}
function render(){
renderDashboard();
const query=$('search').value.trim().toLocaleLowerCase('ru'),task=$('task').value;
const matching=data.events.filter(e=>(!selectedDate||dateKey(e)===selectedDate)&&(!$('audit').value||e.audit_status===$('audit').value)&&(!task||e.feed_id===task)&&(!$('sport').value||e.sport===$('sport').value)&&(!$('status').value||e.status===$('status').value)&&[e.event,e.competition,e.market,e.analysis].join(' ').toLocaleLowerCase('ru').includes(query));
for(const key of ['won','lost','unsettled'])$(key+'-count').textContent=matching.filter(e=>outcomeKey(e)===key).length;
const outcome=$('outcome').value;document.querySelectorAll('[data-outcome]').forEach(b=>{b.classList.toggle('active',b.dataset.outcome===outcome);b.setAttribute('aria-pressed',String(b.dataset.outcome===outcome));});
const events=matching.filter(e=>!outcome||outcomeKey(e)===outcome);
const numericPrice=e=>{const n=initialPrice(e);return n===null?-1:n;};const key=$('sort').value;events.sort((a,b)=>key==='odds'?numericPrice(b)-numericPrice(a):key==='checked'?Date.parse(b.checked_at)-Date.parse(a.checked_at):(a.start_at||a.event_date?Date.parse(a.start_at||a.event_date):Infinity)-(b.start_at||b.event_date?Date.parse(b.start_at||b.event_date):Infinity));
$('rows').replaceChildren();renderCalendar();updateBank();
function detail(row,value){const c=cell(row,value.text);if(value.basis){const s=document.createElement('small');s.textContent=value.basis;c.append(s);}return c;}
for(const e of events){
 const r=document.createElement('tr');r.className='event-row';r.dataset.eventId=e.id;detail(r,eventDate(e));
 const quote=[...bookmakerQuotes(e).values()][0],archived=preservedPrice(e);
 const title=cell(r,''),url=ligaLink(e)||quote?.url||archived?.source_url;
 const name=document.createElement(url?'a':'span');name.textContent=e.event;
 if(url){name.href=url;name.target='_blank';name.rel='noopener noreferrer';name.className='event-link';}title.append(name);
 const sub=document.createElement('small');sub.textContent=[e.sport,e.competition].filter(Boolean).join(' · ');title.append(sub);
 const market=document.createElement('div');market.className='row-market';market.textContent=e.market;title.append(market);
 calculatorCells(r,e);
 const result=detail(r,actualResult(e)),outcome=forecastResult(e),outcomeInfo=document.createElement('div');outcomeInfo.className='row-outcome result-'+outcomeKey(e);outcomeInfo.textContent=outcome.text;result.append(outcomeInfo);
 const status=document.createElement('small');status.className='row-status';status.textContent=e.status;result.append(status);
 const odds=r.children[2],original=originalPrice(e),priceInfo=document.createElement('details'),priceLabel=document.createElement('summary'),originalValue=document.createElement('small');priceInfo.className='row-details original-price';priceLabel.textContent='Исходный кэф';originalValue.textContent=original.text+' · '+original.basis;priceInfo.append(priceLabel,originalValue);odds.append(priceInfo);
 if(archived){const details=document.createElement('details'),summary=document.createElement('summary'),stamp=document.createElement('small'),link=document.createElement('a');details.className='row-details preserved-price';summary.textContent='До результата · '+archived.odds.toFixed(2);stamp.textContent=fmt(archived.checked_at)+' ЕКБ · архивная цена';link.href=archived.source_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=archived.source_name+' ↗';details.append(summary,stamp,link);odds.append(details);}
 const context=document.createElement('tr');context.className='event-context-row';context.dataset.eventId=e.id;
 const contextCell=document.createElement('td');contextCell.colSpan=6;
 const info=document.createElement('div');info.className='event-context';const brief=briefReason(e),reason=document.createElement('p'),label=document.createElement('strong');
 label.textContent='Почему рассматриваем: ';reason.append(label,document.createTextNode(brief.reason));info.append(reason);
 if(brief.risk||brief.riskNote){const risk=document.createElement('p');risk.className='event-risk';risk.textContent=['Риск: '+(brief.risk||'не указан'),brief.riskNote].filter(Boolean).join(' · ');info.append(risk);}
 const sources=document.createElement('div');sources.className='event-sources';sources.setAttribute('aria-label','Источники: '+e.event);
 const sourcesLabel=document.createElement('span');sourcesLabel.textContent='Источники:';sources.append(sourcesLabel);const seen=new Set();
 const sourceLink=(value,label)=>{const href=safeHttp(value);if(!href||seen.has(href)||seen.size>=4)return;seen.add(href);const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label||new URL(href).hostname;a.title=href;sources.append(a);};
 for(const s of Array.isArray(e.selection_sources)?e.selection_sources:[])if(s&&typeof s==='object')sourceLink(s.url||s.source_url,s.name||s.source_name);
 sourceLink(e.result_source_url,'Результат');sourceLink(e.source_url,e.source_name);
 if(archived)sourceLink(archived.source_url,'Коэффициент · '+archived.source_name);
 sourceLink(e.schedule_source_url,'Календарь');
 for(const href of String(e.analysis||'').match(/https?:\/\/[^\s]+/g)||[])sourceLink(href.replace(/[),.;]+$/,''),'');
 const checked=document.createElement('small');checked.className='event-checked';checked.textContent='Проверено: '+fmt(e.checked_at)+' ЕКБ';
 if(e.audit_status)checked.textContent+=' · '+e.audit_status;
 if(!seen.size){const missing=document.createElement('span');missing.textContent='Не указаны в отчёте';sources.append(missing);}sources.append(checked);info.append(sources);
 contextCell.append(info);context.append(contextCell);$('rows').append(r,context);
}
$('empty').textContent=selectedDate?'На выбранную дату событий по этим фильтрам нет. Выберите другую дату или нажмите «Сбросить» под календарём.':'В этом отчёте нет событий, подходящих под фильтры.';$('empty').hidden=events.length>0;$('count').textContent=`${events.length} / ${data.events.length}`;$('updated').textContent=fmt(data.generated_at);
const selected=task?data.feeds.filter(f=>f.feed_id===task):data.feeds;$('notes').textContent=selected.length?selected.map(f=>`${f.task_name}\n${f.summary}`).join('\n\n'):data.summary||'Нет комментария.';
$('health').textContent=$('report').value!=='latest'?'Архивный отчёт':!data.generated_at?'Ожидается отчёт':Date.now()-Date.parse(data.generated_at)>3*3600000?'Есть устаревшие данные':'Данные загружены';
$('feeds').replaceChildren();for(const f of data.feeds){const article=document.createElement('article'),h=document.createElement('h2'),p=document.createElement('p');h.textContent=f.task_name;p.textContent=f.delivery_error?'Ошибка загрузки; показана сохранённая версия':f.generated_at?`${f.events.length} событий · ${fmt(f.generated_at)} · ${f.report_kind==='history'?'Архив обсуждений':f.report_kind==='bootstrap'?'Первичное наполнение':'Отчёт задачи'}`:'Ожидается первый отчёт задачи';article.append(h,p);$('feeds').append(article);}
}
const actionsEndpoint='https://api.github.com/repos/StLisovafk13/BKliz/actions/runs?per_page=60';
let executionRuns=[],executionCheckedAt=null;
const executionState=r=>r.status!=='completed'?(r.status==='in_progress'?'Выполняется':'В очереди'):({success:'Успешно',failure:'Ошибка',cancelled:'Отменено',timed_out:'Ошибка',skipped:'Пропущено'}[r.conclusion]||'Неизвестно');
function renderExecutions(){const root=$('execution-rows');if(!root)return;root.replaceChildren();const workflow=$('execution-workflow').value,status=$('execution-status').value;
 const rows=executionRuns.filter(r=>(!workflow||r.name===workflow)&&(!status||(status==='in_progress'||status==='queued'?r.status===status:r.conclusion===status)));
 for(const r of rows){const tr=document.createElement('tr');const c=(value)=>{const td=document.createElement('td');td.textContent=value;tr.append(td);return td;};c(r.name||'Без названия');c(fmt(r.run_started_at||r.created_at));const state=c(executionState(r));state.className=r.conclusion==='failure'?'execution-failure':r.conclusion==='success'?'execution-success':'';
 const start=Date.parse(r.run_started_at||r.created_at),end=Date.parse(r.updated_at),mins=Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,Math.round((end-start)/60000)):null;c(r.status==='completed'&&mins!==null?mins+' мин':'—');const td=c('');const a=document.createElement('a');a.href=r.html_url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Открыть ↗';td.append(a);root.append(tr);}
 if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='Запусков по выбранным фильтрам нет';tr.append(td);root.append(tr);}
 $('execution-updated').textContent=executionCheckedAt?'Проверено: '+fmt(executionCheckedAt)+' ЕКБ':'Проверка не выполнена';
}
async function loadExecutions(){const b=$('execution-refresh');if(!b)return;b.disabled=true;try{const response=await fetch(actionsEndpoint,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});if(!response.ok)throw Error('GitHub API HTTP '+response.status);const payload=await response.json();if(!Array.isArray(payload.workflow_runs))throw Error('Некорректный ответ GitHub');executionRuns=payload.workflow_runs;executionCheckedAt=new Date().toISOString();const current=$('execution-workflow').value;const names=[...new Set(executionRuns.map(r=>r.name).filter(Boolean))].sort();$('execution-workflow').replaceChildren(new Option('Все процессы',''),...names.map(n=>new Option(n,n)));$('execution-workflow').value=names.includes(current)?current:'';$('execution-error').textContent='';renderExecutions();}catch(e){$('execution-error').textContent='Не удалось проверить GitHub Actions: '+e.message+'. Последняя загруженная таблица сохранена.';}finally{b.disabled=false;}}
$('execution-refresh')?.addEventListener('click',loadExecutions);
for(const id of ['execution-workflow','execution-status'])$(id)?.addEventListener('change',renderExecutions);
loadExecutions();setInterval(()=>{if(!document.hidden)loadExecutions();},60000);
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
$('reset-filters').addEventListener('click',()=>{for(const id of ['search','task','sport','status','audit','outcome'])$(id).value='';$('sort').value='start';selectedDate=calendarDate();calendarMonth=new Date(selectedDate+'T12:00:00');render();});
for(const id of ['search','task','sport','status','audit','sort','outcome'])$(id).addEventListener('input',render);$('report').addEventListener('change',load);$('refresh').addEventListener('click',async()=>{await load();await archive();});await load();await archive();setInterval(async()=>{if(!document.hidden){await load();await archive();}},60000);

window.addEventListener('pageshow',event=>{if(event.persisted){selectedDate=calendarDate();calendarMonth=new Date(selectedDate+'T12:00:00');render();}});
