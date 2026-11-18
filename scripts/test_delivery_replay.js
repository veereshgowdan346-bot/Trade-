// Deterministic unit fixtures only: not historical data or a strategy backtest.
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { ingestHistoricalBars, deliveryLegCharges, replayDelivery } = require('../dist_test_cjs/delivery_replay.js');
const rates = { sttBuy:.001, sttSell:.001, exchange:.00003, sebi:.000001, stampBuy:.00015, gst:.18, dpPerScripSellDay:15, brokeragePerOrder:0, evidence:'TEST FIXTURE ONLY' };
const a = deliveryLegCharges('BUY',10,100,rates,false);
const b = deliveryLegCharges('SELL',10,110,rates,true);
assert(Math.abs(a.stt-1)<1e-9); assert(Math.abs(a.stamp-.15)<1e-9);
assert(Math.abs(b.stt-1.1)<1e-9); assert.equal(b.dp,15); assert(Math.abs(b.gst-(15+.033+.0011)*.18)<1e-9);
assert.throws(() => deliveryLegCharges('SELL',1,100,{...rates,dpPerScripSellDay:NaN},true));
const rows = [
  {t:Date.parse('2024-01-01T09:15:00+05:30'),o:100,h:101,l:99,c:100,v:1},
  {t:Date.parse('2024-01-01T09:16:00+05:30'),o:100,h:101,l:99,c:100,v:1},
  {t:Date.parse('2024-01-02T09:15:00+05:30'),o:90,h:101,l:89,c:100,v:1},
  {t:Date.parse('2024-01-02T09:16:00+05:30'),o:100,h:101,l:99,c:100,v:1},
];
const bytes=Buffer.from(JSON.stringify(rows));
const manifest={market:'NSE', instrument:'FIXTURE',dataKind:'REAL_HISTORICAL_1MIN',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),provider:'TEST ONLY',sourceReference:'TEST ONLY',attestedReal:true};
assert.throws(()=>ingestHistoricalBars(bytes,{...manifest,dataKind:'SYNTHETIC'}));
assert.throws(()=>ingestHistoricalBars(bytes,{...manifest,sha256:'0'.repeat(64)}));
const bars=ingestHistoricalBars(bytes,manifest);
assert.throws(()=>replayDelivery(rows,rates,3000,75,()=>({action:'HOLD'})));
const seen=[];
const result=replayDelivery(bars,rates,3000,75,h=>{ seen.push(h.length); return h.length===1 || h.length===3 ? {action:'BUY',qty:10,stop:95,target:120} : {action:'HOLD'}; });
assert.deepEqual(seen,[1,2,3,4]); assert.equal(result.trades.length,1);
assert.equal(result.trades[0].reason,'STOP_GAP'); assert.equal(result.trades[0].exit,90);
assert.equal(result.openPosition,null); // circuit breaker blocks next entry after realized loss
const same=rows.slice(0,2); same[1]={...same[1],l:90};
const badBytes=Buffer.from(JSON.stringify(same));
const bad=ingestHistoricalBars(badBytes,{...manifest,sha256:crypto.createHash('sha256').update(badBytes).digest('hex')});
assert.throws(()=>replayDelivery(bad,rates,3000,75,h=>h.length===1?{action:'BUY',qty:10,stop:95,target:120}:{action:'HOLD'}),/Same-day exit/);
console.log('Delivery replay unit fixtures passed (not a strategy backtest).');
