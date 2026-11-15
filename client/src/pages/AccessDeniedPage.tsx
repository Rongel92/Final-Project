import { Link } from 'react-router-dom';

export function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-brand-600">403</p>
      <h1 className="text-xl font-semibold">Access denied</h1>
      <p className="max-w-sm text-sm text-slate-500">
        You do not have permission to view this page. This area is restricted to administrators.
      </p>
      <Link to="/" className="btn-primary mt-2">
        Return home
      </Link>
    </div>
  );
}
