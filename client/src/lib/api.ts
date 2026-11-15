// Thin API client. Auth is carried by the session cookie (credentials: 'include').

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function handle(res: Response) {
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    let message = res.statusText;
    let details: unknown;
    if (contentType.includes('application/json')) {
      const body = await res.json().catch(() => ({}));
      message = body.error ?? message;
      details = body.details;
    }
    throw new ApiError(res.status, message, details);
  }
  if (contentType.includes('application/json')) return res.json();
  return res;
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`/api${path}`, { credentials: 'include' });
    return handle(res);
  },
  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handle(res);
  },
  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`/api${path}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handle(res);
  },
  async patch<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`/api${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handle(res);
  },
  async del<T>(path: string): Promise<T> {
    const res = await fetch(`/api${path}`, { method: 'DELETE', credentials: 'include' });
    return handle(res);
  },
  async upload<T>(path: string, form: FormData): Promise<T> {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    return handle(res);
  },
  // Fetches a protected file as an object URL for inline viewing.
  // Caller is responsible for revoking the returned URL with URL.revokeObjectURL.
  async blobUrl(path: string): Promise<{ url: string; mimeType: string }> {
    const res = await fetch(`/api${path}`, { credentials: 'include' });
    if (!res.ok) throw new ApiError(res.status, 'Failed to load file.');
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), mimeType: blob.type };
  },
  // Triggers a file download from a protected endpoint.
  async download(path: string, fallbackName: string): Promise<void> {
    const res = await fetch(`/api${path}`, { credentials: 'include' });
    if (!res.ok) throw new ApiError(res.status, 'Download failed.');
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
