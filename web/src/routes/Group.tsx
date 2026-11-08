import { useTranslation } from 'react-i18next';
import { Link, useParams, Navigate } from 'react-router-dom';
import {
  CATEGORY_LABEL_KEY,
  CATEGORY_ENGINE,
  GROUPS,
  type AnyCategory,
  type GroupKey,
  RC_MONO_TEMPLATES,
  type RCMonoCategory,
  type LifecycleCategory,
  CLADDING_TEMPLATE,
} from '@/templates/RC/allRegistry';
import { RCElementsBody } from '@/routes/RCElementsBody';
import { CompositeBody } from '@/routes/CompositeBody';
import { WindowsBody } from '@/routes/Windows';
import { LifecycleBody } from '@/routes/Lifecycle';

const GROUP_KEYS: GroupKey[] = ['structure', 'envelope', 'interior'];
const isGroupKey = (s: string | undefined): s is GroupKey =>
  !!s && (GROUP_KEYS as string[]).includes(s);

export function GroupRoute() {
  const params = useParams<{ group?: string; cat?: string }>();
  const { t } = useTranslation();

  if (!isGroupKey(params.group)) {
    return <Navigate to="/g/structure" replace />;
  }
  const group = params.group;
  const cats = GROUPS[group];

  const cat = (cats as string[]).includes(params.cat ?? '')
    ? (params.cat as AnyCategory)
    : cats[0];

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t(`groups.${group}`)}
      </div>
      <nav className="mb-6 flex gap-1 border-b border-slate-200">
        {cats.map((c, idx) => (
          <Link
            key={c}
            to={`/g/${group}/${c}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              c === cat
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="mr-1 text-xs text-slate-400">
              {group === 'structure' ? `1-${idx + 1}` :
               group === 'envelope' ? `2-${idx + 1}` :
               `3-${idx + 1}`}
            </span>
            {t(CATEGORY_LABEL_KEY[c])}
          </Link>
        ))}
      </nav>

      <CategoryBodyDispatch category={cat} />
    </section>
  );
}

function CategoryBodyDispatch({ category }: { category: AnyCategory }) {
  const engine = CATEGORY_ENGINE[category];
  switch (engine) {
    case 'rcMono':
      return (
        <RCElementsBody
          category={category as RCMonoCategory}
          template={RC_MONO_TEMPLATES[category as RCMonoCategory]}
        />
      );
    case 'composite':
      return <CompositeBody category="cladding" template={CLADDING_TEMPLATE} />;
    case 'windows':
      return <WindowsBody />;
    case 'interiorWalls':
    case 'floors':
      return <LifecycleBody category={category as LifecycleCategory} />;
  }
}
