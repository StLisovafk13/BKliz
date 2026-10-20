import assert from 'node:assert/strict';
import {preservedPrice} from '../prices.js';
import {initialPrice} from '../calculator.js';
const q=(odds,checked_at,extra={})=>({odds,checked_at,source_name:'Лига Ставок',source_url:'https://www.ligastavok.ru/sports/event-id-1',...extra});
const event={market:'П1 за 60 минут',start_at:'2026-10-19T19:00:00+03:00',status:'Завершён',score:'4:1',forecast_result:'✅ Сбылся',odds:null,original_odds:null,
 price_history:[q(2.10,'2026-10-19T12:00:00Z'),q(2.33,'2026-10-19T14:00:00Z')]};
assert.equal(preservedPrice(event).odds,2.33);
assert.equal(initialPrice(event),2.33);
assert.equal(event.original_odds,null,'Historical quotes must not invent K0');
assert.equal(initialPrice({...event,original_odds:1.86}),1.86);
assert.equal(preservedPrice({...event,price_history:[...event.price_history,q(9,'2026-10-19T17:00:00Z')]}).odds,2.33,'Ignore post-start quotes');
assert.equal(preservedPrice({...event,price_history:[...event.price_history,q(7,'2026-10-19T15:00:00Z',{market:'ТБ 5.5'})]}).odds,2.33,'Do not mix markets');
assert.equal(preservedPrice({...event,result_price:{...event.price_history[0],market:event.market}}).odds,2.10,'A frozen quote must not change with later history');
assert.equal(preservedPrice({...event,score:null,forecast_result:null,reported_score:'4:1'}),null);
assert.equal(preservedPrice({...event,start_at:null}),null);
for(const bad of [
 q(0,'2026-10-19T14:00:00Z'),q(2,'invalid'),q(2,'2026-10-19T14:00:00'),
 q(2,'2026-10-19T14:00:00Z',{source_url:'javascript:alert(1)'}),
 q(2,'2026-10-19T14:00:00Z',{source_name:''}),
 q(2,'2026-10-19T14:00:00Z',{source_url:null})
])assert.equal(preservedPrice({...event,price_history:[bad]}),null);
assert.equal(initialPrice({historical_quote:'1.51 / 5.00 / 6.00'}),null);
assert.equal(initialPrice({historical_quote:'≈2.16'}),2.16);
console.log('Preserved odds passed: confirmed results, K0, frozen price, source, market and pre-start boundaries.');
