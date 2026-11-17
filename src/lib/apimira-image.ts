export type SourceImageInput = {
  dataUrl: string;
  mimeType?: string;
};

const DEFAULT_APIMIRA_BASE_URL = "https://apimira.com/v1";
const GPT_IMAGE_MODEL = "openai/gpt-image-2";
const MAX_EDIT_FILES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // APIMIRA limit: 5 MB per input image
const MAX_PROMPT_LENGTH = 15_000;
const IMAGE_TIMEOUT_MS = 600_000; // APIMIRA recommends >= 600s client timeout for image edits

function getApimiraConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.APIMIRA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("APIMIRA_API_KEY is not configured for GPT Image 2");
  }
  const baseUrl = (process.env.APIMIRA_BASE_URL?.trim() || DEFAULT_APIMIRA_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

function detectImageFormat(buffer: Buffer): { mimeType: string; ext: string } | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mimeType: "image/png", ext: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", ext: "jpg" };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp", ext: "webp" };
  }
  return null;
}

function decodeDataUrlImage(input: SourceImageInput): { buffer: Buffer; mimeType: string; ext: string } | null {
  const match = input.dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;

  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;

  // APIMIRA validates image format by magic bytes, so detect directly from bytes.
  const detected = detectImageFormat(buffer);
  if (!detected) return null;

  return {
    buffer,
    mimeType: detected.mimeType,
    ext: detected.ext,
  };
}

type MultipartFilePart = {
  fieldName: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

/**
 * Constructs a buffered multipart/form-data payload so we can explicitly send
 * Content-Length (required by APIMIRA /v1/images/edits; chunked uploads return 400).
 */
function buildMultipartPayload(
  fields: Array<[string, string]>,
  files: MultipartFilePart[],
): { body: Buffer; contentType: string } {
  const boundary = `----ApimiraForm${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];

  for (const [name, value] of fields) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8",
      ),
    );
  }

  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
        "utf8",
      ),
    );
    chunks.push(file.buffer);
    chunks.push(Buffer.from("\r\n", "utf8"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function parseApimiraError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: string } };
    if (parsed?.error?.message) {
      return `APIMIRA (${res.status}): ${parsed.error.message}`;
    }
  } catch {
    // ignore JSON parse failure
  }
  return `APIMIRA (${res.status}): ${raw.slice(0, 240) || res.statusText || "Request failed"}`;
}

async function extractDataUrlFromResponse(res: Response): Promise<string> {
  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const first = json?.data?.[0];
  if (first?.b64_json) {
    const cleanB64 = first.b64_json.replace(/\s+/g, "");
    const bytes = Buffer.from(cleanB64, "base64");
    const detected = detectImageFormat(bytes);
    const mimeType = detected?.mimeType || "image/png";
    return `data:${mimeType};base64,${cleanB64}`;
  }
  if (first?.url) {
    const imgRes = await fetch(first.url, { signal: AbortSignal.timeout(60_000) });
    if (imgRes.ok) {
      const bytes = Buffer.from(await imgRes.arrayBuffer());
      const detected = detectImageFormat(bytes);
      const mimeType = detected?.mimeType || "image/png";
      return `data:${mimeType};base64,${bytes.toString("base64")}`;
    }
  }
  throw new Error("GPT Image 2 did not return image bytes");
}

/**
 * Generates a brand-new image from scratch using openai/gpt-image-2 via APIMIRA (/v1/images/generations).
 */
export async function generateImageWithGptImage2(
  prompt: string,
): Promise<{ dataUrl: string; source: "apimira-gpt-image-2" }> {
  const { apiKey, baseUrl } = getApimiraConfig();
  const cleanPrompt = prompt.trim().slice(0, MAX_PROMPT_LENGTH);
  if (!cleanPrompt) {
    throw new Error("Image generation prompt is empty");
  }

  const res = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GPT_IMAGE_MODEL,
      prompt: cleanPrompt,
      n: 1,
      size: "1024x1024",
    }),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(await parseApimiraError(res));
  }

  const dataUrl = await extractDataUrlFromResponse(res);
  return {
    dataUrl,
    source: "apimira-gpt-image-2",
  };
}

/**
 * Edits 1..4 user-provided or previously generated images using openai/gpt-image-2 via APIMIRA (/v1/images/edits).
 */
export async function editImageWithGptImage2(
  prompt: string,
  sourceImages: SourceImageInput[],
): Promise<{ dataUrl: string; source: "apimira-gpt-image-2" }> {
  const { apiKey, baseUrl } = getApimiraConfig();
  const cleanPrompt = prompt.trim().slice(0, MAX_PROMPT_LENGTH);
  if (!cleanPrompt) {
    throw new Error("Image edit prompt is empty");
  }

  const decoded = sourceImages
    .map((img) => decodeDataUrlImage(img))
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, MAX_EDIT_FILES);

  if (decoded.length === 0) {
    throw new Error("No valid PNG/JPEG/WebP source image (<= 5 MB) found for editing");
  }

  // APIMIRA docs: single image uses field "image", multiple (2..4) use "image[]"
  const fieldName = decoded.length === 1 ? "image" : "image[]";
  const files: MultipartFilePart[] = decoded.map((item, idx) => ({
    fieldName,
    fileName: `source_${idx + 1}.${item.ext}`,
    mimeType: item.mimeType,
    buffer: item.buffer,
  }));

  const { body, contentType } = buildMultipartPayload(
    [
      ["model", GPT_IMAGE_MODEL],
      ["prompt", cleanPrompt],
      ["n", "1"],
    ],
    files,
  );

  const res = await fetch(`${baseUrl}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": contentType,
      "Content-Length": String(body.length),
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(await parseApimiraError(res));
  }

  const dataUrl = await extractDataUrlFromResponse(res);
  return {
    dataUrl,
    source: "apimira-gpt-image-2",
  };
}
