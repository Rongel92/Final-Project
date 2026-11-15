import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { displayName, type User } from '../lib/types';
import { ErrorBanner, Spinner } from '../components/ui';

type SignInUser = Pick<User, 'id' | 'fullName' | 'email' | 'role' | 'department'>;

// Sign-in screen: redirects authenticated users onward, otherwise lists the
// accounts in the database so you can sign in as any of them (no SSO).
export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<SignInUser[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api
      .get<SignInUser[]>('/auth/users')
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load users.'));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!users || !q) return users ?? [];
    return users.filter((u) =>
      [u.fullName, u.email, u.department ?? ''].some((v) => v.toLowerCase().includes(q))
    );
  }, [users, query]);

  const admins = filtered.filter((u) => u.role === 'ADMIN');
  const employees = filtered.filter((u) => u.role !== 'ADMIN');

  const signIn = async (id: string) => {
    setSigningIn(id);
    setError(null);
    try {
      await login(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
      setSigningIn(null);
    }
  };

  const renderGroup = (title: string, list: SignInUser[]) =>
    list.length > 0 && (
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{title}</p>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {list.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                disabled={signingIn !== null}
                onClick={() => signIn(u.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800/60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                  {displayName(u)
                    .split(/\s+/)
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{displayName(u)}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {u.email}
                    {u.department ? ` · ${u.department}` : ''}
                  </span>
                </span>
                {signingIn === u.id && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-md">
        <div className="brand-chrome mb-6 overflow-hidden rounded-2xl px-6 py-7 text-center text-white shadow-[0_20px_50px_-24px_rgba(12,14,58,0.7)]">
          <h1 className="text-2xl font-semibold tracking-tight">Laptop Resale</h1>
          <p className="mt-1 text-sm text-white/70">Choose an account to sign in.</p>
        </div>

        {loading || (!users && !error) ? (
          <Spinner label="Loading…" />
        ) : (
          <div className="card space-y-4 p-6">
            {error && <ErrorBanner message={error} />}
            {users && users.length === 0 && (
              <p className="text-center text-sm text-slate-500">
                There are no users yet. Run <code>npm run seed</code> in the server folder.
              </p>
            )}
            {users && users.length > 0 && (
              <>
                <input
                  className="input"
                  placeholder="Search by name, email or department"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
                  {renderGroup('Administrators', admins)}
                  {renderGroup('Employees', employees)}
                  {filtered.length === 0 && (
                    <p className="text-center text-sm text-slate-500">No matching users.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
