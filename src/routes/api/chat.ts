import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  buildEffectiveWorkspacePrompt,
  getCustomGlobalPromptForWorkspace,
  type AgentId,
} from "../../lib/system-prompts";
import {
  analyzeAndUpdateMemory,
  createMemory,
  deleteMemory,
  getUserFromToken,
  loadRelevantMemories,
  listAllMemories,
  updateMemory,
  type MemoryAttachment,
  type MemoryRow,
} from "../../lib/memory-server";
import { checkContent, refusalMessage } from "../../lib/content-filters";
import { isChinaSensitive } from "../../lib/sensitive-topics";
import { editImageWithGptImage2, generateImageWithGptImage2 } from "../../lib/apimira-image";
import {
  checkServerPhotoQuota,
  consumeServerPhotoQuota,
  resolvePhotoQuotaActorKey,
} from "../../lib/photo-limits-server";
import { searchWebLive } from "../../lib/web-search";
import {
  extractLibraryText,
  findLibraryFiles,
  libraryItemToBase64DataUrl,
  listAllLibraryFilesServer,
  type ServerLibraryItem,
} from "../../lib/library-server";

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().max(16_000_000),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50),
  reasoning: z.boolean().optional().default(false),
  webSearch: z.boolean().optional().default(false),
  model: z.enum(["instinct", "chat", "f1"]).optional().default("instinct"),
  agent: z.enum(["universal", "coder", "hacker", "mentor", "psy", "creative"]).optional().default("universal"),
  workspace: z.enum(["chat", "engine"]).optional().default("chat"),
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
  previousGeneratedImage: z
    .object({
      dataUrl: z.string().max(16_000_000),
      messageIndex: z.number().int().min(-1).optional(),
    })
    .optional(),
  deviceFp: z.string().max(128).optional(),
  imageQuota: z
    .object({
      used: z.number().int().min(0).max(100),
      resetAt: z.number().int().min(0),
    })
    .optional(),
  libraryFiles: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        type: z.string().optional(),
        mimeType: z.string().optional(),
        content: z.string().max(500_000).optional(),
        dataUrl: z.string().max(1_000_000).optional(),
        source: z.string().optional(),
        chatTitle: z.string().optional(),
        updatedAt: z.string().optional(),
      })
    )
    .max(50)
    .optional(),
});

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; reasoning_content?: string; tool_calls?: ToolCall[] }
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
      "Сгенерировать НОВОЕ изображение с нуля по текстовому описанию и вставить его в чат как карточку. Используй, когда пользователь просит нарисовать/создать картинку с нуля. Если пользователь прикрепил фото и просит отредактировать или добавить элемент на него — используй edit_image!",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Короткое название изображения для карточки." },
        prompt: {
          type: "string",
          description:
            "Детальное описание изображения на английском языке. Опиши стиль, сюжет, цвета, освещение, композицию и настроение. Чем конкренее, тем лучше.",
        },
        description: { type: "string", description: "Краткое описание для карточки (опционально)." },
      },
      required: ["title", "prompt"],
    },
  },
};

const EDIT_IMAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "edit_image",
    description:
      "Отредактировать, изменить, дорисовать или стилизовать фотографию/изображение, прикреплённое пользователем в чате (добавить усы/очки/аксессуары, поменять фон, одежду, освещение, убрать объект, сделать ретушь или перерисовать в другом стиле). Вызывай ВСЕГДА, когда пользователь просит изменить прикреплённое или ранее созданное в чате фото!",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Короткое название результата для карточки." },
        prompt: {
          type: "string",
          description:
            "Чёткая инструкция редактирования на английском языке, что именно нужно добавить, удалить или изменить на исходном изображении (например: 'Add realistic dark mustache above the upper lip on the person in the photo, matching lighting, skin tone, and hair color while keeping everything else unchanged').",
        },
        description: { type: "string", description: "Краткое описание правки (опционально)." },
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
      "Найти, прочитать, составить или отправить письмо через Gmail пользователя. Поддерживает вложения (сгенерированные открытки/изображения, приложенные пользователем файлы, документы из памяти или из Library). Используй всегда, когда пользователь просит проверить почту, найти письмо, составить или отправить email (например: 'отправь открытку маме', 'отправь боссу отчет из library').",
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
              filename: { type: "string", description: "Имя файла вложения (например 'birthday_card.png', 'report.txt', 'отчет.md')." },
              source: {
                type: "string",
                enum: ["generated_image", "user_upload", "memory", "library"],
                description: "Источник вложения: generated_image (сгенерированная открытка/фото), user_upload (файл от пользователя), memory (файл/документ из памяти), library (файл/отчет/артефакт/фото из Library).",
              },
              data_url: { type: "string", description: "Data-URL вложения если доступен." },
              memory_id: { type: "string", description: "ID записи памяти, если вложение берется из памяти." },
              library_id: { type: "string", description: "ID файла из Library, если вложение берется из Library." },
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

const SEARCH_AND_READ_LIBRARY_TOOL = {
  type: "function" as const,
  function: {
    name: "search_and_read_library",
    description:
      "Найти и полностью прочитать файлы, отчеты, документы, код, артефакты и изображения из единой Библиотеки пользователя (Library). " +
      "ИСПОЛЬЗУЙ ВСЕГДА, когда пользователь упоминает файл из библиотеки/library ('возьми мой отчет из library', 'найди файл в библиотеке', 'отправь отчет который лежит в library', 'прочитай документ из library').",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Поисковый запрос по названию или содержимому файла (например: 'отчет', 'report', 'презентация', 'config').",
        },
        library_id: {
          type: "string",
          description: "Точный ID файла из каталога USER LIBRARY CATALOG, если он уже известен.",
        },
        filename: {
          type: "string",
          description: "Точное или частичное имя файла из Library.",
        },
      },
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

const MANAGE_MEMORY_TOOL = {
  type: "function" as const,
  function: {
    name: "manage_memory",
    description:
      "Сохранить, обновить или удалить факт/заметку/файл в долговременной памяти пользователя (Memory HUD). " +
      "ИСПОЛЬЗУЙ АВТОНОМНО В ДВУХ СЛУЧАЯХ: " +
      "1) Пользователь прямо просит что-то запомнить, сохранить, записать, изменить или удалить из памяти ('запомни...', 'сохрани в память...', 'запиши...', 'не забудь...', 'удали из памяти...', 'измени в памяти...'); " +
      "2) Пользователь сообщает важные долговременные факты о себе или прикрепляет важный документ (имя, контакты, email близких/коллег, предпочтения, стек технологий, проекты, устройства, цели, стиль общения).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["save", "update", "delete", "list"],
          description:
            "save — добавить новую запись в память; update — обновить запись по memory_id; delete — удалить запись по memory_id; list — получить текущие записи памяти с их ID.",
        },
        content: {
          type: "string",
          description:
            "Краткая и точная формулировка факта на языке пользователя (для save/update), например: 'Меня зовут Артём' или 'Любимый язык: TypeScript'.",
        },
        kind: {
          type: "string",
          enum: ["name", "preference", "tech", "project", "goal", "device", "interest", "style", "other"],
          description: "Категория факта памяти.",
        },
        memory_id: {
          type: "string",
          description: "ID существующей записи памяти (для action='update' или 'delete').",
        },
        attachment_filename: {
          type: "string",
          description: "Имя файла из вложений текущего сообщения ИЛИ из Library, если пользователь попросил сохранить файл/отчет в память.",
        },
        library_id: {
          type: "string",
          description: "ID файла из Library (из search_and_read_library или каталога USER LIBRARY CATALOG), если пользователь просит запомнить файл из Library.",
        },
        library_filename: {
          type: "string",
          description: "Имя файла из Library, если пользователь просит запомнить файл из Library.",
        },
      },
      required: ["action"],
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

const TAB_TRANSITION_TOOL = {
  type: "function" as const,
  function: {
    name: "suggest_tab_transition",
    description:
      "Используй этот инструмент ОБЯЗАТЕЛЬНО, когда пользователь в базовом чате просит: 1) Создать full stack проект, веб-приложение, запустить живое превью или открыть IDE (target_tab: 'engine'); 2) Выложить код на GitHub, запустить CI/CD, выполнить bash-команды/терминал, запустить веб-мониторинг или автономный сценарий (target_tab: 'flow'); 3) Работать с файлами, вложениями или библиотекой знаний (target_tab: 'library'). Инструмент отобразит в чате интерактивную кнопку перехода. В тексте ответа ОБЯЗАТЕЛЬНО объясни границы возможностей текстового чата и почему задачу следует делать в этой вкладке, предложив перейти в неё по кнопке.",
    parameters: {
      type: "object",
      properties: {
        target_tab: {
          type: "string",
          enum: ["engine", "flow", "library", "saved"],
          description: "Целевая вкладка: 'engine' (среда разработки, Full Stack проекты, live preview, многофайловое дерево), 'flow' (автономный агент, публикация на GitHub, защищённый терминал, пайплайны), 'library' (файлы и документы).",
        },
        title: {
          type: "string",
          description: "Заголовок карточки перехода (например, 'Создать Full Stack проект в Engine' или 'Выгрузить репозиторий на GitHub через Flow').",
        },
        reason: {
          type: "string",
          description: "Чёткое объяснение границ возможностей базового чата (например: 'В обычном чате код выводится только текстом без сборки, зависимостей и живого предпросмотра' или 'Прямая публикация на GitHub и терминал требуют среды Flow с подключённым OAuth').",
        },
        suggested_prompt: {
          type: "string",
          description: "Исходный запрос пользователя для автоматической передачи в целевую вкладку.",
        },
      },
      required: ["target_tab", "title", "reason"],
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
  const hits = await searchWebLive(query, 6);
  return hits.map((h) => ({
    title: h.title,
    url: h.url,
    snippet: h.snippet,
  }));
}

type WebImageResult = {
  title: string;
  url: string;
  thumbnail?: string;
  source?: string;
};

async function searchWebImages(query: string): Promise<WebImageResult[]> {
  const results: WebImageResult[] = [];

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
  }

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

const DATA_URL_RE = /!\[[^\]]*\]\((data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+)\)/g;
const IGFILE_TAG_RE = /<!--\/?IGFILE(?::[^>]*)?-->/g;

function cleanFileWrappers(text: string): string {
  return text.replace(IGFILE_TAG_RE, "").trim();
}

function stripImageDataUrls(text: string): string {
  return cleanFileWrappers(text).replace(DATA_URL_RE, "[прикреплённое изображение]").trim();
}

function collectLatestSourceImages(
  userAttachments: Array<{ name: string; dataUrl: string; type?: string }> | undefined,
  messages: Array<{ role: string; content: string }>,
  lastGeneratedImage: { dataUrl: string; messageIndex: number; sameTurn?: boolean } | null,
): Array<{ dataUrl: string; mimeType?: string }> {
  if (lastGeneratedImage?.sameTurn && lastGeneratedImage.dataUrl.startsWith("data:image/")) {
    return [{ dataUrl: lastGeneratedImage.dataUrl }];
  }

  const fromAttachments = (userAttachments ?? [])
    .filter((a) => a.dataUrl?.startsWith("data:image/"))
    .map((a) => ({ dataUrl: a.dataUrl, mimeType: a.type }));
  if (fromAttachments.length > 0) return fromAttachments;

  let lastUserImageIndex = -1;
  let lastUserImages: Array<{ dataUrl: string; mimeType?: string }> = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role !== "user" || typeof m.content !== "string") continue;
    const matches = [...m.content.matchAll(DATA_URL_RE)];
    if (matches.length > 0) {
      lastUserImageIndex = i;
      lastUserImages = matches.map((match) => ({ dataUrl: match[1] }));
      break;
    }
  }

  if (
    lastGeneratedImage?.dataUrl?.startsWith("data:image/") &&
    (lastUserImageIndex < 0 || lastGeneratedImage.messageIndex >= lastUserImageIndex)
  ) {
    return [{ dataUrl: lastGeneratedImage.dataUrl }];
  }

  return lastUserImages;
}

type ApiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function toApiMessages(
  messages: ChatMessage[],
): Array<Record<string, unknown>> {
  const userImgIndexes = messages
    .map((m, i) => (m.role === "user" && typeof m.content === "string" && m.content.includes("data:image/") ? i : -1))
    .filter((i) => i >= 0);
  const keepImageSet = new Set(userImgIndexes.slice(-3));

  return messages.map((m, index) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.tool_call_id,
        content: typeof m.content === "string" ? m.content : "",
      };
    }
    if (m.role === "assistant") {
      const out: Record<string, unknown> = {
        role: "assistant",
        content: typeof m.content === "string" ? cleanFileWrappers(m.content) : (m.content ?? ""),
      };
      if (m.reasoning_content !== undefined) out.reasoning_content = m.reasoning_content;
      if (m.tool_calls && m.tool_calls.length > 0) out.tool_calls = m.tool_calls;
      return out;
    }
    if (m.role !== "user" || typeof m.content !== "string" || !m.content.includes("data:image/")) {
      return { role: m.role, content: typeof m.content === "string" ? cleanFileWrappers(m.content) : (m.content ?? "") };
    }

    if (!keepImageSet.has(index)) {
      return { role: m.role, content: stripImageDataUrls(m.content) };
    }

    const matches = [...m.content.matchAll(DATA_URL_RE)];
    if (matches.length === 0) return { role: m.role, content: cleanFileWrappers(m.content) };

    const parts: ApiContentPart[] = [];
    let cursor = 0;
    for (const match of matches) {
      const textBefore = cleanFileWrappers(m.content.slice(cursor, match.index));
      if (textBefore) parts.push({ type: "text", text: textBefore });
      parts.push({ type: "image_url", image_url: { url: match[1] } });
      cursor = (match.index ?? 0) + match[0].length;
    }
    const tail = cleanFileWrappers(m.content.slice(cursor));
    if (tail) parts.push({ type: "text", text: tail });
    if (!parts.some((p) => p.type === "text")) {
      parts.unshift({ type: "text", text: "(пользователь прикрепил изображение — проанализируй его)" });
    }
    if (parts.length === 1 && parts[0].type === "text") {
      return { role: m.role, content: parts[0].text };
    }
    return { role: m.role, content: parts };
  });
}

async function generateImage(prompt: string): Promise<string> {
  const res = await generateImageWithGptImage2(prompt);
  return res.dataUrl;
}

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
      }
    }
  }
  return assistantText;
}

type HfTool = {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
};

const INSTINCT_MODEL = "deepseek-v4-flash";
const REASONER_MODEL = "deepseek-reasoner";

type UiModel = "instinct" | "chat" | "f1";
const MODEL_PROFILES: Record<UiModel, { model: string; temperature: number; top_p: number }> = {
  instinct: { model: INSTINCT_MODEL, temperature: 0.8, top_p: 0.95 },
  chat:     { model: "deepseek-chat", temperature: 1.1, top_p: 0.95 },
  f1:       { model: "deepseek-coder", temperature: 0.4, top_p: 0.9 },
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
  const apiKey = process.env.DEEPSEEK_API_KEY || "sk-f9e947f21f0246ad9b524a3a5c86a8b2";
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

        const isEngineRequest = parsed.workspace === "engine";
        const effectiveReasoning = parsed.reasoning;
        const effectiveWebSearch = parsed.webSearch;
        const clientSystemBlocks = parsed.messages
          .filter((m) => m.role === "system")
          .map((m) => m.content.trim())
          .filter(Boolean);
        const cleanMessages = parsed.messages.filter((m) => m.role !== "system");

        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
        const authed = token ? await getUserFromToken(token) : null;
        const photoQuotaActorKey = resolvePhotoQuotaActorKey(request, authed?.id, parsed.deviceFp);
        let currentImageQuotaHint = parsed.imageQuota;

        const lastUserMessage = stripImageDataUrls(
          [...cleanMessages].reverse().find((m) => m.role === "user")?.content ?? "",
        );

        const primaryHistory = cleanMessages.filter((message, index, messages) => {
          if (message.role === "user" && isChinaSensitive(stripImageDataUrls(message.content))) return false;
          if (message.role !== "assistant") return true;

          for (let previous = index - 1; previous >= 0; previous -= 1) {
            const candidate = messages[previous];
            if (candidate.role === "user") return !isChinaSensitive(stripImageDataUrls(candidate.content));
          }
          return true;
        });

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
          memories = await loadRelevantMemories(authed.client, authed.id, lastUserMessage, 12, authed.token);
        }

        const libraryItems: ServerLibraryItem[] = await listAllLibraryFilesServer(
          authed,
          parsed.libraryFiles || [],
        ).catch(() => []);

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

        const libraryCatalogBlock = libraryItems.length
          ? `\n\nUSER LIBRARY CATALOG (files, documents, reports, Flow artifacts & images currently available in the shared Library — use search_and_read_library to read full content):\n${libraryItems
              .slice(0, 25)
              .map((item) => {
                const txt = extractLibraryText(item).slice(0, 140).replace(/\s+/g, " ").trim();
                return `- [lib_id:${item.id}] "${item.name}" (${item.type}, source: ${item.source}${item.chatTitle ? `, from: ${item.chatTitle}` : ""}${txt ? `, preview: "${txt}"` : ""})`;
              })
              .join("\n")}`
          : "\n\nUSER LIBRARY CATALOG: (Library is currently empty or user hasn't added files yet — you can still call search_and_read_library if user asks to check Library).";

        const userAttachmentsBlock = parsed.userAttachments?.length
          ? `\n\nUSER ATTACHMENTS IN THIS MESSAGE (files/documents attached directly by the user):\n${parsed.userAttachments
              .map((a, i) => `- [attachment_${i + 1}] "${a.name}" (${a.type || "file"})`)
              .join("\n")}`
          : "";

        const gmailStatusInfo = parsed.gmailConnected
          ? "Gmail status: User is authenticated. You can freely read, search, draft, or send emails with attachments via manage_gmail."
          : "Gmail status: User is NOT yet signed into Gmail. When the user asks anything about email, ALWAYS call manage_gmail — the client interface will instantly display a Google sign-in modal for the user, after which your email action will be executed WITH any resolved attachments.";

        const capabilities = `You have full autonomy to decide when to call tools. The user does not need to choose tools manually.
${gmailStatusInfo}
Tools available to you:
- search_and_read_library: найти и прочитать полное содержимое файла/отчёта/кода/изображения из единой Библиотеки (Library). ВСЕГДА вызывай этот инструмент, когда пользователь упоминает, что файл лежит в Library / библиотеке ("возьми мой отчёт из library", "отправь отчёт который лежит в library", "прочитай документ из library").
- manage_memory: сохранить, обновить или удалить факт/заметку/файл в долговременной памяти пользователя (Memory HUD). ВСЕГДА вызывай manage_memory (action: "save" / "update" / "delete"), когда пользователь просит что-то запомнить/сохранить/забыть или сам сообщает важные долгосрочные факты о себе (имя, контакты, предпочтения, стек, проекты, цели, привычки).
  * Если пользователь просит запомнить файл из Library ("возьми мой отчёт из library и запомни его"): 1) сначала вызови search_and_read_library чтобы прочитать его текст, 2) затем вызови manage_memory (action: "save") с подробным изложением ключевых данных в content И передай library_id / library_filename (чтобы сам файл тоже сохранился как вложение в Memory HUD!). После вызова подтверди пользователю, что данные и файл сохранены в память.
- search_and_read_memory: прочитать память пользователя или вложения в памяти (документы, файлы, контакты мамы/босса/коллег, отчеты). Используй, когда нужно найти контакты ("мой босс", "мама") или изучить файл из памяти.
- manage_gmail: search, read, compose, or send emails via Gmail. ALWAYS call this tool whenever the user asks to send an email, draft an email, read inbox, or search messages — EVEN IF Gmail is not signed in yet (the UI will open the Gmail sign-in modal with your prepared email and attachments and automatically send it right after sign-in!).
  ВЛОЖЕНИЯ В ПИСЬМА:
  1) Файлы из Library ("отправь моему боссу отчёт, он лежит в library"): найди email получателя в памяти (search_and_read_memory), найди файл в Library (search_and_read_library), затем вызови manage_gmail с action: "send", to: email получателя, subject, содержательным body и attachments: [{ filename: "<имя файла>", source: "library", library_id: "<lib_id>" }].
  2) Сгенерированные открытки/изображения: сначала вызови generate_image, затем manage_gmail с attachments: [{ filename: "birthday_card.png", source: "generated_image" }].
  3) Файлы от пользователя в текущем сообщении: attachments: [{ filename: "<имя файла>", source: "user_upload" }].
  4) Файлы из памяти: attachments: [{ filename: "<имя файла>", source: "memory", memory_id: "<id>" }].
- generate_image: генерация картинок и открыток (мост с Gemini Image). DeepSeek формулирует детальный визуальный промпт на английском, который генерируется прямо в чате карточкой и может быть отправлен по почте!
- refuse_unsupported_request: ЧЕСТНЫЙ ОТКАЗ И ГРАНИЦЫ ВОЗМОЖНОСТЕЙ. Используй этот инструмент НЕМЕДЛЕННО, если пользователь просит сделать то, что ты физически или технически НЕ УМЕЕШЬ (например: реальные телефонные звонки по сотовой связи, SMS с SIM-карты, банковские переводы денег, физические действия в материальном мире, живой взлом закрытых серверов, управление домашней техникой без интеграций, публикации в чужие соцсети без API). Не фантазируй и не притворяйся, что сделал невозможное — сразу вызывай refuse_unsupported_request и честно скажи об этом, предложив конструктивную альтернативу (написать код, скрипт, текст, найти инфу, создать задачу/напоминание).
- suggest_tab_transition: ИНСТРУМЕНТ ПЕРЕХОДА В ДРУГУЮ ВКЛАДКУ (Engine, Flow, Library). Вызывай этот инструмент ТОЛЬКО когда пользователь просит именно открыть/перейти во вкладку или создать полноценный UI-проект/CI-CD:
  1) Создать full stack проект, многофайловое веб-приложение, запустить живое превью кода, открыть IDE -> target_tab: "engine".
  2) Выложить код на GitHub, запустить CI/CD, выполнить bash-команды/терминал, настроить мониторинг или автономный сценарий -> target_tab: "flow".
  3) Если пользователь просит просто ПОКАЗАТЬ интерфейс всех файлов / открыть раздел Library -> target_tab: "library". ВАЖНО: если пользователь просит ПРОЧИТАТЬ файл из Library, ЗАПОМНИТЬ его в память или ОТПРАВИТЬ его по почте — НЕ отправляй его во вкладку Library, а сам сразу используй search_and_read_library + manage_memory / manage_gmail прямо здесь в чате!
- manage_calendar_event: create, list, update or delete events/reminders in Google Calendar. Call this tool whenever the user asks to schedule a meeting, set a reminder, check schedule or manage calendar events.
- manage_google_task: create, list, complete or update tasks in Google Tasks. Call this tool whenever the user asks to add a task, check todo list, mark a task done or manage tasks.
- create_artifact: create a downloadable file card (code, HTML, markdown, document, config). Use it for substantial code or documents.
- find_web_image: search and find REAL web photos, diagrams, or illustrations in the internet. Call this tool ONLY when user asks how something real looks ('как выглядит ...', 'покажи фото ...', 'найди картинку ...', 'схема ...') or asks to show a photo/picture of an object, person, place, animal or concept. Do NOT call this tool for normal conversational messages.
${effectiveWebSearch ? "\n- web_search: search the live internet. Use it whenever the user asks about current events, recent facts, prices, news or anything you might not know. Cite sources briefly in the answer." : ""}
Diagrams & Charts:
- When asked to create flowcharts, diagrams, schemas, graphs, mind maps, process flows or electrical/logic schematics, ALWAYS write a \`\`\`mermaid code block! Do NOT draw wide horizontal ASCII art schemas with long lines that break mobile layouts.
Routing rules — decide automatically, never ask the user which engine to use:
- Full Stack projects or live coding requests ("создай full stack проект", "напиши веб-приложение с превью"): call suggest_tab_transition with target_tab: "engine", explain why Engine is required, and invite user to switch!
- GitHub publication, terminal commands, web monitoring or autonomous multi-step execution requests ("выложи на гитхаб", "запусти в терминале", "автоматизируй процесс"): call suggest_tab_transition with target_tab: "flow", explain that Flow provides OAuth GitHub access and isolated terminal, and invite user to switch!
- Impossible / unsupported requests (phone calls, banking, physical acts, external live hacks): call refuse_unsupported_request immediately!
- Text answers, analysis, code, search: you answer directly.
- Diagrams/Schemas/Flowcharts: write a \`\`\`mermaid code block directly in your text answer.
- Real photos / images: call find_web_image when requested or appropriate.
- Calendar, Tasks, Gmail, Library, Memory integrations: ALWAYS call manage_calendar_event, manage_google_task, manage_gmail, search_and_read_library, search_and_read_memory, and manage_memory autonomously as needed to fulfill user requests directly in the chat!
- Photos or screenshots ATTACHED by the user:
  * If the user asks what is on the image or asks to analyze it: analyze the image content yourself and answer; do not call generate_image.
  * If the user asks to EDIT, MODIFY, ADD something to, REMOVE something from, retouch, or restyle an attached or previously generated image (e.g., "добавь усы", "приклей очки", "измени фон", "сделай в стиле аниме"): ALWAYS call edit_image immediately with a clear English edit instruction! NEVER refuse or claim you cannot edit photos!
- Requests to CREATE a brand-new picture from scratch: call generate_image with a rich English visual prompt (subject, style, lighting, composition).
Never output raw tool-call markup as part of your visible answer.
After using a tool, briefly confirm what was created or executed and do not repeat the full content.`;
        const effectiveSystemCore = buildEffectiveWorkspacePrompt(
          parsed.agent as AgentId,
          parsed.workspace,
        );
        const engineContextBlock =
          isEngineRequest && clientSystemBlocks.length > 0
            ? `\n\nENGINE WORKSPACE FORMAT CONTRACT:\n${clientSystemBlocks.join("\n\n")}`
            : "";
        const systemMessage: ChatMessage = {
          role: "system",
          content: isEngineRequest
            ? `${effectiveSystemCore}${engineContextBlock}${memoryBlock}${libraryCatalogBlock}${userAttachmentsBlock}`
            : `${effectiveSystemCore}\n\n${capabilities}${memoryBlock}${libraryCatalogBlock}${userAttachmentsBlock}`,
        };
        const baseMessages: ChatMessage[] = [
          systemMessage,
          ...primaryHistory.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
        ];

        const supportsTools = !isEngineRequest;
        const activeTools = supportsTools
          ? [
              ARTIFACT_TOOL,
              IMAGE_TOOL,
              EDIT_IMAGE_TOOL,
              WEB_IMAGE_TOOL,
              CALENDAR_TOOL,
              TASKS_TOOL,
              GMAIL_TOOL,
              SEARCH_AND_READ_LIBRARY_TOOL,
              MANAGE_MEMORY_TOOL,
              MEMORY_TOOL,
              REFUSAL_TOOL,
              TAB_TRANSITION_TOOL,
              ...(effectiveWebSearch ? [WEB_SEARCH_TOOL] : []),
            ]
          : [];

        let streamClosed = false;
        const stream = new ReadableStream<Uint8Array>({
          cancel() {
            streamClosed = true;
          },
          async start(controller) {
            const encoder = new TextEncoder();
            const send = (event: string, data: string) => {
              if (streamClosed) return;
              try {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
              } catch {
                streamClosed = true;
              }
            };
            const safeClose = () => {
              if (streamClosed) return;
              streamClosed = true;
              try {
                controller.close();
              } catch {
              }
            };

            type StreamOutcome = {
              finishReason: string | null;
              toolCalls: ToolCall[];
              assistantText: string;
              reasoningText: string;
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
                effectiveReasoning,
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
              let reasoningText = "";

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
                    if (delta?.reasoning_content) {
                      reasoningText += delta.reasoning_content;
                      if (forwardText && effectiveReasoning) {
                        send("reasoning", JSON.stringify(delta.reasoning_content));
                      }
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

              return { finishReason, toolCalls, assistantText, reasoningText };
            }

            let finalAssistantText = "";
            let memoryMutatedInTool = false;
            let hitImageLimit = false;
            let lastGeneratedImageDataUrl: string | null =
              parsed.previousGeneratedImage?.dataUrl?.startsWith("data:image/")
                ? parsed.previousGeneratedImage.dataUrl
                : null;
            let lastGeneratedImageState: { dataUrl: string; messageIndex: number; sameTurn?: boolean } | null =
              lastGeneratedImageDataUrl
                ? {
                    dataUrl: lastGeneratedImageDataUrl,
                    messageIndex: parsed.previousGeneratedImage?.messageIndex ?? cleanMessages.length - 1,
                    sameTurn: false,
                  }
                : null;

            try {
              if (isChinaSensitive(lastUserMessage)) {
                const custom = getCustomGlobalPromptForWorkspace(parsed.workspace);
                const customDirective = custom ? `${custom}\n\n` : "";
                const fallbackMessages = [
                  {
                    role: "system" as const,
                    content:
                      `${customDirective}Answer the user's question directly, factually, and neutrally. Do not discuss unrelated topics.`,
                  },
                  { role: "user" as const, content: lastUserMessage },
                ];
                finalAssistantText = await streamFallbackToClient(fallbackMessages, send);
                if (authed && lastUserMessage) {
                  try {
                    const changed = await Promise.race([
                      analyzeAndUpdateMemory(
                        authed.client,
                        authed.id,
                        lastUserMessage,
                        finalAssistantText,
                        authed.token,
                      ),
                      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 6000)),
                    ]);
                    if (changed) send("memory_updated", "1");
                  } catch (e) {
                    console.error("memory analyze error", e);
                  }
                }
                send("done", "1");
                safeClose();
                return;
              }

              let conversationMessages: ChatMessage[] = [...baseMessages];
              let currentOutcome = await runStream(conversationMessages, activeTools, true);
              finalAssistantText = currentOutcome.assistantText;

              let toolRound = 0;
              while (currentOutcome.finishReason === "tool_calls" && currentOutcome.toolCalls.length > 0 && toolRound < 4) {
                toolRound += 1;
                const followupMessages: ChatMessage[] = [
                  ...conversationMessages,
                  {
                    role: "assistant",
                    content: currentOutcome.assistantText || null,
                    ...(currentOutcome.reasoningText ? { reasoning_content: currentOutcome.reasoningText } : {}),
                    tool_calls: currentOutcome.toolCalls,
                  },
                ];

                for (const tc of currentOutcome.toolCalls) {
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
                      const quotaStatus = checkServerPhotoQuota(photoQuotaActorKey, currentImageQuotaHint);
                      if (!quotaStatus.allowed) {
                        hitImageLimit = true;
                        send(
                          "image_limit",
                          JSON.stringify({
                            scope: "image",
                            used: quotaStatus.used,
                            limit: quotaStatus.limit,
                            resetAt: quotaStatus.resetAt,
                          }),
                        );
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: false,
                            limit_reached: true,
                            used: quotaStatus.used,
                            limit: quotaStatus.limit,
                            resetAt: quotaStatus.resetAt,
                            message:
                              "Дневной лимит генерации и редактирования фото (8 фото в день) исчерпан. Пользователю уже показана карточка с таймером до обновления. Кратко подтверди, что лимит на сегодня исчерпан, и напомни, что обычный текстовый чат работает без ограничений.",
                          }),
                        });
                        continue;
                      }
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        title?: string;
                        prompt?: string;
                        description?: string;
                      };
                      if (!parsedArgs.prompt) throw new Error("missing prompt");
                      const imageTitle = String(parsedArgs.title ?? "Generated image");
                      send("image_start", JSON.stringify({ title: imageTitle, prompt: parsedArgs.prompt }));
                      const dataUrl = await generateImage(parsedArgs.prompt);
                      const updatedQuota = consumeServerPhotoQuota(photoQuotaActorKey, currentImageQuotaHint);
                      currentImageQuotaHint = { used: updatedQuota.used, resetAt: updatedQuota.resetAt };
                      send("photo_usage", JSON.stringify(updatedQuota));
                      lastGeneratedImageDataUrl = dataUrl;
                      lastGeneratedImageState = {
                        dataUrl,
                        messageIndex: cleanMessages.length,
                        sameTurn: true,
                      };
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
                  } else if (tc.function.name === "edit_image") {
                    try {
                      const quotaStatus = checkServerPhotoQuota(photoQuotaActorKey, currentImageQuotaHint);
                      if (!quotaStatus.allowed) {
                        hitImageLimit = true;
                        send(
                          "image_limit",
                          JSON.stringify({
                            scope: "image",
                            used: quotaStatus.used,
                            limit: quotaStatus.limit,
                            resetAt: quotaStatus.resetAt,
                          }),
                        );
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: false,
                            limit_reached: true,
                            used: quotaStatus.used,
                            limit: quotaStatus.limit,
                            resetAt: quotaStatus.resetAt,
                            message:
                              "Дневной лимит генерации и редактирования фото (8 фото в день) исчерпан. Пользователю уже показана карточка с таймером до обновления. Кратко подтверди, что лимит на сегодня исчерпан, и напомни, что обычный текстовый чат работает без ограничений.",
                          }),
                        });
                        continue;
                      }
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        title?: string;
                        prompt?: string;
                        description?: string;
                      };
                      if (!parsedArgs.prompt) throw new Error("missing edit prompt");
                      const sourceImages = collectLatestSourceImages(
                        parsed.userAttachments,
                        cleanMessages,
                        lastGeneratedImageState,
                      );
                      if (sourceImages.length === 0) {
                        throw new Error("No source image found for editing");
                      }
                      const imageTitle = String(parsedArgs.title ?? "Edited image");
                      send("image_start", JSON.stringify({ title: imageTitle, prompt: parsedArgs.prompt }));
                      const edited = await editImageWithGptImage2(parsedArgs.prompt, sourceImages);
                      const updatedQuota = consumeServerPhotoQuota(photoQuotaActorKey, currentImageQuotaHint);
                      currentImageQuotaHint = { used: updatedQuota.used, resetAt: updatedQuota.resetAt };
                      send("photo_usage", JSON.stringify(updatedQuota));
                      lastGeneratedImageDataUrl = edited.dataUrl;
                      lastGeneratedImageState = {
                        dataUrl: edited.dataUrl,
                        messageIndex: cleanMessages.length,
                        sameTurn: true,
                      };
                      const image: GeneratedImage = {
                        id: tc.id,
                        title: imageTitle,
                        prompt: String(parsedArgs.prompt),
                        description: parsedArgs.description
                          ? String(parsedArgs.description)
                          : undefined,
                        dataUrl: edited.dataUrl,
                      };
                      send("image", JSON.stringify(image));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          message: `Изображение «${image.title}» отредактировано по запросу и показано пользователю карточкой. Кратко подтверди, что правка выполнена.`,
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
                        summary: parsedArgs.summary || "Calendar Event",
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
                        title: parsedArgs.title || "New Task",
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
                          source?: "generated_image" | "user_upload" | "memory" | "library";
                          data_url?: string;
                          memory_id?: string;
                          library_id?: string;
                        }>;
                      };

                      const resolvedAttachments: Array<{ filename: string; mimeType?: string; dataUrl?: string }> = [];

                      if (Array.isArray(parsedArgs.attachments) && parsedArgs.attachments.length > 0) {
                        for (const att of parsedArgs.attachments) {
                          let dataUrl = att.data_url;
                          let filename = att.filename || "attachment";
                          let mimeOverride: string | undefined;

                          if (!dataUrl && (att.source === "generated_image" || filename.includes("card") || filename.includes("image") || filename.includes("открытк")) && lastGeneratedImageDataUrl) {
                            dataUrl = lastGeneratedImageDataUrl;
                          }

                          if (!dataUrl && (att.source === "library" || att.library_id) && libraryItems.length > 0) {
                            const matches = findLibraryFiles(libraryItems, {
                              id: att.library_id,
                              filename: att.filename,
                              query: att.filename,
                            });
                            const libMatch = matches[0];
                            if (libMatch) {
                              dataUrl = libraryItemToBase64DataUrl(libMatch);
                              filename = libMatch.name;
                              mimeOverride = libMatch.mimeType;
                            }
                          }

                          if (!dataUrl && parsed.userAttachments?.length && att.source !== "library" && att.source !== "memory") {
                            const match = parsed.userAttachments.find((ua) => ua.name.toLowerCase() === filename.toLowerCase()) || parsed.userAttachments[0];
                            if (match) {
                              dataUrl = match.dataUrl;
                              filename = match.name;
                            }
                          }

                          if (!dataUrl && authed && att.memory_id) {
                            let targetMem = memories.find((m) => m.id === att.memory_id);
                            if (!targetMem) {
                              const freshAll = await listAllMemories(authed.client, authed.id, authed.token).catch(() => []);
                              targetMem = freshAll.find((m) => m.id === att.memory_id);
                            }
                            if (targetMem?.attachment?.dataUrl) {
                              dataUrl = targetMem.attachment.dataUrl;
                              filename = targetMem.attachment.name;
                            } else if (targetMem?.attachment?.textContent) {
                              dataUrl = `data:text/plain;base64,${Buffer.from(targetMem.attachment.textContent, "utf-8").toString("base64")}`;
                              filename = targetMem.attachment.name;
                              mimeOverride = targetMem.attachment.type;
                            }
                          }

                          if (!dataUrl && libraryItems.length > 0) {
                            const fallbackLib = findLibraryFiles(libraryItems, {
                              id: att.library_id,
                              filename: att.filename,
                              query: att.filename,
                            })[0];
                            if (fallbackLib) {
                              dataUrl = libraryItemToBase64DataUrl(fallbackLib);
                              filename = fallbackLib.name;
                              mimeOverride = fallbackLib.mimeType;
                            }
                          }

                          if (dataUrl) {
                            const mimeMatch = dataUrl.match(/^data:([^;]+);/);
                            resolvedAttachments.push({
                              filename,
                              mimeType: mimeOverride || (mimeMatch ? mimeMatch[1] : undefined),
                              dataUrl,
                            });
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
                      } else if (
                        libraryItems.length > 0 &&
                        (parsedArgs.action || "send") === "send" &&
                        /(library|библиотек|отч[её]т|report|файл|документ)/i.test(lastUserMessage)
                      ) {
                        const libMatch = findLibraryFiles(libraryItems, { query: lastUserMessage })[0];
                        if (libMatch) {
                          const dataUrl = libraryItemToBase64DataUrl(libMatch);
                          if (dataUrl) {
                            resolvedAttachments.push({
                              filename: libMatch.name,
                              mimeType: libMatch.mimeType,
                              dataUrl,
                            });
                          }
                        }
                      }

                      const gmailPayload = {
                        id: tc.id,
                        action: parsedArgs.action || "list",
                        to: parsedArgs.to,
                        subject: parsedArgs.subject || "Gmail Message",
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
                          message: `Интеграция Gmail (${gmailPayload.action}) передана в клиентский интерфейс почты.${resolvedAttachments.length ? ` Вложено файлов: ${resolvedAttachments.map((a) => a.filename).join(", ")}.` : ""}${!parsed.gmailConnected ? " Пользователь еще не вошел в Gmail — интерфейс сразу откроет окно входа в Gmail и автоматически отправит письмо с вложением сразу после авторизации." : ""}`,
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "search_and_read_library") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments || "{}") as {
                        query?: string;
                        library_id?: string;
                        filename?: string;
                      };
                      const matches = findLibraryFiles(libraryItems, {
                        id: parsedArgs.library_id,
                        filename: parsedArgs.filename,
                        query: parsedArgs.query || lastUserMessage,
                      });
                      const filesOut = matches.slice(0, 8).map((item) => {
                        const text = extractLibraryText(item);
                        return {
                          id: item.id,
                          name: item.name,
                          type: item.type,
                          mimeType: item.mimeType,
                          source: item.source,
                          chatTitle: item.chatTitle,
                          updatedAt: item.updatedAt,
                          textContent: text ? text.slice(0, 24_000) : "(бинарный файл или изображение без текстового содержимого)",
                          hasBinaryData: Boolean(item.dataUrl),
                        };
                      });
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          total_in_library: libraryItems.length,
                          count: filesOut.length,
                          files: filesOut,
                          message: filesOut.length
                            ? `Найдено файлов в Library: ${filesOut.length}. Используй их содержимое и id (library_id) для ответа, сохранения в память (manage_memory) или отправки через Gmail (manage_gmail с source: "library").`
                            : "Подходящие файлы в Library не найдены. Сообщи об этом пользователю честно.",
                        }),
                      });
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "manage_memory") {
                    try {
                      if (!authed) {
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: false,
                            error: "unauthorized",
                            message: "Пользователь не авторизован в облачном аккаунте, поэтому сохранить запись в облачную память нельзя.",
                          }),
                        });
                        continue;
                      }
                      const parsedArgs = JSON.parse(tc.function.arguments || "{}") as {
                        action?: "save" | "update" | "delete" | "list";
                        content?: string;
                        kind?: string;
                        memory_id?: string;
                        attachment_filename?: string;
                        library_id?: string;
                        library_filename?: string;
                      };
                      const action = parsedArgs.action || "save";
                      if (action === "list") {
                        const all = await listAllMemories(authed.client, authed.id, authed.token);
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: true,
                            count: all.length,
                            memories: all.slice(0, 40).map((m) => ({
                              id: m.id,
                              kind: m.kind,
                              content: m.content,
                              hasAttachment: Boolean(m.attachment),
                            })),
                          }),
                        });
                      } else if (action === "delete") {
                        if (!parsedArgs.memory_id) {
                          throw new Error("missing memory_id for delete");
                        }
                        await deleteMemory(authed.token, parsedArgs.memory_id);
                        memoryMutatedInTool = true;
                        send("memory_updated", "1");
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: true,
                            deleted_id: parsedArgs.memory_id,
                            message: "Запись удалена из памяти пользователя.",
                          }),
                        });
                      } else if (action === "update") {
                        if (!parsedArgs.memory_id || !parsedArgs.content?.trim()) {
                          throw new Error("missing memory_id or content for update");
                        }
                        const updated = await updateMemory(authed.id, authed.token, parsedArgs.memory_id, {
                          content: parsedArgs.content.trim(),
                          kind: parsedArgs.kind,
                        });
                        memoryMutatedInTool = true;
                        send("memory_updated", "1");
                        followupMessages.push({
                          role: "tool",
                          tool_call_id: tc.id,
                          content: JSON.stringify({
                            ok: true,
                            memory: { id: updated.id, content: updated.content, kind: updated.kind },
                            message: `Запись памяти обновлена: «${updated.content}».`,
                          }),
                        });
                      } else {
                        let attachmentToSave: MemoryAttachment | undefined;
                        if (parsedArgs.library_id || parsedArgs.library_filename || (parsedArgs.attachment_filename && !parsed.userAttachments?.length)) {
                          const libMatch = findLibraryFiles(libraryItems, {
                            id: parsedArgs.library_id,
                            filename: parsedArgs.library_filename || parsedArgs.attachment_filename,
                            query: parsedArgs.library_filename || parsedArgs.attachment_filename || lastUserMessage,
                          })[0];
                          if (libMatch) {
                            const textContent = extractLibraryText(libMatch).slice(0, 24_000);
                            const safeB64 = libraryItemToBase64DataUrl(libMatch);
                            attachmentToSave = {
                              name: libMatch.name,
                              type: libMatch.mimeType || "text/plain",
                              ...(safeB64 && safeB64.length <= 750_000 ? { dataUrl: safeB64 } : {}),
                              ...(textContent ? { textContent } : {}),
                            };
                          }
                        }

                        if (!attachmentToSave && (parsedArgs.attachment_filename || (parsed.userAttachments?.length && !parsedArgs.content?.trim()))) {
                          const targetName = (parsedArgs.attachment_filename || "").toLowerCase();
                          const ua =
                            parsed.userAttachments?.find((a) => a.name.toLowerCase() === targetName) ||
                            parsed.userAttachments?.[0];
                          if (ua) {
                            const mime = ua.type || (ua.dataUrl.startsWith("data:") ? ua.dataUrl.slice(5, ua.dataUrl.indexOf(";")) : "application/octet-stream");
                            let textContent: string | undefined;
                            const isTextLike =
                              mime.startsWith("text/") ||
                              /\.(txt|md|json|csv|js|ts|tsx|py|html|css|xml|yaml|yml|log)$/i.test(ua.name);
                            if (isTextLike && ua.dataUrl.includes(",")) {
                              try {
                                const b64 = ua.dataUrl.split(",")[1] || "";
                                textContent = Buffer.from(b64, "base64").toString("utf-8").slice(0, 24000);
                              } catch {  }
                            }
                            attachmentToSave = {
                              name: ua.name,
                              type: mime,
                              ...(ua.dataUrl.length <= 750_000 ? { dataUrl: ua.dataUrl } : {}),
                              ...(textContent ? { textContent } : {}),
                            };
                          }
                        }

                        if (!attachmentToSave && libraryItems.length > 0 && /(library|библиотек|отч[её]т|report|файл)/i.test(lastUserMessage)) {
                          const libMatch = findLibraryFiles(libraryItems, { query: lastUserMessage })[0];
                          if (libMatch) {
                            const textContent = extractLibraryText(libMatch).slice(0, 24_000);
                            const safeB64 = libraryItemToBase64DataUrl(libMatch);
                            attachmentToSave = {
                              name: libMatch.name,
                              type: libMatch.mimeType || "text/plain",
                              ...(safeB64 && safeB64.length <= 750_000 ? { dataUrl: safeB64 } : {}),
                              ...(textContent ? { textContent } : {}),
                            };
                          }
                        }

                        const contentText = (parsedArgs.content || "").trim() || (attachmentToSave ? `Файл из Library: ${attachmentToSave.name}` : "");
                        if (!contentText) {
                          throw new Error("missing content to save");
                        }
                        const existing = await listAllMemories(authed.client, authed.id, authed.token);
                        const matchExisting = existing.find(
                          (m) => m.content.trim().toLowerCase() === contentText.toLowerCase(),
                        );
                        if (matchExisting && !attachmentToSave) {
                          followupMessages.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            content: JSON.stringify({
                              ok: true,
                              already_existed: true,
                              memory: { id: matchExisting.id, content: matchExisting.content, kind: matchExisting.kind },
                              message: `Эта информация уже сохранена в памяти: «${matchExisting.content}».`,
                            }),
                          });
                        } else {
                          const created = await createMemory(authed.id, authed.token, {
                            content: contentText,
                            kind: parsedArgs.kind || "other",
                            ...(attachmentToSave ? { attachment: attachmentToSave } : {}),
                          });
                          memoryMutatedInTool = true;
                          send("memory_updated", "1");
                          followupMessages.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            content: JSON.stringify({
                              ok: true,
                              memory: { id: created.id, content: created.content, kind: created.kind, attachmentName: attachmentToSave?.name },
                              message: `Сохранено в долговременную память (Memory HUD): «${created.content}»${attachmentToSave ? ` с вложением «${attachmentToSave.name}»` : ""}. Кратко подтверди пользователю.`,
                            }),
                          });
                        }
                      }
                    } catch (e) {
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({ ok: false, error: (e as Error).message }),
                      });
                    }
                  } else if (tc.function.name === "search_and_read_memory") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments || "{}") as { query?: string; memory_id?: string };
                      let results: MemoryRow[] = [];
                      if (authed) {
                        const allMemories = await listAllMemories(authed.client, authed.id, authed.token);
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
                        action: String(parsedArgs.action || "Requested action"),
                        reason: String(parsedArgs.reason || "Outside technical capabilities"),
                        alternative: String(parsedArgs.alternative || "I can help with code, writing, or research instead"),
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
                  } else if (tc.function.name === "suggest_tab_transition") {
                    try {
                      const parsedArgs = JSON.parse(tc.function.arguments) as {
                        target_tab?: "engine" | "flow" | "library" | "saved";
                        title?: string;
                        reason?: string;
                        suggested_prompt?: string;
                      };
                      const transitionPayload = {
                        id: tc.id,
                        targetTab: parsedArgs.target_tab || "engine",
                        title: parsedArgs.title || "Open dedicated workspace",
                        reason: parsedArgs.reason || "This request requires tools from a dedicated workspace tab",
                        suggestedPrompt: parsedArgs.suggested_prompt || lastUserMessage,
                      };
                      send("tab_transition_event", JSON.stringify(transitionPayload));
                      followupMessages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                          ok: true,
                          target_tab: transitionPayload.targetTab,
                          message: `Интерактивная кнопка перехода во вкладку «${transitionPayload.targetTab}» показана пользователю в чате. Теперь обязательно объясни пользователю границы возможностей текстового чата (почему нельзя полноценно собрать/запустить или выгрузить проект прямо здесь в обычном тексте) и предложи нажать на появившуюся кнопку перехода.`,
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

                conversationMessages = followupMessages;
                try {
                  const nextTools = toolRound < 4 ? activeTools : [];
                  currentOutcome = await runStream(conversationMessages, nextTools, true);
                  if (currentOutcome.assistantText) {
                    finalAssistantText = currentOutcome.assistantText;
                  }
                } catch (secondErr) {
                  console.warn("Followup tool streaming non-fatal fallback:", secondErr);
                  if (!finalAssistantText && lastGeneratedImageDataUrl) {
                    finalAssistantText = "Image created.";
                    send("delta", JSON.stringify(finalAssistantText));
                  }
                  break;
                }
              }

              if (authed && lastUserMessage && !memoryMutatedInTool) {
                try {
                  const changed = await Promise.race([
                    analyzeAndUpdateMemory(
                      authed.client,
                      authed.id,
                      lastUserMessage,
                      finalAssistantText,
                      authed.token,
                    ),
                    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 6000)),
                  ]);
                  if (changed) send("memory_updated", "1");
                } catch (e) {
                  console.error("memory analyze error", e);
                }
              }
              send("done", "1");
              safeClose();
            } catch (err) {
              console.error("stream error", err);
              if (!lastGeneratedImageDataUrl && !finalAssistantText && !hitImageLimit) {
                send("error", JSON.stringify("stream_failed"));
              } else {
                send("done", "1");
              }
              safeClose();
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
