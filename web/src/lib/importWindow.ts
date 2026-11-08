/**
 * Parser for window elements (2-2 外窗). Each row picks a (glass, frame) combo.
 * Headers tolerate bilingual input; glass/frame names fuzzy-match against the
 * template's list.
 */

import ExcelJS from 'exceljs';

export interface WindowLikeElement {
  floor?: string;
  family?: string;
  areaM2: number;
  note?: string;
  glass: string;
  frame: string;
  reused: boolean;
  prefabModular: boolean;
}

export interface WindowImportConfig {
  glasses: string[];
  frames: string[];
  defaults: {
    glass: string;
    frame: string;
    reused: boolean;
    prefabModular: boolean;
  };
}

export interface ImportedWindowRow {
  element: WindowLikeElement;
  warnings: string[];
  sourceRow: number;
}

export interface WindowImportResult {
  rows: ImportedWindowRow[];
  errors: { row: number; message: string }[];
}

type WindowField =
  | 'floor'
  | 'family'
  | 'areaM2'
  | 'glass'
  | 'frame'
  | 'reused'
  | 'prefabModular'
  | 'note';

const HEADER_MAP: Record<string, WindowField> = {
  floor: 'floor', level: 'floor', '樓層': 'floor',
  family: 'family', type: 'family', '族群與類型': 'family',
  '族群': 'family', '類型': 'family',
  area: 'areaM2', 'area(m2)': 'areaM2', 'area (m²)': 'areaM2',
  aream2: 'areaM2',
  '面積': 'areaM2', '面積(m²)': 'areaM2', '面積 (m²)': 'areaM2',
  glass: 'glass', '玻璃': 'glass', '玻璃類型': 'glass', '玻璃種類': 'glass',
  frame: 'frame', '窗框': 'frame', '窗框類型': 'frame', '框架': 'frame',
  reused: 'reused', '再利用': 'reused', '再利用構件': 'reused',
  modular: 'prefabModular', prefab: 'prefabModular',
  prefabmodular: 'prefabModular', '預鑄': 'prefabModular',
  '模組化': 'prefabModular', '預鑄/模組化': 'prefabModular',
  note: 'note', '備註': 'note',
};

const normalizeHeader = (h: string): string =>
  h.trim().toLowerCase().replace(/\s+/g, '').replace(/[()（）]/g, '');

function positionalFallback(
  dataRows: string[][],
): { fields: (WindowField | undefined)[]; warning: string } | null {
  if (dataRows.length === 0) return null;
  const maxCols = Math.max(...dataRows.map((r) => r.length));
  if (maxCols === 0) return null;
  const sample = dataRows.slice(0, 50);

  const scores = new Array(maxCols).fill(0);
  for (const row of sample) {
    for (let c = 0; c < maxCols; c++) {
      const raw = (row[c] ?? '').trim().replace(/,/g, '').replace(/m²|m2|㎡/gi, '').trim();
      if (raw && /^-?\d+(\.\d+)?$/.test(raw) && Number(raw) > 0) scores[c]++;
    }
  }
  let areaCol = -1;
  let bestScore = 0;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > bestScore) { bestScore = scores[i]; areaCol = i; }
  }
  if (areaCol < 0 || bestScore < sample.length / 2) return null;

  const fields: (WindowField | undefined)[] = new Array(maxCols).fill(undefined);
  fields[areaCol] = 'areaM2';
  if (areaCol - 1 >= 0) fields[areaCol - 1] = 'family';
  if (areaCol - 2 >= 0) fields[areaCol - 2] = 'floor';
  if (areaCol + 1 < maxCols) fields[areaCol + 1] = 'note';

  return {
    fields,
    warning:
      '標頭無法辨識 (檔案的中文字可能已毀損),改以位置推測:' +
      `第 ${areaCol + 1} 欄作為面積。玻璃與窗框使用預設值,可匯入後批次調整。`,
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

const matchName = (raw: string, valid: string[]): string | null => {
  const needle = raw.trim();
  if (!needle) return null;
  if (valid.includes(needle)) return needle;
  const lower = needle.toLowerCase();
  for (const v of valid) if (v.toLowerCase() === lower) return v;
  for (const v of valid) if (v.includes(needle) || needle.includes(v)) return v;
  return null;
};

function elementFromRecord(
  rec: Record<string, unknown>,
  sourceRow: number,
  config: WindowImportConfig,
): ImportedWindowRow | { error: string } {
  const warnings: string[] = [];
  const defaults = config.defaults;

  const areaRaw = rec.areaM2;
  const areaM2 = parseArea(areaRaw);
  if (!(areaM2 > 0)) return { error: `面積無效或為 0 (got "${areaRaw ?? ''}")` };

  let glass = defaults.glass;
  if (rec.glass != null && String(rec.glass).trim()) {
    const m = matchName(String(rec.glass), config.glasses);
    if (m) {
      glass = m;
      if (m !== String(rec.glass).trim())
        warnings.push(`玻璃「${rec.glass}」對應到「${m}」`);
    } else warnings.push(`未知的玻璃類型「${rec.glass}」,使用預設值`);
  }

  let frame = defaults.frame;
  if (rec.frame != null && String(rec.frame).trim()) {
    const m = matchName(String(rec.frame), config.frames);
    if (m) {
      frame = m;
      if (m !== String(rec.frame).trim())
        warnings.push(`窗框「${rec.frame}」對應到「${m}」`);
    } else warnings.push(`未知的窗框類型「${rec.frame}」,使用預設值`);
  }

  const element: WindowLikeElement = {
    floor: String(rec.floor ?? '').trim() || undefined,
    family: String(rec.family ?? '').trim() || undefined,
    areaM2,
    note: String(rec.note ?? '').trim() || undefined,
    glass,
    frame,
    reused: rec.reused == null ? defaults.reused : parseBoolean(rec.reused),
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

export function parseWindowTabular(
  text: string,
  config: WindowImportConfig,
): WindowImportResult {
  const stripped = text.replace(/^﻿/, '');
  const lines = stripped.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  if (lines.length === 0) return { rows: [], errors: [{ row: 0, message: '沒有資料' }] };

  const rawHeaders = splitRow(lines[0]).map((h) => h.trim());
  let fieldByColumn: (WindowField | undefined)[] = rawHeaders.map(
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
            '找不到「面積」欄位,也無法由資料推測。可用標頭:面積 / area / 樓層 / 玻璃 / 窗框 / 再利用 等',
        }],
      };
    }
  }

  const rows: ImportedWindowRow[] = [];
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

export async function parseWindowCsvFile(
  file: File,
  config: WindowImportConfig,
): Promise<{ text: string; result: WindowImportResult }> {
  const buf = await file.arrayBuffer();
  const encodings = ['utf-8', 'big5', 'gb18030'];
  let best: { text: string; result: WindowImportResult; score: number } | null = null;

  for (const enc of encodings) {
    let text: string;
    try { text = new TextDecoder(enc, { fatal: false }).decode(buf); }
    catch { continue; }
    const result = parseWindowTabular(text, config);
    const replCount = (text.match(/�/g) ?? []).length;
    const replRatio = text.length > 0 ? replCount / text.length : 1;
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

export async function parseWindowXlsxFile(
  file: File,
  config: WindowImportConfig,
): Promise<WindowImportResult> {
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

  const rows: ImportedWindowRow[] = [];
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
