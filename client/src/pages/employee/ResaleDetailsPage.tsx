import { Link, useParams } from 'react-router-dom';
import { useApi } from '../../lib/useApi';
import type { EligibilityResult, Resale, Registration } from '../../lib/types';
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  RegStatusBadge,
  Spinner,
  StatusBadge,
} from '../../components/ui';
import { LaptopModelCard } from '../../components/LaptopModelCard';
import { formatDateTime, timeRemaining } from '../../lib/constants';

const FAQS = [
  {
    q: 'How are winners selected?',
    a: 'Winners are chosen through a random, auditable resale run separately for each laptop model.',
  },
  {
    q: 'Is the price deducted from my salary?',
    a: 'Yes. If selected, the purchase price is deducted from your net salary.',
  },
  {
    q: 'Does registering guarantee a laptop?',
    a: 'No. Registration only enters you into the resale. Selection grants the right to purchase.',
  },
  {
    q: 'Can I register for more than one model?',
    a: 'For this resale you select one preferred model.',
  },
];

export function ResaleDetailsPage() {
  const { id } = useParams();
  const { data: resale, loading, error } = useApi<Resale & { myRegistration: Registration | null }>(
    `/resales/${id}`
  );
  const { data: eligibility } = useApi<EligibilityResult>(id ? `/eligibility/check/${id}` : null);

  if (loading) return <Spinner label="Loading resale…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!resale) return <EmptyState title="Resale not found" />;

  const myReg = resale.myRegistration;
  const isOpen = resale.status === 'OPEN';
  const canRegister = isOpen && !myReg && eligibility?.status !== 'INELIGIBLE';

  return (
    <div>
      <PageHeader
        title={resale.title}
        actions={<StatusBadge status={resale.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5">
            <p className="text-sm text-slate-600 dark:text-slate-300">{resale.description}</p>
            {resale.instructions && (
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800">
                {resale.instructions}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-slate-400">Opens</dt>
                <dd className="font-medium">{formatDateTime(resale.registrationOpenAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Closes</dt>
                <dd className="font-medium">{formatDateTime(resale.registrationCloseAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Resale date</dt>
                <dd className="font-medium">{formatDateTime(resale.resaleAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Time left</dt>
                <dd className="font-medium text-amber-600">{timeRemaining(resale.registrationCloseAt)}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold">
              Available laptop models ({resale.models?.length ?? 0})
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {resale.models?.map((m) => (
                <LaptopModelCard
                  key={m.id}
                  model={m.laptopModel}
                  price={m.price}
                  quantity={m.quantity}
                  pickupLocation={m.pickupLocation}
                  notes={m.notes}
                />
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-lg font-semibold">Frequently asked questions</h2>
            <div className="space-y-3">
              {FAQS.map((f) => (
                <details key={f.q} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
                  <p className="mt-2 text-sm text-slate-500">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="text-base font-semibold">Your status</h2>
            {myReg ? (
              <div className="mt-3 space-y-2">
                <RegStatusBadge status={myReg.status} />
                <Link to={`/registrations/${myReg.id}`} className="btn-secondary mt-2 w-full">
                  View my registration
                </Link>
              </div>
            ) : (
              <div className="mt-3">
                {eligibility && (
                  <div
                    className={`rounded-lg p-3 text-sm ${
                      eligibility.status === 'ELIGIBLE'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : eligibility.status === 'INELIGIBLE'
                        ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    }`}
                  >
                    {eligibility.reason}
                  </div>
                )}
                {canRegister ? (
                  <Link to={`/resales/${resale.id}/register`} className="btn-primary mt-3 w-full">
                    Register now
                  </Link>
                ) : (
                  <button className="btn-primary mt-3 w-full" disabled>
                    {isOpen ? 'Not available' : 'Registration closed'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="card p-5 text-sm">
            <h2 className="mb-2 text-base font-semibold">Important purchase terms</h2>
            <ul className="list-disc space-y-1 pl-4 text-slate-500">
              <li>Laptops are refurbished / previously used.</li>
              <li>Provided without warranty.</li>
              <li>Price is deducted from net salary.</li>
              <li>Selection grants the right to purchase only.</li>
              <li>Eligibility cooldown: {resale.cooldownMonths} months.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
