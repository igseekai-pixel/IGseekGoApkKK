import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

/**
 * Bridge for AI image generation:
 * Attempts Gemini image generation first via @google/genai (model: gemini-3.1-flash-lite-image).
 * Falls back to Pollinations Flux if Gemini key is not configured or throws an error.
 */
export async function generateImageWithGemini(prompt: string): Promise<{ dataUrl: string; source: "gemini" | "pollinations" }> {
  const ai = getAi();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || "image/png";
          return {
            dataUrl: `data:${mime};base64,${part.inlineData.data}`,
            source: "gemini",
          };
        }
      }
    } catch (err) {
      console.warn("Gemini image generation error, falling back to Pollinations Flux:", err);
    }
  }

  // Fallback to Pollinations Flux
  const key = process.env.POLLINATIONS_API_KEY;
  const url =
    "https://gen.pollinations.ai/image/" +
    encodeURIComponent(prompt) +
    "?model=black-forest-labs/flux.1-schnell&width=1024&height=1024";

  const res = await fetch(url, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Image generation failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type")?.includes("png") ? "image/png" : "image/jpeg";
  return {
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    source: "pollinations",
  };
}
