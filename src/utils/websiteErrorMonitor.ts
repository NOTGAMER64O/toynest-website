export type WebsiteErrorSource = 'runtime' | 'promise' | 'api' | 'gemini';

export interface CapturedWebsiteError {
  id: string;
  source: WebsiteErrorSource;
  message: string;
  context?: string;
  at: string;
  count: number;
}

const STORAGE_KEY = 'playnix_watchdog_web_errors';
const MAX_STORED_ERRORS = 40;

const listeners = new Set<(errors: CapturedWebsiteError[]) => void>();
let listenersInstalled = false;

function sanitizeErrorId(raw: string): string {
  const clean = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `we_${clean || 'err'}`.slice(0, 80);
}

function shouldIgnoreNoise(message: string): boolean {
  const m = message.toLowerCase();
  if (!m) return true;
  // Runtime rules: HMR / Vite WebSocket disconnects & benign ResizeObserver loops are expected noise
  if (m.includes('websocket') || m.includes('vite') || m.includes('hmr')) return true;
  if (m.includes('resizeobserver loop')) return true;
  // Normal intentional owner PIN mismatch from typing wrong PIN shouldn't create false alarm
  if (m.includes('invalid owner pin') || m.includes('incorrect pin')) return true;
  return false;
}

export function getCapturedWebsiteErrors(): CapturedWebsiteError[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (e) => e && typeof e.id === 'string' && typeof e.message === 'string'
        );
      }
    }
  } catch {}
  return [];
}

function persistWebsiteErrors(list: CapturedWebsiteError[]): void {
  const trimmed = list.slice(0, MAX_STORED_ERRORS);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
  listeners.forEach((cb) => {
    try {
      cb(trimmed);
    } catch {}
  });
}

export function subscribeWebsiteErrors(
  cb: (errors: CapturedWebsiteError[]) => void
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function recordWebsiteError(
  source: WebsiteErrorSource,
  rawMessage: unknown,
  context?: string
): CapturedWebsiteError | null {
  const message = String(
    rawMessage instanceof Error ? rawMessage.message : rawMessage || ''
  )
    .trim()
    .slice(0, 320);

  if (!message || shouldIgnoreNoise(message)) return null;

  const cleanContext = context ? String(context).trim().slice(0, 140) : undefined;
  const fingerprint = `${source}_${message.slice(0, 64)}_${cleanContext || ''}`;
  const id = sanitizeErrorId(fingerprint);
  const nowIso = new Date().toISOString();

  const existing = getCapturedWebsiteErrors();
  const idx = existing.findIndex((e) => e.id === id);

  let updatedEntry: CapturedWebsiteError;
  let nextList: CapturedWebsiteError[];

  if (idx >= 0) {
    updatedEntry = {
      ...existing[idx],
      message,
      context: cleanContext || existing[idx].context,
      at: nowIso,
      count: (existing[idx].count || 1) + 1,
    };
    nextList = [updatedEntry, ...existing.filter((_, i) => i !== idx)];
  } else {
    updatedEntry = {
      id,
      source,
      message,
      ...(cleanContext ? { context: cleanContext } : {}),
      at: nowIso,
      count: 1,
    };
    nextList = [updatedEntry, ...existing];
  }

  persistWebsiteErrors(nextList);
  return updatedEntry;
}

export function clearCapturedWebsiteError(id: string): void {
  const existing = getCapturedWebsiteErrors();
  const next = existing.filter((e) => e.id !== id);
  persistWebsiteErrors(next);
}

export function clearAllCapturedWebsiteErrors(): void {
  persistWebsiteErrors([]);
}

export function installWebsiteErrorListeners(
  onCaptured?: (entry: CapturedWebsiteError) => void
): () => void {
  if (typeof window === 'undefined' || listenersInstalled) {
    return () => {};
  }
  listenersInstalled = true;

  const handleWindowError = (event: ErrorEvent) => {
    const msg = event?.message || event?.error?.message || 'Unexpected runtime script error';
    const ctx = event?.filename
      ? `${event.filename.split('/').pop()}:${event.lineno || 0}`
      : 'window.onerror';
    const captured = recordWebsiteError('runtime', msg, ctx);
    if (captured && onCaptured) onCaptured(captured);
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event?.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
        ? reason
        : reason?.message
        ? String(reason.message)
        : 'Unhandled async promise rejection';
    const captured = recordWebsiteError('promise', msg, 'unhandledrejection');
    if (captured && onCaptured) onCaptured(captured);
  };

  window.addEventListener('error', handleWindowError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    listenersInstalled = false;
    window.removeEventListener('error', handleWindowError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}
