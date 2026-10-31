/**
 * SunPower Ops - Offline Queue (IndexedDB)
 * Phase 1 - Member 3: Operations Frontend
 *
 * Spec: D8 (PWA offline drafts), PRD 1.7 (works on 3G), PRD 3.1 (never lose input)
 *
 * Stores form drafts and pending file uploads in IndexedDB so data survives
 * page reloads and network outages. The service worker triggers replay on reconnect.
 *
 * Stores: DRAFT (form autosave), UPLOAD (photo/signature pending upload),
 *         API_CALL (failed API call to retry)
 */

const DB_NAME = 'sunpower-offline';
const DB_VERSION = 1;
const STORE_DRAFTS = 'drafts';
const STORE_UPLOADS = 'uploads';
const STORE_API_QUEUE = 'api_queue';

export type DraftType = 'SURVEY' | 'INSTALLATION' | 'DISPATCH_SCAN' | 'TICKET';
export type UploadStatus = 'PENDING' | 'UPLOADING' | 'DONE' | 'FAILED';

export interface Draft {
  id: string;
  type: DraftType;
  entityId: string;
  data: Record<string, any>;
  savedAt: number;
}

export interface PendingUpload {
  id: string;
  entityType: string;
  entityId: string;
  file: Blob;
  fileName: string;
  mimeType: string;
  status: UploadStatus;
  attempts: number;
  lastAttempt: number | null;
  createdAt: number;
  metadata?: Record<string, any>;
}

export interface QueuedApiCall {
  id: string;
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
  idempotencyKey: string;
  attempts: number;
  lastAttempt: number | null;
  createdAt: number;
}

// ─── DB init ─────────────────────────────────────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        const store = db.createObjectStore(STORE_DRAFTS, { keyPath: 'id' });
        store.createIndex('by_type_entity', ['type', 'entityId'], { unique: true });
      }
      if (!db.objectStoreNames.contains(STORE_UPLOADS)) {
        const store = db.createObjectStore(STORE_UPLOADS, { keyPath: 'id' });
        store.createIndex('by_status', 'status');
        store.createIndex('by_entity', ['entityType', 'entityId']);
      }
      if (!db.objectStoreNames.contains(STORE_API_QUEUE)) {
        const store = db.createObjectStore(STORE_API_QUEUE, { keyPath: 'id' });
        store.createIndex('by_created', 'createdAt');
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Generic helpers ─────────────────────────────────────────────────────────
async function txPut<T>(storeName: string, item: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function txGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function txDelete(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function txGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function txGetByIndex<T>(storeName: string, indexName: string, key: IDBValidKey | IDBKeyRange): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).index(indexName).getAll(key);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

// ─── Draft operations ────────────────────────────────────────────────────────
export async function saveDraft(type: DraftType, entityId: string, data: Record<string, any>): Promise<void> {
  const id = `${type}:${entityId}`;
  await txPut<Draft>(STORE_DRAFTS, { id, type, entityId, data, savedAt: Date.now() });
}

export async function loadDraft(type: DraftType, entityId: string): Promise<Draft | undefined> {
  return txGet<Draft>(STORE_DRAFTS, `${type}:${entityId}`);
}

export async function deleteDraft(type: DraftType, entityId: string): Promise<void> {
  return txDelete(STORE_DRAFTS, `${type}:${entityId}`);
}

export async function listDrafts(type?: DraftType): Promise<Draft[]> {
  const all = await txGetAll<Draft>(STORE_DRAFTS);
  return type ? all.filter((d) => d.type === type) : all;
}

// ─── Upload queue operations ─────────────────────────────────────────────────
export async function queueUpload(
  entityType: string,
  entityId: string,
  file: Blob,
  fileName: string,
  metadata?: Record<string, any>
): Promise<string> {
  const id = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  await txPut<PendingUpload>(STORE_UPLOADS, {
    id,
    entityType,
    entityId,
    file,
    fileName,
    mimeType: file.type,
    status: 'PENDING',
    attempts: 0,
    lastAttempt: null,
    createdAt: Date.now(),
    metadata,
  });
  return id;
}

export async function getPendingUploads(): Promise<PendingUpload[]> {
  return txGetByIndex<PendingUpload>(STORE_UPLOADS, 'by_status', 'PENDING');
}

export async function markUploadDone(id: string): Promise<void> {
  const item = await txGet<PendingUpload>(STORE_UPLOADS, id);
  if (item) {
    item.status = 'DONE';
    await txPut(STORE_UPLOADS, item);
  }
}

export async function markUploadFailed(id: string): Promise<void> {
  const item = await txGet<PendingUpload>(STORE_UPLOADS, id);
  if (item) {
    item.status = 'FAILED';
    item.attempts += 1;
    item.lastAttempt = Date.now();
    await txPut(STORE_UPLOADS, item);
  }
}

export async function retryFailedUploads(): Promise<PendingUpload[]> {
  const failed = await txGetByIndex<PendingUpload>(STORE_UPLOADS, 'by_status', 'FAILED');
  for (const item of failed) {
    item.status = 'PENDING';
    await txPut(STORE_UPLOADS, item);
  }
  return failed;
}

export async function clearCompletedUploads(): Promise<void> {
  const done = await txGetByIndex<PendingUpload>(STORE_UPLOADS, 'by_status', 'DONE');
  for (const item of done) {
    await txDelete(STORE_UPLOADS, item.id);
  }
}

// ─── API call queue operations ───────────────────────────────────────────────
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Convenience wrapper for queueing a failed/offline write request.
 * Generates an idempotency key so the replay is safe to retry server-side.
 */
export async function enqueueMutation(
  url: string,
  method: string,
  body: any,
  headers: Record<string, string> = { 'Content-Type': 'application/json' },
  idempotencyKey?: string
): Promise<string> {
  return queueApiCall(url, method, body, headers, idempotencyKey || newIdempotencyKey());
}

export async function queueApiCall(
  url: string,
  method: string,
  body: any,
  headers: Record<string, string>,
  idempotencyKey: string
): Promise<string> {
  const id = `api-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  await txPut<QueuedApiCall>(STORE_API_QUEUE, {
    id,
    url,
    method,
    body: JSON.stringify(body),
    headers,
    idempotencyKey,
    attempts: 0,
    lastAttempt: null,
    createdAt: Date.now(),
  });
  return id;
}

export async function getQueuedApiCalls(): Promise<QueuedApiCall[]> {
  return txGetAll<QueuedApiCall>(STORE_API_QUEUE);
}

export async function removeApiCall(id: string): Promise<void> {
  return txDelete(STORE_API_QUEUE, id);
}

// ─── Replay (called by SW or on reconnect) ──────────────────────────────────
export async function replayQueue(
  uploadFn: (upload: PendingUpload) => Promise<boolean>,
  apiFn: (call: QueuedApiCall) => Promise<boolean>
): Promise<{ uploads: number; apiCalls: number }> {
  let uploads = 0;
  let apiCalls = 0;

  const pendingUploads = await getPendingUploads();
  for (const upload of pendingUploads) {
    try {
      const ok = await uploadFn(upload);
      if (ok) {
        await markUploadDone(upload.id);
        uploads++;
      } else {
        await markUploadFailed(upload.id);
      }
    } catch {
      await markUploadFailed(upload.id);
    }
  }

  const pendingCalls = await getQueuedApiCalls();
  for (const call of pendingCalls) {
    try {
      const ok = await apiFn(call);
      if (ok) {
        await removeApiCall(call.id);
        apiCalls++;
      } else {
        call.attempts += 1;
        call.lastAttempt = Date.now();
        await txPut(STORE_API_QUEUE, call);
      }
    } catch {
      call.attempts += 1;
      call.lastAttempt = Date.now();
      await txPut(STORE_API_QUEUE, call);
    }
  }

  return { uploads, apiCalls };
}

// ─── Online listener helper ──────────────────────────────────────────────────
export function onOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  return () => window.removeEventListener('online', callback);
}

export function onOffline(callback: () => void): () => void {
  window.addEventListener('offline', callback);
  return () => window.removeEventListener('offline', callback);
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// ─── High-level flush API (used by tech profile page & FieldShell) ──────────

/**
 * Number of items still waiting in the offline queue
 * (pending uploads + queued API calls + failed uploads).
 */
export async function getOfflineQueueCount(): Promise<number> {
  try {
    const [uploads, calls] = await Promise.all([getPendingUploads(), getQueuedApiCalls()]);
    return uploads.length + calls.length;
  } catch {
    return 0;
  }
}

/**
 * Uploads one pending file to the private attachment storage endpoint.
 * Returns true when the server accepted the file.
 */
async function uploadPendingFile(upload: PendingUpload): Promise<boolean> {
  const form = new FormData();
  form.append('file', upload.file, upload.fileName);
  form.append('entityType', upload.entityType);
  form.append('entityId', upload.entityId);
  // Preserve the attachment kind (ARRAY/INVERTER/EARTHING/SURVEY/SIGNATURE/...)
  // captured at queue time so server-side categorisation is not lost.
  if (upload.metadata?.kind && typeof upload.metadata.kind === 'string') {
    form.append('kind', upload.metadata.kind);
  }
  if (upload.metadata) {
    form.append('metadata', JSON.stringify(upload.metadata));
  }
  const res = await fetch('/api/v1/uploads', { method: 'POST', body: form });
  return res.ok;
}

/** Replays one queued API call. Returns true on HTTP success (2xx). */
async function replayApiCall(call: QueuedApiCall): Promise<boolean> {
  const headers: Record<string, string> = { ...call.headers };
  if (call.idempotencyKey) {
    headers['x-idempotency-key'] = call.idempotencyKey;
  }
  const res = await fetch(call.url, {
    method: call.method,
    headers,
    body: call.body || undefined,
  });
  return res.ok;
}

/**
 * Replays everything that is possible right now: pending file uploads
 * first (photos/signatures must exist before submissions that reference
 * them), then queued API mutations. Safe to call repeatedly - each item
 * is only removed from the queue after a 2xx response.
 */
export async function flushOfflineQueue(): Promise<{
  synced: number;
  remaining: number;
  uploads: number;
  apiCalls: number;
}> {
  if (!isOnline()) {
    const remaining = await getOfflineQueueCount();
    return { synced: 0, remaining, uploads: 0, apiCalls: 0 };
  }
  try {
    const result = await replayQueue(uploadPendingFile, replayApiCall);
    const synced = result.uploads + result.apiCalls;
    const remaining = await getOfflineQueueCount();
    return { synced, remaining, uploads: result.uploads, apiCalls: result.apiCalls };
  } catch (err: any) {
    const remaining = await getOfflineQueueCount().catch(() => 0);
    if (remaining === 0) return { synced: 0, remaining: 0, uploads: 0, apiCalls: 0 };
    throw err;
  }
}
