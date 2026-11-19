import {
  fetchCloudChatMessagesForLibrary,
  type CloudChatMessageForLibrary,
} from "./cloud-sync";
import { firebaseClient } from "./firebase-service";
import { readFlowLibraryFiles, upsertFlowLibraryFiles } from "./flow-library-store";

export type UnifiedLibraryItem = {
  id: string;
  name: string;
  type: "image" | "doc" | "artifact";
  mimeType: string;
  dataUrl?: string;
  content?: string;
  chatId: string;
  chatTitle: string;
  messageId: string;
  timestamp?: string;
  source: "user_upload" | "generated" | "artifact" | "flow";
  snippet?: string;
  flowFileId?: string;
  projectId?: string | null;
};

export function guessMimeType(name: string, fallback = "text/plain"): string {
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

export function utf8ToBase64(text: string): string {
  try {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return btoa(unescape(encodeURIComponent(text)));
  }
}

export function toBase64DataUrlFromItem(item: Pick<UnifiedLibraryItem, "name" | "mimeType" | "content" | "dataUrl">): string | undefined {
  if (item.dataUrl && item.dataUrl.startsWith("data:")) {
    const commaIdx = item.dataUrl.indexOf(",");
    if (commaIdx !== -1) {
      const meta = item.dataUrl.slice(5, commaIdx);
      const body = item.dataUrl.slice(commaIdx + 1);
      if (meta.includes(";base64")) return item.dataUrl;
      try {
        const decoded = decodeURIComponent(body);
        const mime = meta.split(";")[0] || item.mimeType || guessMimeType(item.name);
        return `data:${mime};base64,${utf8ToBase64(decoded)}`;
      } catch {
        return item.dataUrl;
      }
    }
  }
  if (typeof item.content === "string") {
    const mime = item.mimeType || guessMimeType(item.name);
    return `data:${mime};base64,${utf8ToBase64(item.content)}`;
  }
  return undefined;
}

function readGuestMessagesMap(): Record<string, any[]> {
  try {
    const raw = window.localStorage.getItem("igseek:guest-store");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed?.messages && typeof parsed.messages === "object" ? parsed.messages : {};
  } catch {
    return {};
  }
}

export function collectLocalUnifiedLibrary(opts?: {
  userId?: string | null;
  chats?: Array<{ id: string; title: string }>;
  projects?: Array<{ id: string; name: string }>;
  cloudMediaMsgs?: CloudChatMessageForLibrary[];
}): UnifiedLibraryItem[] {
  const list: UnifiedLibraryItem[] = [];
  const seen = new Set<string>();
  const projNameMap = new Map<string, string>();
  (opts?.projects || []).forEach((p) => projNameMap.set(p.id, p.name));
  const chatTitleMap = new Map<string, string>();
  (opts?.chats || []).forEach((c) => chatTitleMap.set(c.id, c.title));

  for (const ff of readFlowLibraryFiles()) {
    const isDataUrl = typeof ff.content === "string" && ff.content.startsWith("data:");
    const mappedType: "image" | "doc" | "artifact" =
      ff.type === "image" || (isDataUrl && ff.content.startsWith("data:image/"))
        ? "image"
        : ff.type === "code" || ff.type === "data" || ff.type === "artifact"
          ? "artifact"
          : "doc";
    const projLabel = ff.projectId ? projNameMap.get(ff.projectId) || "Project" : null;
    const key = `flow:${ff.id}:${ff.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      id: ff.id,
      flowFileId: ff.id,
      name: ff.name,
      type: mappedType,
      mimeType: guessMimeType(ff.name, mappedType === "image" ? "image/png" : "text/plain"),
      ...(isDataUrl
        ? { dataUrl: ff.content }
        : {
            content: ff.content,
            dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(ff.content || "")}`,
          }),
      chatId: "",
      chatTitle: ff.taskTitle
        ? `${ff.taskTitle}${projLabel ? ` (${projLabel})` : ""}`
        : `Library${projLabel ? ` (${projLabel})` : ""}`,
      messageId: "",
      timestamp: ff.updatedAt,
      source: "flow",
      snippet: isDataUrl ? ff.name : (ff.content || "").slice(0, 140),
      projectId: ff.projectId,
    });
  }

  const appendMessagesMedia = (
    chatId: string,
    msgs: Array<{ id: string; content?: string; images?: any[]; artifacts?: any[]; created_at?: string }>,
  ) => {
    const title = chatTitleMap.get(chatId) || "Chat";
    for (const m of msgs) {
      if (!m) continue;
      if (m.content) {
        const matches = [...m.content.matchAll(/!\[([^\]]*)\]\((data:[^)]+)\)/g)];
        for (const match of matches) {
          const name = match[1] || "attachment";
          const dataUrl = match[2];
          const isImg = dataUrl.startsWith("data:image/");
          const mimeMatch = dataUrl.match(/^data:([^;]+);/);
          const id = `${m.id}_${name}`;
          if (seen.has(id)) continue;
          seen.add(id);
          list.push({
            id,
            name,
            type: isImg ? "image" : "doc",
            mimeType: mimeMatch?.[1] || guessMimeType(name),
            dataUrl,
            chatId,
            chatTitle: title,
            messageId: m.id,
            timestamp: m.created_at,
            source: "user_upload",
          });
        }
      }
      if (Array.isArray(m.images)) {
        for (const img of m.images) {
          if (!img?.dataUrl) continue;
          const id = img.id || `${m.id}_img`;
          if (seen.has(id)) continue;
          seen.add(id);
          list.push({
            id,
            name: img.title || "generated_image.png",
            type: "image",
            mimeType: "image/png",
            dataUrl: img.dataUrl,
            chatId,
            chatTitle: title,
            messageId: m.id,
            timestamp: m.created_at,
            source: "generated",
            snippet: img.prompt,
          });
        }
      }
      if (Array.isArray(m.artifacts)) {
        for (const art of m.artifacts) {
          const name = art.title
            ? art.title.includes(".")
              ? art.title
              : `${art.title}.${art.language || "txt"}`
            : "artifact.txt";
          const id = art.id || `${m.id}_art_${name}`;
          if (seen.has(id)) continue;
          seen.add(id);
          list.push({
            id,
            name,
            type: "artifact",
            mimeType: guessMimeType(name, "text/plain"),
            content: art.content || "",
            dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(art.content || "")}`,
            chatId,
            chatTitle: title,
            messageId: m.id,
            timestamp: m.created_at,
            source: "artifact",
            snippet: art.description || art.content?.slice(0, 80),
          });
        }
      }
    }
  };

  if (opts?.cloudMediaMsgs && opts.cloudMediaMsgs.length > 0) {
    const byChat = new Map<string, CloudChatMessageForLibrary[]>();
    for (const msg of opts.cloudMediaMsgs) {
      const cid = msg.chatId || "cloud";
      const arr = byChat.get(cid) ?? [];
      arr.push(msg);
      byChat.set(cid, arr);
    }
    for (const [cid, msgs] of byChat.entries()) {
      appendMessagesMedia(cid, msgs);
    }
  }

  const guestMsgs = readGuestMessagesMap();
  for (const [chatId, msgs] of Object.entries(guestMsgs)) {
    if (!Array.isArray(msgs)) continue;
    appendMessagesMedia(chatId, msgs);
  }

  return list;
}

export async function fetchUnifiedLibraryItems(opts?: {
  userId?: string | null;
  chats?: Array<{ id: string; title: string }>;
  projects?: Array<{ id: string; name: string }>;
}): Promise<UnifiedLibraryItem[]> {
  let cloudMediaMsgs: CloudChatMessageForLibrary[] = [];
  if (opts?.userId && opts.userId !== "guest" && !opts.userId.startsWith("local_")) {
    cloudMediaMsgs = await fetchCloudChatMessagesForLibrary(opts.userId).catch(() => []);
  }
  const localItems = collectLocalUnifiedLibrary({ ...opts, cloudMediaMsgs });

  try {
    const { data } = await firebaseClient.auth.getSession();
    const token = data.session?.access_token;
    const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
    const res = await fetch("/api/library", { headers });
    if (res.ok) {
      const json = (await res.json()) as { items?: any[] };
      if (Array.isArray(json.items)) {
        const seenNames = new Set(localItems.map((i) => `${i.name.toLowerCase()}::${i.source}`));
        for (const srv of json.items) {
          if (!srv?.name) continue;
          const k = `${String(srv.name).toLowerCase()}::${srv.source || "flow"}`;
          if (seenNames.has(k)) continue;
          seenNames.add(k);
          localItems.push({
            id: String(srv.id || `srv_${srv.name}`),
            name: String(srv.name),
            type: srv.type === "image" ? "image" : srv.type === "artifact" ? "artifact" : "doc",
            mimeType: String(srv.mimeType || guessMimeType(srv.name)),
            content: srv.content,
            dataUrl: srv.dataUrl,
            chatId: "",
            chatTitle: String(srv.chatTitle || "Library"),
            messageId: "",
            timestamp: srv.updatedAt,
            source: srv.source === "flow" || srv.source === "user_upload" || srv.source === "generated" || srv.source === "artifact"
              ? srv.source
              : "flow",
            snippet: typeof srv.content === "string" ? srv.content.slice(0, 140) : srv.name,
          });
        }
      }
    }
  } catch {
  }

  return localItems;
}

export function buildChatLibraryPayload(items: UnifiedLibraryItem[]) {
  return items.slice(0, 35).map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    mimeType: item.mimeType,
    source: item.source,
    chatTitle: item.chatTitle,
    updatedAt: item.timestamp,
    ...(typeof item.content === "string" ? { content: item.content.slice(0, 48_000) } : {}),
    ...(item.dataUrl && item.dataUrl.length <= 280_000 ? { dataUrl: item.dataUrl } : {}),
  }));
}

export async function addFileToUnifiedLibrary(
  file: File,
  opts?: { projectId?: string | null; taskTitle?: string },
): Promise<UnifiedLibraryItem> {
  const isText =
    file.type.startsWith("text/") ||
    /\.(txt|md|json|csv|js|ts|tsx|jsx|py|html|css|xml|yaml|yml|log|sql|sh|env)$/i.test(file.name);

  let textContent: string | undefined;
  let dataUrl: string | undefined;

  if (isText && file.size <= 512 * 1024) {
    textContent = await file.text();
    dataUrl = `data:${guessMimeType(file.name, file.type || "text/plain")};base64,${utf8ToBase64(textContent)}`;
  } else {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(file);
    });
  }

  const storedContent = textContent !== undefined ? textContent : (dataUrl || "");
  const fileType = file.type.startsWith("image/")
    ? "image"
    : file.name.endsWith(".json") || file.name.endsWith(".csv")
      ? "data"
      : "document";

  const updated = upsertFlowLibraryFiles([
    {
      name: file.name,
      type: fileType,
      content: storedContent.slice(0, 840_000),
      projectId: opts?.projectId ?? null,
      taskTitle: opts?.taskTitle || "Library",
    },
  ]);

  const savedEntry = updated.find((u) => u.name === file.name) || updated[0];

  try {
    const { data } = await firebaseClient.auth.getSession();
    const token = data.session?.access_token;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
    await Promise.allSettled([
      fetch("/api/library", {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: savedEntry?.id,
          name: file.name,
          type: file.type.startsWith("image/") ? "image" : fileType === "data" ? "artifact" : "doc",
          mimeType: file.type || guessMimeType(file.name),
          ...(textContent !== undefined ? { content: textContent.slice(0, 800_000) } : {}),
          ...(dataUrl && dataUrl.length <= 1_100_000 ? { dataUrl } : {}),
          size: file.size,
          source: "library",
          chatTitle: opts?.taskTitle || "Library",
        }),
      }),
      fetch("/api/flow", {
        method: "POST",
        headers: { ...headers, "x-guest-mode": token ? "false" : "true" },
        body: JSON.stringify({
          action: "sync_library",
          projectId: opts?.projectId ?? null,
          files: [
            {
              name: file.name,
              ...(textContent !== undefined ? { content: textContent } : { dataUrl }),
            },
          ],
        }),
      }),
    ]);
  } catch {
  }

  return {
    id: savedEntry?.id || `lib_${Date.now()}`,
    flowFileId: savedEntry?.id,
    name: file.name,
    type: file.type.startsWith("image/") ? "image" : fileType === "data" ? "artifact" : "doc",
    mimeType: file.type || guessMimeType(file.name),
    ...(textContent !== undefined ? { content: textContent } : {}),
    ...(dataUrl ? { dataUrl } : {}),
    chatId: "",
    chatTitle: opts?.taskTitle || "Library",
    messageId: "",
    timestamp: savedEntry?.updatedAt || new Date().toISOString(),
    source: "flow",
    snippet: textContent ? textContent.slice(0, 140) : file.name,
  };
}
