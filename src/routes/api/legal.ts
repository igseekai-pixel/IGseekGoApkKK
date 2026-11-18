import { PRIVACY_POLICY_URL, USER_AGREEMENT_URL } from "../../lib/legal";

const PROJECT_AI_URL = "https://telegra.ph/Polzovatelskoe-soglashenie-proekta-i-nejroseti-06-24";

const DOC_URLS: Record<string, { url: string; fallbackTitle: string; fallbackBody: string }> = {
  terms: {
    url: USER_AGREEMENT_URL,
    fallbackTitle: "Пользовательское соглашение IGseek",
    fallbackBody:
      "Используя платформу IGseek, вы соглашаетесь соблюдать правила сервиса, использовать инструменты ответственно и не нарушать применимое законодательство.\n\nПо вопросам соглашения обращайтесь в официальный Telegram: @IGSEEKAI.",
  },
  privacy: {
    url: PRIVACY_POLICY_URL,
    fallbackTitle: "Политика конфиденциальности IGseek",
    fallbackBody:
      "IGseek уважает конфиденциальность пользователей. Ваши учётные данные, переписки и настройки используются исключительно для работы платформы и авторизации.\n\nПо вопросам удаления аккаунта и данных: @IGSEEKAI.",
  },
  ai: {
    url: PROJECT_AI_URL,
    fallbackTitle: "Пользовательское соглашение проекта и нейросети",
    fallbackBody:
      "Ответы ИИ формируются автоматически и носят информационный характер. Проверяйте критически важные решения и код перед применением.",
  },
};

const cache = new Map<string, { title: string; body: string; url: string; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export async function handleLegalRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "terms";
  const entry = DOC_URLS[type] || DOC_URLS.terms;

  const cached = cache.get(type);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return new Response(JSON.stringify(cached), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(entry.url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

    const title = titleMatch
      ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "").trim())
      : entry.fallbackTitle;

    let body = articleMatch ? articleMatch[1] : html;
    body = body
      .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, "")
      .replace(/<address[^>]*>[\s\S]*?<\/address>/gi, "")
      .replace(/<\/(h[1-6]|p|li|blockquote|div)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, "")
      .trim();

    body = decodeHtmlEntities(body)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!body) throw new Error("Empty article body");

    const payload = { title, body, url: entry.url, ts: Date.now() };
    cache.set(type, payload);
    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch {
    return new Response(
      JSON.stringify({
        title: entry.fallbackTitle,
        body: entry.fallbackBody,
        url: entry.url,
        fallback: true,
      }),
      {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
}
