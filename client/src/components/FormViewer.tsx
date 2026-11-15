import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { UploadedForm } from '../lib/types';
import { Spinner } from './ui';

interface Props {
  form: UploadedForm;
  title?: string;
  // Tailwind height class for the embedded viewer. Defaults to a compact preview;
  // pass a taller value (e.g. 'h-[80vh]') for a full-page reading view.
  heightClass?: string;
}

// Renders an uploaded form (PDF/DOCX) inline so the user can read it within the
// process. PDFs are shown in an embedded viewer; other types fall back to an
// open-in-new-tab link. The blob is fetched with the auth header.
export function FormViewer({ form, title, heightClass = 'h-96' }: Props) {
  const [state, setState] = useState<{ url: string; mimeType: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let current: string | null = null;
    setState(null);
    setError(null);
    api
      .blobUrl(`/forms/${form.id}/download`)
      .then((res) => {
        if (revoked) {
          URL.revokeObjectURL(res.url);
          return;
        }
        current = res.url;
        setState(res);
      })
      .catch(() => setError('Unable to load the form.'));
    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [form.id]);

  const isPdf =
    form.mimeType === 'application/pdf' || form.originalFilename.toLowerCase().endsWith('.pdf');

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <p className="text-sm font-medium">{title ?? form.originalFilename}</p>
        {state && (
          <a
            href={state.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-brand-600"
          >
            Open in new tab
          </a>
        )}
      </div>
      <div className="p-2">
        {error ? (
          <p className="p-4 text-sm text-rose-600">{error}</p>
        ) : !state ? (
          <div className="p-6">
            <Spinner label="Loading form…" />
          </div>
        ) : isPdf ? (
          <iframe
            title={form.originalFilename}
            src={`${state.url}#pagemode=none&toolbar=0&navpanes=0`}
            className={`${heightClass} w-full rounded bg-white`}
          />
        ) : (
          <div className="p-4 text-sm text-slate-500">
            <p>{form.originalFilename}</p>
            <a
              href={state.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-medium text-brand-600"
            >
              Open the form to read it →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
