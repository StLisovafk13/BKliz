// European single-zero roulette, using virtual chips only.
export const WHEEL = Object.freeze([0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]);
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const COLORS = {red:'красное',black:'чёрное',zero:'зеро'};
const LIMIT = 1_000_000_000_000;
const STORAGE = 'bkliz-roulette-v1';
export const colorOf = n => n===0?'zero':RED.has(n)?'red':'black';
export function settle(balance,stake,color,number){
  if(!Number.isSafeInteger(balance)||balance<0||balance>LIMIT||!Number.isSafeInteger(stake)||stake<1||stake>balance||!Object.hasOwn(COLORS,color)||!WHEEL.includes(number))throw new RangeError('Некорректная ставка');
  const payout=colorOf(number)===color?stake*(color==='zero'?36:2):0;
  const next=balance-stake+payout;
  if(next>LIMIT)throw new RangeError('Максимальный баланс — 1 трлн фишек. Уменьшите ставку.');
  return {balance:next,payout,profit:payout-stake};
}
export function drawNumber(){
  const bytes=new Uint32Array(1),ceiling=Math.floor(2**32/WHEEL.length)*WHEEL.length;
  do{crypto.getRandomValues(bytes);}while(bytes[0]>=ceiling);
  return WHEEL[bytes[0]%WHEEL.length];
}
export function stopAngle(previous,number){
  const target=(360-WHEEL.indexOf(number)*360/WHEEL.length)%360;
  return previous+1800+(target-previous%360+360)%360;
}
const fresh=()=>({balance:1000,history:[],last:null});
function restore(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE));
    if(!saved||!Number.isSafeInteger(saved.balance)||saved.balance<0||saved.balance>LIMIT)return fresh();
    const history=Array.isArray(saved.history)?saved.history.filter(n=>WHEEL.includes(n)).slice(0,6):[];
    const last=saved.last;
    return {balance:saved.balance,history,last:last&&WHEEL.includes(last.number)&&Number.isSafeInteger(last.profit)&&Number.isSafeInteger(last.payout)&&last.payout>=0?last:null};
  }catch{return fresh();}
}
function wheelSvg(root){
  const ns='http://www.w3.org/2000/svg';
  const add=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;root.append(el);return el;};
  const point=(radius,angle)=>[140+radius*Math.cos(angle*Math.PI/180),140+radius*Math.sin(angle*Math.PI/180)];
  const step=360/WHEEL.length,paint={red:'#b6393e',black:'#202a27',zero:'#287a52'};
  add('circle',{cx:140,cy:140,r:136,fill:'#987137',stroke:'#ead29a','stroke-width':2});
  for(const [i,n] of WHEEL.entries()){
    const mid=-90+i*step,start=mid-step/2,end=mid+step/2;
    const a=point(131,start),b=point(131,end),c=point(82,end),d=point(82,start);
    add('path',{d:`M${a} A131 131 0 0 1 ${b} L${c} A82 82 0 0 0 ${d} Z`,fill:paint[colorOf(n)],stroke:'#c5ad76','stroke-width':.6});
    const [x,y]=point(112,mid);
    add('text',{x,y,'text-anchor':'middle','dominant-baseline':'central',fill:'#fff','font-size':11,'font-family':'Arial,sans-serif','font-weight':700,transform:`rotate(${mid+90} ${x} ${y})`},n);
    const lineA=point(82,mid),lineB=point(96,mid);
    add('path',{d:`M${lineA} L${lineB}`,stroke:'#d8c08a','stroke-width':.8,opacity:.7});
  }
  add('circle',{cx:140,cy:140,r:80,fill:'#174533',stroke:'#d3b576','stroke-width':3});
  add('circle',{cx:140,cy:140,r:67,fill:'#123b2b',stroke:'#49745c','stroke-width':1});
  add('circle',{cx:140,cy:140,r:48,fill:'none',stroke:'#547658','stroke-width':1,'stroke-dasharray':'1 5'});
}
function initRoulette(){
  const $=id=>document.getElementById('roulette-'+id);
  if(!$('form'))return;
  let state=restore(),busy=false,rotation=state.history.length?(360-WHEEL.indexOf(state.history[0])*360/WHEEL.length)%360:0;
  const rotor=$('rotor'),stake=$('stake'),radios=[...document.querySelectorAll('input[name="roulette-color"]')];
  const format=n=>n.toLocaleString('ru-RU');
  const color=()=>radios.find(r=>r.checked).value;
  const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}};
  wheelSvg(rotor);rotor.style.transform=`rotate(${rotation}deg)`;
  function controls(){
    stake.max=String(state.balance);stake.disabled=busy;radios.forEach(r=>r.disabled=busy);$('reset').disabled=busy;$('spin').disabled=busy||state.balance===0;
    const n=stake.valueAsNumber,multiplier=color()==='zero'?36:2;
    $('payout').textContent=Number.isSafeInteger(n)&&n>0?'Выплата при выигрыше: '+format(n*multiplier)+' фишек':'Укажите целое число фишек.';
    stake.setCustomValidity(n>state.balance?'Недостаточно фишек для этой ставки.':'');
  }
  function render(){
    $('balance').textContent=format(state.balance);
    $('history').replaceChildren();
    for(const n of state.history){const chip=document.createElement('span');chip.className='roulette-chip '+colorOf(n);chip.textContent=n;chip.title=n+' · '+COLORS[colorOf(n)];$('history').append(chip);}
    $('result').className='roulette-result';
    if(state.last){const last=state.last,chip=document.createElement('span');chip.className='roulette-chip '+colorOf(last.number);chip.textContent=last.number;const text=document.createElement('span');text.textContent=COLORS[colorOf(last.number)]+' · '+(last.profit>0?'+':'')+format(last.profit)+' фишек'+(last.payout?' · выплата '+format(last.payout):'');$('result').replaceChildren(chip,text);$('result').classList.add(last.profit>0?'is-win':'is-loss');}
    else $('result').textContent='Выберите цвет и сделайте ставку.';
    if(state.balance===0)$('result').append(' Баланс пуст — можно сбросить фишки.');
    controls();
  }
  stake.addEventListener('input',controls);radios.forEach(r=>r.addEventListener('change',controls));
  $('reset').addEventListener('click',()=>{if(busy)return;state=fresh();stake.value='10';save();render();});
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const wager=stake.valueAsNumber,selected=color();
    if(!Number.isSafeInteger(wager)||wager<1||wager>state.balance){stake.reportValidity();return;}
    let number,result;
    try{number=drawNumber();result=settle(state.balance,wager,selected,number);}catch(error){$('result').textContent=error instanceof RangeError?error.message:'Не удалось запустить колесо. Попробуйте ещё раз.';return;}
    busy=true;
    const before=state.balance;
    state={balance:result.balance,history:[number,...state.history].slice(0,6),last:{number,stake:wager,color:selected,payout:result.payout,profit:result.profit}};
    // Persist the complete spin before animation so a page reload cannot replay it.
    save();controls();$('balance').textContent=format(before-wager);$('result').className='roulette-result';$('result').textContent='Колесо вращается…';$('spin').textContent='Вращается…';
    const next=stopAngle(rotation,number),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:3600;
    try{await rotor.animate([{transform:`rotate(${rotation}deg)`},{transform:`rotate(${next}deg)`}],{duration,easing:'cubic-bezier(.12,.72,.13,1)',fill:'forwards'}).finished;}catch{}
    rotation=next;rotor.style.transform=`rotate(${rotation}deg)`;rotor.getAnimations().forEach(a=>a.cancel());
    busy=false;$('spin').textContent='Крутить колесо';render();
  });
  render();
}
if(typeof document!=='undefined')initRoulette();
