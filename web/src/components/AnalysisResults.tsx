/**
 * Per-category analysis block (used in every category body page).
 *
 * Layout:
 *   1. Material composition pie + legend table (6 buckets, total in center).
 *   2. Row of 6 circularity donuts (CI_CON, CI_USE, CI_EOL, MCIp, PCI, SCIp).
 *   3. Baseline vs Design EC bar chart + reduction (kgCO₂eq & ratio).
 *   4. 物質流向 Sankey: source → material → waste code (opt-in via `flows`).
 *   5. 生命週期成本 LCC: C₀ + LCCb + 5 stage tiles + per-kg waterfall.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Sankey, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ComponentResult } from '@/engine/types';
import type { MaterialBucket } from '@/engine/materialClassify';
import type { SankeyFlow } from '@/engine/sankey';
import type { WasteKey } from '@/engine/waste';
import { LCC_PARAMS, type LCCScenarioAgg } from '@/engine/lcc';
import { fmtInt, fmtNum, fmtPct } from '@/lib/format';

const MATERIAL_KEYS = [
  'massMineral', 'massMetal', 'massGlass', 'massWood', 'massPlastic', 'massOther',
] as const;

/** Distinct, print-safe colors — kept neutral so the dashboard still reads
 *  cleanly in both default and high-contrast themes. */
const MATERIAL_COLORS: Record<(typeof MATERIAL_KEYS)[number], string> = {
  massMineral: '#64748b',  // slate — concrete/stone
  massMetal:   '#9ca3af',  // cool gray — steel/aluminum
  massGlass:   '#38bdf8',  // sky — glass
  massWood:    '#b45309',  // amber-brown — wood
  massPlastic: '#f59e0b',  // amber — plastic
  massOther:   '#cbd5e1',  // light slate — misc
};

/** Waste-code colors — mixed/混合 stays dim; sorted streams pick up a hue. */
const WASTE_COLORS: Record<WasteKey, string> = {
  wasteB5:     '#78716c',  // stone — aggregate / soil
  wasteR1301:  '#525b6e',  // slate-dark — iron
  wasteR1304:  '#a1a1aa',  // zinc — aluminum
  wasteR0401:  '#38bdf8',  // sky — glass
  wasteR0701:  '#b45309',  // amber-brown — wood
  wasteR0201:  '#f59e0b',  // amber — plastic
  wasteR0503:  '#cbd5e1',  // light slate — mixed
};

const WASTE_CODE_LABEL: Record<WasteKey, string> = {
  wasteB5:     'B5',
  wasteR1301:  'R-1301',
  wasteR1304:  'R-1304',
  wasteR0401:  'R-0401',
  wasteR0701:  'R-0701',
  wasteR0201:  'R-0201',
  wasteR0503:  'R-0503',
};

const CI_KEYS = ['CI_CON', 'CI_USE', 'CI_EOL', 'MCIp', 'PCI', 'SCIp'] as const;

export function AnalysisResults({
  summary,
  flows,
  lccScenarios,
}: {
  summary: ComponentResult;
  flows?: SankeyFlow[];
  /** Optional comparison: {current} = 當前設定, {standard} = 一般拆除情境. */
  lccScenarios?: { current: LCCScenarioAgg; standard: LCCScenarioAgg };
}) {
  const { t } = useTranslation();

  const materialData = MATERIAL_KEYS.map((k) => ({
    key: k,
    name: t(`columns.headers.${k}`).replace(/\s*\(kg\)\s*$/, ''),
    value: summary[k],
    fill: MATERIAL_COLORS[k],
  })).filter((m) => m.value > 0);

  const ecData = [
    { name: t('summary.baselineEC'), value: summary.baselineEC, fill: '#94a3b8' },
    { name: t('summary.designEC'),   value: summary.designEC,   fill: '#0f172a' },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Material composition */}
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t('analysis.materialComposition')}
        </h4>
        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
          <div className="relative h-64">
            {materialData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                {t('analysis.noMass')}
              </div>
            ) : (
              <>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={materialData} dataKey="value" nameKey="name"
                      innerRadius={60} outerRadius={100} paddingAngle={2}
                      stroke="none"
                    >
                      {materialData.map((m) => (
                        <Cell key={m.key} fill={m.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(v: number) => [`${fmtInt(v)} kg`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {t('summary.M').replace(/\s*\(kg\)\s*$/, '').replace('材料總重 M', '總重')}
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-slate-900">
                    {fmtInt(summary.M)}
                  </div>
                  <div className="text-[11px] text-slate-500">kg</div>
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col justify-center gap-1.5">
            {MATERIAL_KEYS.map((k) => {
              const value = summary[k];
              const pct = summary.M > 0 ? (value / summary.M) * 100 : 0;
              const dim = value === 0;
              return (
                <div
                  key={k}
                  className={`flex items-center gap-3 border-b border-slate-100 py-1.5 text-sm last:border-b-0 ${
                    dim ? 'text-slate-400' : 'text-slate-700'
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: dim ? '#e2e8f0' : MATERIAL_COLORS[k] }}
                  />
                  <span className="min-w-[4rem]">
                    {t(`columns.headers.${k}`).replace(/\s*\(kg\)\s*$/, '')}
                  </span>
                  <span className="ml-auto tabular-nums">
                    {fmtInt(value)} kg
                  </span>
                  <span className="min-w-[3.5rem] text-right tabular-nums text-slate-500">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. Six circularity donuts */}
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t('analysis.circularityIndices')}
        </h4>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {CI_KEYS.map((k) => (
            <DonutMetric key={k} label={k} value={summary[k]} />
          ))}
        </div>
      </section>

      {/* 3. Embodied carbon bars + reduction */}
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t('analysis.embodiedCarbon')}
        </h4>
        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ecData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => fmtInt(v)} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(v: number) => [`${fmtInt(v)} kgCO₂eq`, '']}
              />
              <Bar dataKey="value">
                {ecData.map((d) => (<Cell key={d.name} fill={d.fill} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-col justify-center gap-5 px-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                {t('summary.reduction')}
              </div>
              <div className={`mt-1 text-2xl font-bold tabular-nums ${
                summary.reduction <= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {summary.reduction <= 0 ? '' : '+'}{fmtInt(summary.reduction)}
                <span className="ml-1 text-xs font-medium">kgCO₂eq</span>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                {t('summary.reductionRatio')}
              </div>
              <div className={`mt-1 text-2xl font-bold tabular-nums ${
                summary.reductionRatio <= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {fmtPct(summary.reductionRatio)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Waste-flow Sankey: source → material → waste code */}
      {flows && flows.length > 0 && <WasteFlowSankey flows={flows} />}

      {/* 5. Life-cycle cost (LCC) */}
      <LCCSection summary={summary} scenarios={lccScenarios} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sankey subsection
// ---------------------------------------------------------------------------

interface SankeyNodeData {
  name: string;
  tier: 0 | 1 | 2;
  color: string;
  value: number;   // total kg into / out of this node (set by recharts)
}

interface SankeyLinkData {
  source: number;
  target: number;
  value: number;
  color: string;   // link stroke color (follows material bucket)
}

function WasteFlowSankey({ flows }: { flows: SankeyFlow[] }) {
  const { t } = useTranslation();

  const data = useMemo(() => {
    // Preserve left→right stable ordering: sources first (by insertion),
    // then materials (in MATERIAL_KEYS order), then waste codes (fixed order).
    const sources: string[] = [];
    for (const f of flows) if (!sources.includes(f.source)) sources.push(f.source);

    const materialsUsed = MATERIAL_KEYS.filter((m) =>
      flows.some((f) => f.material === m),
    );
    const wastesUsed = (Object.keys(WASTE_CODE_LABEL) as WasteKey[]).filter((w) =>
      flows.some((f) => f.waste === w),
    );

    const nodes: SankeyNodeData[] = [
      ...sources.map((s) => ({ name: s, tier: 0 as const, color: '#475569', value: 0 })),
      ...materialsUsed.map((m) => ({
        name: t(`columns.headers.${m}`).replace(/\s*\(kg\)\s*$/, ''),
        tier: 1 as const,
        color: MATERIAL_COLORS[m],
        value: 0,
      })),
      ...wastesUsed.map((w) => ({
        name: `${WASTE_CODE_LABEL[w]} ${t(`waste.${w}`)}`,
        tier: 2 as const,
        color: WASTE_COLORS[w],
        value: 0,
      })),
    ];

    const sIdx = (s: string) => sources.indexOf(s);
    const mIdx = (m: MaterialBucket) => sources.length + materialsUsed.indexOf(m);
    const wIdx = (w: WasteKey) =>
      sources.length + materialsUsed.length + wastesUsed.indexOf(w);

    // Aggregate: (source → material) and (material → waste).
    const srcMat = new Map<string, number>();
    const matWaste = new Map<string, number>();
    for (const f of flows) {
      const k1 = `${f.source}|${f.material}`;
      srcMat.set(k1, (srcMat.get(k1) ?? 0) + f.value);
      const k2 = `${f.material}|${f.waste}`;
      matWaste.set(k2, (matWaste.get(k2) ?? 0) + f.value);
    }

    const links: SankeyLinkData[] = [];
    for (const [k, v] of srcMat) {
      const [src, mat] = k.split('|') as [string, MaterialBucket];
      links.push({
        source: sIdx(src),
        target: mIdx(mat),
        value: v,
        color: MATERIAL_COLORS[mat],
      });
    }
    for (const [k, v] of matWaste) {
      const [mat, waste] = k.split('|') as [MaterialBucket, WasteKey];
      links.push({
        source: mIdx(mat),
        target: wIdx(waste),
        value: v,
        color: MATERIAL_COLORS[mat],
      });
    }

    return { nodes, links };
  }, [flows, t]);

  if (data.nodes.length === 0 || data.links.length === 0) return null;

  const rightTierCount = data.nodes.filter((n) => n.tier === 2).length;
  const height = Math.max(260, Math.max(data.nodes.length, rightTierCount) * 32);

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t('analysis.wasteFlow')}
      </h4>
      <ResponsiveContainer width="100%" height={height}>
        <Sankey
          data={data}
          nodePadding={24}
          nodeWidth={10}
          linkCurvature={0.45}
          iterations={64}
          margin={{ top: 10, right: 160, bottom: 10, left: 70 }}
          node={<SankeyNodeShape />}
          link={<SankeyLinkShape />}
        >
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(v: number) => [`${fmtInt(v)} kg`, '']}
          />
        </Sankey>
      </ResponsiveContainer>
    </section>
  );
}

/** Node: colored rectangle + label (left of source tier, right of others). */
function SankeyNodeShape(props: unknown) {
  const p = props as {
    x: number; y: number; width: number; height: number;
    index: number;
    payload: SankeyNodeData & { value: number };
  };
  const { x, y, width, height, payload } = p;
  const onLeft = payload.tier === 0;
  const labelX = onLeft ? x - 6 : x + width + 6;
  const anchor = onLeft ? 'end' : 'start';
  return (
    <g>
      <rect x={x} y={y} width={width} height={Math.max(1, height)} fill={payload.color} rx={1} />
      <text
        x={labelX}
        y={y + height / 2}
        textAnchor={anchor}
        dominantBaseline="middle"
        fontSize={11}
        fill="#334155"
      >
        {payload.name}
      </text>
    </g>
  );
}

/** Link: thin bezier colored by the material bucket it carries. */
function SankeyLinkShape(props: unknown) {
  const p = props as {
    sourceX: number; sourceY: number; sourceControlX: number;
    targetX: number; targetY: number; targetControlX: number;
    linkWidth: number;
    payload: { color?: string };
  };
  const path =
    `M${p.sourceX},${p.sourceY}` +
    `C${p.sourceControlX},${p.sourceY} ${p.targetControlX},${p.targetY} ${p.targetX},${p.targetY}`;
  return (
    <path
      d={path}
      fill="none"
      stroke={p.payload.color ?? '#94a3b8'}
      strokeOpacity={0.35}
      strokeWidth={Math.max(1, p.linkWidth)}
    />
  );
}

// ---------------------------------------------------------------------------
// LCC subsection — placed after the Sankey per spec §6 guidance
// ---------------------------------------------------------------------------

/**
 * Comprehensive LCC display: C₀ + 5 stage tiles + 3 ratios + LCCb total.
 * Per spec §6.1 the three ratios MUST be shown together (showing only the
 * material-recovery rate leads to opposite rankings — see 沙崙 vs 楊梅).
 */
function LCCSection({
  summary,
  scenarios,
}: {
  summary: ComponentResult;
  scenarios?: { current: LCCScenarioAgg; standard: LCCScenarioAgg };
}) {
  const { t } = useTranslation();
  const hasLCC = summary.lccNominal !== 0 || summary.lccPV !== 0;
  if (!hasLCC && summary.cost === 0) return null;
  const LCCb = summary.cost + summary.lccPV;
  const hasC0 = summary.cost > 0;

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <h4 className="mb-4 flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <span>{t('analysis.lcc')}</span>
        <span className="text-[11px] font-normal normal-case text-slate-400">
          {t('lcc.discountBase')} · {t('lcc.lifeNote')}
        </span>
      </h4>

      {/* Top row — C₀ and LCCb side-by-side */}
      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <BigValue
          label={t('lcc.cost') + ' C₀'}
          value={summary.cost}
          sub={summary.M > 0 ? `${t('analysis.costPerTonne')}: NT$ ${fmtInt((summary.cost / summary.M) * 1000)}` : undefined}
          dim={!hasC0}
        />
        <BigValue
          label={t('analysis.LCCb')}
          value={LCCb}
          sub={'= C₀ + PV(C,D)'}
          dim={!hasC0 && !hasLCC}
        />
      </div>

      {/* Mid row — 5 cost/benefit tiles */}
      <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-5">
        <SignedTile label={'C₁ ' + t('lcc.lccC1')}      value={summary.lccC1} />
        <SignedTile label={'C₂ ' + t('lcc.lccC2')}      value={summary.lccC2} />
        <SignedTile label={'D '  + t('lcc.lccD')}       value={-summary.lccD} invert />
        <SignedTile label={t('lcc.lccNominal')}         value={summary.lccNominal} />
        <SignedTile label={t('lcc.lccPV')}              value={summary.lccPV} />
      </div>

      {/* Waterfall: per-code terminal net cost. When scenarios are supplied the
          chart shows two stacked rows (一般拆除情境 / 當前設定情境) on a shared
          scale so the configuration gain/loss is read directly off the bars. */}
      <div className="border-t border-slate-100 pt-4">
        <NetCostWaterfall summary={summary} scenarios={scenarios} />
      </div>
    </section>
  );
}

/** Headline card: single big NT$ value + optional subtitle. */
function BigValue({
  label, value, sub, dim,
}: { label: string; value: number; sub?: string; dim?: boolean }) {
  const color = dim ? 'text-slate-400' : value < 0 ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>
        NT$ {fmtInt(value)}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Compact card showing one signed NT$ value. Negative → emerald, positive → slate.
 *  `invert`: treat positive as benefit (for D 殘值 which is displayed as a negative-sign
 *  value already so the invariant "negative = benefit" still holds visually). */
function SignedTile({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const benefit = invert ? value > 0 : value < 0;
  const color = value === 0 ? 'text-slate-400' : benefit ? 'text-emerald-600' : 'text-slate-700';
  return (
    <div className="rounded-md border border-slate-100 px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${color}`}>
        {value === 0 ? '—' : fmtInt(value)}
      </div>
    </div>
  );
}

/**
 * Horizontal waterfall of total terminal net cost (NT$), modelled after the
 * reference figure (b) in LCC計算規格 (終期淨成本 = C₁ 拆除費 + Σ 各代碼
 * (處理費 + 運送 − 再生營收)).
 *
 * Starts at 0, stacks each component in its own direction (positive goes
 * right, negative goes left), and marks the running net with a dashed line.
 * The end position equals summary.lccNominal.
 */
const WASTE_TO_LCC: Record<WasteKey, keyof typeof LCC_PARAMS.categories> = {
  wasteB5:    'B5',
  wasteR1301: 'R1301',
  wasteR1304: 'R1304',
  wasteR0401: 'R0401',
  wasteR0701: 'R0701',
  wasteR0201: 'D0299',
  wasteR0503: 'R0503',
};

const WASTE_LABEL: Record<WasteKey, string> = {
  wasteB5:    'B5 廢土方',
  wasteR0503: 'R-0503 混合物',
  wasteR1301: 'R-1301 廢鐵',
  wasteR1304: 'R-1304 廢鋁',
  wasteR0401: 'R-0401 廢玻璃',
  wasteR0701: 'R-0701 廢木材',
  wasteR0201: 'R-0201 廢塑膠',
};

const WASTE_PALETTE: Record<WasteKey, string> = {
  wasteB5:    '#78716c',
  wasteR0503: '#cbd5e1',
  wasteR1301: '#334155',
  wasteR1304: '#a1a1aa',
  wasteR0401: '#38bdf8',
  wasteR0701: '#b45309',
  wasteR0201: '#f59e0b',
};

/** One row of the terminal-net waterfall for a given scenario. Returns the
 *  computed segments and net so a parent can pool scales across scenarios. */
function buildWaterfallSegs(
  c1Total: number,
  wasteByCode: Record<WasteKey, number>,
  c1Label: string,
): { segs: { key: string; label: string; color: string; contribution: number; start: number; end: number }[]; net: number } {
  const wasteKeys: WasteKey[] = [
    'wasteB5', 'wasteR0503', 'wasteR1301', 'wasteR1304',
    'wasteR0401', 'wasteR0701', 'wasteR0201',
  ];
  const catContribs = wasteKeys
    .map((wk) => {
      const mass = wasteByCode[wk];
      if (mass <= 0) return null;
      const p = LCC_PARAMS.categories[WASTE_TO_LCC[wk]];
      const unit = p.c2 + (p.km * LCC_PARAMS.truckRate) / 1000 - p.d;
      return {
        key: wk,
        label: WASTE_LABEL[wk],
        color: WASTE_PALETTE[wk],
        contribution: unit * mass,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const positives = catContribs.filter((c) => c.contribution > 0);
  const negatives = catContribs.filter((c) => c.contribution < 0);
  const items = [
    { key: 'c1', label: c1Label, color: '#fb923c', contribution: c1Total },
    ...negatives.sort((a, b) => a.contribution - b.contribution),
    ...positives.sort((a, b) => b.contribution - a.contribution),
  ];

  let cursor = 0;
  const segs = items.map((it) => {
    const start = cursor;
    cursor += it.contribution;
    return { ...it, start, end: cursor };
  });
  return { segs, net: cursor };
}

/**
 * Horizontal terminal-net waterfall. When `scenarios` is supplied, draws two
 * rows (一般拆除情境 / 當前設定情境) on a shared X-scale so the configuration
 * gain/loss reads directly off the bar positions and the net markers.
 */
function NetCostWaterfall({
  summary,
  scenarios,
}: {
  summary: ComponentResult;
  scenarios?: { current: LCCScenarioAgg; standard: LCCScenarioAgg };
}) {
  const { t } = useTranslation();
  if (summary.M <= 0) return null;

  const c1Label = 'C₁ ' + t('lcc.lccC1');

  // Build the per-scenario rows. Without `scenarios` fall back to a single
  // row sourced from `summary` (preserves prior behaviour for consumers that
  // haven't wired the scenario comparison yet).
  type Row = {
    key: string;
    label: string;
    segs: ReturnType<typeof buildWaterfallSegs>['segs'];
    net: number;
  };
  const rows: Row[] = scenarios
    ? [
        (() => {
          const { segs, net } = buildWaterfallSegs(
            scenarios.standard.C1, scenarios.standard.waste, c1Label,
          );
          return { key: 'standard', label: t('analysis.scenarioStandard'), segs, net };
        })(),
        (() => {
          const { segs, net } = buildWaterfallSegs(
            scenarios.current.C1, scenarios.current.waste, c1Label,
          );
          return { key: 'current', label: t('analysis.scenarioConfigured'), segs, net };
        })(),
      ]
    : [
        (() => {
          const wasteMap: Record<WasteKey, number> = {
            wasteB5: summary.wasteB5, wasteR1301: summary.wasteR1301,
            wasteR1304: summary.wasteR1304, wasteR0401: summary.wasteR0401,
            wasteR0701: summary.wasteR0701, wasteR0201: summary.wasteR0201,
            wasteR0503: summary.wasteR0503,
          };
          const { segs, net } = buildWaterfallSegs(summary.lccC1, wasteMap, c1Label);
          return { key: 'only', label: '', segs, net };
        })(),
      ];

  // Shared scale: envelope every segment and every net marker across rows.
  const allXs: number[] = [0];
  for (const r of rows) {
    allXs.push(r.net);
    for (const s of r.segs) { allXs.push(s.start); allXs.push(s.end); }
  }
  const minVal = Math.min(...allXs);
  const maxVal = Math.max(...allXs);
  const span = Math.max(1e-9, maxVal - minVal);
  const padFrac = 0.05;
  const vbMin = minVal - span * padFrac;
  const vbMax = maxVal + span * padFrac;
  const vbSpan = vbMax - vbMin;

  const W = 800;
  const rowH = 70;      // height per scenario row
  const topPad = 14;    // for '0' label above the zero line
  const bottomPad = 18; // for the net label
  const H = rows.length * rowH + topPad + bottomPad;
  const barH = 28;
  const zeroX = ((0 - vbMin) / vbSpan) * W;

  // Scenario delta (when both scenarios present): current − standard (nominal).
  const current = scenarios?.current.nominal;
  const standard = scenarios?.standard.nominal;
  const delta = current !== undefined && standard !== undefined ? current - standard : undefined;
  const deltaRatio =
    delta !== undefined && standard !== undefined && standard !== 0
      ? delta / Math.abs(standard)
      : undefined;
  const deltaGood = delta !== undefined && delta < 0;

  // Union of waste codes used across rows → stable legend. C₁ is rendered
  // separately below, so skip it here to avoid a duplicate chip.
  const legendSegs: { key: string; label: string; color: string }[] = [];
  const legendSeen = new Set<string>(['c1']);
  for (const r of rows) {
    for (const s of r.segs) {
      if (!legendSeen.has(s.key)) {
        legendSeen.add(s.key);
        legendSegs.push({ key: s.key, label: s.label, color: s.color });
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-xs font-medium text-slate-600">
          {t('analysis.totalNetCost')}
        </div>
        {delta !== undefined && (
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-slate-500">{t('analysis.scenarioDelta')}</span>
            <span className={`text-xl font-bold tabular-nums ${
              deltaGood ? 'text-emerald-600' : delta === 0 ? 'text-slate-400' : 'text-rose-600'
            }`}>
              {delta > 0 ? '+' : ''}{fmtInt(delta)}
            </span>
            <span className="text-xs text-slate-500">NT$</span>
            {deltaRatio !== undefined && (
              <span className={`ml-1 text-xs tabular-nums ${
                deltaGood ? 'text-emerald-600' : delta === 0 ? 'text-slate-400' : 'text-rose-600'
              }`}>
                ({delta > 0 ? '+' : ''}{fmtPct(deltaRatio)})
              </span>
            )}
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        {/* Zero reference line spans all rows */}
        <line x1={zeroX} y1={topPad} x2={zeroX} y2={H - bottomPad}
              stroke="#cbd5e1" strokeWidth={1} />
        <text x={zeroX} y={topPad - 4} fontSize={10} fill="#94a3b8" textAnchor="middle">0</text>

        {rows.map((r, rowIdx) => {
          const rowTop = topPad + rowIdx * rowH;
          const labelY = rowTop + 10;
          const barY = rowTop + 18;
          const netX = ((r.net - vbMin) / vbSpan) * W;
          const netColor = r.net < 0 ? '#059669' : r.net > 0 ? '#e11d48' : '#94a3b8';
          return (
            <g key={r.key}>
              {/* Row label (left-aligned at viewbox edge) */}
              {r.label && (
                <text x={6} y={labelY} fontSize={11} fontWeight={600} fill="#475569">
                  {r.label}
                </text>
              )}
              {/* Segments */}
              {r.segs.map((s) => {
                const x0 = ((s.start - vbMin) / vbSpan) * W;
                const x1 = ((s.end   - vbMin) / vbSpan) * W;
                const x  = Math.min(x0, x1);
                const w  = Math.abs(x1 - x0);
                if (w < 0.5) return null;
                return (
                  <rect key={s.key} x={x} y={barY} width={w} height={barH}
                        fill={s.color} stroke="#ffffff" strokeWidth={0.5}>
                    <title>{`${r.label || ''}${r.label ? ' · ' : ''}${s.label}: ${s.contribution > 0 ? '+' : ''}${fmtInt(s.contribution)} NT$`}</title>
                  </rect>
                );
              })}
              {/* Net marker and label */}
              <line x1={netX} y1={barY - 4} x2={netX} y2={barY + barH + 4}
                    stroke={netColor} strokeWidth={1.5} strokeDasharray="4 3" />
              <text x={netX + (r.net >= 0 ? 4 : -4)}
                    y={barY + barH + 14}
                    fontSize={11}
                    fontWeight={600}
                    textAnchor={r.net >= 0 ? 'start' : 'end'}
                    fill={netColor}>
                {`${t('analysis.netTotal')} ${r.net > 0 ? '+' : ''}${fmtInt(r.net)} 元`}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#fb923c' }} />
          <span>{c1Label}</span>
        </div>
        {legendSegs.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One circularity ring. Donut fills proportionally to min(value, 1); center
 *  shows the actual value so values > 1 (e.g. reused CI_CON) are still legible. */
function DonutMetric({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(value, 1));
  const data = [
    { name: 'fill', value: clamped },
    { name: 'rest', value: Math.max(0, 1 - clamped) },
  ];
  const overflow = value > 1;
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data} dataKey="value"
              innerRadius={30} outerRadius={44}
              startAngle={90} endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={overflow ? '#059669' : '#0f172a'} />
              <Cell fill="#e2e8f0" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-sm font-semibold tabular-nums text-slate-900">
            {fmtNum(value, 2)}
          </div>
        </div>
      </div>
      <div className="mt-1 text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}
