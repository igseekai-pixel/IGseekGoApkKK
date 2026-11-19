import { z } from "zod";
import {
  deleteLocalLibraryItem,
  listAllLibraryFilesServer,
  upsertLocalLibraryItem,
} from "../../lib/library-server";
import { getUserFromToken } from "../../lib/memory-server";

function bearer(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const UpsertSchema = z.object({
  id: z.string().max(128).optional(),
  name: z.string().min(1).max(260),
  type: z.enum(["image", "doc", "artifact"]).optional().default("doc"),
  mimeType: z.string().max(120).optional().default("text/plain"),
  content: z.string().max(850_000).optional(),
  dataUrl: z.string().max(1_200_000).optional(),
  size: z.number().optional(),
  source: z.enum(["flow", "user_upload", "generated", "artifact", "library"]).optional().default("library"),
  chatTitle: z.string().max(200).optional(),
});

const DeleteSchema = z.object({
  id: z.string().min(1).max(260),
});

export async function handleLibraryRequest(request: Request): Promise<Response> {
  const token = bearer(request);
  const authed = token ? await getUserFromToken(token) : null;
  if (!authed) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (request.method === "GET") {
    try {
      const items = await listAllLibraryFilesServer(authed);
      return jsonResponse({ items });
    } catch (err: any) {
      return jsonResponse({ error: err?.message || "Failed to load library" }, 500);
    }
  }

  if (request.method === "POST") {
    let body: z.infer<typeof UpsertSchema>;
    try {
      body = UpsertSchema.parse(await request.json());
    } catch {
      return jsonResponse({ error: "Invalid library file payload" }, 400);
    }
    const saved = upsertLocalLibraryItem(authed.id, body);
    const items = await listAllLibraryFilesServer(authed);
    return jsonResponse({ item: saved, items });
  }

  if (request.method === "DELETE") {
    let body: z.infer<typeof DeleteSchema>;
    try {
      body = DeleteSchema.parse(await request.json());
    } catch {
      return jsonResponse({ error: "Bad request" }, 400);
    }
    const ok = deleteLocalLibraryItem(authed.id, body.id);
    return jsonResponse({ ok });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}
