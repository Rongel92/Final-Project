import { Link, useParams } from 'react-router-dom';
import { useApi } from '../../lib/useApi';
import type { Resale, ResaleResult } from '../../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';

interface EmployeeResults {
  resale: Resale;
  myResults: ResaleResult[];
  counts: { winners: number; waitingList: number };
}

export function ResultPage() {
  const { resaleId } = useParams();
  const { data, loading, error } = useApi<EmployeeResults>(`/results/${resaleId}`);

  if (loading) return <Spinner label="Loading results…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <EmptyState title="Results not available" />;

  const winner = data.myResults.find((r) => r.resultType === 'WINNER');
  const waiting = data.myResults.find((r) => r.resultType === 'WAITING_LIST');
  const primary = winner ?? waiting ?? data.myResults[0];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Resale result" subtitle={data.resale.title} />

      {!primary ? (
        <EmptyState title="You did not have a registration in this resale." />
      ) : winner ? (
        <div className="card p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl">
            🎉
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-emerald-700">You were selected!</h1>
          <p className="mt-2 text-sm text-slate-500">
            Congratulations. You have been selected for the{' '}
            <span className="font-medium">
              {winner.laptopModel?.manufacturer} {winner.laptopModel?.modelName}
            </span>
            . Please review the acceptance instructions to complete your purchase.
          </p>
          <Link to={`/pickup/${winner.registrationId}`} className="btn-primary mt-6">
            Accept your selection
          </Link>
        </div>
      ) : waiting ? (
        <div className="card p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-2xl">
            ⏳
          </div>
          <h1 className="mt-4 text-xl font-semibold text-amber-700">You are on the waiting list</h1>
          <p className="mt-2 text-sm text-slate-500">
            You were placed at position {waiting.resultOrder + 1} on the waiting list for the{' '}
            {waiting.laptopModel?.manufacturer} {waiting.laptopModel?.modelName}. If a selected
            employee declines, you may be offered the laptop.
          </p>
        </div>
      ) : (
        <div className="card p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-2xl">
            📋
          </div>
          <h1 className="mt-4 text-xl font-semibold">Not selected this time</h1>
          <p className="mt-2 text-sm text-slate-500">
            Unfortunately you were not selected in this resale. Thank you for participating — you
            are welcome to enter future resales.
          </p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 text-center">
        <div className="card p-4">
          <p className="text-2xl font-semibold">{data.counts.winners}</p>
          <p className="text-xs text-slate-400">Total winners</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-semibold">{data.counts.waitingList}</p>
          <p className="text-xs text-slate-400">On waiting list</p>
        </div>
      </div>
    </div>
  );
}
