import { GoogleGenAI } from "@google/genai";
import {
  executeTerminalCommand,
  listLibraryFilesOnDisk,
  readLibraryFileOnDisk,
  writeLibraryFileOnDisk,
  sanitizeLibraryFilename,
} from "./flow-terminal";
import { searchWebLive } from "./web-search";
import { buildFlowSystemDirective, type AgentId } from "./system-prompts";
import type { FlowStep, FlowAutonomyLevel } from "../types/flow";

export type FlowModelId = "instinct" | "chat" | "f1";

let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
  }
  return aiClient;
}

export interface PlanContext {
  availableFiles?: Array<{ name: string; type?: string }>;
  hasGithub?: boolean;
  hasGmail?: boolean;
  hasCalendar?: boolean;
  projectId?: string | null;
  agent?: AgentId;
  model?: FlowModelId;
}

export interface StepExecutionContext {
  goal: string;
  autonomy: FlowAutonomyLevel;
  agent?: AgentId;
  model?: FlowModelId;
  projectId?: string | null;
  previousSteps?: Array<{ title: string; tool: string; status: string; output?: string }>;
  availableFiles?: Array<{ name: string; type?: string; snippet?: string }>;
  githubToken?: string;
  gmailToken?: string;
  calendarToken?: string;
}

export interface FlowStepArtifact {
  name: string;
  type: string;
  content: string;
  projectId?: string | null;
}

export interface FlowStepResult {
  output: string;
  error?: string;
  artifact?: FlowStepArtifact;
  createdFiles?: FlowStepArtifact[];
  emailDraft?: {
    to: string;
    subject: string;
    body: string;
    sent: boolean;
    messageId?: string;
  };
  calendarEvent?: {
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    createdInGoogle: boolean;
    htmlLink?: string;
  };
}

export interface PlanResult {
  title: string;
  steps: Array<{
    title: string;
    description: string;
    tool: string;
    toolParams?: Record<string, any>;
    requiresApproval: boolean;
  }>;
}

function formatPreviousContext(previousSteps?: StepExecutionContext["previousSteps"], maxChars = 6000): string {
  if (!previousSteps || previousSteps.length === 0) return "No previous steps completed.";
  let out = "";
  for (let i = 0; i < previousSteps.length; i++) {
    const ps = previousSteps[i];
    const snippet = (ps.output || "").trim().slice(0, 1800);
    const block = `### Step ${i + 1}: ${ps.title} [${ps.tool}]\n${snippet}\n\n`;
    if (out.length + block.length > maxChars) break;
    out += block;
  }
  return out.trim() || "No text outputs from previous steps.";
}

function modelTemperatureFor(model?: FlowModelId): number | undefined {
  if (model === "chat") return 1.1;
  if (model === "f1") return 0.4;
  if (model === "instinct") return 0.8;
  return undefined;
}

async function generateTextWithGemini(
  prompt: string,
  opts?: { agent?: AgentId; model?: FlowModelId },
): Promise<string | null> {
  const directive = buildFlowSystemDirective(opts?.agent || "universal");
  const ai = getAi();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          systemInstruction: directive,
        },
      });
      const txt = response.text?.trim();
      if (txt) return txt;
    } catch (e) {
      console.warn("Gemini generateText failed:", e);
    }
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    try {
      const temperature = modelTemperatureFor(opts?.model);
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          ...(temperature !== undefined ? { temperature } : {}),
          messages: [
            { role: "system", content: directive },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        const text = json.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (text) return text;
      }
    } catch (e) {
      console.warn("DeepSeek text generation failed:", e);
    }
  }
  return null;
}

/**
 * Plans multi-stage execution steps from natural language goal.
 */
export async function planFlowTask(
  goal: string,
  autonomy: FlowAutonomyLevel,
  context: PlanContext = {}
): Promise<PlanResult> {
  const flowDirective = buildFlowSystemDirective(context.agent || "universal");
  const diskFiles = await listLibraryFilesOnDisk(context.projectId, false);
  const combinedFileNames = Array.from(
    new Set([
      ...diskFiles.map((f) => f.name),
      ...(context.availableFiles || []).map((f) => f.name),
    ])
  );

  const systemPrompt = `${flowDirective}

You are Flow Autonomous Planning Agent inside IGseek Studio.
Break down the user's goal into 3-6 concrete, non-redundant, genuinely executable steps in the same language as the user's goal.

Current environment facts:
- Sandbox working directory has user's Library files mounted in "./library" (${combinedFileNames.length} files currently present: ${combinedFileNames.slice(0, 15).join(", ") || "empty"}).
- Platform source directories (/app, /proc, /sys) are strictly off-limits. Only operate on user files in ./library or workspace.
- Connected integrations: GitHub=${context.hasGithub ? "CONNECTED" : "not connected (public owner/repo only)"}, Gmail=${context.hasGmail ? "CONNECTED" : "drafts saved locally"}, Calendar=${context.hasCalendar ? "CONNECTED" : ".ics & local reminder"}.

Available tools & required toolParams:
- "web_search": Google Search grounding across live web (toolParams: { "query": "specific search query" })
- "web_monitor": Live HTTP fetch & inspect specific URL (ONLY use if a real https:// URL is known or requested; toolParams: { "url": "https://...", "selector": "optional css/keyword" })
- "terminal": Execute real bash/python3/node commands inside isolated sandbox (toolParams: { "command": "exact bash command operating in . or ./library" })
- "github": Real GitHub REST API inspection (toolParams: { "action": "inspect_repo" | "list_repos" | "search" | "create_issue", "repo": "owner/repo if applicable", "query": "optional search" })
- "library": Create/save a real file into Library OR inspect/verify existing Library files (toolParams: { "action": "create" | "check", "filename": "report_name.md", "title": "Document Title", "type": "report" | "code" | "data" })
- "email": Send email via Gmail or create real email draft file in Library (toolParams: { "to": "recipient or empty", "subject": "...", "body": "..." })
- "calendar": Create event in Google Calendar or .ics reminder (toolParams: { "title": "...", "start_time": "ISO string" })

Rules:
- Always put Library inspection/file creation or synthesis steps AFTER data collection steps.
- Every step must pass real, specific toolParams. Never invent placeholder URLs like example.com unless user gave them.
- Return ONLY a valid JSON object:
{
  "title": "Short task title (up to 6 words, matching goal language)",
  "steps": [
    {
      "title": "Short step title",
      "description": "What this step does",
      "tool": "web_search" | "terminal" | "web_monitor" | "github" | "library" | "email" | "calendar",
      "toolParams": { ... },
      "requiresApproval": boolean
    }
  ]
}`;

  const userPrompt = `GOAL: ${goal}\nAUTONOMY MODE: ${autonomy}`;

  // Prefer Gemini 4 Hydrogen for fast, accurate JSON planning
  const ai = getAi();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: `${systemPrompt}\n\n${userPrompt}`,
        config: { responseMimeType: "application/json" },
      });
      const raw = (response.text || "{}").replace(/```json\s*|```/gi, "").trim();
      const parsed = JSON.parse(raw);
      if (parsed.steps && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.warn("Gemini planning failed, trying DeepSeek:", e);
    }
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    try {
      const temperature = modelTemperatureFor(context.model);
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          ...(temperature !== undefined ? { temperature } : {}),
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(18000),
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        const text = json.choices?.[0]?.message?.content || "";
        const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```json\s*|```/gi, "").trim();
        const parsed = JSON.parse(clean);
        if (parsed.steps && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("DeepSeek planning failed:", e);
    }
  }

  // Deterministic smart fallback tailored to goal
  const slug = sanitizeLibraryFilename(goal.slice(0, 28)).replace(/\.[^.]+$/, "") || "flow_report";
  return {
    title: goal.slice(0, 50),
    steps: [
      {
        title: "Web search & data gathering",
        description: "Search for up-to-date information and sources for the goal",
        tool: "web_search",
        toolParams: { query: goal },
        requiresApproval: false,
      },
      {
        title: "Inspect workspace in terminal",
        description: "Check sandbox files and ./library directory",
        tool: "terminal",
        toolParams: { command: "pwd && ls -la library" },
        requiresApproval: false,
      },
      {
        title: "Save report to Library",
        description: "Synthesize previous step results and write file to Library",
        tool: "library",
        toolParams: { action: "create", filename: `${slug}.md`, title: `Report: ${goal.slice(0, 40)}`, type: "report" },
        requiresApproval: autonomy === "assist",
      },
      {
        title: "Verify saved Library files",
        description: "Verify presence and integrity of the created file on disk",
        tool: "library",
        toolParams: { action: "check", filename: `${slug}.md` },
        requiresApproval: false,
      },
    ],
  };
}

async function resolveTerminalCommand(step: FlowStep, taskContext: StepExecutionContext): Promise<string> {
  const rawCmd = typeof step.toolParams?.command === "string" ? step.toolParams.command.trim() : "";
  if (rawCmd.length > 0) {
    if (/^(python|python3|node|bash|sh|zsh|cat|read|less|more|top|htop)$/i.test(rawCmd)) {
      if (rawCmd.startsWith("python")) return 'python3 -c "import os, sys; print(sys.version); print(os.listdir(\'library\'))"';
      if (rawCmd === "node") return 'node -e "console.log(process.version, require(\'fs\').readdirSync(\'library\'))"';
      if (rawCmd === "cat") return "ls -la library && head -n 40 library/* 2>/dev/null || true";
      return "pwd && ls -la && ls -la library";
    }
    return rawCmd;
  }

  // Ask Gemini to generate an exact, safe bash command using available library files & step description
  const diskFiles = await listLibraryFilesOnDisk(taskContext.projectId, false);
  const aiCmd = await generateTextWithGemini(
    `Generate ONE safe, single-line Linux bash command (no markdown, no backticks, no explanation, no stdin reading) to execute inside the sandbox workspace for this step.
Step title: ${step.title}
Step description: ${step.description || ""}
Overall goal: ${taskContext.goal}
Files currently in ./library: ${diskFiles.map((f) => f.name).join(", ") || "(empty)"}
Rules: Never access /app, /proc, /sys, or ../. If creating output files, save them in ./library/. If inspecting files, inspect ./library/.`,
    { agent: taskContext.agent, model: taskContext.model },
  );
  if (aiCmd) {
    const cleaned = aiCmd.replace(/^```(?:bash|sh)?\s*|```$/gi, "").split("\n")[0].trim();
    if (cleaned.length > 0 && cleaned.length < 400) {
      return cleaned;
    }
  }

  const text = `${step.title} ${step.description || ""} ${taskContext.goal}`.toLowerCase();
  if (text.includes("library") || text.includes("библиотек") || text.includes("файл") || text.includes("директор")) {
    return "pwd && ls -la && echo '=== ./library ===' && ls -la library";
  }
  return "pwd && ls -la library && uname -a";
}

function stripHtmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return { title, text: cleaned };
}

function extractUrl(step: FlowStep, taskContext: StepExecutionContext): string | null {
  const paramUrl = typeof step.toolParams?.url === "string" ? step.toolParams.url.trim() : "";
  if (/^https?:\/\/[a-z0-9.-]+/i.test(paramUrl) && !paramUrl.includes("example.com")) {
    return paramUrl;
  }
  const prevText = (taskContext.previousSteps || []).map((s) => s.output || "").join("\n");
  const pool = `${paramUrl}\n${step.description || ""}\n${step.title}\n${taskContext.goal}\n${prevText}`;
  const match = pool.match(/https?:\/\/[^\s)"'<>]+/i);
  if (match && !match[0].includes("example.com")) {
    return match[0].replace(/[.,;!?]+$/, "");
  }
  return null;
}

function extractGithubRepo(step: FlowStep, taskContext: StepExecutionContext): string | null {
  const paramRepo = typeof step.toolParams?.repo === "string" ? step.toolParams.repo.trim() : "";
  if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(paramRepo) && paramRepo !== "current-repository") {
    return paramRepo;
  }
  const pool = `${paramRepo} ${step.description || ""} ${step.title} ${taskContext.goal}`;
  const urlMatch = pool.match(/github\.com\/([a-z0-9_.-]+\/[a-z0-9_.-]+)/i);
  if (urlMatch) return urlMatch[1].replace(/\.git$/i, "");
  const slugMatch = pool.match(/\b([a-z0-9_.-]+\/[a-z0-9_.-]+)\b/i);
  if (slugMatch && !slugMatch[1].includes("example") && !slugMatch[1].startsWith("http")) {
    const candidate = slugMatch[1];
    // Ignore file-like paths such as src/lib or library/file.md
    if (!/^(src|lib|library|app|api|components|routes|http|https)\//i.test(candidate) && !/\.(md|txt|json|ts|tsx|js|py|csv)$/i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function inferFilename(step: FlowStep): string {
  const rawName = step.toolParams?.filename || step.toolParams?.title || step.title || "flow_document";
  let safe = sanitizeLibraryFilename(String(rawName));
  if (!pathHasExt(safe)) {
    const type = String(step.toolParams?.type || "report").toLowerCase();
    if (type === "json" || type === "data") safe += ".json";
    else if (type === "code") safe += ".ts";
    else safe += ".md";
  }
  return safe;
}

function pathHasExt(name: string): boolean {
  const idx = name.lastIndexOf(".");
  return idx > 0 && idx < name.length - 1 && name.length - idx <= 6;
}

/**
 * Executes a single step of a Flow task with real integrations and previous-step context.
 */
export async function executeFlowStep(
  step: FlowStep,
  taskContext: StepExecutionContext
): Promise<FlowStepResult> {
  const tool = (step.tool || "").toLowerCase();
  const prevSummary = formatPreviousContext(taskContext.previousSteps);

  // =========================================================================
  // 1. TERMINAL TOOL
  // =========================================================================
  if (tool === "terminal") {
    const cmd = await resolveTerminalCommand(step, taskContext);
    const res = await executeTerminalCommand(cmd, { projectId: taskContext.projectId });
    if (res.exitCode !== 0) {
      return {
        output: res.stdout || "",
        error: res.stderr || `Command failed with exit code ${res.exitCode}`,
      };
    }

    const createdFiles = (res.createdFiles || []).map((f) => ({
      name: f.name,
      type: f.type,
      content: f.content,
      projectId: taskContext.projectId || null,
    }));

    const createdNote =
      createdFiles.length > 0
        ? `\n\n[Created/updated files in Library: ${createdFiles.map((f) => f.name).join(", ")}]`
        : "";
    const cleanOut = (res.stdout || "").trim();

    return {
      output: (cleanOut ? `$ ${cmd}\n\n${cleanOut}` : `$ ${cmd}\n\n[Completed successfully: exit code 0]`) + createdNote,
      createdFiles: createdFiles.length > 0 ? createdFiles : undefined,
      artifact: createdFiles[0],
    };
  }

  // =========================================================================
  // 2. WEB SEARCH TOOL (Google Search Grounding via Gemini 4 + Multi-Provider Live Search)
  // =========================================================================
  if (tool === "web_search") {
    const q = String(step.toolParams?.query || step.title || taskContext.goal).trim();
    const ai = getAi();
    const flowDirective = buildFlowSystemDirective(taskContext.agent || "universal");

    if (ai) {
      try {
        const resp = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: `Perform an up-to-date web search for: "${q}".
Task context: ${taskContext.goal}
${taskContext.previousSteps?.length ? `Data from previous steps:\n${prevSummary}\n` : ""}
Write a structured, factual answer in the same language as the task goal (with concrete facts, figures, and names).`,
          config: {
            systemInstruction: flowDirective,
            tools: [{ googleSearch: {} }],
          },
        });

        const text = resp.text?.trim() || "";
        const chunks = (resp.candidates?.[0]?.groundingMetadata?.groundingChunks || []) as Array<{
          web?: { uri?: string; title?: string };
        }>;
        const links = chunks
          .map((c) => c.web)
          .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
          .slice(0, 6);

        if (text) {
          const sourcesBlock =
            links.length > 0
              ? `\n\nSources (Google Search):\n${links.map((l, i) => `${i + 1}. ${l.title || l.uri} — ${l.uri}`).join("\n")}`
              : "";
          return { output: `${text}${sourcesBlock}` };
        }
      } catch (e) {
        console.warn("Gemini googleSearch grounding failed, trying multi-provider live search:", e);
      }
    }

    // Resilient parallel live search: DuckDuckGo + Bing RSS + Google News RSS + Wikipedia EN/RU
    let hits = await searchWebLive(q, 6);
    if (hits.length === 0) {
      const relaxed = q
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !/^\d{4}$/.test(w))
        .slice(0, 3)
        .join(" ");
      if (relaxed && relaxed !== q) {
        hits = await searchWebLive(relaxed, 6);
      }
    }

    if (hits.length > 0) {
      const formattedHits = hits
        .map((h, i) => `${i + 1}. **${h.title}** [${h.source}]\n   ${h.snippet || "No description"}\n   ${h.url}`)
        .join("\n\n");

      const synthesis = await generateTextWithGemini(
        `Based ONLY on these live web search results for "${q}", write a concise structured summary (3–5 points) with source links in the same language as the goal (${taskContext.goal}):\n\n${formattedHits}`,
        { agent: taskContext.agent, model: taskContext.model },
      );

      if (synthesis) {
        return {
          output: `${synthesis}\n\n--- Found Sources ---\n${hits.map((h, i) => `${i + 1}. [${h.source}] ${h.title} — ${h.url}`).join("\n")}`,
        };
      }

      return {
        output: `Live web search results for "${q}":\n\n${formattedHits}`,
      };
    }

    return {
      output: "",
      error: `Failed to retrieve live web search results for "${q}". Try simplifying or refining the search query.`,
    };
  }

  // =========================================================================
  // 3. WEB MONITOR TOOL (Real HTTP inspection + optional selector/AI extract)
  // =========================================================================
  if (tool === "web_monitor") {
    const url = extractUrl(step, taskContext);
    if (!url) {
      return {
        output: "",
        error: "No valid URL (https://...) specified for monitoring.",
      };
    }

    const started = Date.now();
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; IGseekFlowMonitor/1.0)",
          Accept: "text/html,application/json,text/plain,*/*",
        },
        signal: AbortSignal.timeout(10000),
      });
      const latencyMs = Date.now() - started;
      const contentType = resp.headers.get("content-type") || "unknown";
      const rawBody = await resp.text();
      const { title, text } = contentType.includes("json")
        ? { title: "JSON Response", text: rawBody.slice(0, 3000) }
        : stripHtmlToText(rawBody);

      const selector = typeof step.toolParams?.selector === "string" ? step.toolParams.selector.trim() : "";
      let selectorReport = "";
      if (selector) {
        const idx = rawBody.toLowerCase().indexOf(selector.replace(/^[#.]/, "").toLowerCase());
        if (idx !== -1) {
          const fragment = stripHtmlToText(rawBody.slice(Math.max(0, idx - 50), idx + 350)).text;
          selectorReport = `\nSelector/keyword match "${selector}": found → "${fragment}"`;
        } else {
          selectorReport = `\nSelector/keyword "${selector}": not found in returned markup.`;
        }
      }

      const excerpt = text.slice(0, 1200) || "(empty response)";
      if (!resp.ok) {
        return {
          output: `URL: ${url}\nStatus: HTTP ${resp.status} ${resp.statusText} (${latencyMs} ms)\nTitle: ${title || "none"}`,
          error: `Server returned error HTTP ${resp.status} ${resp.statusText}`,
        };
      }

      return {
        output: [
          `URL: ${url}`,
          `Status: HTTP ${resp.status} OK (${latencyMs} ms, ${rawBody.length} bytes)`,
          `Content-Type: ${contentType}`,
          title ? `Title: ${title}` : null,
          selectorReport || null,
          `\nExtracted content:\n${excerpt}${text.length > 1200 ? "..." : ""}`,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    } catch (err: any) {
      return {
        output: `URL: ${url}`,
        error: `Connection failed to ${url}: ${err?.message || "timeout or unreachable host"}`,
      };
    }
  }

  // =========================================================================
  // 4. LIBRARY TOOL (Real Read/Verify & Create/Write to Sandbox FS + UI Sync)
  // =========================================================================
  if (tool === "library") {
    const rawAction = String(step.toolParams?.action || "").toLowerCase();
    const hintText = `${step.title} ${step.description || ""}`.toLowerCase();
    const isInspectMode =
      rawAction === "check" ||
      rawAction === "verify" ||
      rawAction === "list" ||
      rawAction === "read" ||
      rawAction === "analyze" ||
      (!rawAction &&
        /\b(провер|верифиц|инспект|изуч|прочита|список|audit|check|verify|list|read|inspect)\b/i.test(hintText) &&
        !/\b(созда|сохран|запиш|сгенерир|напиш|create|save|write|generate)\b/i.test(step.title.toLowerCase()));

    if (isInspectMode) {
      const targetFilename = step.toolParams?.filename || step.toolParams?.file;
      const filesOnDisk = await listLibraryFilesOnDisk(taskContext.projectId, false);

      if (targetFilename) {
        const readRes = await readLibraryFileOnDisk(String(targetFilename), taskContext.projectId);
        if (!readRes) {
          return {
            output: `Files in Library (${taskContext.projectId ? `project ${taskContext.projectId}` : "global"}): ${filesOnDisk.length}\nList: ${filesOnDisk.map((f) => `${f.name} (${f.sizeBytes} B)`).join(", ") || "empty"}`,
            error: `Target file "${targetFilename}" not found on disk in Library.`,
          };
        }
        let syntaxNote = "Readable text verified.";
        if (readRes.name.endsWith(".json")) {
          try {
            JSON.parse(readRes.content);
            syntaxNote = "Valid JSON.";
          } catch (e: any) {
            syntaxNote = `JSON error: ${e.message}`;
          }
        }
        return {
          output: `File "${readRes.name}" verified on disk in Library.\nSize: ${readRes.sizeBytes} bytes | Updated: ${readRes.updatedAt}\nCheck: ${syntaxNote}\n\nContent preview:\n${readRes.content.slice(0, 1800)}${readRes.content.length > 1800 ? "\n..." : ""}`,
        };
      }

      // General Library audit across real disk files
      if (filesOnDisk.length === 0) {
        return {
          output: `Library directory (${taskContext.projectId ? `project ${taskContext.projectId}` : "global"}) inspected: 0 files.\nRun a file creation step or attach files in chat to add files to Library.`,
        };
      }

      const detailedFiles = await listLibraryFilesOnDisk(taskContext.projectId, true);
      const listing = detailedFiles
        .map((f, idx) => `${idx + 1}. ${f.name} (${f.type}, ${f.sizeBytes} bytes)`)
        .join("\n");

      const contentForAi = detailedFiles
        .filter((f) => f.isText && f.content)
        .slice(0, 5)
        .map((f) => `--- File: ${f.name} ---\n${(f.content || "").slice(0, 2000)}`)
        .join("\n\n");

      let analysis = "";
      if (contentForAi) {
        analysis =
          (await generateTextWithGemini(
            `Perform a concise real analysis of these Library files for task "${taskContext.goal}" (step: ${step.title}). Answer strictly based on file contents in the same language as the goal.\n\n${contentForAi}`,
            { agent: taskContext.agent, model: taskContext.model },
          )) || "";
      }

      return {
        output: `Inspected files in Library (${detailedFiles.length}):\n${listing}${analysis ? `\n\nContent analysis:\n${analysis}` : ""}`,
      };
    }

    // CREATE / WRITE mode: generate rich content using previousSteps, write to disk, read back to verify
    const filename = inferFilename(step);
    const title = String(step.toolParams?.title || step.title || filename);
    let content = typeof step.toolParams?.content === "string" ? step.toolParams.content.trim() : "";

    if (!content || content.length < 80) {
      const generated = await generateTextWithGemini(
        `Prepare rich, comprehensive content for file "${filename}" (title: "${title}", format: ${step.toolParams?.type || "markdown"}).
Task goal: ${taskContext.goal}
Step description: ${step.description || step.title}

Real data from previous steps (MUST use in the document):
${prevSummary}

If format is .json, return ONLY valid JSON without markdown wrappers. Otherwise return a Markdown document in the same language as the task goal.`,
        { agent: taskContext.agent, model: taskContext.model },
      );
      if (generated) {
        content = filename.endsWith(".json")
          ? generated.replace(/^```json\s*|```$/gi, "").trim()
          : generated;
      }
    }

    if (!content) {
      content = `# ${title}\n\nGoal: ${taskContext.goal}\nCreated: ${new Date().toISOString()}\n\n## Collected Data\n${prevSummary}`;
    }

    const written = await writeLibraryFileOnDisk(filename, content, taskContext.projectId);
    const verified = await readLibraryFileOnDisk(written.name, taskContext.projectId);
    if (!verified || verified.sizeBytes === 0) {
      return {
        output: "",
        error: `Failed to verify disk write for "${written.name}" in Library.`,
      };
    }

    const artifact: FlowStepArtifact = {
      name: verified.name,
      type: String(step.toolParams?.type || "document"),
      content: verified.content,
      projectId: taskContext.projectId || null,
    };

    return {
      output: `File "${verified.name}" created, saved to Library, and verified on disk (${verified.sizeBytes} bytes).\n\nPreview:\n${verified.content.slice(0, 900)}${verified.content.length > 900 ? "\n..." : ""}`,
      artifact,
      createdFiles: [artifact],
    };
  }

  // =========================================================================
  // 5. GITHUB TOOL (Real GitHub REST API)
  // =========================================================================
  if (tool === "github") {
    const token = taskContext.githubToken?.trim();
    const ghHeaders: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "IGseek-Flow-Agent",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const action = String(step.toolParams?.action || "inspect_repo").toLowerCase();
    const repo = extractGithubRepo(step, taskContext);

    try {
      // Case A: Repository specified -> inspect / commits / issues / create issue
      if (repo) {
        if (action === "create_issue") {
          if (!token) {
            return {
              output: "",
              error: `To create an issue in repository "${repo}", connect GitHub (OAuth or PAT) in the Flow header.`,
            };
          }
          const issueTitle = String(step.toolParams?.title || step.title);
          const issueBody =
            String(step.toolParams?.body || "") ||
            (await generateTextWithGemini(
              `Write a GitHub Issue body for repository ${repo} for task "${taskContext.goal}" (in the same language as the goal).\nContext:\n${prevSummary}`,
              { agent: taskContext.agent, model: taskContext.model },
            )) ||
            `Created via IGseek Flow:\n\n${taskContext.goal}`;

          const createRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
            method: "POST",
            headers: { ...ghHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ title: issueTitle, body: issueBody }),
            signal: AbortSignal.timeout(10000),
          });
          const data = (await createRes.json()) as any;
          if (!createRes.ok) {
            return {
              output: "",
              error: `GitHub API (${createRes.status}): ${data?.message || "Failed to create issue"}`,
            };
          }
          return {
            output: `Created real Issue #${data.number} in ${repo}: ${data.title}\nLink: ${data.html_url}`,
          };
        }

        // Real inspection of repo metadata, root tree, and recent commits
        const [repoRes, commitsRes, contentsRes, issuesRes] = await Promise.all([
          fetch(`https://api.github.com/repos/${repo}`, { headers: ghHeaders, signal: AbortSignal.timeout(8000) }),
          fetch(`https://api.github.com/repos/${repo}/commits?per_page=5`, { headers: ghHeaders, signal: AbortSignal.timeout(8000) }),
          fetch(`https://api.github.com/repos/${repo}/contents/`, { headers: ghHeaders, signal: AbortSignal.timeout(8000) }),
          fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=5`, { headers: ghHeaders, signal: AbortSignal.timeout(8000) }),
        ]);

        if (!repoRes.ok) {
          const errJson = (await repoRes.json().catch(() => ({}))) as any;
          return {
            output: "",
            error: `GitHub API for "${repo}" returned ${repoRes.status}: ${errJson?.message || repoRes.statusText}`,
          };
        }

        const repoData = (await repoRes.json()) as any;
        const commits = commitsRes.ok ? ((await commitsRes.json()) as any[]) : [];
        const contents = contentsRes.ok ? ((await contentsRes.json()) as any[]) : [];
        const issues = issuesRes.ok ? ((await issuesRes.json()) as any[]) : [];

        const commitLines = commits
          .slice(0, 5)
          .map((c) => `- ${String(c.sha || "").slice(0, 7)}: ${String(c.commit?.message || "").split("\n")[0]} (${c.commit?.author?.name || "unknown"})`)
          .join("\n");
        const treeLines = Array.isArray(contents)
          ? contents.slice(0, 20).map((f) => `${f.type === "dir" ? "[dir]" : "[file]"} ${f.name}`).join(", ")
          : "no data";
        const issueLines = Array.isArray(issues)
          ? issues.slice(0, 5).map((i) => `#${i.number}: ${i.title}`).join("\n")
          : "none";

        return {
          output: [
            `Repository: ${repoData.full_name} (${repoData.private ? "Private" : "Public"})`,
            `Description: ${repoData.description || "no description"}`,
            `Language: ${repoData.language || "N/A"} | Stars: ${repoData.stargazers_count} | Forks: ${repoData.forks_count} | Branch: ${repoData.default_branch}`,
            `Root files: ${treeLines}`,
            `\nRecent commits:\n${commitLines || "no data"}`,
            `\nOpen Issues (${repoData.open_issues_count}):\n${issueLines || "none"}`,
          ].join("\n"),
        };
      }

      // Case B: Authenticated user's repositories list
      if (token && (action === "list_repos" || action === "audit" || !step.toolParams?.query)) {
        const [userRes, reposRes] = await Promise.all([
          fetch("https://api.github.com/user", { headers: ghHeaders, signal: AbortSignal.timeout(8000) }),
          fetch("https://api.github.com/user/repos?sort=updated&per_page=10", { headers: ghHeaders, signal: AbortSignal.timeout(8000) }),
        ]);
        if (!reposRes.ok) {
          const errJson = (await reposRes.json().catch(() => ({}))) as any;
          return {
            output: "",
            error: `GitHub API error (${reposRes.status}): ${errJson?.message || "Check GitHub token"}`,
          };
        }
        const userJson = userRes.ok ? ((await userRes.json()) as any) : null;
        const repos = (await reposRes.json()) as any[];
        const list = repos
          .map(
            (r, idx) =>
              `${idx + 1}. ${r.full_name} (${r.private ? "private" : "public"}, ${r.language || "—"}, ★${r.stargazers_count}) — ${r.html_url}`
          )
          .join("\n");
        return {
          output: `Connected GitHub: ${userJson?.login ? `@${userJson.login}` : "OK"}\nFound repositories (${repos.length}):\n${list || "No repositories found."}`,
        };
      }

      // Case C: Public GitHub repository search
      const searchQ = String(step.toolParams?.query || step.title || taskContext.goal).trim();
      if (action === "search" || searchQ) {
        const sr = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQ)}&sort=stars&per_page=5`,
          { headers: ghHeaders, signal: AbortSignal.timeout(8000) }
        );
        if (sr.ok) {
          const sdata = (await sr.json()) as any;
          const items = sdata.items || [];
          if (items.length > 0) {
            return {
              output: `GitHub repository search for "${searchQ}":\n${items
                .map((r: any, i: number) => `${i + 1}. ${r.full_name} (★${r.stargazers_count}, ${r.language || "N/A"}) — ${r.description || ""}\n   ${r.html_url}`)
                .join("\n")}`,
            };
          }
        }
      }

      return {
        output: "",
        error: "No owner/repo specified and no GitHub account connected (OAuth/PAT).",
      };
    } catch (err: any) {
      return {
        output: "",
        error: `GitHub API request failed: ${err?.message || "network error"}`,
      };
    }
  }

  // =========================================================================
  // 6. EMAIL TOOL (Real Gmail Send if authed, else real Draft artifact in Library + local store)
  // =========================================================================
  if (tool === "email") {
    const rawTo = String(step.toolParams?.to || "").trim();
    const goalEmailMatch = `${rawTo} ${step.description || ""} ${taskContext.goal}`.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    const to = goalEmailMatch && !goalEmailMatch[0].includes("example.com") ? goalEmailMatch[0] : "";
    const subject = String(step.toolParams?.subject || step.title || `Flow Report: ${taskContext.goal.slice(0, 40)}`);

    let body = typeof step.toolParams?.body === "string" ? step.toolParams.body.trim() : "";
    if (!body || body.length < 40) {
      body =
        (await generateTextWithGemini(
          `Write a clear professional email body on subject "${subject}" in the same language as the goal.\nGoal: ${taskContext.goal}\nPrevious steps data:\n${prevSummary}`,
          { agent: taskContext.agent, model: taskContext.model },
        )) || `Hello,\n\nResults for "${taskContext.goal}":\n\n${prevSummary}`;
    }

    if (taskContext.gmailToken && to) {
      try {
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
        const rawMsg = [
          `To: ${to}`,
          "Content-Type: text/plain; charset=utf-8",
          "MIME-Version: 1.0",
          `Subject: ${utf8Subject}`,
          "",
          body,
        ].join("\n");
        const encoded = Buffer.from(rawMsg, "utf8")
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${taskContext.gmailToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encoded }),
          signal: AbortSignal.timeout(10000),
        });
        const gmailJson = (await gmailRes.json().catch(() => ({}))) as any;
        if (!gmailRes.ok) {
          return {
            output: "",
            error: `Gmail API (${gmailRes.status}): ${gmailJson?.error?.message || "Failed to send email"}`,
          };
        }
        return {
          output: `Email sent via Gmail API to ${to}.\nSubject: ${subject}\nMessage ID: ${gmailJson.id}`,
          emailDraft: { to, subject, body, sent: true, messageId: gmailJson.id },
        };
      } catch (err: any) {
        return {
          output: "",
          error: `Gmail send error: ${err?.message || "network error"}`,
        };
      }
    }

    // Gmail not connected or no valid recipient -> create real draft file in Library + local email store
    const draftName = sanitizeLibraryFilename(`email_draft_${Date.now()}.md`);
    const draftContent = `# Email Draft\n\n- **To:** ${to || "(not specified)"}\n- **Subject:** ${subject}\n- **Status:** Draft (Gmail OAuth not connected or no recipient specified)\n\n---\n\n${body}`;
    const written = await writeLibraryFileOnDisk(draftName, draftContent, taskContext.projectId);
    const artifact: FlowStepArtifact = {
      name: written.name,
      type: "document",
      content: written.content,
      projectId: taskContext.projectId || null,
    };

    return {
      output: `${taskContext.gmailToken ? "Email recipient not specified" : "Gmail not connected"} — email was NOT sent externally.\nDraft saved to Library (${written.name}) and local drafts:\n\nSubject: ${subject}\nTo: ${to || "not specified"}\n\n${body.slice(0, 500)}${body.length > 500 ? "..." : ""}`,
      artifact,
      createdFiles: [artifact],
      emailDraft: { to: to || "", subject, body, sent: false },
    };
  }

  // =========================================================================
  // 7. CALENDAR TOOL (Real Google Calendar API if authed, else real .ics file + local reminder)
  // =========================================================================
  if (tool === "calendar") {
    const title = String(step.toolParams?.title || step.title || taskContext.goal.slice(0, 60));
    const now = new Date();
    const defaultStart = new Date(now.getTime() + 60 * 60 * 1000);
    let startIso = defaultStart.toISOString();
    if (typeof step.toolParams?.start_time === "string") {
      const parsedDate = new Date(step.toolParams.start_time);
      if (!isNaN(parsedDate.getTime())) startIso = parsedDate.toISOString();
    }
    const endIso = new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();
    const description = `Flow task: ${taskContext.goal}\n\n${prevSummary.slice(0, 1200)}`;

    if (taskContext.calendarToken) {
      try {
        const calRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${taskContext.calendarToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: title,
            description,
            start: { dateTime: startIso },
            end: { dateTime: endIso },
          }),
          signal: AbortSignal.timeout(10000),
        });
        const calJson = (await calRes.json().catch(() => ({}))) as any;
        if (!calRes.ok) {
          return {
            output: "",
            error: `Google Calendar API (${calRes.status}): ${calJson?.error?.message || "Failed to create event"}`,
          };
        }
        return {
          output: `Event created in Google Calendar: "${calJson.summary || title}"\nStart: ${startIso}\nLink: ${calJson.htmlLink || "OK"}`,
          calendarEvent: {
            title,
            description,
            startTime: startIso,
            endTime: endIso,
            createdInGoogle: true,
            htmlLink: calJson.htmlLink,
          },
        };
      } catch (err: any) {
        return {
          output: "",
          error: `Google Calendar error: ${err?.message || "network error"}`,
        };
      }
    }

    // Generate real .ics file in Library + trigger local calendar reminder on client
    const formatIcsDate = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//IGseek Flow//Calendar Event//EN",
      "BEGIN:VEVENT",
      `UID:flow_${Date.now()}@igseek.local`,
      `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
      `DTSTART:${formatIcsDate(startIso)}`,
      `DTEND:${formatIcsDate(endIso)}`,
      `SUMMARY:${title.replace(/\n/g, " ")}`,
      `DESCRIPTION:${description.replace(/\n/g, "\\n").slice(0, 500)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const icsName = sanitizeLibraryFilename(`calendar_${Date.now()}.ics`);
    const written = await writeLibraryFileOnDisk(icsName, icsContent, taskContext.projectId);
    const artifact: FlowStepArtifact = {
      name: written.name,
      type: "data",
      content: written.content,
      projectId: taskContext.projectId || null,
    };

    return {
      output: `Google Calendar not connected — created local reminder and exportable .ics file in Library (${written.name}).\nEvent: "${title}"\nTime: ${new Date(startIso).toISOString()}`,
      artifact,
      createdFiles: [artifact],
      calendarEvent: {
        title,
        description,
        startTime: startIso,
        endTime: endIso,
        createdInGoogle: false,
      },
    };
  }

  return {
    output: "",
    error: `Unknown Flow tool: "${step.tool}".`,
  };
}
