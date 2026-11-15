import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { displayName } from '../lib/types';

interface NavItem {
  to: string;
  label: string;
}

interface NavGroupItem {
  label: string;
  children: NavItem[];
}

type NavEntry = NavItem | NavGroupItem;

const ADMIN_NAV: NavEntry[] = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/resales', label: 'Resales' },
  { to: '/admin/handovers', label: 'Handovers' },
  { to: '/admin/inventory', label: 'Inventory' },
  {
    label: 'Management',
    children: [
      { to: '/admin/audit', label: 'Audit Log' },
      { to: '/admin/exports', label: 'Excel Export' },
      { to: '/admin/eligibility', label: 'Eligibility' },
    ],
  },
];

function LeafLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin' || item.to === '/dashboard'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive
            ? 'bg-white/15 text-white shadow-[inset_3px_0_0_theme(colors.accent.400)]'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      {item.label}
    </NavLink>
  );
}

function NavGroup({ group, onNavigate }: { group: NavGroupItem; onNavigate: () => void }) {
  const location = useLocation();
  const hasActive = group.children.some(
    (c) => location.pathname === c.to || location.pathname.startsWith(`${c.to}/`)
  );
  const [open, setOpen] = useState(hasActive);
  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <span>{group.label}</span>
        <span className={`text-xs text-white/50 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 border-l border-white/15 pl-2">
          {group.children.map((c) => (
            <LeafLink key={c.to} item={c} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function useTheme() {
  useEffect(() => {
    // Single light theme — ensure no stale dark class lingers from older builds.
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('resale.theme');
  }, []);
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="min-h-screen">
      <header className="brand-chrome sticky top-0 z-30 border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                className="rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-white transition hover:bg-white/20 lg:hidden"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Toggle menu"
              >
                ☰
              </button>
            )}
            <Link to={isAdmin ? '/admin' : '/dashboard'} className="flex items-center gap-2 text-white">
              <span className="text-sm font-semibold sm:text-base">
                Laptop Resale{' '}
                <span className="hidden font-normal text-white/60 sm:inline">
                  {isAdmin ? '· Administration' : '· Employee Portal'}
                </span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {!isAdmin && (
              <NavLink
                to="/participated"
                className={({ isActive }) =>
                  `rounded-lg border border-white/25 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20 ${
                    isActive ? 'bg-white/20' : 'bg-white/10'
                  }`
                }
              >
                <span className="hidden sm:inline">Participated resales</span>
                <span className="sm:hidden">Resales</span>
              </NavLink>
            )}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-white">{displayName(user)}</p>
              <p className="text-xs text-white/60">{isAdmin ? 'Administrator' : 'Employee'}</p>
            </div>
            <button
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {isAdmin ? (
          <>
            <aside className={`${menuOpen ? 'block' : 'hidden'} w-full shrink-0 lg:block lg:w-56`}>
              <nav className="brand-chrome sticky top-20 flex flex-col gap-1 rounded-xl border border-white/10 p-2 shadow-[0_14px_30px_-18px_rgba(12,14,58,0.6)]">
                {ADMIN_NAV.map((entry) =>
                  'children' in entry ? (
                    <NavGroup key={entry.label} group={entry} onNavigate={() => setMenuOpen(false)} />
                  ) : (
                    <LeafLink key={entry.to} item={entry} onNavigate={() => setMenuOpen(false)} />
                  )
                )}
              </nav>
            </aside>

            <main className="min-w-0 flex-1">{children}</main>
          </>
        ) : (
          <main className="min-w-0 flex-1">{children}</main>
        )}
      </div>
    </div>
  );
}
