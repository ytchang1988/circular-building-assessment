import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '@/store/project';
import { INTERIOR_WALLS_TEMPLATE } from '@/templates/RC/allRegistry';

export function ProjectMetaRoute() {
  const { t } = useTranslation();
  const meta = useProject((s) => s.meta);
  const setMeta = useProject((s) => s.setMeta);

  const importElements = useProject((s) => s.importElements);
  const importAreaElements = useProject((s) => s.importAreaElements);
  const importWindowElements = useProject((s) => s.importWindowElements);
  const importLifecycleElements = useProject((s) => s.importLifecycleElements);

  const classes = INTERIOR_WALLS_TEMPLATE.buildingClasses.map((b) => b.name);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function loadYangmei() {
    if (loading) return;
    const ok = window.confirm(t('project.demoConfirm'));
    if (!ok) return;
    setLoading(true);
    setStatus(null);
    try {
      const url = `${import.meta.env.BASE_URL}demo/yangmei.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
      const bundle = await res.json();

      setMeta({
        name: bundle.meta.name,
        buildingType: bundle.meta.buildingType,
        totalFloorArea: bundle.meta.totalFloorArea,
        buildingClass: bundle.meta.buildingClass,
      });

      importElements('columns', bundle.columns, 'replace');
      importElements('beams',   bundle.beams,   'replace');
      importElements('slabs',   bundle.slabs,   'replace');
      importElements('walls',   bundle.walls,   'replace');
      importAreaElements('cladding', bundle.cladding, 'replace');
      importWindowElements(bundle.windows, 'replace');
      importLifecycleElements('interiorWalls', bundle.interiorWalls, 'replace');
      importLifecycleElements('floors',         bundle.floors,        'replace');

      const n =
        bundle.columns.length + bundle.beams.length + bundle.slabs.length +
        bundle.walls.length + bundle.cladding.length + bundle.windows.length +
        bundle.interiorWalls.length + bundle.floors.length;
      setStatus(t('project.demoDone', { count: n }));
    } catch (err) {
      setStatus(t('project.demoError', { msg: (err as Error).message }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-8">
      <h2 className="mb-6 text-xl font-semibold">{t('nav.project')}</h2>
      <div className="grid gap-4">
        <label className="grid gap-1">
          <span className="text-sm text-slate-600">{t('project.name')}</span>
          <input
            type="text"
            value={meta.name}
            onChange={(e) => setMeta({ name: e.target.value })}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-slate-600">{t('project.type')}</span>
          <select
            value={meta.buildingType}
            onChange={(e) =>
              setMeta({ buildingType: e.target.value as 'RC' | 'SRC' })
            }
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="RC">{t('project.buildingType.RC')}</option>
            <option value="SRC" disabled>
              {t('project.buildingType.SRC')}
            </option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-slate-600">
            {t('project.totalFloorArea')}
          </span>
          <input
            type="number"
            min={0}
            step="any"
            value={meta.totalFloorArea}
            onChange={(e) =>
              setMeta({ totalFloorArea: Number(e.target.value) || 0 })
            }
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-slate-600">
            {t('project.buildingClass')}
          </span>
          <select
            value={meta.buildingClass}
            onChange={(e) => setMeta({ buildingClass: e.target.value })}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            {t('project.buildingClassHelp')}
          </span>
        </label>
      </div>

      {/* Demo project loader */}
      <div className="mt-8 rounded-md border border-slate-200 bg-slate-50 p-5">
        <div className="mb-2 text-sm font-semibold text-slate-700">
          {t('project.demoTitle')}
        </div>
        <p className="mb-3 text-xs text-slate-600">
          {t('project.demoHint')}
        </p>
        <button
          type="button"
          onClick={loadYangmei}
          disabled={loading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? t('project.demoLoading') : t('project.demoButton')}
        </button>
        {status && (
          <div className="mt-3 text-xs text-slate-700">{status}</div>
        )}
      </div>
    </section>
  );
}
