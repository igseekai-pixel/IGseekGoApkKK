import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildSystemPrompt, type AgentId } from "../../lib/system-prompts";
import {
  analyzeAndUpdateMemory,
  getUserFromToken,
  loadRelevantMemories,
  listAllMemories,
  type MemoryRow,
} from "../../lib/memory-server";
import { checkContent, refusalMessage } from "../../lib/content-filters";
import { isChinaSensitive } from "../../lib/sensitive-topics";
import { generateImageWithGemini } from "../../lib/gemini-image";

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  // Пользователь может прикрепить изображение — оно приходит как base64 data-URL
  // внутри markdown (`![name](data:image/png;base64,...)`), поэтому лимит большой.
  content: z.string().max(16_000_000),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50),
  reasoning: z.boolean().optional().default(false),
  webSearch: z.boolean().optional().default(false),
  model: z.enum(["instinct", "chat", "f1"]).optional().default("instinct"),
  agent: z.enum(["universal", "coder", "hacker", "mentor", "psy", "creative"]).optional().default("universal"),
  gmailConnected: z.boolean().optional().default(false),
  userAttachments: z
    .array(
      z.object({
        name: z.string(),
        dataUrl: z.string(),
        type: z.string().optional(),
      })
    )
    .optional(),
});

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

const ARTIFACT_TOOL = {
  type: "function" as const,
  function: {
    name: "create_artifact",
    description:
      "Создать артефакт-файл (код, HTML, markdown, документ, конфиг) и вложить его карточкой в ответ. Используй для существенного кода или документов, а не для коротких сниппетов внутри текста. После вызова инструмента коротко подтверди пользователю, что артефакт готов.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Название артефакта, читаемое для человека." },
        language: {
          type: "string",
          description:
            "Язык/формат содержимого: html, css, javascript, typescript, tsx, jsx, python, json, yaml, sql, markdown, bash, text и т.п.",
        },
        content: { type: "string", description: "Полное содержимое файла." },
        description: { type: "string", description: "Короткое пояснение (опционально)." },
      },
      required: ["title", "language", "content"],
    },
  },
};

const IMAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "generate_image",
    description:
      "Сгенерировать изображение по текстовому описанию и вставить его в чат как карточку. Используй, когда пользователь просит картинку, изображение, иллюстрацию, фото, арт, визуал или что-то нарисовать. Не генерируй изображения без явного запроса пользователя.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Короткое название изображения для карточки." },
        prompt: {
          type: "string",
          description:
            "Детальное описание изображения на английском языке. Опиши стиль, сюжет, цвета, освещение, композицию и настроение. Чем конкретнее, тем лучше.",
        },
        description: { type: "string", description: "Краткое описание для карточки (опционально)." },
      },
      required: ["title", "prompt"],
    },
  },
};

const WEB_SEARCH_TOOL = {
  type: "function" as const,
  function: {
    name: "web_search",
    description:
      "Найти актуальную информацию в интернете. Используй, когда пользователю нужны свежие данные, новости, факты о реальном мире, курсы, статистика, страницы или всё, чего может не быть в твоих знаниях. Возвращает список результатов с заголовками, ссылками и сниппетами — процитируй источники в ответе.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Короткий поисковый запрос (как в Google)." },
      },
      required: ["query"],
    },
  },
};

const WEB_IMAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "find_web_image",
    description:
      "Найти реальное фото, схему, иллюстрацию или изображение в интернете. Используй ТОЛЬКО когда пользователь спрашивает, как выглядит объект, предмет, схема, география, животное, чертёж, концепт ('как выглядит ...', 'покажи фото ...', 'найди картинку ...', 'схема ...'). Не вызывай этот инструмент для обычных текстовых сообщений — вызывай только когда запрос этого требует.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Поисковый запрос для поиска реальной картинки/фото в интернете (на английском или русском языке).",
        },
        caption: {
          type: "string",
          description: "Короткое пояснение к наденному фото.",
        },
      },
      required: ["query"],
    },
  },
};

const CALENDAR_TOOL = {
  type: "function" as const,
  function: {
    name: "manage_calendar_event",
    description:
      "Запланировать, найти, обновить или удалить событие/напоминание в Google Календаре пользователя. Используй всегда, когда пользователь просит добавить встречу, поставить напоминание, проверить расписание или изменить время.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "list", "update", "delete", "check_free_busy"],
          description: "Действие: create (создать), list (найти/список), update (изменить), delete (удалить), check_free_busy (проверить свободное время).",
        },
        summary: { type: "string", description: "Заголовок встречи или названия напоминания." },
        description: { type: "string", description: "Описание, повестка или дополнительные примечания." },
        start_time: { type: "string", description: "Дата и время начала в ISO 8601 (например 2026-10-30T15:00:00+03:00) или дата YYYY-MM-DD." },
        end_time: { type: "string", description: "Дата и время окончания в ISO 8601 или дата YYYY-MM-DD." },
        location: { type: "string", description: "Место проведения или ссылка на созвон (Google Meet и т.д.)." },
        reminder_minutes: { type: "number", description: "За сколько минут напомнить (например 15)." },
        event_id: { type: "string", description: "ID события при изменении или удалении." },
        query: { type: "string", description: "Поисковый запрос при поиске." },
      },
      required: ["action"],
    },
  },
};

const TASKS_TOOL = {
  type: "function" as const,
  function: {
    name: "manage_google_task",
    description:
      "Создать, найти, обновить или завершить задачу в Google Tasks пользователя. Используй всегда, когда пользователь просит добавить задачу в список дел, отменить/завершить задачу или показать свои задачи.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "list", "complete", "update", "delete"],
          description: "Действие: create (создать), list (показать список), complete (завершить), update (изменить), delete (удалить).",
        },
        title: { type: "string", description: "Название или заголовок задачи." },
        notes: { type: "string", description: "Заметки, описание или подзадачи." },
        due: { type: "string", description: "Срок выполнения в ISO 8601 (например 2026-10-30T18:00:00Z или YYYY-MM-DD)." },
        task_id: { type: "string", description: "ID задачи при обновлении, завершении или удалении." },
        task_list_id: { type: "string", description: "ID списка задач (по умолчанию @default)." },
      },
      required: ["action"],
    },
  },
};

const GMAIL_TOOL = {
  type: "function" as const,
  function: {
    name: "manage_gmail",
    description:
      "Найти, прочитать, составить или отправить письмо через Gmail пользователя. Поддерживает вложения (сгенерированные открытки/изображения, приложенные пользователем файлы, документы из памяти). Используй всегда, когда пользователь просит проверить почту, найти письмо, составить или отправить email (например: 'отправь открытку маме', 'отправь отчет боссу').",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "read", "send", "search"],
          description: "Действие: list (список/поиск), read (прочитать письмо), send (создать/отправить), search (найти по запросу).",
        },
        to: { type: "string", description: "Email получателя при отправке (например email мамы, босса, коллеги)." },
        subject: { type: "string", description: "Тема письма." },
        body: { type: "string", description: "Текст письма." },
        message_id: { type: "string", description: "ID письма при чтении." },
        query: { type: "string", description: "Поисковый запрос по почте." },
        attachments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filename: { type: "string", description: "Имя файла вложения (например 'birthday_card.png', 'report.pdf')." },
              source: {
                type: "string",
                enum: ["generated_image", "user_upload", "memory"],
                description: "Источник вложения: generated_image (сгенерированная открытка/фото), user_upload (файл, прикрепленный пользователем к сообщению), memory (файл/документ из памяти).",
              },
              data_url: { type: "string", description: "Data-URL вложения если доступен." },
              memory_id: { type: "string", description: "ID записи памяти, если вложение берется из памяти." },
            },
            required: ["filename"],
          },
          description: "Файлы или открытки для прикрепления к письму.",
        },
      },
      required: ["action"],
    },
  },
};

const MEMORY_TOOL = {
  type: "function" as const,
  function: {
    name: "search_and_read_memory",
    description:
      "Найти, прочитать или глубоко проанализировать долговременную память пользователя и прикрепленные к ней вложения (документы, текстовые файлы, отчеты, контакты родственников, босса, коллег, заметки, предпочтения). Используй ВСЕГДА, когда пользователь ссылается на контакты ('моя мама', 'мой босс', 'друг'), прошлые договоренности, сохраненные файлы или документы в памяти.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Поисковый запрос по памяти (например: 'мама email', 'босс контакты', 'отчет', 'проект').",
        },
        memory_id: {
          type: "string",
          description: "ID конкретной записи памяти, если нужно прочитать её полное вложение/текст.",
        },
      },
    },
  },
};

const REFUSAL_TOOL = {
  type: "function" as const,
  function: {
    name: "refuse_unsupported_request",
    description:
      "Используй этот инструмент ВСЕГДА, когда пользователь просит выполнить действие, которое ты физически или технически НЕ УМЕЕШЬ делать (например: физические действия в реальном мире, звонки по сотовой связи, SMS, банковские операции/переводы денег, взлом сторонних сервисов вживую, управление домашними устройствами без подключенного API, публикация в сторонние соцсети). Сразу честно признай неспособность, укажи техническую причину и предложи альтернативу из того, что ты реально умеешь.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Что конкретно запросил пользователь (например: 'позвонить на номер +7...', 'перевести деньги на карту', 'сварить кофе', 'взломать аккаунт в реальном времени').",
        },
        reason: {
          type: "string",
          description: "Техническая или физическая причина, почему это невозможно выполнить напрямую (например: 'отсутствует доступ к GSM-модулю и телефонии', 'отсутствует доступ к банковским шлюзам и платежным API', 'отсутствует физическое тело для взаимодействия с материальным миром').",
        },
        alternative: {
          type: "string",
          description: "Что ты реально МОЖЕШЬ сделать взамен (например: 'написать готовый скрипт для телефонии/API', 'составить текст звонка/письма', 'создать задачу в Google Tasks или встречу в Календаре', 'найти актуальную информацию в сети', 'написать код').",
        },
      },
      required: ["action", "reason", "alternative"],
    },
  },
};

type WebResult = { title: string; url: string; snippet: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

async function webSearch(query: string): Promise<WebResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const html = await res.text();
  const results: WebResult[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && results.length < 6) {
    let href = m[1];
    // DDG wraps external links: /l/?uddg=<encoded>
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) {
      try { href = decodeURIComponent(uddg[1]); } catch { /* keep */ }
    }
    results.push({
      title: stripTags(m[2]).slice(0, 200),
      url: href,
      snippet: stripTags(m[3]).slice(0, 400),
    });
  }
  return results;
}

type WebImageResult = {
  title: string;
  url: string;
  thumbnail?: string;
  source?: string;
};

async function searchWebImages(query: string): Promise<WebImageResult[]> {
  const results: WebImageResult[] = [];

  // 1. Try DuckDuckGo Images
  try {
    const htmlRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9,ru;q=0.8",
      },
      signal: AbortSignal.timeout(4000),
    });
    const html = await htmlRes.text();
    const vqdMatch = html.match(/vqd=['"]?([^'"&]+)/) || html.match(/vqd=([\d-]+)/);
    if (vqdMatch) {
      const vqd = vqdMatch[1];
      const imgRes = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&vqd=${vqd}`, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "referer": "https://duckduckgo.com/",
        },
        signal: AbortSignal.timeout(4000),
      });
      if (imgRes.ok) {
        const data = (await imgRes.json()) as { results?: Array<{ title?: string; image?: string; thumbnail?: string; url?: string }> };
        if (data.results && data.results.length > 0) {
          for (const item of data.results.slice(0, 4)) {
            if (item.image && (item.image.startsWith("http://") || item.image.startsWith("https://"))) {
              results.push({
                title: stripTags(item.title || query).slice(0, 150),
                url: item.image,
                thumbnail: item.thumbnail || item.image,
                source: item.url ? new URL(item.url).hostname : "duckduckgo.com",
              });
            }
          }
        }
      }
    }
  } catch {
    /* ignore and try fallback */
  }

  // 2. Fallback: Wikimedia Commons search
  if (results.length === 0) {
    try {
      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&prop=imageinfo&iiprop=url|mime&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=5&format=json&origin=*`;
      const wikiRes = await fetch(wikiUrl, { signal: AbortSignal.timeout(4000) });
      if (wikiRes.ok) {
        const json = (await wikiRes.json()) as any;
        const pages = json.query?.pages || {};
        for (const key of Object.keys(pages)) {
          const page = pages[key];
          const info = page.imageinfo?.[0];
          if (info?.url) {
            results.push({
              title: (page.title || query).replace(/^File:/i, "").replace(/\.[a-z0-9]+$/i, ""),
              url: info.url,
              thumbnail: info.url,
              source: "wikimedia.org",
            });
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return results;
}

type GeneratedImage = {
  id: string;
  title: string;
  prompt: string;
  description?: string;
  dataUrl: string;
};

// --- Vision: извлечение прикреплённых изображений из текста сообщений ---
// Клиент вставляет картинки как markdown с data-URL: ![name](data:image/png;base64,...)
const DATA_URL_RE = /!\[[^\]]*\]\((data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+)\)/g;

/** Текст сообщения без base64-картинок — для фильтров, памяти и чувствительных тем. */
function stripImageDataUrls(text: string): string {
  return text.replace(DATA_URL_RE, "[прикреплённое изображение]").trim();
}

type ApiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * Превращает сообщения в формат DeepSeek: последние сообщение пользователя
 * с прикреплёнными картинками уходит мультимодальным (text + image_url parts),
 * а из старых сообщений истории изображения вырезаются, чтобы не раздувать токены.
 */
function toApiMessages(
  messages: Array<{ role: string; content: string | null }>,
): Array<{ role: string; content: string | ApiContentPart[] }> {
  // Индексы сообщений пользователя с картинками: храним в запросе последние 3,
  // чтобы модель помнила фото и на follow-up вопросы («а что в левом углу?»).
  const userImgIndexes = messages
    .map((m, i) => (m.role === "user" && typeof m.content === "string" && m.content.includes("data:image/") ? i : -1))
    .filter((i) => i >= 0);
  const keepImageSet = new Set(userImgIndexes.slice(-3));

  return messages.map((m, index) => {
    if (m.role !== "user" || typeof m.content !== "string" || !m.content.includes("data:image/")) {
      return { role: m.role, content: m.content ?? "" };
    }

    // Старые изображения сверх лимита вырезаем, чтобы не раздувать токены.
    if (!keepImageSet.has(index)) {
      return { role: m.role, content: stripImageDataUrls(m.content) };
    }

    const matches = [...m.content.matchAll(DATA_URL_RE)];
    if (matches.length === 0) return { role: m.role, content: m.content };

    const parts: ApiContentPart[] = [];
    let cursor = 0;
    for (const match of matches) {
      const textBefore = m.content.slice(cursor, match.index).trim();
      if (textBefore) parts.push({ type: "text", text: textBefore });
      parts.push({ type: "image_url", image_url: { url: match[1] } });
      cursor = (match.index ?? 0) + match[0].length;
    }
    const tail = m.content.slice(cursor).trim();
    if (tail) parts.push({ type: "text", text: tail });
    // DeepSeek требует хотя бы один текстовый part рядом с изображением.
    if (!parts.some((p) => p.type === "text")) {
      parts.unshift({ type: "text", text: "(пользователь прикрепил изображение — проанализируй его)" });
    }
    if (parts.length === 1 && parts[0].type === "text") {
      return { role: m.role, content: parts[0].text };
    }
    return { role: m.role, content: parts };
  });
}

// Генерация изображений: мост через Gemini (@google/genai, gemini-3.1-flash-lite-image) с fallback на Pollinations Flux.
async function generateImage(prompt: string): Promise<string> {
  const res = await generateImageWithGemini(prompt);
  return res.dataUrl;
}

// Стриминг fallback-ответа через Pollinations (OpenAI-совместимый /v1/chat/completions).
// Используется ТОЛЬКО для тем, которые базовая модель цензурирует (Тяньаньмэнь,
// независимость Тайваня, Синьцзян и т.п.). Никаких инструментов — просто текст.
const FALLBACK_MODEL = "openai/gpt-5.4-nano";

async function streamFallbackToClient(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  send: (event: string, data: string) => void,
): Promise<string> {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) throw new Error("POLLINATIONS_API_KEY is not configured");

  const upstream = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: FALLBACK_MODEL,
      stream: true,
      messages,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    console.error("Fallback error", upstream.status, text.slice(0, 500));
    throw new Error(`fallback ${upstream.status}`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          assistantText += delta;
          send("delta", JSON.stringify(delta));
        }
      } catch {
        // ignore
      }
    }
  }
  return assistantText;
}



type HfTool = {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
};

// Официальный IGseek API.
const PRIMARY_CHAT_MODEL = "deepseek-chat";       // IGseek-V3, поддерживает tools
const REASONER_MODEL = "deepseek-reasoner"; // IGseek-R1, reasoning_content

// UI-модели → параметры вызова IGseek.
// Публичный API отдаёт только chat / reasoner,
// поэтому вариации между «Pro / Chat / Flash» задаём через temperature и top_p.
type UiModel = "instinct" | "chat" | "f1";
const MODEL_PROFILES: Record<UiModel, { model: string; temperature: number; top_p: number }> = {
  instinct: { model: PRIMARY_CHAT_MODEL, temperature: 0.8, top_p: 0.95 }, // v4 pro
  chat:     { model: PRIMARY_CHAT_MODEL, temperature: 1.1, top_p: 0.95 }, // chat
  f1:       { model: PRIMARY_CHAT_MODEL, temperature: 0.4, top_p: 0.9 },  // v4 flash
};

async function callPrimary(
  apiKey: string,
  messages: ChatMessage[],
  tools: HfTool[] | null,
  reasoning: boolean,
  uiModel: UiModel,
) {
  const profile = MODEL_PROFILES[uiModel];
  return fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: reasoning ? REASONER_MODEL : profile.model,
      stream: true,
      messages: toApiMessages(messages),
      temperature: profile.temperature,
      top_p: profile.top_p,
      ...(tools && tools.length ? { tools, tool_choice: "auto" } : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });
}



export async function handleChatPost(request: Request): Promise<Response> {
  const apiKey = process.env.DEEPSEEK_API_KEY || "sk-39c4bfbe3e164ae3945f56382f8fb94f";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }


        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ error: "Invalid request" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const cleanMessages = parsed.messages.filter((m) => m.role !== "system");

        // Long-term memory: identify user via bearer token, load relevant memories.
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
        const authed = token ? await getUserFromToken(token) : null;

        // Текст последнего сообщения без base64-картинок — для фильтров и памяти.
        const lastUserMessage = stripImageDataUrls(
          [...cleanMessages].reverse().find((m) => m.role === "user")?.content ?? "",
        );

        // Fallback is a one-turn fallback only. Keep its sensitive user/assistant pairs
        // out of later primary requests so fallback answer cannot affect the model's
        // behavior on an unrelated follow-up.
        const primaryHistory = cleanMessages.filter((message, index, messages) => {
          if (message.role === "user" && isChinaSensitive(stripImageDataUrls(message.content))) return false;
          if (message.role !== "assistant") return true;

          for (let previous = index - 1; previous >= 0; previous -= 1) {
            const candidate = messages[previous];
            if (candidate.role === "user") return !isChinaSensitive(stripImageDataUrls(candidate.content));
          }
          return true;
        });

        // Content filters — блокируем террор/оружие ДО обращения к модели.
        const preCheck = checkContent(lastUserMessage);
        if (preCheck.blocked) {
          const refusal = refusalMessage(preCheck.category, "ru");
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              const encoder = new TextEncoder();
              const send = (event: string, data: string) =>
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
              send("delta", JSON.stringify(refusal));
              send("done", "1");
              controller.close();
            },
          });
          return new Response(stream, {
            status: 200,
            headers: {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-cache, no-transform",
              "x-accel-buffering": "no",
            },
          });
        }


        let memories: MemoryRow[] = [];
        if (authed && lastUserMessage) {
          memories = await loadRelevantMemories(authed.client, authed.id, lastUserMessage, 8);
        }

        const memoryBlock = memories.length
          ? `\n\nUSER LONG-TERM MEMORY (relevant facts and attachments remembered from previous conversations — treat as trusted context, refer to naturally, do not mention IDs):\n${memories
              .map((m) => {
                let s = `- [id:${m.id}] (${m.kind}) ${m.content}`;
                if (m.attachment) {
                  s += ` [Вложение в памяти: "${m.attachment.name}" (${m.attachment.type}${m.attachment.textContent ? `, текст: "${m.attachment.textContent.slice(0, 500)}"` : ""})]`;
                }
                return s;
              })
              .join("\n")}`
          : "";

        const userAttachmentsBlock = parsed.userAttachments?.length
          ? `\n\nUSER ATTACHMENTS IN THIS MESSAGE (files/documents attached directly by the user):\n${parsed.userAttachments
              .map((a, i) => `- [attachment_${i + 1}] "${a.name}" (${a.type || "file"})`)
              .join("\n")}`
          : "";

        const gmailStatusInfo = parsed.gmailConnected
          ? "Gmail status: User is authenticated. You can freely read, search, draft, or send emails with attachments via manage_gmail."
          : "Gmail status: User is NOT yet signed into Gmail. When the user asks anything about email, ALWAYS call manage_gmail — the client interface will instantly display a Google sign-in modal for the user, after which your email action will be executed.";

        const capabilities = `You have full autonomy to decide when to call tools. The user does not need to choose tools manually.
${gmailStatusInfo}
Tools available to you:
- search_and_read_memory: прочитать память пользователя или вложения в памяти (документы, файлы, контакты мамы/босса/коллег, отчеты). Используй, когда нужно найти контакты или изучить файл из памяти.
- manage_gmail: search, read, compose, or send emails via Gmail. ALWAYS call this tool whenever the user asks to send an email, draft an email, read inbox, or search messages! The client handles Google authentication automatically.
  ВЛОЖЕНИЯ В ПИСЬМА:
  1) Сгенерированные открытки/изображения: когда пользователь просит "сгенерируй открытку с днем рождения и отправь её моей маме" — сначала вызови generate_image с детальным промптом открытки (для Gemini/генератора), затем manage_gmail с to: email мамы из памяти, поздравлением и attachments: [{ filename: "birthday_card.png", source: "generated_image" }].
  2) Файлы от пользователя: когда пользователь прикрепил файл и говорит "Отправь моему боссу отчет" — найди email босса в памяти (или спроси), вызови manage_gmail с to: email босса, темой и attachments: [{ filename: "<имя файла>", source: "user_upload" }].
  3) Файлы из памяти: attachments: [{ filename: "<имя файла>", source: "memory", memory_id: "<id>" }].
- generate_image: генерация картинок и открыток (мост с Gemini Image). DeepSeek формулирует детальный визуальный промпт на английском, который генерируется прямо в чате карточкой и может быть отправлен по почте!
- refuse_unsupported_request: ЧЕСТНЫЙ ОТКАЗ И ГРАНИЦЫ ВОЗМОЖНОСТЕЙ. Используй этот инструмент НЕМЕДЛЕННО, если пользователь просит сделать то, что ты физически или технически НЕ УМЕЕШЬ (например: реальные телефонные звонки по сотовой связи, SMS с SIM-карты, банковские переводы денег, физические действия в материальном мире, живой взлом закрытых серверов, управление домашней техникой без интеграций, публикации в чужие соцсети без API). Не фантазируй и не притворяйся, что сделал невозможное — сразу вызывай refuse_unsupported_request и честно скажи об этом, предложив конструктивную альтернативу (написать код, скрипт, текст, найти инфу, создать задачу/напоминание).
- manage_calendar_event: create, list, update or delete events/reminders in Google Calendar. Call this tool whenever the user asks to schedule a meeting, set a reminder, check schedule or manage calendar events.
- manage_google_task: create, list, complete or update tasks in Google Tasks. Call this tool whenever the user asks to add a task, check todo list, mark a task done or manage tasks.
- create_artifact: create a downloadable file card (code, HTML, markdown, document, config). Use it for substantial code or documents.
- find_web_image: search and find REAL web photos, diagrams, or illustrations in the internet. Call this tool ONLY when user asks how something real looks ('как выглядит ...', 'покажи фото ...', 'найди картинку ...', 'схема ...') or asks to show a photo/picture of an object, person, place, animal or concept. Do NOT call this tool for normal conversational messages.
${parsed.webSearch ? "\n- web_search: search the live internet. Use it whenever the user asks about current events, recent facts, prices, news or anything you might not know. Cite sources briefly in the answer." : ""}
Diagrams & Charts:
- When asked to create flowcharts, diagrams, schemas, graphs, mind maps, process flows or electrical/logic schematics, ALWAYS write a \`\`\`mermaid code block! Do NOT draw wide horizontal ASCII art schemas with long lines that break mobile layouts.
Routing rules — decide automatically, never ask the user which engine to use:
- Impossible / unsupported requests (phone calls, banking, physical acts, external live hacks): call refuse_unsupported_request immediately!
- Text answers, analysis, code, search: you answer directly.
- Diagrams/Schemas/Flowcharts: write a \`\`\`mermaid code block directly in your text answer.
- Real photos / images: call find_web_image when requested or appropriate.
- Calendar, Tasks, Gmail integrations: ALWAYS call manage_calendar_event, manage_google_task, or manage_gmail autonomously as needed to fulfill user requests directly in the chat!
- Photos or screenshots ATTACHED by the user: you can see them — analyze the image content yourself and answer; never call generate_image for analyzing attachments.
- Requests to CREATE a picture: call generate_image with a rich English visual prompt (subject, style, lighting, composition).
Never output raw tool-call markup as part of your visible answer.
After using a tool, briefly confirm what was created or executed and do not repeat the full content.`;
        const systemMessage: ChatMessage = {
          role: "system",
          content: `${buildSystemPrompt(parsed.agent as AgentId)}\n\n${capabilities}${memoryBlock}${userAttachmentsBlock}`,
        };
        const baseMessages: ChatMessage[] = [
          systemMessage,
          ...primaryHistory.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
        ];


        // reasoning-модель инструменты не поддерживает — включаем tools только для чат-модели.
        const supportsTools = !parsed.reasoning;
        const activeTools = supportsTools
          ? [ARTIFACT_TOOL, IMAGE_TOOL, WEB_IMAGE_TOOL, CALENDAR_TOOL, TASKS_TOOL, GMAIL_TOOL, MEMORY_TOOL, REFUSAL_TOOL, ...(parsed.webSearch ? [WEB_SEARCH_TOOL] : [])]
          : [];

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const encoder = new TextEncoder();
            const send = (event: string, data: string) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
            };

            type StreamOutcome = {
              finishReason: string | null;
              toolCalls: ToolCall[];
              assistantText: string;
            };

            async function runStream(
              messages: ChatMessage[],
              tools: typeof activeTools,
              forwardText: boolean,
            ): Promise<StreamOutcome> {
              const upstream = await callPrimary(
                apiKey!,
                messages,
                tools.length ? tools : null,
                parsed.reasoning,
                parsed.model,
              );
              if (!upstream.ok || !upstream.body) {
                const text = await upstream.text().catch(() => "");
                console.error("Primary error", upstream.status, text.slice(0, 500));
                throw new Error(`upstream ${upstream.status}`);
              }

              const reader = upstream.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              const toolAcc = new Map<number, { id: string; name: string; args: string }>();
              let finishReason: string | null = null;
              let assistantText = "";

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const raw of lines) {
                  const line = raw.trim();
                  if (!line.startsWith("data:")) continue;
                  const payload = line.slice(5).trim();
                  if (payload === "[DONE]") continue;
                  try {
                    const json = JSON.parse(payload) as {
                      choices?: Array<{
                        delta?: {
                          content?: string;
                          reasoning_content?: string;
                          tool_calls?: Array<{
                            index: number;
                            id?: string;
                            function?: { name?: string; arguments?: string };
                          }>;
                        };
                        finish_reason?: string | null;
                      }>;
                    };
                    const choice = json.choices?.[0];
                    const delta = choice?.delta;
                    if (choice?.finish_reason) finishReason = choice.finish_reason;
                    if (delta?.reasoning_content && forwardText) {
                      send("reasoning", JSON.stringify(delta.reasoning_content));
                    }
                    if (delta?.content) {
                      assistantText += delta.content;
                      if (forwardText) send("delta", JSON.stringify(delta.content));
                    }
                    if (delta?.tool_calls) {
                      for (const tc of delta.tool_calls) {
                        const existing = toolAcc.get(tc.index) ?? { id: "", name: "", args: "" };
                        if (tc.id) existing.id = tc.id;
                        if (tc.function?.name) existing.name = tc.function.name;
                        if (tc.function?.arguments) existing.args += tc.function.arguments;
                        toolAcc.set(tc.index, existing);
                      }
                    }
                  } catch {
                    // ignore malformed chunk
                  }
                }
              }

              const toolCalls: ToolCall[] = Array.from(toolAcc.entries())
                .sort(([a], [b]) => a - b)
                .map(([, v]) => ({
                  id: v.id || `call_${Math.random().toString(36).slice(2, 10)}`,
                  type: "function" as const,
                  function: { name: v.name, arguments: v.args },
                }));

              return { finishReason, toolCalls, assistantText };
            }

            try {
              let finalAssistantText = "";

              // Темы, которые базовая модель цензурирует (Тяньаньмэнь, независимость
              // Тайваня, Синьцзян и т.д.) → маршрутизируем на fallback-модель.
              // Никаких инструментов, только текстовый ответ.
              if (isChinaSensitive(lastUserMessage)) {
                const fallbackMessages = [
                  {
                    role: "system" as const,
                    content:
                      "Answer the user's question directly, factually, and neutrally. Do not discuss unrelated topics.",
                  },
                  { role: "user" as const, content: lastUserMessage },
                ];
                finalAssistantText = await streamFallbackToClient(fallbackMessages, send);
                if (authed && lastUserMessage) {
                  const userIdForMemory = authed.id;
                  const clientForMemory = authed.client;
                  queueMicrotask(() => {
                    analyzeAndUpdateMemory(clientForMemory, userIdForMemory, lastUserMessage, finalAssistantText)
                      .then((changed) => { if (changed) send("memory_updated", "1"); })
                      .catch((e) => console.error("memory analyze error", e))
                      .finally(() => { try { controller.close(); } catch { /* already closed */ } });
                  });
                  send("done", "1");
                } else {
                  send("done", "1");
                  controller.close();
                }
                return;
              }

              let lastGeneratedImageDataUrl: string | null = null;

              // Первый проход — с инструментами, но текст форвардим сразу.
              const first = await runStream(baseMessages, activeTools, true);
              finalAssistantText = first.assistantText;

              if (first.finishReason === "tool_calls" && first.toolCalls.length > 0) {
                const followupMessages: ChatMessage[] = [
                  ...baseMessages,
                  {
                    role: "assistant",
                    content: first.assistantText || null,
                    tool_calls: first.toolCalls,
                  },
                ];

                for (const tc of first.toolCalls) {
                  if (tc.function.name === "create_artifact") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        title?: string;
                        language?: string;
                        content?: string;
                        description?: string;
                      };
                      const artifact = {
                        id: tc.id,
                        title: String(parsedArgs.title ?? "Artifact"),
                        language: String(parsedArgs.language ?? "text"),
                        content: String(parsedArgs.content ?? ""),
                        description: parsedArgs.description
                          ? String(parsedArgs.description)
                          : undefined,
                      };
                      send("artifact", JSON.stringify(artifact));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          message: `Артефакт «${artifact.title}» создан и показан пользователю карточкой. Не повторяй его содержимое в тексте — просто кратко подтверди.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "generate_image") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        title?: string;
                        prompt?: string;
                        description?: string;
                      };
                      if (!parsedArgs.prompt) throw new Error("missing prompt");
                      const imageTitle = String(parsedArgs.title ?? "Generated image");
                      send("image_start", JSON.stringify({ title: imageTitle, prompt: parsedArgs.prompt }));
                      const dataUrl = await generateImage(parsedArgs.prompt);
                      lastGeneratedImageDataUrl = dataUrl;
                      const image: GeneratedImage = {
                        id: tc.id,
                        title: imageTitle,
                        prompt: String(parsedArgs.prompt),
                        description: parsedArgs.description
                          ? String(parsedArgs.description)
                          : undefined,
                        dataUrl,
                      };
                      send("image", JSON.stringify(image));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          message: `Изображение «${image.title}» сгенерировано и показано пользователю карточкой. Не описывай картинку подробно — просто кратко подтверди.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "web_search") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as { query?: string };
                      const query = String(parsedArgs.query ?? "").trim();
                      if (!query) throw new Error("missing query");
                      send("web_search", JSON.stringify({ query }));
                      const results = await webSearch(query);
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: true, query, results }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "find_web_image") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as { query?: string; caption?: string };
                      const query = String(parsedArgs.query ?? "").trim();
                      if (!query) throw new Error("missing query");
                      const imgResults = await searchWebImages(query);
                      const webImagePayload = {
                        id: tc.id,
                        query,
                        caption: parsedArgs.caption,
                        images: imgResults,
                      };
                      send("web_image", JSON.stringify(webImagePayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          query,
                          count: imgResults.length,
                          message: `Найдены изображения по запросу "${query}" (${imgResults.length} шт.) и отображены пользователю карточкой.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "manage_calendar_event") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        action?: string;
                        summary?: string;
                        description?: string;
                        start_time?: string;
                        end_time?: string;
                        location?: string;
                        reminder_minutes?: number;
                        event_id?: string;
                        query?: string;
                      };
                      const calendarPayload = {
                        id: tc.id,
                        action: parsedArgs.action || "create",
                        summary: parsedArgs.summary || "Событие календаря",
                        description: parsedArgs.description,
                        location: parsedArgs.location,
                        startTime: parsedArgs.start_time,
                        endTime: parsedArgs.end_time,
                        reminderMinutes: parsedArgs.reminder_minutes,
                        eventId: parsedArgs.event_id,
                        query: parsedArgs.query,
                      };
                      send("calendar_event", JSON.stringify(calendarPayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          action: calendarPayload.action,
                          event: calendarPayload,
                          message: `Событие «${calendarPayload.summary}» (${calendarPayload.action}) передано в интерфейс календаря пользователя и отображено карточкой.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "manage_google_task") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        action?: string;
                        title?: string;
                        notes?: string;
                        due?: string;
                        task_id?: string;
                        task_list_id?: string;
                      };
                      const taskPayload = {
                        id: tc.id,
                        action: parsedArgs.action || "create",
                        title: parsedArgs.title || "Новая задача",
                        notes: parsedArgs.notes,
                        due: parsedArgs.due,
                        taskId: parsedArgs.task_id,
                        taskListId: parsedArgs.task_list_id || "@default",
                        status: parsedArgs.action === "complete" ? "completed" : "needsAction",
                      };
                      send("task_event", JSON.stringify(taskPayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          action: taskPayload.action,
                          task: taskPayload,
                          message: `Задача «${taskPayload.title}» (${taskPayload.action}) передана в интерфейс Google Tasks пользователя и показана карточкой.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "manage_gmail") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        action?: string;
                        to?: string;
                        subject?: string;
                        body?: string;
                        message_id?: string;
                        query?: string;
                        attachments?: Array<{
                          filename?: string;
                          source?: "generated_image" | "user_upload" | "memory";
                          data_url?: string;
                          memory_id?: string;
                        }>;
                      };

                      const resolvedAttachments: Array<{ filename: string; mimeType?: string; dataUrl?: string }> = [];

                      if (Array.isArray(parsedArgs.attachments) && parsedArgs.attachments.length > 0) {
                        for (const att of parsedArgs.attachments) {
                          let dataUrl = att.data_url;
                          let filename = att.filename || "attachment";

                          if (!dataUrl && (att.source === "generated_image" || filename.includes("card") || filename.includes("image") || filename.includes("открытк")) && lastGeneratedImageDataUrl) {
                            dataUrl = lastGeneratedImageDataUrl;
                          }

                          if (!dataUrl && parsed.userAttachments?.length) {
                            const match = parsed.userAttachments.find((ua) => ua.name.toLowerCase() === filename.toLowerCase()) || parsed.userAttachments[0];
                            if (match) {
                              dataUrl = match.dataUrl;
                              filename = match.name;
                            }
                          }

                          if (!dataUrl && authed && att.memory_id) {
                            const targetMem = memories.find((m) => m.id === att.memory_id);
                            if (targetMem?.attachment?.dataUrl) {
                              dataUrl = targetMem.attachment.dataUrl;
                              filename = targetMem.attachment.name;
                            }
                          }

                          if (dataUrl) {
                            const mimeMatch = dataUrl.match(/^data:([^;]+);/);
                            resolvedAttachments.push({ filename, mimeType: mimeMatch ? mimeMatch[1] : undefined, dataUrl });
                          }
                        }
                      } else if (lastGeneratedImageDataUrl && (lastUserMessage.toLowerCase().includes("отправ") || lastUserMessage.toLowerCase().includes("send")) && (lastUserMessage.toLowerCase().includes("открытк") || lastUserMessage.toLowerCase().includes("фото") || lastUserMessage.toLowerCase().includes("картинк") || lastUserMessage.toLowerCase().includes("карточк"))) {
                        resolvedAttachments.push({
                          filename: "greeting_card.png",
                          mimeType: "image/png",
                          dataUrl: lastGeneratedImageDataUrl,
                        });
                      } else if (parsed.userAttachments?.length && (lastUserMessage.toLowerCase().includes("отправ") || lastUserMessage.toLowerCase().includes("send"))) {
                        for (const ua of parsed.userAttachments) {
                          const mimeMatch = ua.dataUrl.match(/^data:([^;]+);/);
                          resolvedAttachments.push({
                            filename: ua.name,
                            mimeType: mimeMatch ? mimeMatch[1] : undefined,
                            dataUrl: ua.dataUrl,
                          });
                        }
                      }

                      const gmailPayload = {
                        id: tc.id,
                        action: parsedArgs.action || "list",
                        to: parsedArgs.to,
                        subject: parsedArgs.subject || "Письмо Gmail",
                        body: parsedArgs.body,
                        messageId: parsedArgs.message_id,
                        query: parsedArgs.query,
                        attachments: resolvedAttachments,
                      };
                      send("gmail_event", JSON.stringify(gmailPayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          action: gmailPayload.action,
                          gmail: gmailPayload,
                          message: `Интеграция Gmail (${gmailPayload.action}) передана в клиентский интерфейс почты и отображена карточкой.${resolvedAttachments.length ? ` Вложено файлов: ${resolvedAttachments.map((a) => a.filename).join(", ")}.` : ""}`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "search_and_read_memory") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as { query?: string; memory_id?: string };
                      let results: MemoryRow[] = [];
                      if (authed) {
                        const allMemories = await listAllMemories(authed.client, authed.id);
                        if (parsedArgs.memory_id) {
                          results = allMemories.filter((m) => m.id === parsedArgs.memory_id);
                        } else if (parsedArgs.query) {
                          const q = parsedArgs.query.toLowerCase();
                          results = allMemories.filter((m) =>
                            m.content.toLowerCase().includes(q) ||
                            m.kind.toLowerCase().includes(q) ||
                            (m.attachment?.name && m.attachment.name.toLowerCase().includes(q)) ||
                            (m.attachment?.textContent && m.attachment.textContent.toLowerCase().includes(q))
                          );
                          if (results.length === 0) results = allMemories.slice(0, 10);
                        } else {
                          results = allMemories.slice(0, 10);
                        }
                      }
                      const memoryDetails = results.map((m) => ({
                        id: m.id,
                        kind: m.kind,
                        content: m.content,
                        attachment: m.attachment
                          ? {
                              name: m.attachment.name,
                              type: m.attachment.type,
                              size: m.attachment.size,
                              textContent: m.attachment.textContent || "(бинарное вложение или изображение)",
                            }
                          : null,
                      }));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          count: memoryDetails.length,
                          memories: memoryDetails,
                          message: `Найдено записей в памяти: ${memoryDetails.length}. Используй их контекст и вложения для ответа пользователю или отправки писем.`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "refuse_unsupported_request") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        action?: string;
                        reason?: string;
                        alternative?: string;
                      };
                      const refusalPayload = {
                        id: tc.id,
                        action: String(parsedArgs.action || "Запрошенное действие"),
                        reason: String(parsedArgs.reason || "Выходит за рамки технических возможностей"),
                        alternative: String(parsedArgs.alternative || "Могу предложить помощь с кодом, текстом или информацией"),
                      };
                      send("refusal_event", JSON.stringify(refusalPayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          refused: true,
                          message: `Честный отказ зафиксирован: ты прямо признаешь, что не умеешь «${refusalPayload.action}» (причина: ${refusalPayload.reason}). Теперь скажи пользователю прямо, без виляний и без морализаторства: четко подтверди, что не умеешь это делать, и предложи альтернативу: «${refusalPayload.alternative}».`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else {
                    followupMessages.push({
                      role: "tool",
                      tool_call_id: tc.id,
                      content: JSON.stringify({ ok: false, error: "unknown_tool" }),
                    });
                  }

                }

                // Второй проход — без инструментов, стримим ответ модели.
                const second = await runStream(followupMessages, [], true);
                finalAssistantText = second.assistantText || finalAssistantText;
              }

              // Fire-and-forget: analyze the exchange and update long-term memory.
              if (authed && lastUserMessage) {
                const userIdForMemory = authed.id;
                const clientForMemory = authed.client;
                queueMicrotask(() => {
                  analyzeAndUpdateMemory(clientForMemory, userIdForMemory, lastUserMessage, finalAssistantText)
                    .then((changed) => { if (changed) send("memory_updated", "1"); })
                    .catch((e) => console.error("memory analyze error", e))
                    .finally(() => {
                      try { controller.close(); } catch { /* already closed */ }
                    });
                });
                send("done", "1");
              } else {
                send("done", "1");
                controller.close();
              }
            } catch (err) {
              console.error("stream error", err);
              send("error", JSON.stringify("stream_failed"));
              try { controller.close(); } catch { /* ignore */ }
            }
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
          },
        });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: any) => handleChatPost(request),
    },
  },
} as any);

