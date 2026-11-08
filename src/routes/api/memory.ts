import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getUserFromToken, listAllMemories } from "../../lib/memory-server";
import { db, collection, addDoc, doc, updateDoc, deleteDoc } from "../../lib/firebase";

function bearer(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7) : "";
}

async function auth(request: Request) {
  const token = bearer(request);
  if (!token) return null;
  return getUserFromToken(token);
}

const UpsertSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  content: z.string().min(1).max(4000),
  kind: z.string().max(30).optional(),
  attachment: z
    .object({
      name: z.string(),
      type: z.string(),
      size: z.number().optional(),
      dataUrl: z.string().optional(),
      textContent: z.string().optional(),
    })
    .nullable()
    .optional(),
});

const DeleteSchema = z.object({ id: z.string().min(1).max(128) });

export async function handleMemoryRequest(request: Request): Promise<Response> {
  const authed = await auth(request);
  if (!authed) return new Response("Unauthorized", { status: 401 });

  if (request.method === "GET") {
    const items = await listAllMemories(authed.client, authed.id);
    return new Response(JSON.stringify({ items }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = UpsertSchema.parse(await request.json());
    } catch (err) {
      console.error("Memory POST validation error", err);
      return new Response("Bad request", { status: 400 });
    }

    try {
      if (body.id) {
        const patch: Record<string, unknown> = {
          content: body.content,
          updated_at: new Date().toISOString(),
        };
        if (body.kind) patch.kind = body.kind;
        if (body.attachment !== undefined) patch.attachment = body.attachment;
        await updateDoc(doc(db, "memories", body.id), patch);
      } else {
        await addDoc(collection(db, "memories"), {
          user_id: authed.id,
          content: body.content,
          kind: body.kind || "other",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(body.attachment ? { attachment: body.attachment } : {}),
        });
      }
    } catch (err: any) {
      console.error("Firestore memory save error", err);
      return new Response(err?.message || "Failed to save memory", { status: 500 });
    }

    const items = await listAllMemories(authed.client, authed.id);
    return new Response(JSON.stringify({ items }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (request.method === "DELETE") {
    let body;
    try {
      body = DeleteSchema.parse(await request.json());
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    try {
      await deleteDoc(doc(db, "memories", body.id));
    } catch (err: any) {
      console.error("Firestore memory delete error", err);
      return new Response(err?.message || "Failed to delete memory", { status: 500 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
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
