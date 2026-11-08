// Domain types for the BCI / EC engine.
// Mirrors the column layout of the source spreadsheets.

export type YN = 'Y' | 'N';

export interface ConcreteMaterial {
  strength: string;        // e.g. "結構用混凝土，預拌，350kgf/cm2"
  admixturePct: number;    // 0, 0.1, 0.2, 0.3, 0.4, 0.5
  density: number;         // kg/m³, typically 2400
  cementRatio: number;     // D
  recycledRatio: number;   // E (= cementRatio * admixturePct for non-zero admixture)
  recyclableRatio: number; // F
  name: string;            // G integrated name
  ecFactor: number;        // H kgCO2eq/m³
  /** NT$ per m³ of ready-mix concrete (excludes rebar / formwork / labor). */
  unitPrice?: number;
}

export interface RebarMaterial {
  crossSectionRatio: number; // 0.01..0.05
  massPerM3: number;         // kg/m³
  recycledRatio: number;     // 0.8
  recyclableRatio: number;   // 0.9
  ecFactor: number;          // kgCO2eq/kg, 1.15
  /** NT$ per kg of rebar (SD420W baseline). */
  unitPricePerKg?: number;
}

/** Element-level calculation defaults that are hard-coded in the spreadsheet
 *  for a given component category (e.g. RC columns). The user can override per
 *  project; per-element overrides come from `ColumnElement`. */
export interface CategoryDefaults {
  category: string;            // 構件分類, e.g. "結構"
  projectLifeYears: number;    // 專案壽命
  layerLifeYears: number;      // 層次壽命
  productLifeYears: number;    // 產品壽命
  downcycle: YN;               // 降級回收 K
  lightweight: YN;             // 輕量化設計 L
  componentDetachable: YN;     // 構件拆卸性 M
  systemDetachable: YN;        // 系統拆卸性 O
  FRR: number;                 // 使用可快速再生料比例
  EF: number;                  // 製造階段回收效率
  CU: number;                  // 未來可再使用材料比例
  EC_efficiency: number;       // 拆除階段回收效率
}

export interface ColumnElement {
  id: string;
  floor?: string;
  family?: string;
  volumeM3: number;
  note?: string;
  // Selections from 選填表單:
  concreteStrength: string;     // matches ConcreteMaterial.strength
  admixturePct: number;         // matches ConcreteMaterial.admixturePct
  reused: boolean;              // 再利用構件
  prefabModular: boolean;       // 預鑄工法或模矩化
  greenDemolition: boolean;     // 綠色拆除 — if true, sort waste by material code
}

export interface ElementResult {
  M: number;            // total mass kg
  /** 礦物: RC → concrete; 其他引擎 → 依構造名稱分類 */
  massMineral: number;
  /** 金屬: RC → rebar; 其他引擎 → 依構造名稱分類 (鋼/鋁/鐵) */
  massMetal: number;
  /** 玻璃: 外窗預設,或構造名稱含 glass */
  massGlass: number;
  /** 木材: 構造名稱含 木/wood/竹 */
  massWood: number;
  /** 塑膠: 構造名稱含 PVC/塑膠/FRP */
  massPlastic: number;
  /** 其他: 無法分類 */
  massOther: number;
  /** Taiwan EPA waste codes (kg). Sum equals M. Flow depends on greenDemolition. */
  wasteB5: number;       // 廢土方 (concrete/stone/tile/brick — both scenarios)
  wasteR1301: number;    // 廢鐵 (always separated)
  wasteR1304: number;    // 廢鋁 (green only; else → R-0503)
  wasteR0401: number;    // 廢玻璃 (green only; else → R-0503)
  wasteR0701: number;    // 廢木材 (green only; else → R-0503)
  wasteR0201: number;    // 廢塑膠 (green only; else → R-0503)
  wasteR0503: number;    // 營建混合物 (board materials, misc, and all non-green)
  CI_CON: number;       // FU + FRR + FR
  CI_USE: number;       // V/I
  CI_EOL: number;       // CU + CR
  V: number;            // initial virgin input
  Wo: number;           // EOL waste
  WF: number;           // recycle process waste F
  WC: number;           // recycle process waste C
  W: number;            // total waste
  LFI: number;
  ELFI: number;
  MCIp: number;
  PCI: number;
  SCIp: number;
  baselineEC: number;   // kgCO2eq
  designEC: number;     // kgCO2eq
  reduction: number;    // designEC - baselineEC (negative when reduced)
  reductionRatio: number; // reduction / baselineEC
  /** 資材購買價格 (NT$), from template unitPrice × quantity. */
  cost: number;
  /** LCC terminal values (NT$). See `lcc.ts` for formulas. */
  lccC1: number;        // 拆除費用
  lccC2: number;        // 運送 + 處理 (combined)
  lccD: number;         // 殘值
  lccNominal: number;   // 終期淨成本 (名目) = C1 + C2 − D
  lccPV: number;        // 終期淨成本 現值 (折現至 t=0)
}

export interface ComponentResult {
  category: string;     // e.g. "RC結構柱"
  elementCount: number;
  M: number;
  massMineral: number;
  massMetal: number;
  massGlass: number;
  massWood: number;
  massPlastic: number;
  massOther: number;
  wasteB5: number;
  wasteR1301: number;
  wasteR1304: number;
  wasteR0401: number;
  wasteR0701: number;
  wasteR0201: number;
  wasteR0503: number;
  CI_CON: number;       // mass-weighted average
  CI_USE: number;
  CI_EOL: number;
  MCIp: number;
  PCI: number;
  SCIp: number;
  baselineEC: number;
  designEC: number;
  reduction: number;
  reductionRatio: number;
  cost: number;
  lccC1: number;
  lccC2: number;
  lccD: number;
  lccNominal: number;
  lccPV: number;
}

export interface BuildingResult {
  components: ComponentResult[];
  M: number;
  massMineral: number;
  massMetal: number;
  massGlass: number;
  massWood: number;
  massPlastic: number;
  massOther: number;
  wasteB5: number;
  wasteR1301: number;
  wasteR1304: number;
  wasteR0401: number;
  wasteR0701: number;
  wasteR0201: number;
  wasteR0503: number;
  CI_CON: number;
  CI_USE: number;
  CI_EOL: number;
  MCIp: number;
  PCI: number;
  /** BCI = building-level SCIp (mass-weighted average of component SCIp). */
  BCI: number;
  baselineEC: number;
  designEC: number;
  reduction: number;
  reductionRatio: number;
  cost: number;
  lccC1: number;
  lccC2: number;
  lccD: number;
  lccNominal: number;
  lccPV: number;
}
