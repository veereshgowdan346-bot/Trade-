// Fetch public Yahoo chart data once; no credentials, no live trading.
// Usage: node scripts/fetch_market_data.js [RELIANCE.NS] [1m|5m|15m]
'use strict';
const fs=require('fs'),path=require('path');
const {parseRealCsv,sha256}=require('./ingest_real_csv');
const symbol=process.argv[2]||'RELIANCE.NS', interval=process.argv[3]||'5m';
if(!/^[A-Z0-9&-]+\.NS$/.test(symbol)||!['1m','5m','15m'].includes(interval)||process.argv.length>4) throw Error('Usage: node scripts/fetch_market_data.js [NSE_SYMBOL.NS] [1m|5m|15m]');
const intervalMinutes=Number(interval.slice(0,-1)), range=interval==='1m'?'7d':'60d';
const dir=path.join(__dirname,'..','data','historical_real'), csvPath=path.join(dir,'market.csv'), manifestPath=path.join(dir,'manifest.json');
const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=history`;
async function main(){
  if(fs.existsSync(csvPath)||fs.existsSync(manifestPath)) throw Error('Input file already exists; refusing to overwrite');
  const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw Error(`Yahoo HTTP ${response.status}`);
  const body=await response.json(), result=body?.chart?.result?.[0];
  if(body?.chart?.error || !result || !Array.isArray(result.timestamp) || !result.indicators?.quote?.[0]) throw Error('Malformed or empty provider response');
  const meta=result.meta||{};
  if(meta.symbol!==symbol || !['NSE','NSI'].includes(meta.exchangeName) || meta.exchangeTimezoneName!=='Asia/Kolkata' || meta.instrumentType!=='EQUITY') throw Error('Provider metadata is not a matching NSE equity');
  const q=result.indicators.quote[0], rows=['timestamp,open,high,low,close,volume'];
  let skipped=0;
  for(let i=0;i<result.timestamp.length;i++){
    const t=result.timestamp[i], v=[q.open?.[i],q.high?.[i],q.low?.[i],q.close?.[i],q.volume?.[i]];
    // Omit incomplete, missing, or extended-hours observations; never interpolate.
    if(!Number.isSafeInteger(t)||t*1000+intervalMinutes*60000>Date.now()||v.some(x=>!Number.isFinite(x))){skipped++;continue;}
    const ist=new Date(t*1000+19800000), minute=ist.getUTCHours()*60+ist.getUTCMinutes();
    if(minute<555||minute>930-intervalMinutes||(minute-555)%intervalMinutes!==0){skipped++;continue;}
    rows.push([t,...v].join(','));
  }
  const bytes=Buffer.from(rows.join('\n')+'\n');
  const manifest={market:'NSE',instrument:symbol,dataKind:'REAL_HISTORICAL_INTRADAY',intervalMinutes,provider:'Yahoo Finance',sourceReference:url,attestedReal:true,attestationMeaning:'Provider-supplied historical data; not independently authenticated',retrievedAt:new Date().toISOString(),csvSha256:sha256(bytes),skippedProviderRows:skipped};
  const validated=parseRealCsv(bytes,manifest);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(csvPath,bytes,{flag:'wx'});
  try {fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});}
  catch(e){console.error('CSV was created, but manifest creation failed; inspect the files before retrying.');throw e;}
  console.log(JSON.stringify({csvPath,manifestPath,intervalMinutes,sessions:validated.sessions.length,bars:validated.bars.length,missingSessions:validated.missingSessions,skipped},null,2));
}
main().catch(e=>{console.error(`Data fetch failed: ${e.message}${e.cause?.code?' ('+e.cause.code+')':''}`);process.exitCode=1;});
