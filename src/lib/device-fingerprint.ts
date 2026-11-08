// Stable-ish device fingerprint. Uniqueness is guaranteed by DB UNIQUE constraint;
// this only aims to be stable within the same browser/device.

const STORAGE_KEY = "igseek:device-fp";

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function canvasSignature(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 220;
    c.height = 40;
    const ctx = c.getContext("2d");
    if (!ctx) return "no-2d";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 220, 40);
    ctx.fillStyle = "#069";
    ctx.fillText("IGseek·fp·⚡", 2, 2);
    ctx.strokeStyle = "rgba(255,0,0,0.7)";
    ctx.strokeText("IGseek·fp·⚡", 4, 4);
    return c.toDataURL();
  } catch {
    return "canvas-err";
  }
}

function webglSignature(): string {
  try {
    const c = document.createElement("canvas");
    const gl =
      (c.getContext("webgl") as WebGLRenderingContext | null) ||
      (c.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return "no-webgl";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return `${vendor}|${renderer}`;
  } catch {
    return "webgl-err";
  }
}

export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached && cached.length >= 32) return cached;
  } catch {
    // ignore
  }

  const nav = navigator;
  const parts = [
    nav.userAgent,
    nav.language,
    (nav.languages || []).join(","),
    String(nav.hardwareConcurrency || ""),
    // @ts-expect-error deviceMemory is non-standard
    String(nav.deviceMemory || ""),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(new Date().getTimezoneOffset()),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    canvasSignature(),
    webglSignature(),
  ].join("::");

  const hash = await sha256Hex(parts);
  try {
    localStorage.setItem(STORAGE_KEY, hash);
  } catch {
    // ignore
  }
  return hash;
}

export function humanDeviceError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("device_already_registered") || s.includes("profiles_device_fingerprint_key") || s.includes("duplicate")) {
    return "На этом устройстве уже зарегистрирован другой аккаунт. Один аккаунт — одно устройство.";
  }
  if (s.includes("device_mismatch")) {
    return "Этот аккаунт привязан к другому устройству.";
  }
  return raw;
}
