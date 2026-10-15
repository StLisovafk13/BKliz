import {outcomeKey} from './presentation.js?v=outcomes-20261015';
export const amount=v=>{if(typeof v!=='number'&&typeof v!=='string')return null;const s=String(v).trim().replace(',','.');if(!s)return null;const n=Number(s);return Number.isFinite(n)&&n>=0&&n<=1e9?n:null;};
export const price=v=>{const n=amount(v);return n!==null&&n>=1&&n<100000?n:null;};
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
export function initialPrice(e){if(price(e.original_odds)!==null)return price(e.original_odds);const quote=String(e.historical_quote||'').trim();if(/^[≈~]?\s*\d+(?:[.,]\d+)?$/.test(quote))return price(quote.replace(/[≈~]/g,''));return price(e.odds);}
export function autoSettlement(e){const text=String(e.forecast_result||'').toLowerCase();if(/возврат/.test(text))return 'refund';return e.forecast_result?outcomeKey(e):'pending';}
export function calculate(entry){const stake=amount(entry.stake)||0,k=price(entry.odds),state=entry.settlement==='auto'?entry.auto:entry.settlement;const potential=k===null?null:round(stake*k);let payout=null;
if(state==='lost')payout=0;else if(state==='refund')payout=stake;else if(state==='won'&&k!==null)payout=potential;
return {stake,odds:k,potential,payout,profit:payout===null?null:round(payout-stake)};}
export function totals(entries,bank){const rows=entries.map(calculate),staked=round(rows.reduce((s,r)=>s+r.stake,0)),returns=round(rows.reduce((s,r)=>s+(r.payout??0),0)),profit=round(rows.reduce((s,r)=>s+(r.profit??0),0)),pending=round(rows.filter(r=>r.payout===null).reduce((s,r)=>s+r.stake,0)),missing=rows.some(r=>r.stake>0&&r.odds===null),potential=missing?null:round(rows.reduce((s,r)=>s+(r.potential??0),0));const initial=amount(bank);
return {staked,returns,profit,pending,potential,weighted:!missing&&staked>0?potential/staked:null,balance:initial===null?null:round(initial+profit),available:initial===null?null:round(initial-staked+returns)};}
const knownLinks=[
['2026-10-15','Зальцбург — Милан','soccer/red-bull-zaltcburg-milan-id-23631569-service-id-26-ext-id-1140032'],
['2026-10-15','Лион — Кристал Пэлас','soccer/lion-kristal-pelas-id-23631579-service-id-26-ext-id-1140036'],
['2026-10-15','Сельта — Ювентус','soccer/selta-iuventus-id-23631572-service-id-26-ext-id-1140058'],
['2026-10-15','Северсталь — Локомотив','ice-hockey/severstal-lokomotiv-id-23754568-service-id-26-ext-id-1164480'],
['2026-10-15','Лада — СКА','ice-hockey/lada-ska-id-23754569-service-id-26-ext-id-1164481'],
['2026-10-16','Адмирал — Спартак','ice-hockey/admiral-spartak-id-23760102-service-id-26-ext-id-1170167'],
['2026-10-16','Авангард — Автомобилист','ice-hockey/avangard-avtomobilist-id-23760101-service-id-26-ext-id-1170164'],
['2026-10-16','Нефтехимик — Трактор','ice-hockey/neftekhimik-traktor-id-23760103-service-id-26-ext-id-1220754'],
['2026-10-16','Шанхайские Драконы — Ак Барс','ice-hockey/shankhai-dregons-ak-bars-id-23760104-service-id-26-ext-id-1170166']];
export function ligaLink(e){for(const value of [e.liga_url,e.bookmaker_url,e.source_url]){try{const u=new URL(value);if(u.protocol==='https:'&&(u.hostname==='ligastavok.ru'||u.hostname==='www.ligastavok.ru')&&u.pathname.startsWith('/sports/')&&/-id-\d+/.test(u.pathname))return u.href;}catch{}}
const date=e.event_date||e.start_at?.slice(0,10)||(/^\d{2}\.\d{2}\.\d{4}$/.test(e.calendar_date||'')?e.calendar_date.split('.').reverse().join('-'):null),record=knownLinks.find(r=>r[0]===date&&r[1]===e.event);return record?'https://www.ligastavok.ru/sports/'+record[2]:null;}
