// Stable-ish device fingerprint. Uniqueness is guaranteed by DB UNIQUE constraint;
// this only aims to be stable within the same browser/device.

const STORAGE_KEY = "igseek:device-fp";
let memoizedFingerprintPromise: Promise<string> | null = null;

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
    ctx.fillText("IGseek·hw·fp", 2, 2);
    ctx.strokeStyle = "rgba(255,0,0,0.7)";
    ctx.strokeText("IGseek·hw·fp", 4, 4);
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
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    const viewportStr = Array.isArray(maxViewport) || ArrayBuffer.isView(maxViewport)
      ? Array.from(maxViewport as Iterable<number>).join("x")
      : String(maxViewport || "");
    return `${vendor}|${renderer}|${maxTexture}|${viewportStr}`;
  } catch {
    return "webgl-err";
  }
}

async function computeHardwareFingerprint(): Promise<string> {
  const nav = navigator;
  // Use stable hardware/OS traits only (avoid UI language or volatile storage state)
  const parts = [
    String(nav.platform || ""),
    String(nav.hardwareConcurrency || ""),
    // @ts-expect-error deviceMemory is non-standard
    String(nav.deviceMemory || ""),
    String(nav.maxTouchPoints ?? ""),
    `${screen.width}x${screen.height}x${screen.colorDepth}x${screen.pixelDepth}`,
    String(window.devicePixelRatio || 1),
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

export function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve("");
  if (!memoizedFingerprintPromise) {
    memoizedFingerprintPromise = computeHardwareFingerprint().catch(() => {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached && /^[a-zA-Z0-9_-]{32,128}$/.test(cached)) return cached;
      } catch {
        // ignore
      }
      return "";
    });
  }
  return memoizedFingerprintPromise;
}

export function humanDeviceError(raw: string, lang: string = "en"): string {
  const s = raw.toLowerCase();
  const l = (["en", "ru", "es", "fr", "ar"].includes(lang) ? lang : "en") as "en" | "ru" | "es" | "fr" | "ar";
  if (s.includes("device_already_registered") || s.includes("profiles_device_fingerprint_key") || s.includes("duplicate")) {
    const map = {
      en: "Another account is already registered on this device. One account per device.",
      ru: "На этом устройстве уже зарегистрирован другой аккаунт. Один аккаунт — одно устройство.",
      es: "Ya hay otra cuenta registrada en este dispositivo. Una cuenta por dispositivo.",
      fr: "Un autre compte est déjà enregistré sur cet appareil. Un compte par appareil.",
      ar: "يوجد حساب آخر مسجّل على هذا الجهاز بالفعل. حساب واحد لكل جهاز.",
    };
    return map[l];
  }
  if (s.includes("device_mismatch")) {
    const map = {
      en: "This account is linked to another device.",
      ru: "Этот аккаунт привязан к другому устройству.",
      es: "Esta cuenta está vinculada a otro dispositivo.",
      fr: "Ce compte est associé à un autre appareil.",
      ar: "هذا الحساب مرتبط بجهاز آخر.",
    };
    return map[l];
  }
  return raw;
}
