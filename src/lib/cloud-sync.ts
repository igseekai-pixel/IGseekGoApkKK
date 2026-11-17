import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  OperationType,
  handleFirestoreError,
  type Unsubscribe,
} from "./firebase";

export const CLOUD_UID_KEY = "igseek:cloud_uid";
export const ENGINE_PROJ_PREFIX = "igseek:engine_proj_";
export const ENGINE_CHAT_IDS_KEY = "igseek:engine_chat_ids";
export const FLOW_TASKS_KEY = "igseek:flow_tasks";
export const FLOW_LIBRARY_KEY = "igseek:flow_library_files";

export interface SyncedLibraryFile {
  id: string;
  name: string;
  type: string;
  content: string;
  projectId: string | null;
  taskId?: string;
  taskTitle?: string;
  source: "flow";
  createdAt: string;
  updatedAt: string;
}

export interface CloudEngineMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  filesUpdated?: string[];
  limitCooldown?: {
    scope: "engine" | "chat" | "flow" | "image";
    used?: number;
    limit?: number;
    resetAt: number;
  };
}

export interface CloudEngineProject {
  id: string;
  userId: string;
  title: string;
  projectId: string | null;
  activeFile: string;
  files: Record<string, string>;
  chatMessages: CloudEngineMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface CloudChatMessageForLibrary {
  id: string;
  chatId: string;
  content: string;
  images?: Array<{ id?: string; title?: string; prompt?: string; dataUrl: string }>;
  artifacts?: Array<{ id?: string; title?: string; language?: string; description?: string; content: string }>;
}

function cleanFirestorePayload<T>(obj: T): T {
  if (obj === undefined) return null as unknown as T;
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.filter((v) => v !== undefined).map(cleanFirestorePayload) as unknown as T;
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj as Record<string, any>)) {
    if (v !== undefined) {
      out[k] = cleanFirestorePayload(v);
    }
  }
  return out as T;
}

function sanitizeDocId(rawId: string): string {
  const safe = rawId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  return safe || `doc_${Date.now()}`;
}

/**
 * Clears account-scoped caches in localStorage so switching accounts or logging out
 * never mixes one account's Engine/Flow/Library data into another.
 */
export function clearLocalUserCaches(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(FLOW_LIBRARY_KEY);
    window.localStorage.removeItem(FLOW_TASKS_KEY);
    window.localStorage.removeItem(ENGINE_CHAT_IDS_KEY);
    window.localStorage.removeItem(CLOUD_UID_KEY);
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(ENGINE_PROJ_PREFIX)) {
        toRemove.push(key);
      }
    }
    for (const k of toRemove) {
      window.localStorage.removeItem(k);
    }
    window.dispatchEvent(new CustomEvent("igseek:library-updated"));
  } catch {
    // ignore storage errors
  }
}

/**
 * Ensures localStorage caches belong only to the active Firebase UID.
 */
export function ensureAccountScope(uid: string): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    const prevUid = window.localStorage.getItem(CLOUD_UID_KEY);
    if (prevUid && prevUid !== uid) {
      clearLocalUserCaches();
    }
    window.localStorage.setItem(CLOUD_UID_KEY, uid);
  } catch {
    // ignore
  }
}

export function getActiveCloudUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

/* ==================== ENGINE PROJECTS SYNC ==================== */

export async function listCloudEngineProjectIds(uid: string): Promise<string[]> {
  if (!uid) return [];
  try {
    const snap = await getDocs(
      query(collection(db, "engine_projects"), where("userId", "==", uid))
    );
    return snap.docs.map((d) => d.id);
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, "engine_projects");
    } catch {
      // logged
    }
    return [];
  }
}

export async function loadCloudEngineProject(
  uid: string,
  chatId: string
): Promise<CloudEngineProject | null> {
  if (!uid || !chatId) return null;
  const docId = sanitizeDocId(chatId);
  try {
    const snap = await getDoc(doc(db, "engine_projects", docId));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    const owner = data.userId || data.user_id;
    if (owner && owner !== uid) return null;
    return {
      id: snap.id,
      userId: owner || uid,
      title: String(data.title || "Engine project"),
      projectId: data.projectId ?? data.project_id ?? null,
      activeFile: String(data.activeFile || "src/App.tsx"),
      files: (data.files && typeof data.files === "object" ? data.files : {}) as Record<string, string>,
      chatMessages: Array.isArray(data.chatMessages) ? data.chatMessages : [],
      createdAt: String(data.createdAt || new Date().toISOString()),
      updatedAt: String(data.updatedAt || new Date().toISOString()),
    };
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.GET, `engine_projects/${docId}`);
    } catch {
      // logged
    }
    return null;
  }
}

export async function saveCloudEngineProject(
  uid: string,
  input: {
    id: string;
    title: string;
    projectId?: string | null;
    activeFile?: string;
    files: Record<string, string>;
    chatMessages: CloudEngineMessage[];
  }
): Promise<void> {
  if (!uid || !input.id) return;
  const docId = sanitizeDocId(input.id);
  const now = new Date().toISOString();

  // Keep within Firestore 1MB doc limit safely
  const sanitizedFiles: Record<string, string> = {};
  let totalBytes = 0;
  for (const [k, v] of Object.entries(input.files || {})) {
    const val = typeof v === "string" ? v : String(v ?? "");
    if (totalBytes + val.length > 750_000) continue;
    sanitizedFiles[k] = val;
    totalBytes += val.length;
  }

  const trimmedMessages = (input.chatMessages || []).slice(-200).map((m) => ({
    id: String(m.id || `msg_${Date.now()}`),
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    content: String(m.content || "").slice(0, 60_000),
    ...(Array.isArray(m.filesUpdated) && m.filesUpdated.length > 0
      ? { filesUpdated: m.filesUpdated.slice(0, 50) }
      : {}),
    ...(m.limitCooldown
      ? {
          limitCooldown: {
            scope: m.limitCooldown.scope,
            ...(m.limitCooldown.used !== undefined ? { used: m.limitCooldown.used } : {}),
            ...(m.limitCooldown.limit !== undefined ? { limit: m.limitCooldown.limit } : {}),
            resetAt: m.limitCooldown.resetAt,
          },
        }
      : {}),
  }));

  const payload = cleanFirestorePayload({
    userId: uid,
    user_id: uid,
    title: (input.title || "Engine project").slice(0, 200),
    projectId: input.projectId ?? null,
    activeFile: (input.activeFile || "src/App.tsx").slice(0, 260),
    files: sanitizedFiles,
    chatMessages: trimmedMessages,
    updatedAt: now,
    createdAt: now,
  });

  try {
    const ref = doc(db, "engine_projects", docId);
    const existing = await getDoc(ref).catch(() => null);
    if (existing?.exists()) {
      const prevCreated = (existing.data() as any)?.createdAt;
      if (prevCreated) payload.createdAt = prevCreated;
    }
    await setDoc(ref, payload, { merge: true });
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, `engine_projects/${docId}`);
    } catch {
      // logged non-fatal
    }
  }
}

export async function deleteCloudEngineProject(uid: string, chatId: string): Promise<void> {
  if (!uid || !chatId) return;
  const docId = sanitizeDocId(chatId);
  try {
    await deleteDoc(doc(db, "engine_projects", docId));
  } catch {
    // ignore missing doc or offline
  }
}

/* ==================== LIBRARY FILES SYNC ==================== */

export function subscribeCloudLibraryFiles(
  uid: string,
  onFiles: (files: SyncedLibraryFile[]) => void
): Unsubscribe {
  const q = query(collection(db, "library_files"), where("userId", "==", uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: SyncedLibraryFile[] = snap.docs
        .map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: String(data.name || "file.txt"),
            type: String(data.type || "document"),
            content: String(data.content || ""),
            projectId: data.projectId ?? data.project_id ?? null,
            taskId: data.taskId || undefined,
            taskTitle: data.taskTitle || undefined,
            source: "flow" as const,
            createdAt: String(data.createdAt || new Date().toISOString()),
            updatedAt: String(data.updatedAt || new Date().toISOString()),
          };
        })
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      onFiles(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, "library_files");
      } catch {
        // logged
      }
    }
  );
}

export async function upsertCloudLibraryFiles(
  uid: string,
  files: SyncedLibraryFile[]
): Promise<void> {
  if (!uid || !files.length) return;
  for (const f of files) {
    if (!f.id || !f.name) continue;
    const docId = sanitizeDocId(f.id);
    const content = typeof f.content === "string" ? f.content : String(f.content ?? "");
    // Stay safely within Firestore 1MB per-doc ceiling
    const safeContent = content.length > 850_000 ? content.slice(0, 850_000) : content;
    const payload = cleanFirestorePayload({
      userId: uid,
      user_id: uid,
      name: f.name.slice(0, 260),
      type: (f.type || "document").slice(0, 50),
      content: safeContent,
      projectId: f.projectId ?? null,
      taskId: f.taskId ?? null,
      taskTitle: f.taskTitle ? f.taskTitle.slice(0, 200) : null,
      source: "flow",
      createdAt: f.createdAt || new Date().toISOString(),
      updatedAt: f.updatedAt || new Date().toISOString(),
    });
    try {
      await setDoc(doc(db, "library_files", docId), payload, { merge: true });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `library_files/${docId}`);
      } catch {
        // logged
      }
    }
  }
}

export async function renameCloudLibraryFile(
  uid: string,
  fileId: string,
  newName: string
): Promise<void> {
  if (!uid || !fileId || !newName) return;
  const docId = sanitizeDocId(fileId);
  try {
    await updateDoc(doc(db, "library_files", docId), {
      name: newName.slice(0, 260),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.UPDATE, `library_files/${docId}`);
    } catch {
      // logged
    }
  }
}

export async function deleteCloudLibraryFile(uid: string, fileId: string): Promise<void> {
  if (!uid || !fileId) return;
  const docId = sanitizeDocId(fileId);
  try {
    await deleteDoc(doc(db, "library_files", docId));
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.DELETE, `library_files/${docId}`);
    } catch {
      // logged
    }
  }
}

/* ==================== CHAT MEDIA & ARTIFACTS FOR LIBRARY ==================== */

export async function fetchCloudChatMessagesForLibrary(
  uid: string
): Promise<CloudChatMessageForLibrary[]> {
  if (!uid) return [];
  try {
    const snap = await getDocs(
      query(collection(db, "chat_messages"), where("user_id", "==", uid))
    );
    const items: CloudChatMessageForLibrary[] = [];
    for (const d of snap.docs) {
      const data = d.data() as any;
      const content = String(data.content || "");
      const hasInlineDataUrl = /!\[[^\]]*\]\(data:[^)]+\)/.test(content);
      const images = Array.isArray(data.images) ? data.images : undefined;
      const artifacts = Array.isArray(data.artifacts) ? data.artifacts : undefined;
      if (hasInlineDataUrl || (images && images.length > 0) || (artifacts && artifacts.length > 0)) {
        items.push({
          id: d.id,
          chatId: String(data.chat_id || data.chatId || ""),
          content,
          images,
          artifacts,
        });
      }
    }
    return items;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, "chat_messages");
    } catch {
      // logged
    }
    return [];
  }
}

export async function renameCloudChatMediaItem(
  msgId: string,
  oldName: string,
  newName: string
): Promise<boolean> {
  if (!msgId || !oldName || !newName) return false;
  try {
    const ref = doc(db, "chat_messages", msgId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const data = snap.data() as any;
    let content = String(data.content || "");
    if (content.includes(`![${oldName}]`)) {
      content = content.replaceAll(`![${oldName}]`, `![${newName}]`);
    }
    const images = Array.isArray(data.images)
      ? data.images.map((img: any) => (img?.title === oldName ? { ...img, title: newName } : img))
      : undefined;
    const artifacts = Array.isArray(data.artifacts)
      ? data.artifacts.map((art: any) => (art?.title === oldName ? { ...art, title: newName } : art))
      : undefined;

    const patch: Record<string, any> = { content };
    if (images !== undefined) patch.images = images;
    if (artifacts !== undefined) patch.artifacts = artifacts;
    await updateDoc(ref, patch);
    return true;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.UPDATE, `chat_messages/${msgId}`);
    } catch {
      // logged
    }
    return false;
  }
}

export async function deleteCloudChatMediaItem(
  msgId: string,
  fileName: string
): Promise<boolean> {
  if (!msgId || !fileName) return false;
  try {
    const ref = doc(db, "chat_messages", msgId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const data = snap.data() as any;
    let content = String(data.content || "");
    const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    content = content.replace(new RegExp(`!\\[${escaped}\\]\\(data:[^)]+\\)\\n?`, "g"), "").trim();
    const images = Array.isArray(data.images)
      ? data.images.filter((img: any) => img?.title !== fileName)
      : undefined;
    const artifacts = Array.isArray(data.artifacts)
      ? data.artifacts.filter(
          (art: any) => art?.title !== fileName && `${art?.title}.${art?.language}` !== fileName
        )
      : undefined;

    const patch: Record<string, any> = { content };
    if (images !== undefined) patch.images = images;
    if (artifacts !== undefined) patch.artifacts = artifacts;
    await updateDoc(ref, patch);
    return true;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.UPDATE, `chat_messages/${msgId}`);
    } catch {
      // logged
    }
    return false;
  }
}
