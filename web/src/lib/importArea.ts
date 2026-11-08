/**
 * Parsers for area-based elements (cladding, interior walls, floors). All
 * three share the exact same element shape:
 *   { floor?, family?, areaM2, constructionType, reused, greenRecycled,
 *     prefabModular, note? }
 * so one parser handles them all. The caller supplies the list of valid
 * construction names and default values.
 *
 * Tolerant of bilingual headers, 是/否 flags, "10 m²" suffixes, and will
 * fuzzy-match construction names by substring / numeric hint when the raw
 * value is not an exact match.
 */

import ExcelJS from 'exceljs';

export interface AreaLikeElement {
  floor?: string;
  family?: string;
  areaM2: number;
  note?: string;
  constructionType: string;
  reused: boolean;
  greenRecycled: boolean;
  prefabModular: boolean;
}

export interface AreaImportConfig {
  constructionNames: string[];
  defaults: {
    constructionType: string;
    reused: boolean;
    greenRecycled: boolean;
    prefabModular: boolean;
  };
}

export interface ImportedAreaRow {
  element: AreaLikeElement;
  warnings: string[];
  sourceRow: number;
}

export interface AreaImportResult {
  rows: ImportedAreaRow[];
  errors: { row: number; message: string }[];
}

type AreaField =
  | 'floor'
  | 'family'
  | 'areaM2'
  | 'constructionType'
  | 'reused'
  | 'greenRecycled'
  | 'prefabModular'
  | 'note';

const HEADER_MAP: Record<string, AreaField> = {
  // floor
  floor: 'floor', level: 'floor', '樓層': 'floor',
  // family
  family: 'family', type: 'family', 'family/type': 'family',
  '族群與類型': 'family', '族群': 'family', '類型': 'family',
  // area
  area: 'areaM2', 'area(m2)': 'areaM2', 'area (m²)': 'areaM2',
  'area m2': 'areaM2', aream2: 'areaM2',
  '面積': 'areaM2', '面積(m²)': 'areaM2', '面積 (m²)': 'areaM2',
  // construction
  construction: 'constructionType',
  'construction type': 'constructionType',
  constructiontype: 'constructionType',
  '構造類型': 'constructionType',
  '構造': 'constructionType',
  '構造型式': 'constructionType',
  '類別': 'constructionType',
  // reused
  reused: 'reused', '再利用': 'reused', '再利用構件': 'reused',
  // green recycled
  green: 'greenRecycled',
  'green recycled': 'greenRecycled',
  greenrecycled: 'greenRecycled',
  '綠建材': 'greenRecycled',
  '再生綠建材': 'greenRecycled',
  // modular
  modular: 'prefabModular', prefab: 'prefabModular',
  'prefab/modular': 'prefabModular', prefabmodular: 'prefabModular',
  '預鑄': 'prefabModular', '模組化': 'prefabModular',
  '預鑄工法或模矩化': 'prefabModular', '預鑄/模組化': 'prefabModular',
  // note
  note: 'note', notes: 'note', '備註': 'note',
};

const normalizeHeader = (h: string): string =>
  h.trim().toLowerCase().replace(/\s+/g, '').replace(/[()（）]/g, '');

/**
 * Positional fallback for CSVs whose headers are corrupted (e.g. a Google
 * Sheets export where some Chinese characters got replaced with `?`). Pick the
 * column that is numeric in at least half of the first N data rows as the area
 * column, and map neighbouring columns by position:
 *   [floor, family, area, note]  (standard Google Sheets 數量清單 layout)
 */
function positionalFallback(
  dataRows: string[][],
): { fields: (AreaField | undefined)[]; warning: string } | null {
  if (dataRows.length === 0) return null;
  const maxCols = Math.max(...dataRows.map((r) => r.length));
  if (maxCols === 0) return null;
  const sample = dataRows.slice(0, 50);

  const scores = new Array(maxCols).fill(0);
  for (const row of sample) {
    for (let c = 0; c < maxCols; c++) {
      const raw = (row[c] ?? '').trim().replace(/,/g, '').replace(/m²|m2|㎡|㎥|m³/gi, '').trim();
      if (raw && /^-?\d+(\.\d+)?$/.test(raw) && Number(raw) > 0) scores[c]++;
    }
  }
  let areaCol = -1;
  let bestScore = 0;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > bestScore) { bestScore = scores[i]; areaCol = i; }
  }
  if (areaCol < 0 || bestScore < sample.length / 2) return null;

  const fields: (AreaField | undefined)[] = new Array(maxCols).fill(undefined);
  fields[areaCol] = 'areaM2';
  if (areaCol - 1 >= 0) fields[areaCol - 1] = 'family';
  if (areaCol - 2 >= 0) fields[areaCol - 2] = 'floor';
  if (areaCol + 1 < maxCols) fields[areaCol + 1] = 'note';

  return {
    fields,
    warning:
      '標頭無法辨識 (檔案的中文字可能已毀損),改以位置推測:' +
      `第 ${areaCol + 1} 欄作為面積。構造類型使用預設值,可匯入後批次調整。`,
  };
}

const parseBoolean = (v: unknown): boolean => {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return ['是', 'y', 'yes', 'true', '1', 't', '✓'].includes(s);
};

const parseArea = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '')
    .replace(/m²|m2|m\^2|㎡/gi, '')
    .replace(/,/g, '')
    .trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const matchConstruction = (
  raw: string,
  valid: string[],
): string | null => {
  const needle = raw.trim();
  if (!needle) return null;
  if (valid.includes(needle)) return needle;
  // Exact (case-insensitive) first
  const lower = needle.toLowerCase();
  for (const v of valid) {
    if (v.toLowerCase() === lower) return v;
  }
  // Substring either direction
  for (const v of valid) {
    if (v.includes(needle) || needle.includes(v)) return v;
  }
  return null;
};

function elementFromRecord(
  rec: Record<string, unknown>,
  sourceRow: number,
  config: AreaImportConfig,
): ImportedAreaRow | { error: string } {
  const warnings: string[] = [];
  const defaults = config.defaults;

  const areaRaw = rec.areaM2;
  const areaM2 = parseArea(areaRaw);
  if (!(areaM2 > 0)) {
    return { error: `面積無效或為 0 (got "${areaRaw ?? ''}")` };
  }

  let constructionType = defaults.constructionType;
  if (rec.constructionType != null && String(rec.constructionType).trim()) {
    const matched = matchConstruction(
      String(rec.constructionType),
      config.constructionNames,
    );
    if (matched) {
      constructionType = matched;
      if (matched !== String(rec.constructionType).trim()) {
        warnings.push(
          `構造「${rec.constructionType}」對應到「${matched}」`,
        );
      }
    } else {
      warnings.push(
        `未知的構造類型「${rec.constructionType}」,使用預設值`,
      );
    }
  }

  const element: AreaLikeElement = {
    floor: String(rec.floor ?? '').trim() || undefined,
    family: String(rec.family ?? '').trim() || undefined,
    areaM2,
    note: String(rec.note ?? '').trim() || undefined,
    constructionType,
    reused: rec.reused == null ? defaults.reused : parseBoolean(rec.reused),
    greenRecycled:
      rec.greenRecycled == null
        ? defaults.greenRecycled
        : parseBoolean(rec.greenRecycled),
    prefabModular:
      rec.prefabModular == null
        ? defaults.prefabModular
        : parseBoolean(rec.prefabModular),
  };

  return { element, warnings, sourceRow };
}

function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"' && cur === '') inQuote = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function parseAreaTabular(
  text: string,
  config: AreaImportConfig,
): AreaImportResult {
  const stripped = text.replace(/^﻿/, '');
  const lines = stripped
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length === 0) {
    return { rows: [], errors: [{ row: 0, message: '沒有資料' }] };
  }

  const rawHeaders = splitRow(lines[0]).map((h) => h.trim());
  let fieldByColumn: (AreaField | undefined)[] = rawHeaders.map(
    (h) => HEADER_MAP[normalizeHeader(h)],
  );

  const dataCells = lines.slice(1).map((l) => splitRow(l));
  let globalWarning: string | null = null;

  if (!fieldByColumn.some((f) => f === 'areaM2')) {
    const fb = positionalFallback(dataCells);
    if (fb) {
      fieldByColumn = fb.fields;
      globalWarning = fb.warning;
    } else {
      return {
        rows: [],
        errors: [{
          row: 1,
          message:
            '找不到「面積」欄位,也無法由資料推測。可用標頭:面積 / area / 樓層 / 構造類型 / 再利用 / 綠建材 / 預鑄 等',
        }],
      };
    }
  }

  const rows: ImportedAreaRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    const rec: Record<string, unknown> = {};
    for (let c = 0; c < fieldByColumn.length; c++) {
      const field = fieldByColumn[c];
      if (!field) continue;
      rec[field] = cells[c];
    }
    const result = elementFromRecord(rec, i + 1, config);
    if ('error' in result) errors.push({ row: i + 1, message: result.error });
    else {
      if (globalWarning && rows.length === 0) result.warnings.unshift(globalWarning);
      rows.push(result);
    }
  }

  return { rows, errors };
}

export async function parseAreaCsvFile(
  file: File,
  config: AreaImportConfig,
): Promise<{ text: string; result: AreaImportResult }> {
  const buf = await file.arrayBuffer();
  const encodings = ['utf-8', 'big5', 'gb18030'];
  let best: { text: string; result: AreaImportResult; score: number } | null = null;

  for (const enc of encodings) {
    let text: string;
    try {
      text = new TextDecoder(enc, { fatal: false }).decode(buf);
    } catch { continue; }
    const result = parseAreaTabular(text, config);
    const replCount = (text.match(/�/g) ?? []).length;
    const replRatio = text.length > 0 ? replCount / text.length : 1;
    // UTF-8 short-circuit: if it parses rows and the file is clearly
    // UTF-8-ish (<30% replacement chars), prefer it — UTF-8 preserves more
    // real CJK characters when the SOURCE file is a partially corrupted UTF-8
    // (e.g. Google Sheets export with lost characters as literal '?').
    if (enc === 'utf-8' && result.rows.length > 0 && replRatio < 0.3) {
      return { text, result };
    }
    const score = result.rows.length * 1000 - replCount;
    if (!best || score > best.score) best = { text, result, score };
  }

  if (!best || best.result.rows.length === 0) {
    return {
      text: best?.text ?? '',
      result: {
        rows: [],
        errors: best?.result.errors ?? [{ row: 0, message: '檔案編碼無法辨識' }],
      },
    };
  }
  return { text: best.text, result: best.result };
}

export async function parseAreaXlsxFile(
  file: File,
  config: AreaImportConfig,
): Promise<AreaImportResult> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws =
    wb.getWorksheet('數量清單') ??
    wb.getWorksheet('選填表單') ??
    wb.worksheets[0];
  if (!ws) return { rows: [], errors: [{ row: 0, message: '找不到工作表' }] };

  let headerRowIdx = 1;
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const hasString = [...Array(10)].some((_, i) => {
      const v = row.getCell(i + 1).value;
      return typeof v === 'string' && v.trim() !== '';
    });
    if (hasString) { headerRowIdx = r; break; }
  }

  const headerRow = ws.getRow(headerRowIdx);
  const rawHeaders: string[] = [];
  const colCount = headerRow.cellCount || 20;
  for (let c = 1; c <= colCount; c++) {
    const v = headerRow.getCell(c).value;
    rawHeaders.push(typeof v === 'string' ? v : String(v ?? ''));
  }
  const fieldByColumn = rawHeaders.map((h) => HEADER_MAP[normalizeHeader(h)]);

  if (!fieldByColumn.some((f) => f === 'areaM2')) {
    return {
      rows: [],
      errors: [{
        row: headerRowIdx,
        message: `找不到「面積」欄位(在工作表「${ws.name}」第 ${headerRowIdx} 列)`,
      }],
    };
  }

  const rows: ImportedAreaRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rec: Record<string, unknown> = {};
    let hasAny = false;
    for (let c = 1; c <= fieldByColumn.length; c++) {
      const field = fieldByColumn[c - 1];
      if (!field) continue;
      const cell = row.getCell(c).value;
      if (cell != null && cell !== '') hasAny = true;
      rec[field] = cell as unknown;
    }
    if (!hasAny) continue;
    const result = elementFromRecord(rec, r, config);
    if ('error' in result) errors.push({ row: r, message: result.error });
    else rows.push(result);
  }

  return { rows, errors };
}
