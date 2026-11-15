import { useEffect, useMemo, useRef, useState } from 'react';

const pad2 = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Parsed {
  year: number;
  month: number; // 0-based
  day: number;
  hour: number;
  minute: number;
}

function parseValue(value: string): Parsed | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]) - 1,
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

function toValue(p: Parsed): string {
  return `${p.year}-${pad2(p.month + 1)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

function formatDisplay(value: string): string {
  const p = parseValue(value);
  if (!p) return '';
  const date = new Date(p.year, p.month, p.day, p.hour, p.minute);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateDisplay(value: string): string {
  const p = parseValue(value);
  if (!p) return '';
  const date = new Date(p.year, p.month, p.day);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// A styled date + time picker with a bordered, shadowed popover. Emits the same
// `YYYY-MM-DDTHH:mm` string used by native `datetime-local` inputs.
export function DateTimeField({
  value,
  onChange,
  dateOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  dateOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const parsed = parseValue(value);
  const now = new Date();
  const [viewYear, setViewYear] = useState(parsed?.year ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? now.getMonth());

  useEffect(() => {
    if (open && parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // When the calendar opens, scroll it fully into view so the whole popover is
  // visible without the user having to scroll the page manually.
  useEffect(() => {
    if (open && popoverRef.current) {
      popoverRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [open]);

  const grid = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const emit = (next: Partial<Parsed>) => {
    const base: Parsed = parsed ?? {
      year: viewYear,
      month: viewMonth,
      day: now.getDate(),
      hour: 9,
      minute: 0,
    };
    onChange(toValue({ ...base, ...next }));
  };

  const selectDay = (day: number) => {
    if (dateOnly) {
      emit({ year: viewYear, month: viewMonth, day, hour: 0, minute: 0 });
    } else {
      emit({ year: viewYear, month: viewMonth, day });
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const setToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    onChange(
      toValue({
        year: t.getFullYear(),
        month: t.getMonth(),
        day: t.getDate(),
        hour: dateOnly ? 0 : parsed?.hour ?? 9,
        minute: dateOnly ? 0 : parsed?.minute ?? 0,
      })
    );
  };

  const clear = () => {
    onChange('');
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="input flex items-center justify-between text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={value ? '' : 'text-slate-400'}>
          {value
            ? dateOnly
              ? formatDateDisplay(value)
              : formatDisplay(value)
            : dateOnly
              ? 'Select date'
              : 'Select date & time'}
        </span>
        <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute left-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={prevMonth}
            >
              ‹
            </button>
            <span className="text-sm font-semibold">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={nextMonth}
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((day, i) => {
              const selected =
                parsed && day === parsed.day && viewMonth === parsed.month && viewYear === parsed.year;
              return (
                <div key={i} className="flex items-center justify-center">
                  {day ? (
                    <button
                      type="button"
                      className={`h-8 w-8 rounded-full text-sm ${
                        selected
                          ? 'bg-brand-600 text-white'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                      onClick={() => selectDay(day)}
                    >
                      {day}
                    </button>
                  ) : (
                    <span className="h-8 w-8" />
                  )}
                </div>
              );
            })}
          </div>

          {!dateOnly && (
            <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="text-xs text-slate-400">Time</span>
              <select
                className="input h-9 py-0"
                value={parsed?.hour ?? 9}
                onChange={(e) => emit({ hour: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {pad2(h)}
                  </option>
                ))}
              </select>
              <span>:</span>
              <select
                className="input h-9 py-0"
                value={parsed?.minute ?? 0}
                onChange={(e) => emit({ minute: Number(e.target.value) })}
              >
                {Array.from({ length: 60 }, (_, m) => (
                  <option key={m} value={m}>
                    {pad2(m)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium text-brand-600"
              onClick={clear}
            >
              Clear
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-sm font-medium text-brand-600"
                onClick={setToday}
              >
                Today
              </button>
              <button
                type="button"
                className="text-sm font-medium text-slate-500"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
