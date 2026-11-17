const fs = require('fs');
const path = require('path');

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;

function generateSampleMarketFeed(days = 4, basePrice = 2500, seed = 42) {
  let rng = seed;
  const nextRand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  const candles = [];
  let cur = basePrice;
  const baseStart = Date.parse("2026-11-17T09:15:00+05:30");
  const barsPerDay = 375;

  for (let d = 0; d < days; d++) {
    const dayStartTs = baseStart + d * 24 * 3600 * 1000;
    for (let b = 0; b < barsPerDay; b++) {
      const t = dayStartTs + b * 60000;
      let drift = 0;
      let vol = 1.8;

      if (d === 0) {
        if (b < 120) drift = 0.35;
        else if (b < 240) drift = (nextRand() - 0.5) * 0.15;
        else drift = 0.25;
      } else if (d === 1) {
        if (b < 140) drift = -0.40;
        else if (b < 260) drift = (nextRand() - 0.5) * 0.2;
        else drift = -0.20;
      } else if (d === 2) {
        drift = (nextRand() - 0.5) * 0.12;
        vol = 1.2;
      } else {
        if (b < 100) drift = 0.50;
        else if (b < 220) drift = -0.55;
        else drift = 0.30;
        vol = 3.2;
      }

      const delta = drift + (nextRand() - 0.49) * vol;
      const o = cur;
      const c = r2(o + delta);
      const h = r2(Math.max(o, c) + nextRand() * (vol * 0.8));
      const l = r2(Math.min(o, c) - nextRand() * (vol * 0.8));
      const v = Math.floor(1000 + nextRand() * 5000 * (vol / 1.5));

      candles.push({ t, o, h, l, c, v });
      cur = c;
    }
  }
  return candles;
}

const candles = generateSampleMarketFeed(4, 2500, 42);
console.log(`Generated ${candles.length} candles.`);
const p0 = candles[0].o; // Entry at bar 0 Open = 2500
const pEnd = candles[candles.length - 1].c;
console.log(`Start Price (Bar 0 Open): ${p0}, End Price (Bar 1499 Close): ${pEnd}`);

// 1. Unmanaged Buy & Hold (39 shares)
let peak39 = 100000;
let maxDD39 = 0;
let curPeakBar39 = 0;
let maxDDBars39 = { peakBar: 0, troughBar: 0 };
const eqCurve39 = [];

for (let i = 0; i < candles.length; i++) {
  const c = candles[i];
  // Mark-to-market equity with 39 shares
  const pnl = 39 * (c.c - p0);
  const eq = 100000 + pnl;
  eqCurve39.push(eq);

  if (eq > peak39) {
    peak39 = eq;
    curPeakBar39 = i;
  }
  const dd = peak39 - eq;
  if (dd > maxDD39) {
    maxDD39 = dd;
    maxDDBars39 = { peakBar: curPeakBar39, troughBar: i };
  }
}

const unmanagedGrossPnL = r2(39 * (pEnd - p0));
const unmanagedFriction = 80.49;
const unmanagedNetPnL = r2(unmanagedGrossPnL - unmanagedFriction);
const maxDD39Pct = r2((maxDD39 / peak39) * 100);
const maxDD39OnCap = r2((maxDD39 / 100000) * 100);

console.log(`\nUnmanaged Buy & Hold (39 shares):`);
console.log(`  Gross P&L: Rs ${unmanagedGrossPnL}`);
console.log(`  Friction: Rs ${unmanagedFriction}`);
console.log(`  Net P&L: Rs ${unmanagedNetPnL}`);
console.log(`  Peak Equity: Rs ${r2(peak39)} at Bar ${maxDDBars39.peakBar}`);
console.log(`  Trough Equity: Rs ${r2(peak39 - maxDD39)} at Bar ${maxDDBars39.troughBar}`);
console.log(`  Max Drawdown: Rs ${r2(maxDD39)} (${maxDD39Pct}% of peak, ${maxDD39OnCap}% of initial capital)`);

// 2. Risk-Budget-Matched Buy & Hold (4 shares)
let peak4 = 100000;
let maxDD4 = 0;
let curPeakBar4 = 0;
let maxDDBars4 = { peakBar: 0, troughBar: 0 };
const eqCurve4 = [];

for (let i = 0; i < candles.length; i++) {
  const c = candles[i];
  const pnl = 4 * (c.c - p0);
  const eq = 100000 + pnl;
  eqCurve4.push(eq);

  if (eq > peak4) {
    peak4 = eq;
    curPeakBar4 = i;
  }
  const dd = peak4 - eq;
  if (dd > maxDD4) {
    maxDD4 = dd;
    maxDDBars4 = { peakBar: curPeakBar4, troughBar: i };
  }
}

const fourGrossPnL = r2(4 * (pEnd - p0));
const fourFriction = 40.40;
const fourNetPnL = r2(fourGrossPnL - fourFriction);
const maxDD4Pct = r2((maxDD4 / peak4) * 100);
const maxDD4OnCap = r2((maxDD4 / 100000) * 100);

console.log(`\n4-Share Benchmark (Ex-Post Risk-Matched & Ex-Ante Fixed Allocation):`);
console.log(`  Gross P&L: Rs ${fourGrossPnL}`);
console.log(`  Friction: Rs ${fourFriction}`);
console.log(`  Net P&L: Rs ${fourNetPnL}`);
console.log(`  Peak Equity: Rs ${r2(peak4)} at Bar ${maxDDBars4.peakBar}`);
console.log(`  Trough Equity: Rs ${r2(peak4 - maxDD4)} at Bar ${maxDDBars4.troughBar}`);
console.log(`  Max Drawdown: Rs ${r2(maxDD4)} (${maxDD4Pct}% of peak, ${maxDD4OnCap}% of initial capital)`);

// Let's also check sample points on the curve (e.g. Day 1, Day 2, Day 3, Day 4 endpoints)
console.log('\n--- Daily Mark-to-Market Snapshots (EOD) ---');
[374, 749, 1124, 1499].forEach((bar, idx) => {
  const c = candles[bar];
  console.log(`Day ${idx + 1} Close (Bar ${bar}): Price=${c.c} | 39-Share Eq=Rs ${r2(eqCurve39[bar])} (Gross ${r2(39 * (c.c - p0))}) | 4-Share Eq=Rs ${r2(eqCurve4[bar])} (Gross ${r2(4 * (c.c - p0))})`);
});
