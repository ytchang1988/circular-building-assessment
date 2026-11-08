/**
 * Verification: run the app's engine over the loaded demo bundle and compare
 * to the 楊梅 case's "0_整體結果" sheet row 10 (grand total).
 *
 * Expected (from original xlsx, r10):
 *   M = 55,834,957.38 kg
 *   BCI = 0.22726523
 *   baselineEC = 15,750,547.79 kgCO₂eq
 *   designEC   = 13,077,980.67 kgCO₂eq
 */

import fs from 'node:fs/promises';
import {
  aggregateBuilding, aggregateComponent,
  computeAreaElement, computeColumnElement,
  computeFloorElement, computeInteriorWallElement, computeWindowElement,
} from '../src/engine/index.ts';
import {
  CLADDING_TEMPLATE, FLOORS_TEMPLATE, INTERIOR_WALLS_TEMPLATE,
  RC_MONO_TEMPLATES, WINDOWS_TEMPLATE,
} from '../src/templates/RC/allRegistry.ts';

const b = JSON.parse(await fs.readFile('public/demo/yangmei.json', 'utf8'));
const bClass = b.meta.buildingClass;

const safe = (fn, arr) =>
  arr.map((x) => { try { return fn(x); } catch (e) { console.error('skip:', (e).message?.slice(0, 80)); return null; } })
     .filter((r) => r !== null);

const rows = [
  aggregateComponent('RC結構柱',      safe((e) => computeColumnElement(e, RC_MONO_TEMPLATES.columns), b.columns)),
  aggregateComponent('RC結構梁',      safe((e) => computeColumnElement(e, RC_MONO_TEMPLATES.beams),   b.beams)),
  aggregateComponent('RC結構樓板',     safe((e) => computeColumnElement(e, RC_MONO_TEMPLATES.slabs),   b.slabs)),
  aggregateComponent('RC外牆',        safe((e) => computeColumnElement(e, RC_MONO_TEMPLATES.walls),   b.walls)),
  aggregateComponent('RC外牆外裝',     safe((e) => computeAreaElement(e, CLADDING_TEMPLATE),          b.cladding)),
  aggregateComponent('RC外窗',        safe((e) => computeWindowElement(e, WINDOWS_TEMPLATE),          b.windows)),
  aggregateComponent('內牆',          safe((e) => computeInteriorWallElement(e, INTERIOR_WALLS_TEMPLATE, bClass), b.interiorWalls)),
  aggregateComponent('地坪',          safe((e) => computeFloorElement(e, FLOORS_TEMPLATE, bClass),    b.floors)),
];

const bldg = aggregateBuilding(rows);

const row = (label, computed, expected) => {
  const diff = expected ? (computed - expected) / expected * 100 : 0;
  console.log(
    `  ${label.padEnd(18)}  computed=${computed.toFixed(2).padStart(16)}` +
    (expected ? `  expected=${expected.toFixed(2).padStart(16)}  Δ=${diff.toFixed(3)}%` : ''),
  );
};

console.log('\n== Per-category M (kg) ==');
const expM = {
  RC結構柱: 5838003.98, RC結構梁: 21108520.83, RC結構樓板: 11832167.84,
  RC外牆: 10870811.64, RC外牆外裝: 1656794.43, RC外窗: 105701.25,
  內牆: 696116.08, 地坪: 3726841.33,
};
for (const r of rows) row(r.category, r.M, expM[r.category]);

console.log('\n== Per-category SCIp ==');
const expSCIp = {
  RC結構柱: 0.2459, RC結構梁: 0.2261, RC結構樓板: 0.213,
  RC外牆: 0.213, RC外牆外裝: 0.2882, RC外窗: 0.5482,
  內牆: 0.5136, 地坪: 0.2019,
};
for (const r of rows) row(r.category, r.SCIp, expSCIp[r.category]);

console.log('\n== Per-category baselineEC (kgCO₂eq) ==');
const expBase = {
  RC結構柱: 1876571.96, RC結構梁: 5711270.65, RC結構樓板: 2504061.87,
  RC外牆: 2300608.42, RC外牆外裝: 836203.1, RC外窗: 207478.03,
  內牆: 942802.56, 地坪: 1371551.2,
};
for (const r of rows) row(r.category, r.baselineEC, expBase[r.category]);

console.log('\n== Per-category designEC (kgCO₂eq) ==');
const expDes = {
  RC結構柱: 1709659.68, RC結構梁: 5070709.18, RC結構樓板: 2181887.07,
  RC外牆: 2004610.12, RC外牆外裝: 811245.58, RC外窗: 207478.03,
  內牆: 385682.28, 地坪: 706708.73,
};
for (const r of rows) row(r.category, r.designEC, expDes[r.category]);

console.log('\n== Building totals (r10 grand total) ==');
row('M',          bldg.M,          55834957.38);
row('BCI',        bldg.BCI,        0.22726523);
row('baselineEC', bldg.baselineEC, 15750547.79);
row('designEC',   bldg.designEC,   13077980.67);
row('cost (C₀)',  bldg.cost,       0);  // no expected; new feature
row('lccNominal', bldg.lccNominal, 0);
row('lccPV',      bldg.lccPV,      0);
