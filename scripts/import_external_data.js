/**
 * External data importer — provenance-preserving ingestion of real NSE data.
 *
 * Background: the environment can reach only github.com/api.github.com/codeload/pypi/npm. Official
 * NSE downloads are TLS-blocked, so genuine data can only be obtained as a THIRD-PARTY
 * REDISTRIBUTION. That is a real provenance limitation and is recorded, not hidden:
 *
 *   - `authenticity: "UNVERIFIED_REDISTRIBUTION"` — the bytes are not proven to equal NSE's originals
 *   - the upstream repo, blob SHA, licence and retrieval time are recorded for every file
 *   - file SHA-256 is computed locally so a later re-fetch can be compared byte-for-byte
 *
 * Supported formats
 *   1. NIFTY 50 index 1-minute:  Epoch,Timestamp,Open,High,Low,Close   (no volume by construction)
 *   2. NSE equity 1-minute tape: Date,Symbol,Time,open,high,low,close,volume  (IST wall clock)
 *
 * Raw files stay in data/external/ (gitignored). Only the manifest is committed.
 *
 * Usage: node scripts/import_external_data.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const EXT = path.join(ROOT, "data", "external", "nse");
const OUT_DIR = path.join(ROOT, "data", "provenance");
const MANIFEST = path.join(OUT_DIR, "external_dataset_manifest.json");
const CANON = path.join(ROOT, "data", "external", "canonical");

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/* ------------------------------ declarative sources ------------------------------ */

/**
 * Upstream blob SHAs captured from the GitHub API. These pin the EXACT bytes the local files
 * descend from. Re-verifiable with:
 *   curl -s https://api.github.com/repos/<owner>/<repo>/contents/<path>
 * Licence permission and exchange authenticity are different things: a permissive licence does not
 * make the prices authentic, and this field only proves which bytes were downloaded.
 */
const UPSTREAM_BLOBS = {
  "NIFTY50_1min_2022.csv": { blobSha: "4f05c9804c956b8662dabb7d106b1e4702f3a77e", size: 6019857 },
  "NIFTY50_1min_2023.csv": { blobSha: "eec7d0efbfab465e9c686c8e9479c875fc60c2bd", size: 5975228 },
  "NIFTY50_1min_2024.csv": { blobSha: "35e0c5727c29b50e54c91ca756126c1697adb557", size: 6014477 },
  "20200108.csv": { blobSha: "e30c473ef60b732aa5bf53275e5cef66d8cfb3dc", size: 7850611 },
  "20200110.csv": { blobSha: "91521f18604ff4a158ac9ddcc7710be7d2c1aed4", size: 7911222 },
};
const UPSTREAM_HEADS = {
  "technovusin/nifty50-historical-data": "088a7a856da9b670c505c0831d2f472f0d69027c",
  "hunterabhi/daily-1-minute-eod-data": "f482c664a0726aa5726cc98146ca3818c8f09064",
};

const SOURCES = {
  nifty_index: {
    instrument: "NIFTY 50 (index)",
    kind: "REAL_REDISTRIBUTION",
    timeframe: "1m",
    upstream: "technovusin/nifty50-historical-data",
    upstreamUrl: "https://github.com/technovusin/nifty50-historical-data",
    licence: "MIT",
    redistributionAllowed: true,
    volumePublished: false,
    downloadMethod:
      "GitHub contents/git-blobs API (base64). raw.githubusercontent.com and NSE are unreachable from this environment.",
    limitations: [
      "Third-party redistribution; bytes not verified against NSE originals",
      "Index series: volume is not published, so volume-based strategies are NOT_EVALUABLE",
      "Index level is not directly tradable; equity cost model applied as a proxy",
    ],
  },
  equity_tape: {
    instrument: "NSE equity (multi-symbol intraday tape)",
    kind: "REAL_REDISTRIBUTION",
    timeframe: "1m",
    upstream: "hunterabhi/daily-1-minute-eod-data",
    upstreamUrl: "https://github.com/hunterabhi/daily-1-minute-eod-data",
    licence: "none declared",
    redistributionAllowed: false,
    volumePublished: true,
    downloadMethod: "GitHub git-blobs API (base64).",
    limitations: [
      "No licence declared upstream — data is NOT redistributed in this repository",
      "Only two sessions are available, so no performance inference is possible",
      "Third-party redistribution; bytes not verified against NSE originals",
    ],
  },
};

/* ---------------------------------- parsers ---------------------------------- */

function parseNiftyIndex(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const header = lines.shift();
  if (!/^Epoch,Timestamp,Open,High,Low,Close/.test(header)) throw new Error(`unexpected header in ${file}: ${header}`);
  const out = [];
  for (const l of lines) {
    const [epoch, ts, o, h, lo, c] = l.split(",");
    out.push({
      t: Number(epoch) * 1000, // epoch is true UTC; equals 09:15 IST for the first bar
      o: +o, h: +h, l: +lo, c: +c,
      v: 0, // index publishes no volume
      istWallClock: ts,
    });
  }
  return out;
}

function parseEquityTape(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  lines.shift(); // Date,Symbol,Time,...
  const bySymbol = new Map();
  for (const l of lines) {
    const [date, sym, time, o, h, lo, c, v] = l.split(",");
    if (!sym || !time) continue;
    // upstream encodes the date as YYYYMMDD, which Date.parse rejects — normalise to ISO first
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const ms = Date.parse(`${iso}T${time}+05:30`);
    if (!Number.isFinite(ms)) throw new Error(`unparseable timestamp in ${file}: ${date} ${time}`);
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym).push({ t: ms, o: +o, h: +h, l: +lo, c: +c, v: +(v || 0) });
  }
  // sort each series chronologically; the importer refuses to "fix" ordering silently downstream
  for (const arr of bySymbol.values()) arr.sort((a, b) => a.t - b.t);
  return bySymbol;
}

/* ---------------------------------- helpers ---------------------------------- */

function sessionStats(candles) {
  const byDay = new Map();
  for (const c of candles) {
    const d = new Date(c.t + IST_OFFSET_MS).toISOString().slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const counts = [...byDay.values()];
  return {
    sessions: byDay.size,
    firstSession: [...byDay.keys()].sort()[0] ?? null,
    lastSession: [...byDay.keys()].sort().pop() ?? null,
    barsPerSessionMin: counts.length ? Math.min(...counts) : 0,
    barsPerSessionMax: counts.length ? Math.max(...counts) : 0,
    barsPerSessionMean: counts.length ? Number((counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2)) : 0,
    shortSessions: [...byDay.entries()].filter(([, n]) => n < 300).map(([d, n]) => ({ date: d, bars: n })),
  };
}

function integrity(candles) {
  let badOhlc = 0, nonPositive = 0, dup = 0, unordered = 0, nonPositiveVolume = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!(c.h >= Math.max(c.o, c.c) - 1e-9 && c.l <= Math.min(c.o, c.c) + 1e-9)) badOhlc++;
    if (c.o <= 0 || c.h <= 0 || c.l <= 0 || c.c <= 0) nonPositive++;
    if (!(c.v >= 0)) nonPositiveVolume++;
    if (i) {
      if (candles[i - 1].t === c.t) dup++;
      if (candles[i - 1].t > c.t) unordered++;
    }
  }
  return { badOhlc, nonPositive, dup, unordered, nonPositiveVolume };
}

/* ----------------------------------- main ----------------------------------- */

const datasets = [];

function addDataset(entry, candles, srcKey, file) {
  const buf = fs.readFileSync(file);
  const st = sessionStats(candles);
  const ig = integrity(candles);
  const src = SOURCES[srcKey];
  const id = path.basename(file).replace(/\.csv$/, "");
  const record = {
    id,
    kind: src.kind,
    instrument: entry.instrument ?? src.instrument,
    symbol: entry.symbol ?? null,
    timeframe: src.timeframe,
    rows: candles.length,
    ...st,
    priceRange: {
      first: candles[0]?.o ?? null,
      last: candles[candles.length - 1]?.c ?? null,
      // reduce, not Math.min(...): spreading ~283k values overflows the call stack
      minLow: candles.reduce((m, c) => (c.l < m ? c.l : m), Infinity),
      maxHigh: candles.reduce((m, c) => (c.h > m ? c.h : m), -Infinity),
    },
    integrity: ig,
    volumePublished: src.volumePublished,
    provenance: {
      upstream: src.upstream,
      upstreamUrl: src.upstreamUrl,
      licence: src.licence,
      redistributionAllowed: src.redistributionAllowed,
      downloadMethod: src.downloadMethod,
      retrievedAt: new Date().toISOString(),
      fileSha256: sha256(buf),
      fileBytes: buf.length,
      upstreamBlobSha: UPSTREAM_BLOBS[path.basename(file)]?.blobSha ?? null,
      upstreamHeadCommit: UPSTREAM_HEADS[src.upstream] ?? null,
      upstreamBlobSizeMatches:
        UPSTREAM_BLOBS[path.basename(file)] ? UPSTREAM_BLOBS[path.basename(file)].size === buf.length : null,
      authenticity: "UNVERIFIED_REDISTRIBUTION",
      limitations: src.limitations,
    },
  };
  datasets.push(record);
  // canonical cache for the audit/backtest runners (gitignored)
  fs.writeFileSync(path.join(CANON, `${id}.json`), JSON.stringify({ id, candles: candles.map(({ t, o, h, l, c, v }) => ({ t, o, h, l, c, v })) }));
  return record;
}

function main() {
  if (!fs.existsSync(EXT)) {
    console.error(`[import] no external data at ${EXT} — nothing to import`);
    process.exitCode = 2;
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CANON, { recursive: true });

  const indexFiles = fs.readdirSync(EXT).filter((f) => /^NIFTY50_1min_\d{4}\.csv$/.test(f)).sort();
  for (const f of indexFiles) {
    const candles = parseNiftyIndex(path.join(EXT, f));
    const r = addDataset({ instrument: "NIFTY 50 (index)" }, candles, "nifty_index", path.join(EXT, f));
    console.error(`[import] ${r.id.padEnd(22)} rows=${String(r.rows).padStart(6)} sessions=${String(r.sessions).padStart(4)} badOHLC=${r.integrity.badOhlc} dup=${r.integrity.dup} unordered=${r.integrity.unordered} shortSessions=${r.shortSessions.length}`);
  }

  const tapeFiles = fs.readdirSync(EXT).filter((f) => /^\d{8}\.csv$/.test(f)).sort();
  for (const f of tapeFiles) {
    const bySymbol = parseEquityTape(path.join(EXT, f));
    // import the whole tape as one file but also surface per-symbol counts
    let all = [];
    for (const arr of bySymbol.values()) all = all.concat(arr);
    const r = addDataset({ instrument: "NSE equity tape", symbol: `${bySymbol.size} symbols` }, all.sort((a, b) => a.t - b.t), "equity_tape", path.join(EXT, f));
    r.symbolCount = bySymbol.size;
    r.topSymbols = [...bySymbol.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([s, a]) => ({ symbol: s, bars: a.length }));
    console.error(`[import] ${r.id.padEnd(22)} rows=${String(r.rows).padStart(6)} symbols=${bySymbol.size} sessions=${r.sessions} badOHLC=${r.integrity.badOhlc}`);
  }

  const manifest = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    environment: {
      reachable: ["github.com", "api.github.com", "codeload.github.com", "pypi.org", "registry.npmjs.org"],
      blocked: [
        { host: "www.nseindia.com", evidence: "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL" },
        { host: "www.sebi.gov.in", evidence: "curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL" },
        { host: "www.cbic.gov.in (GST)", evidence: "http=000" },
        { host: "raw.githubusercontent.com", evidence: "http=000" },
      ],
      consequence:
        "Official downloads are impossible. Real data is therefore only obtainable as third-party redistribution, which cannot establish authenticity against the exchange.",
    },
    separationPolicy: {
      syntheticFixtures: "data/fixtures/** — committed, always labelled SYNTHETIC",
      realExternal: "data/external/** — gitignored, labelled REAL_REDISTRIBUTION with authenticity UNVERIFIED",
      rule: "A REAL_REDISTRIBUTION dataset still cannot support a profitability claim until authenticity and cost rates are verified.",
    },
    datasets,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ manifest: MANIFEST, datasets: datasets.map((d) => ({ id: d.id, rows: d.rows, sessions: d.sessions, sha256: d.provenance.fileSha256.slice(0, 16) })) }, null, 2));
}

main();
