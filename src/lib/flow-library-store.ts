import {
  getActiveCloudUid,
  upsertCloudLibraryFiles,
  renameCloudLibraryFile,
  deleteCloudLibraryFile,
} from "./cloud-sync";

export const FLOW_LIBRARY_STORAGE_KEY = "igseek:flow_library_files";

export interface StoredFlowLibraryFile {
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

export function readFlowLibraryFiles(): StoredFlowLibraryFile[] {
  try {
    const raw = localStorage.getItem(FLOW_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeFlowLibraryFiles(files: StoredFlowLibraryFile[]): void {
  try {
    localStorage.setItem(FLOW_LIBRARY_STORAGE_KEY, JSON.stringify(files));
  } catch {
    // ignore quota issues
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("igseek:library-updated"));
  }
}

/**
 * Replaces/merges local cached Flow Library files from Firebase Cloud Firestore snapshot
 * without echoing writes back to the server.
 */
export function replaceFlowLibraryFilesFromCloud(cloudFiles: StoredFlowLibraryFile[]): void {
  const sorted = [...cloudFiles].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  writeFlowLibraryFiles(sorted);
}

export function upsertFlowLibraryFiles(
  incoming: Array<{
    name: string;
    type?: string;
    content: string;
    projectId?: string | null;
    taskId?: string;
    taskTitle?: string;
  }>
): StoredFlowLibraryFile[] {
  const existing = readFlowLibraryFiles();
  const now = new Date().toISOString();
  const map = new Map<string, StoredFlowLibraryFile>();

  for (const item of existing) {
    const key = `${item.projectId || ""}::${item.name}`;
    map.set(key, item);
  }

  const changedItems: StoredFlowLibraryFile[] = [];

  for (const item of incoming) {
    if (!item.name || item.content === undefined) continue;
    const proj = item.projectId ?? null;
    const key = `${proj || ""}::${item.name}`;
    const prev = map.get(key);
    // Avoid redundant cloud writes when exact same content & metadata already exist
    const sameContent =
      prev &&
      prev.content === item.content &&
      prev.type === (item.type || prev.type || "document");
    const entry: StoredFlowLibraryFile = {
      id: prev?.id || `flowfile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: item.name,
      type: item.type || prev?.type || "document",
      content: item.content,
      projectId: proj,
      taskId: item.taskId ?? prev?.taskId,
      taskTitle: item.taskTitle ?? prev?.taskTitle,
      source: "flow",
      createdAt: prev?.createdAt || now,
      updatedAt: sameContent && prev?.updatedAt ? prev.updatedAt : now,
    };
    map.set(key, entry);
    if (!sameContent) {
      changedItems.push(entry);
    }
  }

  const next = Array.from(map.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  writeFlowLibraryFiles(next);

  const cloudUid = getActiveCloudUid();
  if (cloudUid && changedItems.length > 0) {
    void upsertCloudLibraryFiles(cloudUid, changedItems);
  }

  return next;
}

export function renameStoredFlowLibraryFile(id: string, newName: string): StoredFlowLibraryFile | null {
  const existing = readFlowLibraryFiles();
  let target: StoredFlowLibraryFile | null = null;
  const next = existing.map((f) => {
    if (f.id === id) {
      target = { ...f, name: newName, updatedAt: new Date().toISOString() };
      return target;
    }
    return f;
  });
  if (target) {
    writeFlowLibraryFiles(next);
    const cloudUid = getActiveCloudUid();
    if (cloudUid) {
      void renameCloudLibraryFile(cloudUid, id, newName);
    }
  }
  return target;
}

export function deleteStoredFlowLibraryFile(id: string): StoredFlowLibraryFile | null {
  const existing = readFlowLibraryFiles();
  const target = existing.find((f) => f.id === id) || null;
  if (!target) return null;
  writeFlowLibraryFiles(existing.filter((f) => f.id !== id));

  const cloudUid = getActiveCloudUid();
  if (cloudUid) {
    void deleteCloudLibraryFile(cloudUid, id);
  }

  return target;
}
