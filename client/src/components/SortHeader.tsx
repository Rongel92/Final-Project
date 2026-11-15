import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: string;
  dir: SortDir;
}

type SortValue = string | number | boolean | null | undefined;

/**
 * Client-side sorting for list views. Pass the rows and a map of column-key ->
 * value accessor. Returns the sorted rows plus the current sort state and a
 * toggle handler to wire up to <SortHeader>.
 */
export function useClientSort<T>(
  rows: T[],
  accessors: Record<string, (row: T) => SortValue>,
  initial: SortState
) {
  const [sort, setSort] = useState<SortState>(initial);

  const toggleSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const sorted = useMemo(() => {
    const accessor = accessors[sort.key];
    if (!accessor) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // nulls always last
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      if (typeof va === 'boolean' && typeof vb === 'boolean') return (Number(va) - Number(vb)) * factor;
      return (
        String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * factor
      );
    });
    // accessors is recreated each render but stable in behaviour; sorting is cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  return { sorted, sort, toggleSort };
}

export function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className = 'th',
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span className={active ? 'text-brand-600' : 'text-slate-300'}>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
