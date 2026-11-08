import { createFileRoute } from "@tanstack/react-router";

export async function handleCreateDonation(_request: Request): Promise<Response> {
  return new Response(JSON.stringify({ error: "Donations are disabled. IGseek is 100% free." }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/create-donation")({
  server: {
    handlers: {
      POST: async ({ request }: any) => handleCreateDonation(request),
    },
  },
} as any);
