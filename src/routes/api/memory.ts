import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  createMemory,
  deleteMemory,
  getUserFromToken,
  listAllMemories,
  updateMemory,
} from "../../lib/memory-server";

function bearer(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function auth(request: Request) {
  const token = bearer(request);
  if (!token) return null;
  return getUserFromToken(token);
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const MAX_ATTACHMENT_BYTES = 850_000;

const UpsertSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  content: z.string().min(1).max(4000),
  kind: z.string().max(30).optional(),
  attachment: z
    .object({
      name: z.string().max(260),
      type: z.string().max(120),
      size: z.number().optional(),
      dataUrl: z.string().max(MAX_ATTACHMENT_BYTES).optional(),
      textContent: z.string().max(40_000).optional(),
    })
    .nullable()
    .optional(),
});

const DeleteSchema = z.object({ id: z.string().min(1).max(128) });

export async function handleMemoryRequest(request: Request): Promise<Response> {
  const authed = await auth(request);
  if (!authed) {
    return jsonResponse({ error: "Unauthorized: valid Firebase sign-in required" }, 401);
  }

  if (request.method === "GET") {
    try {
      const items = await listAllMemories(authed.client, authed.id, authed.token);
      return jsonResponse({ items });
    } catch (err: any) {
      const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
      console.error("Memory GET error", err);
      return jsonResponse({ error: err?.message || "Failed to load memories" }, status);
    }
  }

  if (request.method === "POST") {
    let body: z.infer<typeof UpsertSchema>;
    try {
      const rawJson = await request.json();
      body = UpsertSchema.parse(rawJson);
    } catch (err: any) {
      console.error("Memory POST validation error", err);
      const isTooBig = String(err?.message || "").includes("too_big") || String(err?.message || "").includes(String(MAX_ATTACHMENT_BYTES));
      return jsonResponse(
        {
          error: isTooBig
            ? "Файл слишком большой для хранения в облачной памяти (лимит ~800 КБ)."
            : "Некорректные данные записи памяти.",
        },
        400,
      );
    }

    try {
      if (body.id) {
        await updateMemory(authed.id, authed.token, body.id, {
          content: body.content,
          kind: body.kind,
          attachment: body.attachment,
        });
      } else {
        await createMemory(authed.id, authed.token, {
          content: body.content,
          kind: body.kind || "other",
          attachment: body.attachment,
        });
      }
    } catch (err: any) {
      const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
      console.error("Firestore memory save error", err);
      return jsonResponse({ error: err?.message || "Failed to save memory" }, status);
    }

    try {
      const items = await listAllMemories(authed.client, authed.id, authed.token);
      return jsonResponse({ items });
    } catch (err: any) {
      return jsonResponse({ error: err?.message || "Saved but failed to reload" }, 500);
    }
  }

  if (request.method === "DELETE") {
    let body: z.infer<typeof DeleteSchema>;
    try {
      body = DeleteSchema.parse(await request.json());
    } catch {
      return jsonResponse({ error: "Bad request" }, 400);
    }
    try {
      await deleteMemory(authed.token, body.id);
    } catch (err: any) {
      const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
      console.error("Firestore memory delete error", err);
      return jsonResponse({ error: err?.message || "Failed to delete memory" }, status);
    }
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}

export const Route = createFileRoute("/api/memory")({
  server: {
    handlers: {
      GET: async ({ request }: any) => handleMemoryRequest(request),
      POST: async ({ request }: any) => handleMemoryRequest(request),
      DELETE: async ({ request }: any) => handleMemoryRequest(request),
    },
  },
} as any);
