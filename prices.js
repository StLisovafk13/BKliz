// Historical prices remain separate from current quotes and the original forecast K0.
const validOdds=v=>typeof v==='number'&&Number.isFinite(v)&&v>1&&v<100000;
const stamp=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
function quote(value,event){
 if(!value||typeof value!=='object'||!validOdds(value.odds))return null;
 if(value.market!=null&&value.market!==event.market)return null;
 const checked=stamp(value.checked_at),start=stamp(event.start_at);
 if(checked===null||(start!==null&&checked>=start))return null;
 const source=String(value.source_name||value.bookmaker||value.source||'').trim();
 if(!source)return null;
 const url=String(value.source_url||value.url||'').trim();
 if(!/^https?:\/\/[^/\s?#@]+(?:[/?#][^\s]*)?$/i.test(url))return null;
 return {odds:value.odds,market:event.market,source_name:source,source_url:url,checked_at:value.checked_at};
}
export function preservedPrice(event){
 if(!event.score&&!event.forecast_result)return null;
 const frozen=quote(event.result_price,event);
 if(frozen)return frozen;
 // Without a known start time the history cannot establish a pre-match quote.
 if(stamp(event.start_at)===null)return null;
 let last=null;
 for(const item of Array.isArray(event.price_history)?event.price_history:[]){
  const next=quote(item,event);
  if(next&&(!last||Date.parse(next.checked_at)>Date.parse(last.checked_at)))last=next;
 }
 return last;
}
