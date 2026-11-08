/**
 * Parsers for importing column elements from pasted text (TSV/CSV) or xlsx.
 * Tolerant of bilingual headers, 是/否 flags, "20%" percentages, "1.2 m³" suffixes.
 */

import ExcelJS from 'exceljs';
import type { ColumnElement } from '@/engine/types';
import type { RCColumnsTemplate } from '@/engine/columns';

export interface ImportedRow {
  element: Omit<ColumnElement, 'id'>;
  warnings: string[];
  sourceRow: number;
}

export interface ImportResult {
  rows: ImportedRow[];
  errors: { row: number; message: string }[];
}

// Header aliases → canonical field name
const HEADER_MAP: Record<string, keyof Omit<ColumnElement, 'id'>> = {
  // floor
  floor: 'floor',
  level: 'floor',
  '樓層': 'floor',
  // family
  family: 'family',
  type: 'family',
  'family/type': 'family',
  '族群與類型': 'family',
  '族群': 'family',
  '類型': 'family',
  // volume
  volume: 'volumeM3',
  'volume(m3)': 'volumeM3',
  'volume (m³)': 'volumeM3',
  'volume m3': 'volumeM3',
  volumem3: 'volumeM3',
  '體積': 'volumeM3',
  '體積(m³)': 'volumeM3',
  '體積 (m³)': 'volumeM3',
  // concrete
  'concrete strength': 'concreteStrength',
  concretestrength: 'concreteStrength',
  strength: 'concreteStrength',
  '混凝土強度': 'concreteStrength',
  '強度': 'concreteStrength',
  // admixture
  'admixture %': 'admixturePct',
  'admixture pct': 'admixturePct',
  admixture: 'admixturePct',
  admixturepct: 'admixturePct',
  '礦物摻料比例': 'admixturePct',
  '摻料': 'admixturePct',
  '摻料比例': 'admixturePct',
  // reused
  reused: 'reused',
  '再利用': 'reused',
  '再利用構件': 'reused',
  // modular
  modular: 'prefabModular',
  prefab: 'prefabModular',
  'prefab/modular': 'prefabModular',
  prefabmodular: 'prefabModular',
  '預鑄': 'prefabModular',
  '模組化': 'prefabModular',
  '預鑄工法或模矩化': 'prefabModular',
  '預鑄/模組化': 'prefabModular',
  // note
  note: 'note',
  notes: 'note',
  '備註': 'note',
};

const normalizeHeader = (h: string): string =>
  h.trim().toLowerCase().replace(/\s+/g, '').replace(/[()（）]/g, '');

type RCField = keyof Omit<ColumnElement, 'id'>;

function positionalFallback(
  dataRows: string[][],
): { fields: (RCField | undefined)[]; warning: string } | null {
  if (dataRows.length === 0) return null;
  const maxCols = Math.max(...dataRows.map((r) => r.length));
  if (maxCols === 0) return null;
  const sample = dataRows.slice(0, 50);

  const scores = new Array(maxCols).fill(0);
  for (const row of sample) {
    for (let c = 0; c < maxCols; c++) {
      const raw = (row[c] ?? '').trim().replace(/,/g, '').replace(/m³|m3|㎥/gi, '').trim();
      if (raw && /^-?\d+(\.\d+)?$/.test(raw) && Number(raw) > 0) scores[c]++;
    }
  }
  let volCol = -1;
  let bestScore = 0;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > bestScore) { bestScore = scores[i]; volCol = i; }
  }
  if (volCol < 0 || bestScore < sample.length / 2) return null;

  const fields: (RCField | undefined)[] = new Array(maxCols).fill(undefined);
  fields[volCol] = 'volumeM3';
  if (volCol - 1 >= 0) fields[volCol - 1] = 'family';
  if (volCol - 2 >= 0) fields[volCol - 2] = 'floor';
  if (volCol + 1 < maxCols) fields[volCol + 1] = 'note';

  return {
    fields,
    warning:
      '標頭無法辨識 (檔案的中文字可能已毀損),改以位置推測:' +
      `第 ${volCol + 1} 欄作為體積。強度/摻料使用預設值,可匯入後批次調整。`,
  };
}

const parseBoolean = (v: unknown): boolean => {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return ['是', 'y', 'yes', 'true', '1', 't'].includes(s);
};

const parseVolume = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '')
    .replace(/m³|m3|m\^3|㎥/gi, '')
    .replace(/,/g, '')
    .trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const parsePercent = (v: unknown): number => {
  if (typeof v === 'number') {
    // "0.2" means 20%; "20" also means 20%. Disambiguate by magnitude.
    return v > 1 ? v / 100 : v;
  }
  const raw = String(v ?? '').trim();
  const hasPercent = raw.includes('%');
  const n = Number(raw.replace('%', '').trim());
  if (!Number.isFinite(n)) return NaN;
  if (hasPercent) return n / 100;
  return n > 1 ? n / 100 : n;
};

const snapAdmixture = (
  p: number,
  valid: number[],
): { value: number; snapped: boolean } => {
  let best = valid[0];
  let bestDiff = Infinity;
  for (const v of valid) {
    const d = Math.abs(v - p);
    if (d < bestDiff) {
      bestDiff = d;
      best = v;
    }
  }
  return { value: best, snapped: bestDiff > 1e-6 };
};

const matchStrength = (s: string, valid: string[]): string | null => {
  const needle = s.trim();
  if (!needle) return null;
  if (valid.includes(needle)) return needle;
  const m = needle.match(/(\d{2,4})/);
  if (m) {
    const n = m[1];
    const hit = valid.find((v) => v.includes(`${n}kgf`));
    if (hit) return hit;
  }
  return null;
};

function elementFromRecord(
  rec: Record<string, unknown>,
  sourceRow: number,
  template: RCColumnsTemplate,
): ImportedRow | { error: string } {
  const defaults = template.elementDefaults;
  const validStrengths = Array.from(
    new Set(template.concreteMaterials.map((m) => m.strength)),
  );
  const validAdmixtures = Array.from(
    new Set(template.concreteMaterials.map((m) => m.admixturePct)),
  ).sort((a, b) => a - b);
  const warnings: string[] = [];

  const volumeRaw = rec.volumeM3;
  const volumeM3 = parseVolume(volumeRaw);
  if (!(volumeM3 > 0)) {
    return { error: `體積無效或為 0 (got "${volumeRaw ?? ''}")` };
  }

  let concreteStrength = defaults.concreteStrength;
  if (rec.concreteStrength != null && String(rec.concreteStrength).trim()) {
    const matched = matchStrength(String(rec.concreteStrength), validStrengths);
    if (matched) {
      concreteStrength = matched;
    } else {
      warnings.push(
        `未知的混凝土強度 "${rec.concreteStrength}",使用預設值`,
      );
    }
  }

  let admixturePct = defaults.admixturePct;
  if (rec.admixturePct != null && String(rec.admixturePct).trim() !== '') {
    const parsed = parsePercent(rec.admixturePct);
    if (Number.isFinite(parsed)) {
      const snapped = snapAdmixture(parsed, validAdmixtures);
      admixturePct = snapped.value;
      if (snapped.snapped) {
        warnings.push(
          `摻料比例 ${(parsed * 100).toFixed(1)}% 已對齊到最接近的 ${(admixturePct * 100).toFixed(0)}%`,
        );
      }
    } else {
      warnings.push(`摻料比例 "${rec.admixturePct}" 無法解析,使用預設值`);
    }
  }

  const element: Omit<ColumnElement, 'id'> = {
    floor: String(rec.floor ?? '').trim() || undefined,
    family: String(rec.family ?? '').trim() || undefined,
    volumeM3,
    note: String(rec.note ?? '').trim() || undefined,
    concreteStrength,
    admixturePct,
    reused: rec.reused == null ? defaults.reused : parseBoolean(rec.reused),
    prefabModular:
      rec.prefabModular == null
        ? defaults.prefabModular
        : parseBoolean(rec.prefabModular),
    greenDemolition: false,
  };

  return { element, warnings, sourceRow };
}

function splitRow(line: string): string[] {
  // TSV first (Excel/Sheets default clipboard format)
  if (line.includes('\t')) return line.split('\t');
  // CSV with simple quote handling
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === ',') {
        out.push(cur);
        cur = '';
      } else if (c === '"' && cur === '') {
        inQuote = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

export function parseTabular(
  text: string,
  template: RCColumnsTemplate,
): ImportResult {
  const stripped = text.replace(/^﻿/, ''); // strip UTF-8 BOM
  const lines = stripped
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length === 0) {
    return { rows: [], errors: [{ row: 0, message: '沒有資料' }] };
  }

  const rawHeaders = splitRow(lines[0]).map((h) => h.trim());
  let fieldByColumn: (RCField | undefined)[] = rawHeaders.map(
    (h) => HEADER_MAP[normalizeHeader(h)],
  );

  const dataCells = lines.slice(1).map((l) => splitRow(l));
  let globalWarning: string | null = null;

  if (!fieldByColumn.some((f) => f === 'volumeM3')) {
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
            '找不到「體積」欄位,也無法由資料推測。可用標頭:體積 / volume / 樓層 / 強度 等',
        }],
      };
    }
  }

  const rows: ImportedRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    const rec: Record<string, unknown> = {};
    for (let c = 0; c < fieldByColumn.length; c++) {
      const field = fieldByColumn[c];
      if (!field) continue;
      rec[field] = cells[c];
    }
    const result = elementFromRecord(rec, i + 1, template);
    if ('error' in result) {
      errors.push({ row: i + 1, message: result.error });
    } else {
      if (globalWarning && rows.length === 0) result.warnings.unshift(globalWarning);
      rows.push(result);
    }
  }

  return { rows, errors };
}

/**
 * Decode a text/CSV file, auto-detecting common Chinese legacy encodings.
 * CSVs exported from Windows Excel in zh-TW default to Big5, not UTF-8, so
 * File.text() (UTF-8) returns garbled headers. We try UTF-8 first, then Big5
 * (Traditional Chinese), then GB18030 (Simplified Chinese), and pick the
 * first decoding that produces parseable rows.
 */
export async function parseCsvFile(
  file: File,
  template: RCColumnsTemplate,
): Promise<{ text: string; result: ImportResult }> {
  const buf = await file.arrayBuffer();
  const encodings = ['utf-8', 'big5', 'gb18030'];
  let best: { text: string; result: ImportResult; score: number } | null = null;

  for (const enc of encodings) {
    let text: string;
    try {
      text = new TextDecoder(enc, { fatal: false }).decode(buf);
    } catch { continue; }
    const result = parseTabular(text, template);
    const replCount = (text.match(/�/g) ?? []).length;
    const replRatio = text.length > 0 ? replCount / text.length : 1;
    // UTF-8 short-circuit: if it parses rows and <30% replacement chars,
    // prefer it. Covers partially-corrupted UTF-8 files (e.g. Google Sheets
    // exports with some lost characters replaced by literal '?').
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

export async function parseXlsxFile(
  file: File,
  template: RCColumnsTemplate,
): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  // Prefer a sheet named "數量清單" or "選填表單"; else first sheet
  const preferred =
    wb.getWorksheet('數量清單') ??
    wb.getWorksheet('選填表單') ??
    wb.worksheets[0];
  if (!preferred) {
    return { rows: [], errors: [{ row: 0, message: '找不到工作表' }] };
  }

  // Header row = first row with any string in cols 1-10
  let headerRowIdx = 1;
  for (let r = 1; r <= Math.min(5, preferred.rowCount); r++) {
    const row = preferred.getRow(r);
    const hasString = [...Array(10)].some((_, i) => {
      const v = row.getCell(i + 1).value;
      return typeof v === 'string' && v.trim() !== '';
    });
    if (hasString) {
      headerRowIdx = r;
      break;
    }
  }

  const headerRow = preferred.getRow(headerRowIdx);
  const rawHeaders: string[] = [];
  const colCount = headerRow.cellCount || 20;
  for (let c = 1; c <= colCount; c++) {
    const v = headerRow.getCell(c).value;
    rawHeaders.push(typeof v === 'string' ? v : String(v ?? ''));
  }
  const fieldByColumn = rawHeaders.map((h) => HEADER_MAP[normalizeHeader(h)]);

  if (!fieldByColumn.some((f) => f === 'volumeM3')) {
    return {
      rows: [],
      errors: [
        {
          row: headerRowIdx,
          message: `找不到「體積」欄位(在工作表「${preferred.name}」第 ${headerRowIdx} 列)`,
        },
      ],
    };
  }

  const rows: ImportedRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let r = headerRowIdx + 1; r <= preferred.rowCount; r++) {
    const row = preferred.getRow(r);
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
    const result = elementFromRecord(rec, r, template);
    if ('error' in result) {
      errors.push({ row: r, message: result.error });
    } else {
      rows.push(result);
    }
  }

  return { rows, errors };
}
