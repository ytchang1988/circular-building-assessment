import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';

export function Header() {
  const { t, i18n } = useTranslation();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link to="/" className="text-lg font-bold text-slate-800">
          {t('appTitle')}
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {[
            { to: '/', key: 'project', end: true },
            { to: '/g/structure', key: 'groupStructure', end: false },
            { to: '/g/envelope', key: 'groupEnvelope', end: false },
            { to: '/g/interior', key: 'groupInterior', end: false },
            { to: '/dashboard', key: 'dashboard', end: true },
          ].map(({ to, key, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {t(`nav.${key}`)}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1 text-sm">
          {(['zh-TW', 'en'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => i18n.changeLanguage(lang)}
              className={`rounded-md px-2 py-1 ${
                i18n.language === lang
                  ? 'bg-slate-200 text-slate-900'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
