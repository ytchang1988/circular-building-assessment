// Peek sheet names + first 15 rows × first 12 cols of the 選填表單 sheet
// (or first sheet if none named that) in each xlsx in a directory.
import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import path from 'node:path';

const DIR = 'C:/Users/user/Documents/BCI-LERB/1-楊梅-RC';
const files = (await fs.readdir(DIR)).filter((f) =>
  f.endsWith('.xlsx') && !f.startsWith('~$'),
);

for (const f of files) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(path.join(DIR, f));
  } catch (e) {
    console.log(`\n--- ${f} ---`);
    console.log(`(failed to open: ${(e).message?.slice(0, 120)})`);
    continue;
  }
  console.log(`\n=== ${f} ===`);
  console.log('Sheets:', wb.worksheets.map((w) => w.name).join(' | '));

  // Target sheet: 選填表單 if present, else the first.
  const target =
    wb.worksheets.find((w) => w.name.includes('選填')) ?? wb.worksheets[0];
  console.log(`-- sheet: "${target.name}", dims: ${target.rowCount} rows × ${target.columnCount} cols --`);
  const maxR = Math.min(target.rowCount, 15);
  const maxC = Math.min(target.columnCount, 12);
  for (let r = 1; r <= maxR; r++) {
    const row = target.getRow(r);
    const vals = [];
    for (let c = 1; c <= maxC; c++) {
      const v = row.getCell(c).value;
      let s;
      if (v === null || v === undefined) s = '';
      else if (typeof v === 'object' && 'result' in v) s = String(v.result ?? '');
      else if (typeof v === 'object' && 'text' in v) s = String(v.text ?? '');
      else s = String(v);
      s = s.replace(/\s+/g, ' ').slice(0, 24);
      vals.push(s);
    }
    console.log(`  r${r}: ${vals.map((v, i) => `[${i + 1}]${v}`).join(' | ')}`);
  }
}
