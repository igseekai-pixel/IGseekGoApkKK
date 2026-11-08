import { createFileRoute } from "@tanstack/react-router";

export async function handleCreatePayment(_request: Request): Promise<Response> {
  return new Response(JSON.stringify({ error: "Payments are disabled. IGseek is 100% free." }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/create-payment")({
  server: {
    handlers: {
      POST: async ({ request }: any) => handleCreatePayment(request),
    },
  },
} as any);
