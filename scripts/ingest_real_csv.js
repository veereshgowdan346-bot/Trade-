// Local-only CSV validator. Provider attestations cannot prove authenticity.
'use strict';
const crypto = require('crypto');
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
function csvRows(text) {
  const rows=[]; let row=[], field='', quoted=false, closed=false, atStart=true;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) { if(c==='"') { if(text[i+1]==='"') {field+='"';i++;} else {quoted=false;closed=true;} } else field+=c; continue; }
    if(c==='"') { if(!atStart || closed) throw Error('Invalid CSV quote'); quoted=true; atStart=false; continue; }
    if(c===',' || c==='\n' || c==='\r') {
      row.push(field); field=''; atStart=true; closed=false;
      if(c!==',') { if(c==='\r' && text[i+1]==='\n') i++; rows.push(row); row=[]; }
      continue;
    }
    if(closed) throw Error('Unexpected character after quoted CSV field');
    field+=c; atStart=false;
  }
  if(quoted) throw Error('Unclosed CSV quote');
  if(row.length || field.length || closed) { row.push(field); rows.push(row); }
  return rows;
}
function parseTime(s) {
  if (!/^(?:\d{10}|\d{13}|\d{4}-\d\d-\d\dT\d\d:\d\d(?::00(?:\.000)?)?(?:Z|\+05:30))$/.test(s)) throw Error(`Invalid timestamp: ${s}`);
  const n=/^\d+$/.test(s) ? Number(s)*(s.length===10?1000:1) : Date.parse(s);
  if (!Number.isSafeInteger(n) || n%60000!==0) throw Error('Timestamp must be a valid exact minute');
  if (!/^\d+$/.test(s)) {
    const local=s.endsWith('Z') ? new Date(n).toISOString().slice(0,16) : new Date(n+19800000).toISOString().slice(0,16);
    if(local!==s.slice(0,16)) throw Error(`Invalid date: ${s}`);
  }
  return n;
}
function parseRealCsv(bytes, manifest) {
  if (!manifest || manifest.market!=='NSE' || !['REAL_HISTORICAL_1MIN','REAL_HISTORICAL_INTRADAY'].includes(manifest.dataKind) || manifest.attestedReal!==true || typeof manifest.instrument!=='string' || !manifest.instrument.trim() || typeof manifest.provider!=='string' || !manifest.provider.trim() || typeof manifest.sourceReference!=='string' || !manifest.sourceReference.trim() || typeof manifest.csvSha256!=='string' || !/^[a-f0-9]{64}$/.test(manifest.csvSha256) || sha256(bytes)!==manifest.csvSha256) throw Error('Manifest source or CSV SHA-256 invalid');
  const interval=manifest.intervalMinutes ?? (manifest.dataKind==='REAL_HISTORICAL_1MIN'?1:undefined);
  if (![1,5,15].includes(interval) || (manifest.dataKind==='REAL_HISTORICAL_1MIN' && interval!==1)) throw Error('Invalid declared intraday interval');
  const rows=csvRows(bytes.toString('utf8'));
  if (!rows.length || rows[0].join(',')!=='timestamp,open,high,low,close,volume') throw Error('Expected exact header timestamp,open,high,low,close,volume');
  let last=-Infinity; const sessions=new Map(), bars=[];
  for (let i=1;i<rows.length;i++) {
    const r=rows[i]; if(r.length!==6 || r.some(x=>x.trim()!==x || !x)) throw Error(`Invalid row ${i+1}`);
    const t=parseTime(r[0]);
    const nums=r.slice(1).map(s=>{if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)) throw Error(`Invalid numeric value at row ${i+1}`);return Number(s);});
    const [o,h,l,c,v]=nums;
    if(t<=last || !nums.every(Number.isFinite) || o<=0 || h<=0 || l<=0 || c<=0 || v<0 || h<Math.max(o,l,c) || l>Math.min(o,h,c)) throw Error(`Invalid, unordered, duplicate or inconsistent bar at row ${i+1}`);
    last=t;
    const ist=new Date(t+19800000), d=ist.toISOString().slice(0,10), minute=ist.getUTCHours()*60+ist.getUTCMinutes();
    if(minute<555 || minute>930-interval || (minute-555)%interval!==0) throw Error(`Outside or misaligned regular session at row ${i+1}`);
    const list=sessions.get(d)||[]; list.push(minute); sessions.set(d,list);
    bars.push({t,o,h,l,c,v});
  }
  const minimumSessions=interval===1?5:30;
  if(sessions.size<minimumSessions) throw Error(`At least ${minimumSessions} sessions required for ${interval}-minute bars`);
  const missing=[];
  for(const [d,minutes] of sessions) {
    const seen=new Set(minutes), missingMinutes=[];
    for(let m=555;m<930;m+=interval) if(!seen.has(m)) missingMinutes.push(m);
    if(missingMinutes.length) missing.push({date:d,missingBars:missingMinutes.length});
  }
  return {bars,sessions:[...sessions.keys()],intervalMinutes:interval,missingSessions:missing,csvSha256:sha256(bytes)};
}
module.exports={parseRealCsv,sha256};
