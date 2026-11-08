import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  parseWindowCsvFile, parseWindowTabular, parseWindowXlsxFile,
  type WindowImportConfig, type WindowImportResult,
} from '@/lib/importWindow';

interface Props {
  open: boolean;
  config: WindowImportConfig;
  onClose: () => void;
  onImport: (result: WindowImportResult, mode: 'append' | 'replace') => void;
}

export function WindowImportDialog({ open, config, onClose, onImport }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<WindowImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const doPreview = () => setPreview(parseWindowTabular(text, config));

  const doFile = async (file: File) => {
    setLoading(true);
    try {
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        setPreview(await parseWindowXlsxFile(file, config));
      } else {
        const { text: decoded, result } = await parseWindowCsvFile(file, config);
        setText(decoded);
        setPreview(result);
      }
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setText(''); setPreview(null); };
  const apply = (mode: 'append' | 'replace') => {
    if (!preview) return;
    onImport(preview, mode);
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-lg font-semibold">{t('importWindow.title')}</h3>
          <button type="button" onClick={() => { reset(); onClose(); }}
            className="text-slate-400 hover:text-slate-700" aria-label="close">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-sm text-slate-600">{t('importWindow.help')}</p>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
              {t('import.uploadFile')}
              <input type="file" accept=".csv,.tsv,.txt,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void doFile(f);
                }} />
            </label>
            {loading && <span className="text-xs text-slate-500">{t('import.loading')}</span>}
          </div>

          <textarea value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={doPreview}
            placeholder={t('importWindow.placeholder')}
            spellCheck={false}
            className="h-40 w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-xs" />

          <div className="mt-2 flex gap-2">
            <button type="button" onClick={doPreview} disabled={!text.trim()}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50">
              {t('import.preview')}
            </button>
            <button type="button" onClick={reset}
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
              {t('import.clear')}
            </button>
          </div>

          {preview && (
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-4 text-sm">
                <span className="text-slate-600">
                  {t('import.previewOk', { count: preview.rows.length })}
                </span>
                {preview.errors.length > 0 && (
                  <span className="text-rose-600">
                    {t('import.previewErr', { count: preview.errors.length })}
                  </span>
                )}
              </div>

              {preview.rows.length > 0 && (
                <div className="max-h-56 overflow-auto rounded-md border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-2 py-1 text-left">#</th>
                        <th className="px-2 py-1 text-left">{t('columns.headers.floor')}</th>
                        <th className="px-2 py-1 text-left">{t('columns.headers.family')}</th>
                        <th className="px-2 py-1 text-right">{t('composite.headers.areaM2')}</th>
                        <th className="px-2 py-1 text-left">{t('windows.headers.glass')}</th>
                        <th className="px-2 py-1 text-left">{t('windows.headers.frame')}</th>
                        <th className="px-2 py-1 text-center">{t('columns.headers.reused')}</th>
                        <th className="px-2 py-1 text-center">{t('columns.headers.prefabModular')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.slice(0, 50).map((r, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 text-slate-400">{r.sourceRow}</td>
                          <td className="px-2 py-1">{r.element.floor ?? '—'}</td>
                          <td className="px-2 py-1">{r.element.family ?? '—'}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{r.element.areaM2}</td>
                          <td className="px-2 py-1">{r.element.glass}</td>
                          <td className="px-2 py-1">{r.element.frame}</td>
                          <td className="px-2 py-1 text-center">{r.element.reused ? '✓' : ''}</td>
                          <td className="px-2 py-1 text-center">{r.element.prefabModular ? '✓' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rows.length > 50 && (
                    <div className="border-t border-slate-200 bg-slate-50 px-2 py-1 text-right text-[11px] text-slate-500">
                      {t('import.previewTruncated', { shown: 50, total: preview.rows.length })}
                    </div>
                  )}
                </div>
              )}

              {preview.errors.length > 0 && (
                <ul className="mt-3 max-h-32 overflow-y-auto rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {preview.errors.map((e, i) => (
                    <li key={i}>{t('import.row')} {e.row}: {e.message}</li>
                  ))}
                </ul>
              )}

              {preview.rows.some((r) => r.warnings.length > 0) && (
                <details className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <summary className="cursor-pointer">{t('import.warningsHeader')}</summary>
                  <ul className="mt-2 space-y-0.5">
                    {preview.rows.filter((r) => r.warnings.length > 0).map((r, i) => (
                      <li key={i}>{t('import.row')} {r.sourceRow}: {r.warnings.join('; ')}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={() => { reset(); onClose(); }}
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            {t('import.cancel')}
          </button>
          <button type="button" onClick={() => apply('append')}
            disabled={!preview || preview.rows.length === 0}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            {t('import.append')}
          </button>
          <button type="button" onClick={() => apply('replace')}
            disabled={!preview || preview.rows.length === 0}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
            {t('import.replace')}
          </button>
        </footer>
      </div>
    </div>
  );
}
