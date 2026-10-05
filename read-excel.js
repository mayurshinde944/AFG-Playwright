const xlsx = require('xlsx');

const filepath = 'D:\\invezza\\AFG Automation\\artifacts\\reports\\QA_Report_2026-08-18T11-31-33-599Z.xlsx';
const wb = xlsx.readFile(filepath);

for (const name of wb.SheetNames) {
  console.log(`\n--- SHEET: ${name} ---`);
  const data = xlsx.utils.sheet_to_json(wb.Sheets[name]);
  console.log(JSON.stringify(data, null, 2));
}
