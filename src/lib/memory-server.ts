import fs from "node:fs";
import path from "node:path";
import firebaseConfig from "../../firebase-applet-config.json";
import { firebaseClient } from "./firebase-service";

export type MemoryAttachment = {
  name: string;
  type: string;
  size?: number;
  dataUrl?: string;
  textContent?: string;
};

export type MemoryRow = {
  id: string;
  content: string;
  kind: string;
  similarity?: number;
  created_at: string;
  attachment?: MemoryAttachment;
};

export type MemoryKind =
  | "name"
  | "preference"
  | "tech"
  | "project"
  | "goal"
  | "device"
  | "interest"
  | "style"
  | "other";

export type AuthedUser = {
  id: string;
  client: typeof firebaseClient;
  token: string;
  isJwt: boolean;
};

const PROJECT_ID = (firebaseConfig as any).projectId as string;
const DATABASE_ID = ((firebaseConfig as any).firestoreDatabaseId as string) || "(default)";
const FIRESTORE_DOCUMENTS_PATH = `projects/${PROJECT_ID}/databases/${encodeURIComponent(DATABASE_ID)}/documents`;
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/${FIRESTORE_DOCUMENTS_PATH}`;
const LOCAL_MEM_FILE = path.join(process.cwd(), ".data", "local-memories.json");

export function isFirebaseJwt(token: string): boolean {
  return Boolean(token && token.split(".").length === 3);
}

export function isLocalFallbackToken(token: string): boolean {
  return Boolean(token && token.startsWith("local_") && token.length >= 10 && /^[a-zA-Z0-9_=-]+$/.test(token));
}

export async function getUserFromToken(token: string): Promise<AuthedUser | null> {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      let decoded = "";
      try {
        decoded = Buffer.from(parts[1], "base64url").toString("utf-8");
      } catch {
        decoded = Buffer.from(parts[1], "base64").toString("utf-8");
      }
      const payload = JSON.parse(decoded);
      const uid = payload.sub || payload.user_id;
      if (uid && typeof uid === "string") {
        return { id: uid, client: firebaseClient, token, isJwt: true };
      }
    }
    if (isLocalFallbackToken(token)) {
      return { id: token, client: firebaseClient, token, isJwt: false };
    }
    return null;
  } catch (err) {
    console.error("getUserFromToken parse error", err);
    return null;
  }
}

type LocalStoreShape = Record<string, MemoryRow[]>;

function readLocalStore(): LocalStoreShape {
  try {
    if (!fs.existsSync(LOCAL_MEM_FILE)) return {};
    const raw = fs.readFileSync(LOCAL_MEM_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as LocalStoreShape) : {};
  } catch {
    return {};
  }
}

function writeLocalStore(data: LocalStoreShape): void {
  const dir = path.dirname(LOCAL_MEM_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(LOCAL_MEM_FILE, JSON.stringify(data, null, 2), "utf-8");
}

type FirestoreValue =
  | { nullValue: null }
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

function toFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return { nullValue: null };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.filter((v) => v !== undefined).map(toFirestoreValue),
      },
    };
  }
  if (typeof val === "object") {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function encodeFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

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

function docToMemoryRow(docObj: { name?: string; fields?: Record<string, any>; createTime?: string }): MemoryRow {
  const id = String(docObj.name || "").split("/").pop() || "";
  const raw: Record<string, any> = {};
  for (const [k, fv] of Object.entries(docObj.fields || {})) {
    raw[k] = fromFirestoreValue(fv);
  }
  const att =
    raw.attachment && typeof raw.attachment === "object"
      ? ({
          name: String(raw.attachment.name || "file"),
          type: String(raw.attachment.type || "application/octet-stream"),
          ...(typeof raw.attachment.size === "number" ? { size: raw.attachment.size } : {}),
          ...(typeof raw.attachment.dataUrl === "string" ? { dataUrl: raw.attachment.dataUrl } : {}),
          ...(typeof raw.attachment.textContent === "string" ? { textContent: raw.attachment.textContent } : {}),
        } satisfies MemoryAttachment)
      : undefined;

  return {
    id,
    content: String(raw.content ?? ""),
    kind: String(raw.kind ?? "other"),
    created_at: String(raw.created_at ?? raw.createdAt ?? docObj.createTime ?? new Date().toISOString()),
    ...(att ? { attachment: att } : {}),
  };
}

async function firestoreFetch(pathUrl: string, token: string, init: RequestInit = {}): Promise<any> {
  if (!isFirebaseJwt(token)) {
    throw new Error("Cloud authentication token required for Firestore memory access");
  }
  const res = await fetch(`${FIRESTORE_REST_BASE}${pathUrl}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const errMsg =
      (Array.isArray(json) ? json[0]?.error?.message : json?.error?.message) ||
      text.slice(0, 300) ||
      `Firestore HTTP ${res.status}`;
    const err = new Error(errMsg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function listAllMemories(
  _client: typeof firebaseClient,
  userId: string,
  token?: string,
): Promise<MemoryRow[]> {
  if (token && isLocalFallbackToken(token)) {
    const store = readLocalStore();
    const list = Array.isArray(store[userId]) ? [...store[userId]] : [];
    list.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
    return list;
  }
  if (!token || !isFirebaseJwt(token)) {
    return [];
  }
  const rows = (await firestoreFetch(":runQuery", token, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "memories" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "user_id" },
            op: "EQUAL",
            value: { stringValue: userId },
          },
        },
      },
    }),
  })) as Array<{ document?: { name?: string; fields?: Record<string, any>; createTime?: string } }>;

  const memories = (Array.isArray(rows) ? rows : [])
    .filter((r) => Boolean(r.document?.name))
    .map((r) => docToMemoryRow(r.document!));

  memories.sort((a, b) => {
    const ta = Date.parse(a.created_at) || 0;
    const tb = Date.parse(b.created_at) || 0;
    return tb - ta;
  });

  return memories;
}

export async function createMemory(
  userId: string,
  token: string,
  input: {
    content: string;
    kind?: string;
    attachment?: MemoryAttachment | null;
  },
): Promise<MemoryRow> {
  const now = new Date().toISOString();
  if (isLocalFallbackToken(token)) {
    const store = readLocalStore();
    const list = Array.isArray(store[userId]) ? store[userId] : [];
    const row: MemoryRow = {
      id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content: input.content.trim().slice(0, 4000),
      kind: (input.kind || "other").slice(0, 30),
      created_at: now,
      ...(input.attachment ? { attachment: input.attachment } : {}),
    };
    store[userId] = [row, ...list];
    writeLocalStore(store);
    return row;
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    content: input.content.trim().slice(0, 4000),
    kind: (input.kind || "other").slice(0, 30),
    created_at: now,
    updated_at: now,
  };
  if (input.attachment) {
    payload.attachment = input.attachment;
  }

  const created = await firestoreFetch("/memories", token, {
    method: "POST",
    body: JSON.stringify({ fields: encodeFields(payload) }),
  });

  return docToMemoryRow(created);
}

export async function updateMemory(
  userId: string,
  token: string,
  id: string,
  input: {
    content: string;
    kind?: string;
    attachment?: MemoryAttachment | null;
  },
): Promise<MemoryRow> {
  const now = new Date().toISOString();
  if (isLocalFallbackToken(token)) {
    const store = readLocalStore();
    const list = Array.isArray(store[userId]) ? store[userId] : [];
    let updatedRow: MemoryRow | null = null;
    store[userId] = list.map((m) => {
      if (m.id !== id) return m;
      updatedRow = {
        ...m,
        content: input.content.trim().slice(0, 4000),
        ...(input.kind ? { kind: input.kind.slice(0, 30) } : {}),
        ...(input.attachment === null
          ? { attachment: undefined }
          : input.attachment
            ? { attachment: input.attachment }
            : {}),
      };
      return updatedRow;
    });
    if (!updatedRow) {
      throw new Error("Memory item not found");
    }
    writeLocalStore(store);
    return updatedRow;
  }

  const fieldsObj: Record<string, unknown> = {
    user_id: userId,
    content: input.content.trim().slice(0, 4000),
    updated_at: now,
  };
  const maskPaths = ["user_id", "content", "updated_at"];
  if (input.kind) {
    fieldsObj.kind = input.kind.slice(0, 30);
    maskPaths.push("kind");
  }
  if (input.attachment !== undefined) {
    maskPaths.push("attachment");
    if (input.attachment !== null) {
      fieldsObj.attachment = input.attachment;
    }
  }

  const qs = maskPaths.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&");
  const updated = await firestoreFetch(`/memories/${encodeURIComponent(id)}?${qs}`, token, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFields(fieldsObj) }),
  });

  return docToMemoryRow(updated);
}

export async function deleteMemory(token: string, id: string): Promise<void> {
  if (isLocalFallbackToken(token)) {
    const store = readLocalStore();
    const list = Array.isArray(store[token]) ? store[token] : [];
    store[token] = list.filter((m) => m.id !== id);
    writeLocalStore(store);
    return;
  }
  await firestoreFetch(`/memories/${encodeURIComponent(id)}`, token, {
    method: "DELETE",
  });
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е");
}

export async function loadRelevantMemories(
  _client: typeof firebaseClient,
  userId: string,
  queryText: string,
  matchCount = 12,
  token?: string,
): Promise<MemoryRow[]> {
  try {
    const all = await listAllMemories(_client, userId, token);
    if (all.length === 0) return [];
    if (!queryText || all.length <= matchCount) {
      return all.slice(0, matchCount);
    }

    const qNorm = normalizeForMatch(queryText);
    const words = qNorm
      .split(/[\s,.;:!?()"'«»]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3);

    const ranked = all.map((m, idx) => {
      let score = 0.25;
      if (m.kind === "name" || m.kind === "style" || m.kind === "preference") {
        score += 0.2;
      }
      const haystack = normalizeForMatch(
        `${m.content} ${m.kind} ${m.attachment?.name ?? ""} ${m.attachment?.textContent ?? ""}`,
      );
      for (const w of words) {
        const stem = w.length >= 5 ? w.slice(0, w.length - 1) : w;
        if (haystack.includes(w)) score += 0.3;
        else if (stem.length >= 3 && haystack.includes(stem)) score += 0.2;
      }
      score += Math.max(0, (all.length - idx) / Math.max(all.length, 1)) * 0.05;
      return { ...m, similarity: Math.min(1.0, score) };
    });

    ranked.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    return ranked.slice(0, matchCount);
  } catch (e) {
    console.error("loadRelevantMemories error", e);
    return [];
  }
}

type MemoryDecision =
  | { action: "create"; kind: MemoryKind; content: string }
  | { action: "update"; id: string; content: string; kind?: MemoryKind }
  | { action: "delete"; id: string }
  | { action: "noop" };

const ANALYZER_SYSTEM = `You maintain a compact, high-signal long-term memory notebook for a single user of an AI assistant.
You will receive: (1) the user's most recent message, (2) the assistant's reply, (3) the current memory list.
Return a JSON object: {"decisions": [<decision>, ...]} — 0 to 3 decisions, most of the time 0.

Each decision is one of:
- {"action":"create","kind":"<kind>","content":"<short factual statement about the user>"}
- {"action":"update","id":"<existing_id>","content":"<new statement>","kind":"<kind optional>"}
- {"action":"delete","id":"<existing_id>"}
- {"action":"noop"}

kind is one of: name, preference, tech, project, goal, device, interest, style, other.

RULES:
- Only save DURABLE facts about the user (name, contacts, preferences, tools, favorite tech, ongoing projects, goals, devices, interests, communication style, recurring context). Never save ephemeral chatter, questions, or single-session tasks.
- Do NOT save facts that are already present verbatim or nearly identically in CURRENT MEMORIES.
- Do NOT save the assistant's own suggestions, generated content, or code — only stable facts stated or clearly implied by the user.
- Prefer update over create when a similar memory already exists. Prefer delete when a memory is clearly outdated or contradicted.
- Keep each memory concise (under 240 chars), written as a plain fact, in the same language the user uses.
- If nothing meaningful or already stored, return {"decisions":[{"action":"noop"}]}.
- Output ONLY valid JSON, no prose.`;

export async function analyzeAndUpdateMemory(
  client: typeof firebaseClient,
  userId: string,
  userMessage: string,
  assistantMessage: string,
  token?: string,
): Promise<boolean> {
  if (!token || (!isFirebaseJwt(token) && !isLocalFallbackToken(token))) return false;
  const key = process.env.DEEPSEEK_API_KEY || "sk-f9e947f21f0246ad9b524a3a5c86a8b2";
  if (!key) return false;

  let existing: MemoryRow[] = [];
  try {
    existing = await listAllMemories(client, userId, token);
  } catch (e) {
    console.error("analyzeAndUpdateMemory list error", e);
    return false;
  }

  const existingSnippet =
    existing
      .slice(0, 60)
      .map((m) => `- [${m.id}] (${m.kind}) ${m.content}`)
      .join("\n") || "(empty)";

  const analysisPrompt = `USER MESSAGE:\n${userMessage.slice(0, 4000)}\n\nASSISTANT REPLY:\n${assistantMessage.slice(0, 2000)}\n\nCURRENT MEMORIES:\n${existingSnippet}\n\nRespond with ONLY a JSON object of shape {"decisions":[...]}. No prose.`;

  let decisions: MemoryDecision[] = [];
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ANALYZER_SYSTEM },
          { role: "user", content: analysisPrompt },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      console.error("memory analyzer failed", res.status);
      return false;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawRaw = json.choices?.[0]?.message?.content ?? "";
    const raw = rawRaw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}$/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as { decisions?: MemoryDecision[] };
    decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  } catch (e) {
    console.error("memory analyzer parse error", e);
    return false;
  }

  let changed = false;
  for (const d of decisions.slice(0, 3)) {
    try {
      if (d.action === "create") {
        const content = String(d.content || "").trim().slice(0, 400);
        if (!content) continue;
        const dup = existing.some(
          (m) => normalizeForMatch(m.content) === normalizeForMatch(content),
        );
        if (dup) continue;
        await createMemory(userId, token, {
          content,
          kind: d.kind || "other",
        });
        changed = true;
      } else if (d.action === "update") {
        const content = String(d.content || "").trim().slice(0, 400);
        if (!content || !d.id) continue;
        await updateMemory(userId, token, d.id, {
          content,
          ...(d.kind ? { kind: d.kind } : {}),
        });
        changed = true;
      } else if (d.action === "delete") {
        if (!d.id) continue;
        await deleteMemory(token, d.id);
        changed = true;
      }
    } catch (e) {
      console.error("memory apply decision error", e);
    }
  }
  return changed;
}
