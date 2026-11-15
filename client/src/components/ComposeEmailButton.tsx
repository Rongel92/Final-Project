import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';

interface EmailTemplate {
  subject: string;
  body: string;
  recipients: number;
}

// Button that opens a fully editable email and sends it to a group of a resale's
// winners. The server endpoint (`path`) decides who receives it and the starting
// text, which may be blank.
export function ComposeEmailButton({
  resaleId,
  path,
  label,
  description,
  disabled,
}: {
  resaleId: string;
  path: 'pickup-email' | 'pending-notice';
  label: string;
  description: (recipients: number) => string;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const show = async () => {
    setBusy(true);
    try {
      const loaded = await api.get<EmailTemplate>(`/resales/${resaleId}/${path}`);
      setTemplate(loaded);
      // Keep unsent edits if the dialog was closed before sending.
      if (!subject.trim() && !body.trim()) {
        setSubject(loaded.subject);
        setBody(loaded.body);
      }
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not load the email.');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ sent: number }>(`/resales/${resaleId}/${path}`, { subject, body });
      toast.success(
        `Sending to ${res.sent} winner${res.sent === 1 ? '' : 's'}. Emails go out gradually over the next few minutes.`
      );
      setOpen(false);
      setSubject('');
      setBody('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not send the email.');
    } finally {
      setBusy(false);
    }
  };

  const edited = template !== null && (subject !== template.subject || body !== template.body);
  const blankTemplate = template !== null && !template.subject && !template.body;
  const recipients = template?.recipients ?? 0;

  return (
    <>
      <button className="btn-secondary" disabled={busy || disabled} onClick={show}>
        {label}
      </button>
      {open && template && (
        <ConfirmDialog
          open
          wide
          title={label}
          message={
            <div className="space-y-3">
              <p className="text-sm text-slate-500">{description(recipients)}</p>
              <label className="block text-xs font-medium text-slate-500">
                Subject
                <input
                  className="input mt-1 font-normal"
                  placeholder="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                Message
                <textarea
                  className="input mt-1 font-normal leading-relaxed"
                  rows={14}
                  placeholder="Write your message…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </label>
              <p className="text-xs text-slate-400">
                You can use {'{first name}'}, {'{laptop}'} and {'{link}'}; they are filled in for each
                winner..
              </p>
              {edited && (
                <button
                  type="button"
                  className="text-xs font-medium text-brand-600 hover:underline"
                  onClick={() => {
                    setSubject(template.subject);
                    setBody(template.body);
                  }}
                >
                  {blankTemplate ? 'Clear' : 'Reset to template'}
                </button>
              )}
            </div>
          }
          confirmLabel={`Send to ${recipients} winner${recipients === 1 ? '' : 's'}`}
          busy={busy}
          confirmDisabled={!subject.trim() || !body.trim() || recipients === 0}
          onConfirm={send}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
