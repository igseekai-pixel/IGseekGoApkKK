// Server-only helpers for the long-term memory system.
// Powered by Firebase Firestore.

import { firebaseClient } from "./firebase-service";
import {
  db,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  orderBy,
} from "./firebase";

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

const EMBEDDING_MODEL = "openai/text-embedding-3-small";

export async function getUserFromToken(token: string): Promise<{ id: string; client: typeof firebaseClient } | null> {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
      const uid = payload.sub || payload.user_id;
      if (uid) {
        return { id: uid, client: firebaseClient };
      }
    }
    // Fallback if token is direct UID
    if (token.length >= 20) {
      return { id: token, client: firebaseClient };
    }
    return null;
  } catch (err) {
    console.error("getUserFromToken parse error", err);
    return null;
  }
}

export async function embed(text: string): Promise<number[] | null> {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://gen.pollinations.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 6000) }),
    });
    if (!res.ok) {
      console.error("embed failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    return json.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("embed error", e);
    return null;
  }
}

export async function loadRelevantMemories(
  _client: typeof firebaseClient,
  userId: string,
  queryText: string,
  matchCount = 8,
): Promise<MemoryRow[]> {
  try {
    const all = await listAllMemories(_client, userId);
    if (!queryText || all.length === 0) return all.slice(0, matchCount);

    const qLower = queryText.toLowerCase();
    const ranked = all.map((m) => {
      let score = 0.3;
      const cLower = m.content.toLowerCase();
      const words = qLower.split(/\s+/).filter((w) => w.length > 2);
      for (const w of words) {
        if (cLower.includes(w)) score += 0.2;
      }
      return { ...m, similarity: Math.min(1.0, score) };
    });

    return ranked.filter((r) => (r.similarity ?? 0) > 0.35).slice(0, matchCount);
  } catch (e) {
    console.error("loadRelevantMemories error", e);
    return [];
  }
}

export async function listAllMemories(_client: typeof firebaseClient, userId: string): Promise<MemoryRow[]> {
  try {
    const snap = await getDocs(
      query(collection(db, "memories"), where("user_id", "==", userId), orderBy("created_at", "desc")),
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        content: data.content ?? "",
        kind: data.kind ?? "other",
        created_at: data.created_at ?? new Date().toISOString(),
        attachment: data.attachment ?? undefined,
      };
    });
  } catch (error) {
    // Fallback without orderBy
    try {
      const snap = await getDocs(
        query(collection(db, "memories"), where("user_id", "==", userId)),
      );
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          content: data.content ?? "",
          kind: data.kind ?? "other",
          created_at: data.created_at ?? new Date().toISOString(),
          attachment: data.attachment ?? undefined,
        };
      });
    } catch (inner) {
      console.error("listAllMemories fallback error", inner);
      return [];
    }
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
- {"action":"create","kind":"<kind>","content":"<short factual statement in first person about the user>"}
- {"action":"update","id":"<existing_id>","content":"<new statement>","kind":"<kind optional>"}
- {"action":"delete","id":"<existing_id>"}
- {"action":"noop"}

kind is one of: name, preference, tech, project, goal, device, interest, style, other.

RULES:
- Only save DURABLE facts about the user (name, preferences, tools, favorite tech, ongoing projects, goals, devices, interests, communication style, recurring context). Never save ephemeral chatter, questions, or single-session tasks.
- Do NOT save the assistant's own suggestions, generated content, or code — only stable facts stated or clearly implied by the user.
- Prefer update over create when a similar memory already exists. Prefer delete when a memory is clearly outdated or contradicted.
- Keep each memory concise (under 200 chars), written as a plain fact, in the same language the user uses.
- If nothing meaningful, return {"decisions":[{"action":"noop"}]}.
- Output ONLY valid JSON, no prose.`;

export async function analyzeAndUpdateMemory(
  client: typeof firebaseClient,
  userId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<boolean> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return false;

  const existing = await listAllMemories(client, userId);
  const existingSnippet = existing
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
        await addDoc(collection(db, "memories"), {
          user_id: userId,
          content,
          kind: d.kind || "other",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        changed = true;
      } else if (d.action === "update") {
        const content = String(d.content || "").trim().slice(0, 400);
        if (!content || !d.id) continue;
        const patch: Record<string, unknown> = {
          content,
          updated_at: new Date().toISOString(),
        };
        if (d.kind) patch.kind = d.kind;
        await updateDoc(doc(db, "memories", d.id), patch);
        changed = true;
      } else if (d.action === "delete") {
        if (!d.id) continue;
        await deleteDoc(doc(db, "memories", d.id));
        changed = true;
      }
    } catch (e) {
      console.error("memory apply decision error", e);
    }
  }
  return changed;
}
