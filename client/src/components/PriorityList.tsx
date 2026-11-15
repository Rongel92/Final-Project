export interface PriorityItem {
  id: string;
  label: string;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const ordinal = (i: number) => ORDINALS[i] ?? `${i + 1}th`;

// Lets an employee rank their selected laptop models from most to least wanted.
// The array order is the priority (index 0 = top choice).
export function PriorityList({
  items,
  onReorder,
}: {
  items: PriorityItem[];
  onReorder: (ids: string[]) => void;
}) {
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    onReorder(next.map((i) => i.id));
  };

  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li
          key={it.id}
          className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
        >
          <span className="grid h-7 w-12 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {ordinal(i)}
          </span>
          <span className="flex-1 text-left text-sm font-medium">{it.label}</span>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              aria-label="Move up"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              className="rounded border border-slate-200 px-2 text-xs leading-5 text-slate-600 hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              ▲
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
              className="rounded border border-slate-200 px-2 text-xs leading-5 text-slate-600 hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              ▼
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
