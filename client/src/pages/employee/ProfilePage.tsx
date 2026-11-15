import { useAuth } from '../../lib/auth';
import { displayName } from '../../lib/types';
import { PageHeader } from '../../components/ui';

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  const name = displayName(user);

  const fields: [string, string | null | undefined][] = [
    ['Full name', name],
    ['Email', user.email],
    ['Department', user.department],
    ['Site', user.site],
    ['Country', user.country],
    ['Manager', user.managerName],
    ['Role', user.role === 'ADMIN' ? 'Administrator' : 'Employee'],
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Employee Profile" subtitle="Your account details (managed by HR)." />
      <div className="card p-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-600 text-xl font-semibold text-white">
            {name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold">{name}</p>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <dt className="text-xs text-slate-400">{k}</dt>
              <dd className="font-medium">{v || '—'}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-slate-400">
          Profile details are synchronized from the corporate HR system and cannot be edited here.
        </p>
      </div>
    </div>
  );
}
