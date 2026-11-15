import type { LaptopModel } from '../lib/types';
import { currency } from '../lib/constants';

interface Props {
  model: LaptopModel;
  price?: number;
  quantity?: number;
  pickupLocation?: string | null;
  notes?: string | null;
  selected?: boolean;
  onSelect?: () => void;
  selectLabel?: string;
}

export function LaptopModelCard({
  model,
  price,
  quantity,
  pickupLocation,
  notes,
  selected,
  onSelect,
  selectLabel = 'Select this model',
}: Props) {
  const specs: [string, string | null | undefined][] = [
    ['CPU', model.processor],
    ['Memory', model.memory],
    ['Storage', model.storage],
    ['Screen', model.screenSize],
    ['OS', model.operatingSystem],
    ['Battery', model.batteryCondition],
    ['Accessories', model.accessories],
  ];

  return (
    <div
      className={`card flex flex-col p-5 ${
        selected ? 'ring-2 ring-brand-500' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {model.manufacturer}
          </p>
          <h3 className="text-lg font-semibold">{model.modelName}</h3>
        </div>
      </div>

      <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-4xl dark:bg-slate-800">
        {model.imagePath ? (
          <img
            src={model.imagePath}
            alt={`${model.manufacturer} ${model.modelName}`}
            className="h-full w-full object-contain"
          />
        ) : (
          '💻'
        )}
      </div>

      <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {specs
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="whitespace-nowrap text-slate-400">{k}</dt>
              <dd className="break-words text-right font-medium">{v}</dd>
            </div>
          ))}
      </dl>

      {model.description && <p className="mt-3 text-xs text-slate-500">{model.description}</p>}
      {notes && <p className="mt-1 text-xs italic text-slate-400">Note: {notes}</p>}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div>
          {price !== undefined && (
            <p className="text-lg font-semibold text-brand-700 dark:text-brand-300">
              {currency(price, model.currency)}
            </p>
          )}
          {quantity !== undefined && (
            <p className="text-xs text-slate-400">{quantity} available</p>
          )}
          {pickupLocation && <p className="text-xs text-slate-400">Location: {pickupLocation}</p>}
        </div>
        {onSelect && (
          <button
            className={`whitespace-nowrap ${selected ? 'btn-secondary' : 'btn-primary'}`}
            onClick={onSelect}
            type="button"
          >
            {selected ? 'Selected ✓' : selectLabel}
          </button>
        )}
      </div>
    </div>
  );
}
