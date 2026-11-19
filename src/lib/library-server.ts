import fs from "node:fs";
import path from "node:path";
import firebaseConfig from "../../firebase-applet-config.json";
import { listLibraryFilesOnDisk } from "./flow-terminal";
import { isFirebaseJwt, type AuthedUser } from "./memory-server";

export type ServerLibraryItem = {
  id: string;
  name: string;
  type: "image" | "doc" | "artifact";
  mimeType: string;
  content?: string;
  dataUrl?: string;
  size?: number;
  source: "flow" | "user_upload" | "generated" | "artifact" | "library";
  chatTitle?: string;
  updatedAt?: string;
};

const PROJECT_ID = (firebaseConfig as any).projectId as string;
const DATABASE_ID = ((firebaseConfig as any).firestoreDatabaseId as string) || "(default)";
const FIRESTORE_DOCUMENTS_PATH = `projects/${PROJECT_ID}/databases/${encodeURIComponent(DATABASE_ID)}/documents`;
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/${FIRESTORE_DOCUMENTS_PATH}`;
const LOCAL_LIB_FILE = path.join(process.cwd(), ".data", "local-library.json");

function fromFirestoreValue(v: any): any {
  if (!v || typeof v !== "object") return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return Boolean(v.booleanValue);
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) {
    return Array.isArray(v.arrayValue?.values)
      ? v.arrayValue.values.map(fromFirestoreValue)
      : [];
  }
  if ("mapValue" in v) {
    const out: Record<string, any> = {};
    const fields = v.mapValue?.fields || {};
    for (const [k, fv] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(fv);
    }
    return out;
  }
  return undefined;
}

function decodeDocFields(docObj: { name?: string; fields?: Record<string, any>; updateTime?: string }): Record<string, any> {
  const out: Record<string, any> = {
    _id: String(docObj.name || "").split("/").pop() || "",
    _updateTime: docObj.updateTime || "",
  };
  for (const [k, fv] of Object.entries(docObj.fields || {})) {
    out[k] = fromFirestoreValue(fv);
  }
  return out;
}

async function runFirestoreQuery(token: string, collectionId: string, fieldPath: string, uid: string): Promise<Record<string, any>[]> {
  if (!isFirebaseJwt(token)) return [];
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}:runQuery`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath },
              op: "EQUAL",
              value: { stringValue: uid },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ document?: { name?: string; fields?: Record<string, any>; updateTime?: string } }>;
    if (!Array.isArray(rows)) return [];
    return rows.filter((r) => Boolean(r.document?.name)).map((r) => decodeDocFields(r.document!));
  } catch {
    return [];
  }
}

type LocalLibStore = Record<string, ServerLibraryItem[]>;

function readLocalLibStore(): LocalLibStore {
  try {
    if (!fs.existsSync(LOCAL_LIB_FILE)) return {};
    const raw = fs.readFileSync(LOCAL_LIB_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as LocalLibStore) : {};
  } catch {
    return {};
  }
}

function writeLocalLibStore(store: LocalLibStore): void {
  const dir = path.dirname(LOCAL_LIB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(LOCAL_LIB_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function listLocalLibraryItems(userId: string): ServerLibraryItem[] {
  const store = readLocalLibStore();
  return Array.isArray(store[userId]) ? [...store[userId]] : [];
}

export function upsertLocalLibraryItem(userId: string, item: Omit<ServerLibraryItem, "id"> & { id?: string }): ServerLibraryItem {
  const store = readLocalLibStore();
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  const now = new Date().toISOString();
  const id = item.id || `lib_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nextItem: ServerLibraryItem = {
    id,
    name: item.name.slice(0, 260),
    type: item.type || "doc",
    mimeType: item.mimeType || "text/plain",
    ...(item.content !== undefined ? { content: item.content } : {}),
    ...(item.dataUrl !== undefined ? { dataUrl: item.dataUrl } : {}),
    ...(item.size !== undefined ? { size: item.size } : {}),
    source: item.source || "library",
    chatTitle: item.chatTitle || "Library",
    updatedAt: item.updatedAt || now,
  };
  const filtered = list.filter((x) => x.id !== id && x.name.toLowerCase() !== nextItem.name.toLowerCase());
  store[userId] = [nextItem, ...filtered].slice(0, 200);
  writeLocalLibStore(store);
  return nextItem;
}

export function deleteLocalLibraryItem(userId: string, idOrName: string): boolean {
  const store = readLocalLibStore();
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  const next = list.filter((x) => x.id !== idOrName && x.name !== idOrName);
  if (next.length === list.length) return false;
  store[userId] = next;
  writeLocalLibStore(store);
  return true;
}

function guessMimeFromName(name: string, fallback = "text/plain"): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".html")) return "text/html";
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "text/typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "text/javascript";
  if (lower.endsWith(".py")) return "text/x-python";
  if (lower.endsWith(".txt") || lower.endsWith(".log")) return "text/plain";
  return fallback;
}

function normalizeMatchText(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim();
}

export function extractLibraryText(item: ServerLibraryItem): string {
  if (typeof item.content === "string" && item.content.length > 0) {
    return item.content;
  }
  if (item.dataUrl && item.dataUrl.startsWith("data:")) {
    const commaIdx = item.dataUrl.indexOf(",");
    if (commaIdx !== -1) {
      const meta = item.dataUrl.slice(5, commaIdx).toLowerCase();
      const body = item.dataUrl.slice(commaIdx + 1);
      const mime = meta.split(";")[0] || item.mimeType || "";
      const isTextLike =
        mime.startsWith("text/") ||
        mime.includes("json") ||
        mime.includes("xml") ||
        mime.includes("javascript") ||
        mime.includes("csv") ||
        /\.(txt|md|json|csv|js|ts|tsx|jsx|py|html|css|xml|yaml|yml|log|sql|sh|env)$/i.test(item.name);
      if (isTextLike) {
        try {
          if (meta.includes(";base64")) {
            return Buffer.from(body, "base64").toString("utf-8");
          }
          return decodeURIComponent(body);
        } catch {
          return "";
        }
      }
    }
  }
  return "";
}

export function libraryItemToBase64DataUrl(item: ServerLibraryItem): string | undefined {
  if (item.dataUrl && item.dataUrl.startsWith("data:")) {
    const commaIdx = item.dataUrl.indexOf(",");
    if (commaIdx !== -1) {
      const meta = item.dataUrl.slice(5, commaIdx);
      const body = item.dataUrl.slice(commaIdx + 1);
      if (meta.includes(";base64")) {
        return item.dataUrl;
      }
      try {
        const decoded = decodeURIComponent(body);
        const mime = meta.split(";")[0] || item.mimeType || guessMimeFromName(item.name);
        return `data:${mime};base64,${Buffer.from(decoded, "utf-8").toString("base64")}`;
      } catch {
        return item.dataUrl;
      }
    }
  }
  if (typeof item.content === "string" && item.content.length > 0) {
    const mime = item.mimeType || guessMimeFromName(item.name, "text/plain");
    return `data:${mime};base64,${Buffer.from(item.content, "utf-8").toString("base64")}`;
  }
  return undefined;
}

export async function listAllLibraryFilesServer(
  authed: AuthedUser | null,
  clientItems: Array<{
    id?: string;
    name: string;
    type?: string;
    mimeType?: string;
    content?: string;
    dataUrl?: string;
    source?: string;
    chatTitle?: string;
    updatedAt?: string;
  }> = [],
): Promise<ServerLibraryItem[]> {
  const byKey = new Map<string, ServerLibraryItem>();

  const pushItem = (raw: ServerLibraryItem) => {
    const key = `${normalizeMatchText(raw.name)}::${raw.source}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, raw);
      return;
    }
    const existingScore = (existing.content ? 2 : 0) + (existing.dataUrl ? 2 : 0);
    const nextScore = (raw.content ? 2 : 0) + (raw.dataUrl ? 2 : 0);
    if (nextScore >= existingScore) {
      byKey.set(key, {
        ...existing,
        ...raw,
        content: raw.content ?? existing.content,
        dataUrl: raw.dataUrl ?? existing.dataUrl,
      });
    }
  };

  for (const ci of clientItems) {
    if (!ci?.name) continue;
    const typeNorm: "image" | "doc" | "artifact" =
      ci.type === "image" ? "image" : ci.type === "artifact" ? "artifact" : "doc";
    const srcNorm =
      ci.source === "flow" || ci.source === "user_upload" || ci.source === "generated" || ci.source === "artifact"
        ? ci.source
        : "library";
    pushItem({
      id: ci.id || `cli_${ci.name}`,
      name: ci.name,
      type: typeNorm,
      mimeType: ci.mimeType || guessMimeFromName(ci.name, typeNorm === "image" ? "image/png" : "text/plain"),
      ...(ci.content !== undefined ? { content: ci.content } : {}),
      ...(ci.dataUrl !== undefined ? { dataUrl: ci.dataUrl } : {}),
      source: srcNorm,
      chatTitle: ci.chatTitle || "Library",
      updatedAt: ci.updatedAt,
    });
  }

  if (authed?.id) {
    for (const loc of listLocalLibraryItems(authed.id)) {
      pushItem(loc);
    }
  }

  try {
    const diskFiles = await listLibraryFilesOnDisk(null, true);
    for (const df of diskFiles) {
      pushItem({
        id: `disk_${df.name}`,
        name: df.name,
        type: df.type === "code" || df.type === "data" ? "artifact" : "doc",
        mimeType: guessMimeFromName(df.name),
        ...(df.content !== undefined ? { content: df.content } : {}),
        size: df.sizeBytes,
        source: "flow",
        chatTitle: "Flow Library",
        updatedAt: df.updatedAt,
      });
    }
  } catch {
  }

  if (authed?.isJwt && authed.token) {
    const [libByCamel, libBySnake, chatMsgs] = await Promise.all([
      runFirestoreQuery(authed.token, "library_files", "userId", authed.id),
      runFirestoreQuery(authed.token, "library_files", "user_id", authed.id),
      runFirestoreQuery(authed.token, "chat_messages", "user_id", authed.id),
    ]);

    const seenDocIds = new Set<string>();
    for (const doc of [...libByCamel, ...libBySnake]) {
      if (!doc._id || seenDocIds.has(doc._id)) continue;
      seenDocIds.add(doc._id);
      const name = String(doc.name || "file.txt");
      const rawContent = typeof doc.content === "string" ? doc.content : "";
      const isDataUrl = rawContent.startsWith("data:");
      const typeNorm: "image" | "doc" | "artifact" =
        doc.type === "image" || (isDataUrl && rawContent.startsWith("data:image/"))
          ? "image"
          : doc.type === "code" || doc.type === "data" || doc.type === "artifact"
            ? "artifact"
            : "doc";
      pushItem({
        id: doc._id,
        name,
        type: typeNorm,
        mimeType: guessMimeFromName(name, typeNorm === "image" ? "image/png" : "text/plain"),
        ...(isDataUrl ? { dataUrl: rawContent } : { content: rawContent }),
        source: doc.source === "flow" ? "flow" : "library",
        chatTitle: doc.taskTitle ? `Flow: ${doc.taskTitle}` : "Library",
        updatedAt: String(doc.updatedAt || doc.createdAt || doc._updateTime || ""),
      });
    }

    for (const msg of chatMsgs) {
      const msgContent = String(msg.content || "");
      const matches = [...msgContent.matchAll(/!\[([^\]]*)\]\((data:[^)]+)\)/g)];
      for (const match of matches) {
        const name = match[1] || "attachment";
        const dataUrl = match[2];
        const isImg = dataUrl.startsWith("data:image/");
        const mimeMatch = dataUrl.match(/^data:([^;]+);/);
        pushItem({
          id: `${msg._id}_${name}`,
          name,
          type: isImg ? "image" : "doc",
          mimeType: mimeMatch?.[1] || guessMimeFromName(name),
          dataUrl,
          source: "user_upload",
          chatTitle: "Chat upload",
          updatedAt: String(msg.created_at || msg._updateTime || ""),
        });
      }
      if (Array.isArray(msg.images)) {
        for (const img of msg.images) {
          if (!img?.dataUrl) continue;
          const name = String(img.title || "generated_image.png");
          pushItem({
            id: String(img.id || `${msg._id}_img`),
            name,
            type: "image",
            mimeType: "image/png",
            dataUrl: img.dataUrl,
            source: "generated",
            chatTitle: "AI Art",
            updatedAt: String(msg.created_at || msg._updateTime || ""),
          });
        }
      }
      if (Array.isArray(msg.artifacts)) {
        for (const art of msg.artifacts) {
          if (art?.content === undefined) continue;
          const name = art.title
            ? art.title.includes(".")
              ? art.title
              : `${art.title}.${art.language || "txt"}`
            : "artifact.txt";
          pushItem({
            id: String(art.id || `${msg._id}_art`),
            name,
            type: "artifact",
            mimeType: guessMimeFromName(name, "text/plain"),
            content: String(art.content || ""),
            source: "artifact",
            chatTitle: "Artifact",
            updatedAt: String(msg.created_at || msg._updateTime || ""),
          });
        }
      }
    }
  }

  const result = Array.from(byKey.values());
  result.sort((a, b) => (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0));
  return result;
}

export function findLibraryFiles(
  items: ServerLibraryItem[],
  opts: { id?: string; filename?: string; query?: string },
): ServerLibraryItem[] {
  if (opts.id) {
    const exactId = items.filter((i) => i.id === opts.id);
    if (exactId.length > 0) return exactId;
  }
  if (opts.filename) {
    const fn = normalizeMatchText(opts.filename);
    const exactName = items.filter((i) => normalizeMatchText(i.name) === fn);
    if (exactName.length > 0) return exactName;
    const partialName = items.filter((i) => normalizeMatchText(i.name).includes(fn) || fn.includes(normalizeMatchText(i.name)));
    if (partialName.length > 0) return partialName;
  }
  const q = normalizeMatchText(opts.query || "");
  if (!q) return items.slice(0, 20);

  const words = q
    .split(/[\s,.;:!?()"'«»]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);

  const scored = items
    .map((item) => {
      let score = 0;
      const nameNorm = normalizeMatchText(item.name);
      const text = normalizeMatchText(extractLibraryText(item).slice(0, 4000));
      const meta = normalizeMatchText(`${item.chatTitle || ""} ${item.source} ${item.type}`);
      if (nameNorm === q) score += 10;
      if (nameNorm.includes(q)) score += 6;
      for (const w of words) {
        const stem = w.length >= 5 ? w.slice(0, w.length - 1) : w;
        if (nameNorm.includes(w)) score += 4;
        else if (stem.length >= 3 && nameNorm.includes(stem)) score += 2.5;
        if (text.includes(w)) score += 1.5;
        else if (stem.length >= 3 && text.includes(stem)) score += 0.8;
        if (meta.includes(w)) score += 1;
      }
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);

  return scored.length > 0 ? scored.slice(0, 15) : items.slice(0, 10);
}
