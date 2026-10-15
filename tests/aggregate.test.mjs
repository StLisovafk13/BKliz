import assert from 'node:assert/strict';
import {aggregate} from '../aggregate.js';
const e={id:'same-event',event:'Example'};
const a={feed_id:'cycle',task_name:'Cycle',generated_at:'2026-10-15T15:00:00Z',summary:'A',events:[e]};
const b={feed_id:'overview',task_name:'Overview',generated_at:'2026-10-15T16:00:00Z',summary:'B',events:[e]};
const c={feed_id:'signals',task_name:'Signals',generated_at:null,summary:'Waiting',events:[]};
const result=aggregate([a,b,c]);
assert.equal(result.events.length,2);assert.notEqual(result.events[0].id,result.events[1].id);assert.equal(result.events[0].task_name,'Cycle');assert.equal(result.events[1].task_name,'Overview');assert.equal(result.generated_at,b.generated_at);assert.equal(result.feeds.length,3);assert.equal(a.events[0].id,'same-event');assert.equal(aggregate([c]).generated_at,null);assert.equal(aggregate([]).events.length,0);
console.log('Aggregation passed: independent feeds, identical event IDs, pending feeds.');
