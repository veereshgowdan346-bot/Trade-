// Offline, paper-only, exploratory replay. Never submit real orders.
'use strict';
const fs=require('fs'), path=require('path');
const {parseRealCsv,sha256}=require('./ingest_real_csv');
const {ingestHistoricalBars,replayDelivery,deliveryLegCharges,USER_AUTHORIZED_DELIVERY_SCENARIO:rates}=require('../dist_test_cjs/delivery_replay');
const {atr,adx}=require('../dist_test_cjs/indicators');
const {runExperimental}=require('../dist_test_cjs/experimental_strategies');
const dir=path.join(__dirname,'..','data','historical_real');
const CAPITAL=3000, LIMIT=75, STRATEGY='x_macd_momentum';
function main(){
  const csv=fs.readFileSync(path.join(dir,'market.csv'));
  const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  const parsed=parseRealCsv(csv,m);
  const bytes=Buffer.from(JSON.stringify(parsed.bars));
  const bars=ingestHistoricalBars(bytes,{market:'NSE',instrument:m.instrument,dataKind:'REAL_HISTORICAL_1MIN',sha256:sha256(bytes),provider:m.provider,sourceReference:m.sourceReference,attestedReal:true});
  // Fixed single strategy, long-only adaptation; signals see only the prefix.
  const strategy=history=>{
    if(history.length<60) return {action:'HOLD'};
    const signal=runExperimental(STRATEGY,history);
    if(signal.signal===-1 && signal.confidence>=55) return {action:'SELL'};
    if(signal.signal!==1 || signal.confidence<70) return {action:'HOLD'};
    const last=history[history.length-1], a=atr(history,14).at(-1), regime=adx(history,14).adx.at(-1);
    if(!Number.isFinite(a) || a<=0 || !Number.isFinite(regime) || regime<25) return {action:'HOLD'};
    // Sizing uses the known close; the replay rejects an unaffordable next-open fill.
    const qty=Math.floor(CAPITAL/last.c), stop=last.c-2*a, target=last.c+3*a;
    if(qty<1 || stop<=0) return {action:'HOLD'};
    const charges=deliveryLegCharges('BUY',qty,last.c,rates,false).total+deliveryLegCharges('SELL',qty,target,rates,true).total;
    if(qty*3*a < 3*charges) return {action:'HOLD'};
    return {action:'BUY',qty,stop,target};
  };
  const result=replayDelivery(bars,rates,CAPITAL,LIMIT,strategy);
  const gross=result.trades.reduce((s,t)=>s+t.gross,0), net=result.trades.reduce((s,t)=>s+t.net,0);
  const report={
    disclaimer:'PAPER ONLY, exploratory replay, not independently verified data or rates, not proof of real-market profit or out-of-sample performance.',
    data:{instrument:m.instrument,provider:m.provider,sourceReference:m.sourceReference,csvSha256:parsed.csvSha256,sessions:parsed.sessions.length,firstSession:parsed.sessions[0],lastSession:parsed.sessions.at(-1),bars:bars.length,attestation:'USER PROVIDED; NOT INDEPENDENTLY VERIFIED'},
    protocol:{capital:CAPITAL, strategy:STRATEGY, mode:'LONG_ONLY_1MIN_NEXT_OPEN',warmup:60,entryConfidence:70,exitConfidence:55,adxPeriod:14,adxMin:25,atrPeriod:14,stopAtr:2,targetAtr:3,costMultiple:3,dailyRealizedLossLimit:LIMIT,costRates:rates,rateStatus:'USER PROVIDED; NOT INDEPENDENTLY VERIFIED',selection:'Single fixed strategy; not an OOS claim'},
    summary:{trades:result.trades.length,gross,realizedNet:net,meanNetPerTrade:result.trades.length?net/result.trades.length:null,cash:result.cash,markedEquity:result.markedEquity,maxMarkedDrawdown:result.maxMarkedDrawdown,openPosition:result.openPosition,rejectedOrders:result.rejectedOrders},
    details:result,
  };
  const out=path.join(dir,'replay_report.json');
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(`Paper report written to ${out}`);
}
try { main(); } catch(e) { console.error(`Replay aborted: ${e.message}. No new report produced.`); process.exitCode=1; }
