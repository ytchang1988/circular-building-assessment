/**
 * Per-variant × per-material MCI breakdown — mirrors the My MCI&PCI sheet
 * schema: one parent row per "design variant" actually in use on the page,
 * nested material rows with the full MCI calculation chain and the
 * MCI × M contribution that rolls up to the parent MCIp.
 *
 * A "variant" groups elements whose MCI-affecting config is identical
 * (strength + admixture + reused for RC; constructionType + reused +
 * greenRecycled for composite / interior / floors; glass + frame + reused
 * for windows). Masses are summed across all elements in that variant so
 * the panel reflects the real project, not just the template library.
 *
 * MCIp invariant: Σ (MCI_material × M_material) / Σ M_material = MCIp,
 * which is exactly how the per-element engines aggregate — so the panel's
 * per-variant MCIp matches what a single element of that variant produces
 * in the main table, and the category totals in <AnalysisResults /> are
 * the mass-weighted blend across variants.
 */

import type { ColumnElement, YN } from './types';
import type { RCColumnsTemplate } from './columns';
import type { AreaElement, CompositeTemplate } from './composite';
import type { WindowElement, WindowsTemplate } from './windows';
import type { InteriorWallElement, InteriorWallsTemplate } from './interiorWalls';
import type { FloorElement, FloorsTemplate } from './floors';
import { classifyMaterial } from './materialClassify';

export interface MaterialBreakdownRow {
  /** Display name — concrete grade, "鋼筋", construction, glass/frame name. */
  name: string;
  /** Optional one-word qualifier (e.g. "再用", "綠建材"). */
  note?: string;
  /** Total mass (kg) across all elements in this variant. */
  M: number;
  /** Share of the parent component mass, 0..1. */
  pct: number;
  Fu: number; Frr: number; Fr: number; Cu: number; Cr: number;
  Ef: number; Ec: number;
  L: number; Lav: number;
  downcycle: YN; lightweight: YN;
  // computed
  V: number; Wo: number; Wfr: number; Wcr: number; W: number;
  X: number; LFI: number; Level: number; Re: number; ELFI: number;
  FX: number; MCI: number;
  /** MCI × M — the material's contribution to parent ΣMCI×M (→ parent MCIp). */
  MCIxM: number;
}

export interface ComponentBreakdownRow {
  /** Human-readable variant summary (strength, admixture, reused, …). */
  variantName: string;
  /** Number of elements in this variant. */
  elementCount: number;
  /** Total project quantity for the variant, with unit label (e.g. "12 m³"). */
  quantityLabel?: string;
  totalM: number;
  MCIp: number;
  materials: MaterialBreakdownRow[];
}

// ---------------------------------------------------------------------------
// Pure material-row math (per-material, with actual mass)
// ---------------------------------------------------------------------------

interface MaterialInput {
  name: string;
  note?: string;
  M: number;
  Fu: number; Fr: number; Cu: number; Cr: number;
  /** Rapid-renewable (biogenic) share — wood → 1.0; default 0. */
  Frr?: number;
  Ef: number; Ec: number;
  L: number; Lav: number;
  downcycle: YN; lightweight: YN;
}

function computeRow(p: MaterialInput, parentTotalM: number): MaterialBreakdownRow {
  const Frr = p.Frr ?? 0;
  // V = virgin non-renewable: FRR (rapid renewable) + FR (recycled) + FU
  // (reused) all subtract from the virgin share, per EMF MCI.
  const V = Math.max(0, p.M * (1 - p.Fu - Frr - p.Fr));
  const Wo = Math.max(0, p.M * (1 - p.Cu - p.Cr));
  const Wfr = p.Ef > 0 ? (p.M * p.Fr * (1 - p.Ef)) / p.Ef : 0;
  const Wcr = p.M * p.Cr * (1 - p.Ec);
  const W = Wo + (Wfr + Wcr) / 2;
  const X = p.Lav > 0 ? p.L / p.Lav : 0;
  const denom = 2 * p.M + (Wfr - Wcr) / 2;
  const LFI = denom > 0 ? (V + W) / denom : 0;
  const Level = p.downcycle === 'Y' ? 0.8 : 1;
  const Re = p.lightweight === 'Y' ? 0.9 : 1;
  const ELFI = Level > 0 ? (LFI * Re) / Level : 0;
  const FX = X > 0 ? 0.9 / X : 0;
  // EMF clamp: MCI ∈ [0, 1] (matches the per-category engines, which cap at 0
  // when ELFI × F(X) > 1 per the EMF Material Circularity Indicator paper).
  const MCI = X > 0 ? Math.max(0, 1 - ELFI * FX) : 0;
  const pct = parentTotalM > 0 ? p.M / parentTotalM : 0;
  const MCIxM = MCI * p.M;
  return { ...p, Frr, pct, V, Wo, Wfr, Wcr, W, X, LFI, Level, Re, ELFI, FX, MCI, MCIxM };
}

function rollUp(
  variantName: string,
  elementCount: number,
  quantityLabel: string | undefined,
  materials: MaterialInput[],
): ComponentBreakdownRow {
  const totalM = materials.reduce((s, m) => s + m.M, 0);
  const rows = materials.map((m) => computeRow(m, totalM));
  const sumMCIxM = rows.reduce((s, r) => s + r.MCIxM, 0);
  const MCIp = totalM > 0 ? sumMCIxM / totalM : 0;
  return { variantName, elementCount, quantityLabel, totalM, MCIp, materials: rows };
}

// ---------------------------------------------------------------------------
// RC mono (columns / beams / slabs / walls) — concrete + rebar per element.
// ---------------------------------------------------------------------------

export function buildRCVariants(
  elements: ColumnElement[],
  tpl: RCColumnsTemplate,
  labels: { concrete: string; rebar: string; reusedTag: string; prefabTag: string },
): ComponentBreakdownRow[] {
  const d = tpl.defaults;
  const rebar = tpl.rebarMaterials.find(
    (r) => Math.abs(r.massPerM3 - tpl.rebarDefaultMassPerM3) <= 1,
  ) ?? tpl.rebarMaterials[0];

  type Group = {
    variantName: string; elementCount: number; totalVolume: number;
    concreteMass: number; rebarMass: number;
    concreteFr: number; concreteCr: number;
    concreteName: string;
    Fu: number; prefab: boolean;
  };
  const byKey = new Map<string, Group>();

  for (const el of elements) {
    if (!el.volumeM3 || el.volumeM3 <= 0) continue;
    const c = tpl.concreteMaterials.find(
      (m) => m.strength === el.concreteStrength
        && Math.abs(m.admixturePct - el.admixturePct) < 1e-9,
    );
    if (!c) continue;
    const key = `${c.name}|${el.reused ? 1 : 0}|${el.prefabModular ? 1 : 0}`;
    const g = byKey.get(key);
    const dCon = el.volumeM3 * c.density;
    const dReb = el.volumeM3 * rebar.massPerM3;
    if (g) {
      g.elementCount += 1;
      g.totalVolume += el.volumeM3;
      g.concreteMass += dCon;
      g.rebarMass += dReb;
    } else {
      const tags = [el.reused ? labels.reusedTag : '', el.prefabModular ? labels.prefabTag : '']
        .filter(Boolean).join(' / ');
      byKey.set(key, {
        variantName: tags ? `${c.name} (${tags})` : c.name,
        elementCount: 1,
        totalVolume: el.volumeM3,
        concreteMass: dCon,
        rebarMass: dReb,
        concreteFr: c.recycledRatio,
        concreteCr: c.recyclableRatio,
        concreteName: c.name,
        Fu: el.reused ? 1 : 0,
        prefab: el.prefabModular,
      });
    }
  }

  const out: ComponentBreakdownRow[] = [];
  for (const g of byKey.values()) {
    const materials: MaterialInput[] = [
      {
        name: labels.concrete,
        note: g.concreteName,
        M: g.concreteMass,
        Fu: g.Fu, Fr: g.concreteFr, Cu: d.CU, Cr: g.concreteCr,
        Ef: d.EF, Ec: d.EC_efficiency,
        L: d.productLifeYears, Lav: d.layerLifeYears,
        downcycle: d.downcycle, lightweight: d.lightweight,
      },
      {
        name: labels.rebar,
        note: `SD420W (${(rebar.crossSectionRatio * 100).toFixed(0)}%, ${rebar.massPerM3} kg/m³)`,
        M: g.rebarMass,
        Fu: g.Fu, Fr: rebar.recycledRatio, Cu: d.CU, Cr: rebar.recyclableRatio,
        Ef: d.EF, Ec: d.EC_efficiency,
        L: d.productLifeYears, Lav: d.layerLifeYears,
        downcycle: d.downcycle, lightweight: d.lightweight,
      },
    ];
    out.push(rollUp(
      g.variantName,
      g.elementCount,
      `${g.totalVolume.toFixed(2)} m³ × ${g.elementCount}`,
      materials,
    ));
  }
  return out.sort((a, b) => b.totalM - a.totalM);
}

// ---------------------------------------------------------------------------
// Composite (外裝) — one material = the whole construction, per variant.
// ---------------------------------------------------------------------------

export function buildCompositeVariants(
  elements: AreaElement[],
  tpl: CompositeTemplate,
  labels: { reusedTag: string; greenTag: string; prefabTag: string; constructionLabel: string },
): ComponentBreakdownRow[] {
  type Group = {
    variantName: string;
    elementCount: number;
    totalArea: number;
    cRef: NonNullable<CompositeTemplate['constructions'][number]>;
    Fu: number; greenRecycled: boolean;
  };
  const byKey = new Map<string, Group>();

  for (const el of elements) {
    if (!el.areaM2 || el.areaM2 <= 0) continue;
    const c = tpl.constructions.find((x) => x.name === el.constructionType);
    if (!c) continue;
    const key = `${c.name}|${el.reused ? 1 : 0}|${el.greenRecycled ? 1 : 0}|${el.prefabModular ? 1 : 0}`;
    const g = byKey.get(key);
    if (g) {
      g.elementCount += 1;
      g.totalArea += el.areaM2;
    } else {
      const tags = [
        el.reused ? labels.reusedTag : '',
        el.greenRecycled ? labels.greenTag : '',
        el.prefabModular ? labels.prefabTag : '',
      ].filter(Boolean).join(' / ');
      byKey.set(key, {
        variantName: tags ? `${c.name} (${tags})` : c.name,
        elementCount: 1,
        totalArea: el.areaM2,
        cRef: c,
        Fu: el.reused ? 1 : 0,
        greenRecycled: el.greenRecycled,
      });
    }
  }

  const out: ComponentBreakdownRow[] = [];
  for (const g of byKey.values()) {
    const c = g.cRef;
    const productLifeSurface = tpl.projectLifeYears / (c.updateCount + 1);
    const materials: MaterialInput[] = [];
    if (c.materials && c.materials.length > 0) {
      // Sub-material breakdown: one row per composition item, with per-row
      // FR/CR/downcycle/lightweight overrides where the material declares them.
      for (const m of c.materials) {
        const factor = m.layer === 'base' ? 1 : c.updateCount + 1;
        const M = g.totalArea * m.weightPerM2New * factor;
        const Fr = m.fr !== undefined
          ? m.fr
          : (g.greenRecycled ? c.frWhenGreen : 0);
        const Cr = m.cr !== undefined ? m.cr : tpl.CR;
        const L = m.layer === 'base' ? tpl.projectLifeYears : productLifeSurface;
        materials.push({
          name: m.name,
          note: m.layer === 'base' ? '基層' : '表層',
          M,
          Fu: g.Fu, Fr, Cu: tpl.CU, Cr,
          Ef: tpl.EF, Ec: tpl.EC_efficiency,
          L, Lav: tpl.layerLifeYears,
          downcycle: m.downcycle ?? c.downcycle,
          lightweight: m.lightweight ?? c.lightweight,
        });
      }
    } else {
      // Legacy single-bucket: construction = one material.
      materials.push({
        name: labels.constructionLabel,
        note: c.name,
        M: g.totalArea * c.weightPerM2,
        Fu: g.Fu, Fr: g.greenRecycled ? c.frWhenGreen : 0,
        Cu: tpl.CU, Cr: tpl.CR,
        Ef: tpl.EF, Ec: tpl.EC_efficiency,
        L: productLifeSurface, Lav: tpl.layerLifeYears,
        downcycle: c.downcycle, lightweight: c.lightweight,
      });
    }
    out.push(rollUp(
      g.variantName,
      g.elementCount,
      `${g.totalArea.toFixed(2)} m² × ${g.elementCount}`,
      materials,
    ));
  }
  return out.sort((a, b) => b.totalM - a.totalM);
}

// ---------------------------------------------------------------------------
// Windows — split per variant into glass (≈70%) + frame (≈30%) to echo the
// engine's materialClassify split.
// ---------------------------------------------------------------------------

export function buildWindowVariants(
  elements: WindowElement[],
  tpl: WindowsTemplate,
  labels: { glass: string; frame: string; reusedTag: string; prefabTag: string },
): ComponentBreakdownRow[] {
  type Group = {
    variantName: string; elementCount: number; totalArea: number;
    M: number; glass: string; frame: string;
    Fu: number; Fr: number; Cr: number;
    downcycle: YN; lightweight: YN; productLife: number;
  };
  const byKey = new Map<string, Group>();

  for (const el of elements) {
    if (!el.areaM2 || el.areaM2 <= 0) continue;
    const c = tpl.combos.find((x) => x.glass === el.glass && x.frame === el.frame);
    if (!c) continue;
    const key = `${el.glass}|${el.frame}|${el.reused ? 1 : 0}|${el.prefabModular ? 1 : 0}`;
    const g = byKey.get(key);
    const dM = el.areaM2 * c.totalWeightPerM2;
    if (g) {
      g.elementCount += 1;
      g.totalArea += el.areaM2;
      g.M += dM;
    } else {
      const tags = [el.reused ? labels.reusedTag : '', el.prefabModular ? labels.prefabTag : '']
        .filter(Boolean).join(' / ');
      byKey.set(key, {
        variantName: tags ? `${el.glass} + ${el.frame} (${tags})` : `${el.glass} + ${el.frame}`,
        elementCount: 1,
        totalArea: el.areaM2,
        M: dM,
        glass: el.glass,
        frame: el.frame,
        Fu: el.reused ? 1 : 0,
        Fr: c.FR,
        Cr: c.CR,
        downcycle: c.downcycle, lightweight: c.lightweight,
        productLife: tpl.projectLifeYears / (c.updateCount + 1),
      });
    }
  }

  const out: ComponentBreakdownRow[] = [];
  for (const g of byKey.values()) {
    // Engine splits the window mass 70/30 glass:frame; apply the same FR/CR to
    // both — the template only carries one value for the assembled combo.
    const Mg = g.M * 0.7;
    const Mf = g.M * 0.3;
    const common = {
      Fu: g.Fu, Fr: g.Fr, Cu: tpl.CU, Cr: g.Cr,
      Ef: tpl.EF, Ec: tpl.EC_efficiency,
      L: g.productLife, Lav: tpl.layerLifeYears,
      downcycle: g.downcycle, lightweight: g.lightweight,
    } as const;
    const frameBucket = classifyMaterial(g.frame);
    const materials: MaterialInput[] = [
      { name: labels.glass, note: g.glass, M: Mg, ...common },
      {
        name: labels.frame,
        note: `${g.frame} (${frameBucket === 'massMetal' ? '金屬' : frameBucket === 'massWood' ? '木' : '塑'})`,
        M: Mf, ...common,
      },
    ];
    out.push(rollUp(
      g.variantName,
      g.elementCount,
      `${g.totalArea.toFixed(2)} m² × ${g.elementCount}`,
      materials,
    ));
  }
  return out.sort((a, b) => b.totalM - a.totalM);
}

// ---------------------------------------------------------------------------
// Interior walls — construction-level, with lifecycle factor baked into M.
// ---------------------------------------------------------------------------

export function buildInteriorWallVariants(
  elements: InteriorWallElement[],
  tpl: InteriorWallsTemplate,
  buildingClassName: string,
  labels: { reusedTag: string; greenTag: string; prefabTag: string; constructionLabel: string },
): ComponentBreakdownRow[] {
  const cls = tpl.buildingClasses.find((b) => b.name === buildingClassName)
    ?? tpl.buildingClasses[tpl.buildingClasses.length - 1];
  const updates = cls.updateCount;
  const lifecycleFactor = updates + 1;
  // Lav = baseline construction's layer life for this building class. In 3-1
  // all constructions share the buildingClass.updateCount, so Lav = L per
  // material → X = 1 today. Structured this way so future base/surface
  // attribution on 3-1 materials lets X diverge.
  const Lav = tpl.projectLifeYears / lifecycleFactor;
  const layerLife = Lav;

  type Group = {
    variantName: string; elementCount: number; totalArea: number;
    cRef: NonNullable<InteriorWallsTemplate['constructions'][number]>;
    Fu: number; greenRecycled: boolean;
  };
  const byKey = new Map<string, Group>();

  for (const el of elements) {
    if (!el.areaM2 || el.areaM2 <= 0) continue;
    const c = tpl.constructions.find((x) => x.name === el.constructionType);
    if (!c) continue;
    const key = `${c.name}|${el.reused ? 1 : 0}|${el.greenRecycled ? 1 : 0}|${el.prefabModular ? 1 : 0}`;
    const g = byKey.get(key);
    if (g) {
      g.elementCount += 1;
      g.totalArea += el.areaM2;
    } else {
      const tags = [
        el.reused ? labels.reusedTag : '',
        el.greenRecycled ? labels.greenTag : '',
        el.prefabModular ? labels.prefabTag : '',
      ].filter(Boolean).join(' / ');
      byKey.set(key, {
        variantName: tags ? `${c.name} (${tags})` : c.name,
        elementCount: 1,
        totalArea: el.areaM2,
        cRef: c,
        Fu: el.reused ? 1 : 0,
        greenRecycled: el.greenRecycled,
      });
    }
  }

  const out: ComponentBreakdownRow[] = [];
  for (const g of byKey.values()) {
    const c = g.cRef;
    const materials: MaterialInput[] = [];
    if (c.materials && c.materials.length > 0) {
      // Sub-material breakdown: one row per composition item, with per-row
      // FR/CR overrides where the material declares them (e.g. 鋼筋/槽鐵).
      for (const m of c.materials) {
        const M = g.totalArea * lifecycleFactor * m.weightPerM2New;
        const Fr = m.fr !== undefined
          ? m.fr
          : (g.greenRecycled ? c.frGreen : c.frNotGreen);
        const Cr = m.cr !== undefined ? m.cr : c.cr;
        materials.push({
          name: m.name,
          M,
          Fu: g.Fu, Fr,
          Frr: m.frr ?? tpl.FRR,
          Cu: tpl.CU, Cr,
          Ef: tpl.EF, Ec: tpl.EC_efficiency,
          L: layerLife, Lav,
          downcycle: m.downcycle ?? c.downcycle,
          lightweight: m.lightweight ?? c.lightweight,
        });
      }
    } else {
      // Legacy single-bucket: construction = one material.
      materials.push({
        name: labels.constructionLabel,
        note: c.name,
        M: g.totalArea * lifecycleFactor * c.newWeightPerM2,
        Fu: g.Fu,
        Fr: g.greenRecycled ? c.frGreen : c.frNotGreen,
        Cu: tpl.CU, Cr: c.cr,
        Ef: tpl.EF, Ec: tpl.EC_efficiency,
        L: layerLife, Lav: layerLife,
        downcycle: c.downcycle, lightweight: c.lightweight,
      });
    }
    out.push(rollUp(
      g.variantName,
      g.elementCount,
      `${g.totalArea.toFixed(2)} m² × ${g.elementCount}`,
      materials,
    ));
  }
  return out.sort((a, b) => b.totalM - a.totalM);
}

// ---------------------------------------------------------------------------
// Floors — per-construction × building-class pre-computed totals.
// ---------------------------------------------------------------------------

export function buildFloorVariants(
  elements: FloorElement[],
  tpl: FloorsTemplate,
  buildingClassName: string,
  labels: { reusedTag: string; prefabTag: string; constructionLabel: string },
): ComponentBreakdownRow[] {
  type Group = {
    variantName: string;
    elementCount: number;
    totalArea: number;
    cRef: NonNullable<FloorsTemplate['constructions'][number]>;
    byClass: NonNullable<FloorsTemplate['constructions'][number]['byClass'][string]>;
    Fu: number;
  };
  const byKey = new Map<string, Group>();

  for (const el of elements) {
    if (!el.areaM2 || el.areaM2 <= 0) continue;
    const c = tpl.constructions.find((x) => x.name === el.constructionType);
    if (!c) continue;
    const byClass = c.byClass[buildingClassName]
      ?? c.byClass[tpl.defaultBuildingClass]
      ?? Object.values(c.byClass)[0];
    if (!byClass) continue;
    const key = `${c.name}|${el.reused ? 1 : 0}|${el.prefabModular ? 1 : 0}`;
    const g = byKey.get(key);
    if (g) {
      g.elementCount += 1;
      g.totalArea += el.areaM2;
    } else {
      const tags = [el.reused ? labels.reusedTag : '', el.prefabModular ? labels.prefabTag : '']
        .filter(Boolean).join(' / ');
      byKey.set(key, {
        variantName: tags ? `${c.name} (${tags})` : c.name,
        elementCount: 1,
        totalArea: el.areaM2,
        cRef: c,
        byClass,
        Fu: el.reused ? 1 : 0,
      });
    }
  }

  // Lav = baseline construction's surface-layer life for this class.
  const baseline = tpl.constructions.find((x) => x.name === tpl.baselineConstruction);
  const baselineByClass = baseline?.byClass[buildingClassName]
    ?? baseline?.byClass[tpl.defaultBuildingClass]
    ?? (baseline ? Object.values(baseline.byClass)[0] : undefined);
  const Lav = baselineByClass
    ? tpl.projectLifeYears / (baselineByClass.surfaceUpdateCount + 1)
    : tpl.projectLifeYears;

  const out: ComponentBreakdownRow[] = [];
  for (const g of byKey.values()) {
    const c = g.cRef;
    const baseUpdates = g.byClass.baseUpdateCount;
    const surfaceUpdates = g.byClass.surfaceUpdateCount;
    const materials: MaterialInput[] = [];
    if (c.materials && c.materials.length > 0) {
      // Sub-material breakdown — base and surface get independent lifecycle
      // factors; metals/wood carry fr/frr/cr overrides from the template.
      for (const m of c.materials) {
        const ownUpdates = m.layer === 'base' ? baseUpdates : surfaceUpdates;
        const factor = ownUpdates + 1;
        const M = g.totalArea * m.weightPerM2New * factor;
        const L = tpl.projectLifeYears / factor;
        materials.push({
          name: m.name,
          note: m.layer === 'base' ? '基層' : '表層',
          M,
          Fu: g.Fu,
          Fr: m.fr ?? 0,
          Frr: m.frr ?? tpl.FRR,
          Cu: tpl.CU,
          Cr: m.cr ?? tpl.CR,
          Ef: tpl.EF, Ec: tpl.EC_efficiency,
          L, Lav,
          downcycle: m.downcycle ?? c.downcycle,
          lightweight: m.lightweight ?? c.lightweight,
        });
      }
    } else {
      // Legacy single-bucket: construction = one material.
      materials.push({
        name: labels.constructionLabel,
        note: c.name,
        M: g.totalArea * g.byClass.totalWeightPerM2,
        Fu: g.Fu, Fr: 0, Cu: tpl.CU, Cr: tpl.CR,
        Ef: tpl.EF, Ec: tpl.EC_efficiency,
        L: tpl.projectLifeYears / (baseUpdates + 1),
        Lav,
        downcycle: c.downcycle, lightweight: c.lightweight,
      });
    }
    out.push(rollUp(
      g.variantName,
      g.elementCount,
      `${g.totalArea.toFixed(2)} m² × ${g.elementCount}`,
      materials,
    ));
  }
  return out.sort((a, b) => b.totalM - a.totalM);
}
