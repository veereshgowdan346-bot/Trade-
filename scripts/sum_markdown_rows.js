const markdownRows = [
  { id: "PAPER_1", gross: 317.85, tax: 125.60, net: 192.25 },
  { id: "PAPER_2", gross: 320.97, tax: 127.11, net: 193.86 },
  { id: "PAPER_3", gross: -129.20, tax: 125.07, net: -254.27 },
  { id: "PAPER_4", gross: 298.30, tax: 125.80, net: 172.50 },
  { id: "PAPER_5", gross: 288.60, tax: 126.20, net: 162.40 },
  { id: "PAPER_6", gross: -105.30, tax: 124.95, net: -230.25 },
  { id: "PAPER_7", gross: 325.65, tax: 126.85, net: 198.80 },
  { id: "PAPER_8", gross: -144.30, tax: 125.40, net: -269.70 },
  { id: "PAPER_9", gross: 319.80, tax: 126.40, net: 193.40 },
  { id: "PAPER_10", gross: 46.80, tax: 125.10, net: -78.30 },
  { id: "PAPER_11", gross: 334.40, tax: 127.20, net: 207.20 },
  { id: "PAPER_12", gross: 349.60, tax: 128.05, net: 221.55 },
  { id: "PAPER_13", gross: -163.40, tax: 126.10, net: -289.50 },
  { id: "PAPER_14", gross: 319.20, tax: 126.50, net: 192.70 },
  { id: "PAPER_15", gross: -163.40, tax: 125.90, net: -289.30 },
];

let sumG = 0, sumT = 0, sumN = 0;
markdownRows.forEach(r => {
  sumG += r.gross;
  sumT += r.tax;
  sumN += r.net;
});

console.log("Markdown Rows Sum Gross:", Math.round(sumG * 100) / 100);
console.log("Markdown Rows Sum Tax:", Math.round(sumT * 100) / 100);
console.log("Markdown Rows Sum Net:", Math.round(sumN * 100) / 100);
console.log("Markdown Sum Gross - Sum Tax:", Math.round((sumG - sumT) * 100) / 100);
