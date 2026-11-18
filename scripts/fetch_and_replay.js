// Explicit offline-paper workflow; stop immediately if fetch or compilation fails.
'use strict';
const {spawnSync}=require('child_process');
const path=require('path');
const root=path.join(__dirname,'..');
const symbol=process.argv[2]||'RELIANCE.NS', interval=process.argv[3]||'5m';
if(process.argv.length>4) { console.error('Usage: node scripts/fetch_and_replay.js [SYMBOL.NS] [1m|5m|15m]'); process.exit(1); }
for(const [command,args] of [[process.execPath,['scripts/fetch_market_data.js',symbol,interval]],['npm',['run','test:prep']],[process.execPath,['scripts/run_real_blind_replay.js']]]) {
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit'});
  if(result.error || result.status!==0) { console.error(`Workflow stopped after ${command}: ${result.error?.message || `exit ${result.status}`}`); process.exit(1); }
}
