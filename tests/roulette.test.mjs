import assert from 'node:assert/strict';
import {WHEEL,colorOf,settle,stopAngle,drawNumber} from '../roulette.js';

assert.equal(new Set(WHEEL).size,37);
assert.deepEqual([...WHEEL].sort((a,b)=>a-b),Array.from({length:37},(_,n)=>n));
assert.equal(WHEEL.filter(n=>colorOf(n)==='red').length,18);
assert.equal(WHEEL.filter(n=>colorOf(n)==='black').length,18);
assert.equal(colorOf(0),'zero');
assert.deepEqual(settle(1000,10,'red',32),{balance:1010,payout:20,profit:10});
assert.deepEqual(settle(1000,10,'black',32),{balance:990,payout:0,profit:-10});
assert.deepEqual(settle(1000,10,'zero',0),{balance:1350,payout:360,profit:350});
for(const color of ['red','black'])assert.equal(settle(10,10,color,0).balance,0);
for(const invalid of [0,-1,10.5,1001,NaN])assert.throws(()=>settle(1000,invalid,'red',32),RangeError);
assert.throws(()=>settle(1000,10,'green',0),RangeError);
assert.throws(()=>settle(1000,10,'red',37),RangeError);
// Every winning sector must stop beneath the pointer even after several turns.
for(const start of [0,2317.5,7200])for(const number of WHEEL){const angle=stopAngle(start,number);assert(angle>=start+1800);const position=(angle+WHEEL.indexOf(number)*360/37)%360;assert(Math.min(position,360-position)<1e-8);}
for(let i=0;i<100;i++)assert(WHEEL.includes(drawNumber()));
console.log('Roulette passed: 37 sectors, color payouts, zero, stake validation and pointer alignment.');
