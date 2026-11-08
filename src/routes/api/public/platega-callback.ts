import { createFileRoute } from "@tanstack/react-router";

export async function handlePlategaCallback(_request: Request): Promise<Response> {
  return new Response("ok");
}

export const Route = createFileRoute("/api/public/platega-callback")({
  server: {
    handlers: {
      POST: async ({ request }: any) => handlePlategaCallback(request),
    },
  },
} as any);
