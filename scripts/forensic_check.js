const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scripts/phase4_simulation_output.json', 'utf8'));

let sumGross = 0;
let sumCharges = 0;
let sumNet = 0;

console.log("Index | TradeID | Side | Qty | Entry | Exit | Gross | Charges | Net | Gross - Charges | Diff");
data.trades.forEach((t, i) => {
  sumGross += t.grossPnL;
  sumCharges += t.totalCharges;
  sumNet += t.netPnL;
  const expectedNet = Math.round((t.grossPnL - t.totalCharges) * 100) / 100;
  const diff = Math.round((t.netPnL - expectedNet) * 100) / 100;
  console.log(`${i+1} | ${t.tradeId} | ${t.side} | ${t.qty} | ${t.entryPrice} | ${t.exitPrice} | ${t.grossPnL} | ${t.totalCharges} | ${t.netPnL} | ${expectedNet} | ${diff}`);
});

console.log("\n--- AGGREGATE TOTALS IN JSON ---");
console.log("Sum Gross:", Math.round(sumGross * 100) / 100);
console.log("Sum Charges:", Math.round(sumCharges * 100) / 100);
console.log("Sum Net:", Math.round(sumNet * 100) / 100);
console.log("Sum Gross - Sum Charges:", Math.round((sumGross - sumCharges) * 100) / 100);
console.log("Reported Net Profit in metrics:", data.performanceMetrics.netProfit);
console.log("Reported Final Capital in metrics:", data.performanceMetrics.finalCapital);
