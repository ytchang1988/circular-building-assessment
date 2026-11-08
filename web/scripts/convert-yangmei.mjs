/**
 * One-off converter: reads 8 xlsx files from the 楊梅-RC project folder and
 * writes a single demo JSON bundle that the web app can one-click load via
 * `/demo/yangmei.json` → ProjectMeta "Load demo project" button.
 *
 * Source layout: each xlsx has a "選填表單" sheet starting at r2 with columns:
 *   col 2  族群與類型
 *   col 3  體積 (RC) / 面積 (其他)
 *   col 4  備註
 *   col 5  混凝土強度 / 外裝類型 / 玻璃類型 / 內牆類型 / 地坪類型
 *   col 6  礦物摻料比例 / 窗框類型 / 再利用構件
 *   col 7  再利用構件 / 再生綠建材
 *   col 8  預鑄工法或模矩化
 */

import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = 'C:/Users/user/Documents/BCI-LERB/1-楊梅-RC';
const OUT = path.resolve('public/demo/yangmei.json');

/** Unwrap a cell's value to a plain string/number. */
function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((t) => t.text ?? '').join('');
    }
    if ('text' in v) return String(v.text);
    if ('result' in v) return v.result ?? '';
    if ('formula' in v) return v.result ?? '';
  }
  return String(v);
}

function toYN(v) {
  const s = String(cellValue(v)).trim();
  return s === '是' || s.toLowerCase() === 'yes' || s === 'Y' || s === 'y' || s === 'true';
}

function toNum(v) {
  const n = Number(cellValue(v));
  return Number.isFinite(n) ? n : 0;
}

function toStr(v) {
  const s = String(cellValue(v)).trim();
  return s;
}

/** Iterate 選填表單 rows starting at r2 until an empty 族群與類型 (col 2). */
async function readSheet(file, mapRow) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(SRC, file));
  const ws = wb.worksheets.find((w) => w.name.includes('選填')) ?? wb.worksheets[0];
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const family = toStr(row.getCell(2).value);
    const qty = toNum(row.getCell(3).value);
    // Stop when both family and qty are empty — ignore trailing blank rows.
    if (!family && qty === 0) continue;
    if (!family) continue;
    const mapped = mapRow(row);
    if (mapped) rows.push(mapped);
  }
  return rows;
}

/** RC monolithic rows: 柱 / 梁 / 樓板 / 外牆. */
async function rcSheet(file) {
  return readSheet(file, (row) => ({
    floor: '',
    family: toStr(row.getCell(2).value),
    volumeM3: toNum(row.getCell(3).value),
    note: toStr(row.getCell(4).value) || undefined,
    concreteStrength: toStr(row.getCell(5).value),
    admixturePct: toNum(row.getCell(6).value),
    reused: toYN(row.getCell(7).value),
    prefabModular: toYN(row.getCell(8).value),
    greenDemolition: false,
  }));
}

/** Cladding / interior walls / floors — area-based with constructionType + greenRecycled. */
async function areaSheet(file) {
  return readSheet(file, (row) => ({
    floor: '',
    family: toStr(row.getCell(2).value),
    areaM2: toNum(row.getCell(3).value),
    note: toStr(row.getCell(4).value) || undefined,
    constructionType: toStr(row.getCell(5).value),
    reused: toYN(row.getCell(6).value),
    greenRecycled: toYN(row.getCell(7).value),
    prefabModular: toYN(row.getCell(8).value),
    greenDemolition: false,
  }));
}

/** Windows — glass + frame, area-based. */
async function windowSheet(file) {
  return readSheet(file, (row) => ({
    floor: '',
    family: toStr(row.getCell(2).value),
    areaM2: toNum(row.getCell(3).value),
    note: toStr(row.getCell(4).value) || undefined,
    glass: toStr(row.getCell(5).value),
    frame: toStr(row.getCell(6).value),
    reused: toYN(row.getCell(7).value),
    prefabModular: toYN(row.getCell(8).value),
    greenDemolition: false,
  }));
}

const bundle = {
  name: '楊梅 RC 案 (範例)',
  sourceNote: '由 1-楊梅-RC/*.xlsx 選填表單 自動轉檔,2025-09 核算',
  meta: {
    name: '楊梅-RC 範例專案',
    buildingType: 'RC',
    totalFloorArea: 55834, // approx — can be edited in Project settings
    buildingClass: '低耗損建築 （自用辦公建築、倉庫、 住宅、住宿類建築）',
  },
  columns:       await rcSheet('1-1_RC結構柱_楊梅.xlsx'),
  beams:         await rcSheet('1-2_RC結構梁_楊梅.xlsx'),
  slabs:         await rcSheet('1-3_RC結構樓板_楊梅.xlsx'),
  walls:         await rcSheet('2-1_RC外牆_楊梅.xlsx'),
  cladding:      await areaSheet('2-2_RC外牆外裝_楊梅.xlsx'),
  windows:       await windowSheet('2-3_RC外牆外窗_楊梅.xlsx'),
  interiorWalls: await areaSheet('3-1_內牆_楊梅.xlsx'),
  floors:        await areaSheet('3-2_地坪_楊梅.xlsx'),
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(bundle, null, 2));

const counts = Object.entries({
  columns: bundle.columns, beams: bundle.beams, slabs: bundle.slabs, walls: bundle.walls,
  cladding: bundle.cladding, windows: bundle.windows,
  interiorWalls: bundle.interiorWalls, floors: bundle.floors,
}).map(([k, v]) => `${k}=${v.length}`).join('  ');
console.log(`✓ wrote ${OUT}\n  ${counts}`);
