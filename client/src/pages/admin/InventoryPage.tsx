import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { LaptopModel } from '../../lib/types';
import { currency, CURRENCY_OPTIONS } from '../../lib/constants';
import { EmptyState, ErrorBanner, Field, PageHeader, Spinner } from '../../components/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SortHeader, useClientSort } from '../../components/SortHeader';
import { useToast } from '../../components/Toast';

interface Unit {
  id: string;
  status: string;
  laptopModel: LaptopModel;
}

interface ModelGroup {
  model: LaptopModel;
  total: number;
  available: number;
  inUse: number;
}

function modelLabel(m: LaptopModel): string {
  return `${m.manufacturer ?? ''} ${m.modelName}`.trim();
}

export function InventoryPage() {
  const toast = useToast();
  const unitsQ = useApi<Unit[]>('/inventory');

  const [modelName, setModelName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [processor, setProcessor] = useState('');
  const [memory, setMemory] = useState('');
  const [storage, setStorage] = useState('');
  const [price, setPrice] = useState(0);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<ModelGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [availFilter, setAvailFilter] = useState<'all' | 'available' | 'inuse'>('all');
  const [mfgFilter, setMfgFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, availFilter, mfgFilter]);

  const groups: ModelGroup[] = useMemo(() => {
    const units = unitsQ.data ?? [];
    const map = new Map<string, ModelGroup>();
    for (const u of units) {
      if (u.status === 'REMOVED' || u.status === 'HANDED_OVER' || u.status === 'RETURNED') continue;
      let g = map.get(u.laptopModel.id);
      if (!g) {
        g = { model: u.laptopModel, total: 0, available: 0, inUse: 0 };
        map.set(u.laptopModel.id, g);
      }
      g.total += 1;
      if (u.status === 'AVAILABLE') g.available += 1;
      else g.inUse += 1;
    }
    return Array.from(map.values()).sort((a, b) =>
      modelLabel(a.model).localeCompare(modelLabel(b.model))
    );
  }, [unitsQ.data]);

  const existingModels = useMemo(() => groups.map((g) => g.model), [groups]);

  const searchLower = search.trim().toLowerCase();
  const mfgOptions = useMemo(
    () =>
      Array.from(new Set(groups.map((g) => g.model.manufacturer).filter(Boolean) as string[])).sort(),
    [groups]
  );
  const searchedGroups = groups.filter((g) => {
    if (mfgFilter !== 'all' && g.model.manufacturer !== mfgFilter) return false;
    if (availFilter === 'available' && g.available <= 0) return false;
    if (availFilter === 'inuse' && g.available > 0) return false;
    if (
      searchLower &&
      ![modelLabel(g.model), g.model.processor, g.model.memory, g.model.storage]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(searchLower)
    ) {
      return false;
    }
    return true;
  });
  const filtersActive = Boolean(searchLower) || availFilter !== 'all' || mfgFilter !== 'all';

  const { sorted, sort, toggleSort } = useClientSort(
    searchedGroups,
    {
      model: (g) => modelLabel(g.model),
      cpu: (g) => g.model.processor,
      memory: (g) => g.model.memory,
      storage: (g) => g.model.storage,
      price: (g) => g.model.price,
      amount: (g) => g.total,
    },
    { key: 'model', dir: 'asc' }
  );

  const PAGE_SIZE = 25;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const onPickImage = (file: File | null) => {
    setImage(file);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const resetForm = () => {
    setModelName('');
    setQuantity(1);
    setProcessor('');
    setMemory('');
    setStorage('');
    setPrice(0);
    setCurrencyCode('USD');
    onPickImage(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const add = async () => {
    const name = modelName.trim();
    if (!name || quantity < 1) return;
    setBusy(true);
    try {
      // If the typed name matches an existing model, add to it; otherwise create it.
      const match = existingModels.find(
        (m) => modelLabel(m).toLowerCase() === name.toLowerCase()
      );
      const form = new FormData();
      if (match) form.append('laptopModelId', match.id);
      else form.append('modelName', name);
      form.append('quantity', String(Number(quantity)));
      if (processor.trim()) form.append('processor', processor.trim());
      if (memory.trim()) form.append('memory', memory.trim());
      if (storage.trim()) form.append('storage', storage.trim());
      form.append('price', String(Number(price)));
      form.append('currency', currencyCode);
      if (image) form.append('image', image);
      await api.upload('/inventory/bulk', form);
      toast.success(`Added ${quantity} unit(s) of ${name}.`);
      resetForm();
      unitsQ.refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to add inventory.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await api.del<{ deleted: number }>(`/inventory/model/${toDelete.model.id}`);
      toast.success(`Removed ${res?.deleted ?? 0} unit(s) of ${modelLabel(toDelete.model)}.`);
      setToDelete(null);
      unitsQ.refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to remove.');
    } finally {
      setDeleting(false);
    }
  };

  if (unitsQ.loading) return <Spinner label="Loading inventory…" />;
  if (unitsQ.error) return <ErrorBanner message={unitsQ.error} />;

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Laptop models and quantities available for resales." />

      <div className="card mb-4 p-5">
        <h2 className="mb-3 text-base font-semibold">Add inventory</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Field label="Model name" required hint="Type a model name, or pick an existing one from the list.">
              <input
                className="input"
                list="inventory-models"
                placeholder="e.g. Dell Latitude 7420"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              />
              <datalist id="inventory-models">
                {existingModels.map((m) => (
                  <option key={m.id} value={modelLabel(m)} />
                ))}
              </datalist>
            </Field>
          </div>
          <div className="w-36">
            <Field label="CPU" hint="e.g. i7">
              <input
                className="input"
                placeholder="e.g. i7"
                value={processor}
                onChange={(e) => setProcessor(e.target.value)}
              />
            </Field>
          </div>
          <div className="w-36">
            <Field label="Memory (RAM)" hint="e.g. 16 GB">
              <input
                className="input"
                placeholder="e.g. 16 GB"
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
              />
            </Field>
          </div>
          <div className="w-36">
            <Field label="SSD size" hint="e.g. 512 GB">
              <input
                className="input"
                placeholder="e.g. 512 GB"
                value={storage}
                onChange={(e) => setStorage(e.target.value)}
              />
            </Field>
          </div>
          <div className="w-32">
            <Field label="Price" hint="Per unit">
              <input
                type="number"
                min={0}
                className="input"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="w-28">
            <Field label="Currency" hint="Per unit">
              <select
                className="input"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="w-28">
            <Field label="Amount" required hint="Units to add">
              <input
                type="number"
                min={1}
                className="input"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="min-w-[14rem]">
            <Field label="Laptop image" hint="PNG, JPEG, WEBP or GIF">
              <div className="flex items-center gap-3">
                {preview && (
                  <img
                    src={preview}
                    alt="Preview"
                    className="h-12 w-12 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                  />
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="text-sm"
                  onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
                />
              </div>
            </Field>
          </div>
          <button className="btn-primary" disabled={busy || !modelName.trim()} onClick={add}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <input
              className="input w-full pr-9"
              placeholder="Search by model, CPU, memory or SSD…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>
          <select
            className="input w-auto"
            value={availFilter}
            onChange={(e) => setAvailFilter(e.target.value as typeof availFilter)}
            aria-label="Filter by availability"
          >
            <option value="all">All availability</option>
            <option value="available">Has available</option>
            <option value="inuse">Fully in use</option>
          </select>
          {mfgOptions.length > 1 && (
            <select
              className="input w-auto"
              value={mfgFilter}
              onChange={(e) => setMfgFilter(e.target.value)}
              aria-label="Filter by manufacturer"
            >
              <option value="all">All manufacturers</option>
              {mfgOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          {filtersActive && (
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              onClick={() => {
                setSearch('');
                setAvailFilter('all');
                setMfgFilter('all');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState title="No inventory yet" hint="Add a model and amount above to build your inventory." />
      ) : sorted.length === 0 ? (
        <EmptyState title="No matching models" hint="Try a different search or filter." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="th"></th>
                  <SortHeader label="Model" sortKey="model" sort={sort} onSort={toggleSort} />
                  <SortHeader label="CPU" sortKey="cpu" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Memory" sortKey="memory" sort={sort} onSort={toggleSort} />
                  <SortHeader label="SSD" sortKey="storage" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Price" sortKey="price" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Amount" sortKey="amount" sort={sort} onSort={toggleSort} />
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map((g) => (
                  <tr key={g.model.id}>
                    <td className="td">
                      {g.model.imagePath ? (
                        <img
                          src={g.model.imagePath}
                          alt={modelLabel(g.model)}
                          className="h-11 w-11 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                        />
                      ) : (
                        <div className="grid h-11 w-11 place-items-center rounded-lg border border-dashed border-slate-200 text-lg text-slate-300 dark:border-slate-700">
                          💻
                        </div>
                      )}
                    </td>
                    <td className="td font-medium">{modelLabel(g.model)}</td>
                    <td className="td text-slate-500">{g.model.processor || '—'}</td>
                    <td className="td text-slate-500">{g.model.memory || '—'}</td>
                    <td className="td text-slate-500">{g.model.storage || '—'}</td>
                    <td className="td text-slate-500">{g.model.price ? currency(g.model.price, g.model.currency) : '—'}</td>
                    <td className="td">{g.total}</td>
                    <td className="td text-right">
                      <button
                        className="text-sm font-medium text-rose-600 disabled:text-slate-300"
                        disabled={g.available === 0}
                        title={g.available === 0 ? 'No available units to remove' : undefined}
                        onClick={() => setToDelete(g)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">
                {sorted.length} total · Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn-secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        danger
        busy={deleting}
        title="Remove inventory"
        confirmLabel="Remove"
        message={
          toDelete
            ? `Remove ${toDelete.available} available unit(s) of ${modelLabel(toDelete.model)}? Units already assigned or handed over are kept.`
            : ''
        }
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
