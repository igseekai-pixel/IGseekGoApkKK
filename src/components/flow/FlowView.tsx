import React, { useState, useEffect, useRef } from "react";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import {
  Play,
  Pause,
  RotateCcw,
  Terminal,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Radio,
  FileCode,
  Github,
  Sparkles,
  Search,
  Plus,
  Trash2,
  Layers,
  ArrowUpRight,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Lock,
  Globe,
  Sliders,
  Bell,
  Code2,
  Download,
  Activity,
  Check,
  X,
  RefreshCw,
  Folder,
  FolderOpen,
  Copy,
  Key,
  Menu,
  Shuffle,
  TrendingUp,
  Zap,
  CheckSquare,
  Paperclip,
  Mic,
  MicOff,
  Loader2,
  Cpu,
  Layers3,
  Square,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  auth,
  db,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "@/lib/firebase";
import { getCachedGmailToken, saveLocalEmail } from "@/lib/gmail";
import { getCachedCalendarToken, saveLocalReminder } from "@/lib/google-calendar";
import { readFlowLibraryFiles, upsertFlowLibraryFiles } from "@/lib/flow-library-store";
import { addFileToUnifiedLibrary, fetchUnifiedLibraryItems, toBase64DataUrlFromItem } from "@/lib/unified-library";
import { LibraryPickerModal } from "@/components/LibraryPickerModal";
import {
  LongTextButton,
  LongTextModal,
  countTextLines,
  isLongTextOverLimit,
} from "@/components/ui/LongTextModal";
import { useT, useLang, localeFor } from "@/lib/i18n";
import { LimitCooldownCard } from "@/components/ui/LimitCooldownCard";
import {
  PROMPT_LIMITS,
  type PromptReceipt,
  canUsePrompt,
  consumePrompt,
  ensureScopeResetTimestamp,
  formatRemainingReset,
  isWithinCancelRefundWindow,
  refundPrompt,
  usePromptLimits,
} from "@/lib/prompt-limits";
import type {
  FlowTask,
  FlowStep,
  FlowAutonomyLevel,
  FlowScenario,
  FlowIntegration,
  FlowLogEntry,
  TerminalExecutionResult,
} from "@/types/flow";

const FLOW_STORAGE_KEY = "igseek:flow_tasks";

export interface FlowScenarioChip {
  id: string;
  name: string;
  description: string;
  category: string;
  goalTemplate: string;
  recommendedAutonomy: FlowAutonomyLevel;
  icon: any;
  color: string;
  tag: string;
}

const ALL_FLOW_SCENARIOS: FlowScenarioChip[] = [
  {
    id: "sc-competitors",
    name: "5 Competitors Analysis",
    description: "Research competitor websites, compare features, and generate a comparison table in Library.",
    category: "Analytics",
    goalTemplate: "Find top 5 competitors in our niche, study their platforms, compare strengths, and save a detailed comparison table to Library.",
    recommendedAutonomy: "semi-auto",
    icon: Search,
    color: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
    tag: "Market",
  },
  {
    id: "sc-web-monitor",
    name: "GitHub Releases Monitor",
    description: "Periodically check the project page and notify immediately when a new version appears.",
    category: "Monitoring",
    goalTemplate: "Track updates on https://github.com/trending and send me a summary whenever new trends appear.",
    recommendedAutonomy: "autopilot",
    icon: Radio,
    color: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    tag: "Trends",
  },
  {
    id: "sc-github-ci",
    name: "GitHub Audit & CI/CD Tests",
    description: "Inspect the repository, find build errors, run tests via terminal, and prepare a report.",
    category: "DevOps",
    goalTemplate: "Analyze the current project structure via terminal, run tsc --noEmit type checks, and verify release readiness.",
    recommendedAutonomy: "assist",
    icon: Github,
    color: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400",
    tag: "CI/CD",
  },
  {
    id: "sc-files-sort",
    name: "Organize Library & Files",
    description: "Scan attached files, extract key insights, and group them by project.",
    category: "Library",
    goalTemplate: "Analyze the files in my Library, create a concise summary of each document, and build a knowledge map.",
    recommendedAutonomy: "semi-auto",
    icon: FolderOpen,
    color: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
    tag: "Files",
  },
  {
    id: "sc-ai-trends",
    name: "Weekly AI & LLM Trends",
    description: "Find major model releases and AI breakthroughs over the last 7 days.",
    category: "Research",
    goalTemplate: "Find and summarize 5 major AI releases and open-weight models from the last 7 days, and prepare a concise digest.",
    recommendedAutonomy: "semi-auto",
    icon: TrendingUp,
    color: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
    tag: "AI",
  },
  {
    id: "sc-security-audit",
    name: "npm Security Audit",
    description: "Scan package.json for vulnerabilities and prepare patch recommendations.",
    category: "Security",
    goalTemplate: "Scan package.json via terminal, run npm audit for vulnerabilities, and list required security updates.",
    recommendedAutonomy: "assist",
    icon: ShieldCheck,
    color: "bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400",
    tag: "Security",
  },
  {
    id: "sc-api-cheatsheet",
    name: "API Markdown Cheatsheet",
    description: "Gather endpoint specifications and build a developer-friendly reference guide.",
    category: "Documentation",
    goalTemplate: "Inspect the service API, extract key endpoints, parameters, and request examples, and save a structured cheatsheet to Library.",
    recommendedAutonomy: "semi-auto",
    icon: FileCode,
    color: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    tag: "Docs",
  },
  {
    id: "sc-task-breakdown",
    name: "Release Launch Breakdown",
    description: "Break down a complex launch into engineering milestones with effort estimates and acceptance criteria.",
    category: "Planning",
    goalTemplate: "Break down a new product launch into sprints: frontend, backend, QA testing, deployment, and analytics.",
    recommendedAutonomy: "semi-auto",
    icon: Sparkles,
    color: "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400",
    tag: "Plan",
  },
];

const INITIAL_INTEGRATIONS: FlowIntegration[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Access repositories, file trees, commits, Issues, and Pull Requests for autonomous Flow tasks.",
    connected: false,
    scopes: [
      { id: "repo:read", label: "Read repositories & source trees", granted: true },
      { id: "repo:issues", label: "Create and comment on Issues", granted: true },
      { id: "repo:write", label: "Create branches and Pull Requests", granted: false, critical: true },
    ],
  },
];

function cleanForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter((v) => v !== undefined)
      .map(cleanForFirestore);
  }
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      const res = cleanForFirestore(val);
      if (res !== undefined) {
        clean[key] = res;
      }
    }
  }
  return clean;
}

export function FlowView({
  userId,
  isAuthed,
  onRequireAuth,
  onOpenLibrary,
  onToggleSidebar,
  projects = [],
  chats = [],
  onCreateProject,
  agent = "universal",
  model = "instinct",
}: {
  userId: string | null;
  isAuthed: boolean;
  onRequireAuth: () => void;
  onOpenLibrary?: () => void;
  onToggleSidebar?: () => void;
  projects?: Array<{ id: string; name: string }>;
  chats?: Array<any>;
  onCreateProject?: (name: string) => Promise<any>;
  agent?: "universal" | "coder" | "hacker" | "mentor" | "psy" | "creative";
  model?: "instinct" | "chat" | "f1";
}) {
  const lang = useLang();
  const t = useT();
  const firestoreUserId =
    userId && userId !== "guest" && !userId.startsWith("local_") && Boolean(auth.currentUser)
      ? userId
      : null;
  const usageUid = firestoreUserId || "guest";
  const { usage: promptUsage, limits: promptLimits } = usePromptLimits(usageUid);
  const flowUsed = promptUsage.flow;
  const flowLimit = promptLimits.flow;
  const flowExhausted = flowUsed >= flowLimit;
  const [cooldownResetAt, setCooldownResetAt] = useState<number>(0);

  useEffect(() => {
    if (!flowExhausted && cooldownResetAt) {
      setCooldownResetAt(0);
    }
  }, [flowExhausted, cooldownResetAt]);
  const [tasks, setTasks] = useState<FlowTask[]>([]);
  const tasksRef = useRef<FlowTask[]>([]);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState("");
  const goalComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const syncGoalComposerHeight = useAutoResizeTextarea(goalComposerRef, goalInput, {
    maxViewportFraction: null,
    deps: [Boolean(selectedTaskId)],
  });
  const [autonomy, setAutonomy] = useState<FlowAutonomyLevel>("semi-auto");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isRunningStep, setIsRunningStep] = useState(false);
  const [runningStepId, setRunningStepId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const planAbortRef = useRef<{ controller: AbortController; receipt: PromptReceipt | null } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {}
    };
  }, []);
  const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [longTextTarget, setLongTextTarget] = useState<
    | { kind: "composer" }
    | { kind: "goal"; taskId: string }
    | { kind: "step_desc"; taskId: string; stepId: string; stepTitle: string }
    | { kind: "step_output"; taskId: string; stepId: string; stepTitle: string; tool: string }
    | { kind: "artifact"; taskId: string; index: number; name: string }
    | null
  >(null);

  const [scenariosList, setScenariosList] = useState<FlowScenarioChip[]>(() => {
    return [...ALL_FLOW_SCENARIOS].sort(() => Math.random() - 0.5);
  });

  const shuffleScenarios = () => {
    setScenariosList([...ALL_FLOW_SCENARIOS].sort(() => Math.random() - 0.5));
    toast.success(t("Scenarios shuffled!"));
  };

  const [githubUser, setGithubUser] = useState<any>(() => {
    try {
      const u = localStorage.getItem("igseek:github_user");
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });
  const [githubToken, setGithubToken] = useState<string>(() => {
    return localStorage.getItem("igseek:github_token") || "";
  });
  const [isConnectingGithub, setIsConnectingGithub] = useState(false);
  const [patInput, setPatInput] = useState("");
  const [customClientId, setCustomClientId] = useState(() => {
    return localStorage.getItem("igseek:github_client_id") || "";
  });
  const [showConfig, setShowConfig] = useState(false);

  const [integrations, setIntegrations] = useState<FlowIntegration[]>(() => {
    try {
      const stored = localStorage.getItem("igseek:flow_integrations");
      if (stored) {
        const parsed = JSON.parse(stored);
        const filtered = parsed.filter((i: any) => i.id === "github");
        if (filtered.length > 0) return filtered;
      }
    } catch {
    }
    return INITIAL_INTEGRATIONS;
  });

  const saveIntegrations = (list: FlowIntegration[]) => {
    setIntegrations(list);
    try {
      localStorage.setItem("igseek:flow_integrations", JSON.stringify(list));
    } catch {
    }
  };

  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      if (e.data?.type === "GITHUB_OAUTH_SUCCESS") {
        const { token, user: userProfile } = e.data;
        if (token) {
          setGithubToken(token);
          localStorage.setItem("igseek:github_token", token);
        }
        if (userProfile) {
          setGithubUser(userProfile);
          localStorage.setItem("igseek:github_user", JSON.stringify(userProfile));
        } else if (token) {
          await verifyAndSaveToken(token);
        }
        const updated = integrations.map((it) => (it.id === "github" ? { ...it, connected: true } : it));
        saveIntegrations(updated);
        toast.success(`${t("GitHub account connected:")} ${userProfile?.login ? `@${userProfile.login}` : ""}`.trim());
      } else if (e.data?.type === "GITHUB_OAUTH_ERROR") {
        toast.error(`${t("GitHub authorization error:")} ${e.data.error}`);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [integrations, lang]);

  useEffect(() => {
    if (githubToken && !githubUser) {
      void verifyAndSaveToken(githubToken);
    }
  }, []);

  const handleConnectGitHubOAuth = async () => {
    setIsConnectingGithub(true);
    try {
      const scopes = integrations[0]?.scopes.filter((s: any) => s.granted).map((s: any) => s.id).join(",") || "repo,read:user";
      const params = new URLSearchParams({ scopes });
      if (customClientId.trim()) {
        params.set("client_id", customClientId.trim());
        localStorage.setItem("igseek:github_client_id", customClientId.trim());
      }
      const res = await fetch(`/api/auth/github/url?${params.toString()}`);
      if (!res.ok) throw new Error(t("Failed to get OAuth link from server"));
      const resText = await res.text();
      let resJson: any = {};
      try { resJson = JSON.parse(resText); } catch { throw new Error(t("Invalid OAuth response from server")); }
      const { url: authUrl, hasClientId } = resJson;

      if (!hasClientId && !customClientId.trim()) {
        toast.info(t("OAuth requires your GitHub App Client ID, or connect using a Personal Access Token (PAT)"));
        setShowConfig(true);
        return;
      }

      const popup = window.open(
        authUrl,
        "github_oauth_popup",
        "width=600,height=720,menubar=no,toolbar=no,status=no"
      );
      if (!popup) {
        toast.error(t("Popup blocked by browser. Please allow popups."));
      }
    } catch (err: any) {
      toast.error(err.message || t("Failed to start GitHub OAuth"));
    } finally {
      setIsConnectingGithub(false);
    }
  };

  const handleSavePAT = async () => {
    const clean = patInput.trim();
    if (!clean) {
      toast.error(t("Enter your GitHub Personal Access Token (PAT)"));
      return;
    }
    setIsConnectingGithub(true);
    try {
      await verifyAndSaveToken(clean);
      setPatInput("");
      setShowConfig(false);
    } finally {
      setIsConnectingGithub(false);
    }
  };

  const verifyAndSaveToken = async (tokenStr: string) => {
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${tokenStr}` },
      });
      if (!res.ok) throw new Error(t("Invalid GitHub token"));
      const text = await res.text();
      let profile: any = {};
      try { profile = JSON.parse(text); } catch { throw new Error(t("GitHub profile error")); }
      setGithubUser(profile);
      setGithubToken(tokenStr);
      localStorage.setItem("igseek:github_user", JSON.stringify(profile));
      localStorage.setItem("igseek:github_token", tokenStr);

      const updated = integrations.map((it) => (it.id === "github" ? { ...it, connected: true } : it));
      saveIntegrations(updated);
      toast.success(`${t("GitHub account connected:")} @${profile.login}`);
    } catch (err: any) {
      toast.error(err.message || t("Token verification failed"));
    }
  };

  const handleDisconnectGithub = () => {
    setGithubUser(null);
    setGithubToken("");
    localStorage.removeItem("igseek:github_token");
    localStorage.removeItem("igseek:github_user");
    const updated = integrations.map((it) => (it.id === "github" ? { ...it, connected: false } : it));
    saveIntegrations(updated);
    toast.success(t("GitHub account disconnected"));
  };

  const mergeTasksPreservingRunning = (incoming: FlowTask[]): FlowTask[] => {
    return incoming.map((inc) => {
      const local = tasksRef.current.find((c) => c.id === inc.id);
      if (!local) return inc;
      const isLocalActive = local.status === "running" || local.steps.some((s) => s.status === "running");
      if (isLocalActive) {
        const mergedSteps = inc.steps.map((incStep) => {
          const localStep = local.steps.find((ls) => ls.id === incStep.id);
          if (localStep && localStep.status === "running") {
            return localStep;
          }
          return incStep;
        });
        return {
          ...inc,
          status: local.status === "running" ? "running" : inc.status,
          steps: mergedSteps,
          logs: local.logs.length > inc.logs.length ? local.logs : inc.logs,
        };
      }
      return inc;
    });
  };

  const isInitialLoadRef = useRef(true);

  const commitTasks = (next: FlowTask[]) => {
    tasksRef.current = next;
    setTasks(next);
    try {
      localStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(next));
    } catch {
    }
  };

  useEffect(() => {
    if (firestoreUserId) {
      isInitialLoadRef.current = true;
      const q = query(collection(db, "flow_tasks"), where("userId", "==", firestoreUserId));
      const unsubscribe = onSnapshot(
        q,
        (snap: any) => {
          const loaded: FlowTask[] = snap.docs
            .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
            .sort((a: FlowTask, b: FlowTask) => {
              const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
              const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
              return tb - ta;
            });
          if (isInitialLoadRef.current) {
            isInitialLoadRef.current = false;
            const sanitized = loaded.map((t) => ({
              ...t,
              status: t.status === "running" ? ("idle" as const) : t.status,
              steps: (t.steps || []).map((s) => (s.status === "running" ? { ...s, status: "pending" as const } : s)),
            }));
            commitTasks(sanitized);
            if (sanitized.length > 0 && !selectedTaskId) setSelectedTaskId(sanitized[0].id);
          } else {
            const merged = mergeTasksPreservingRunning(loaded);
            commitTasks(merged);
            if (merged.length > 0 && !selectedTaskId) setSelectedTaskId(merged[0].id);
          }
        },
        (error: any) => {
          console.warn("Firestore flow_tasks snapshot fallback to local:", error);
          loadLocalTasks();
        }
      );
      return () => unsubscribe();
    } else {
      loadLocalTasks();
    }
  }, [firestoreUserId]);

  const loadLocalTasks = () => {
    try {
      const raw = localStorage.getItem(FLOW_STORAGE_KEY);
      if (raw) {
        const parsed: FlowTask[] = JSON.parse(raw);
        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
          const sanitized = parsed.map((t) => ({
            ...t,
            status: t.status === "running" ? ("idle" as const) : t.status,
            steps: (t.steps || []).map((s) => (s.status === "running" ? { ...s, status: "pending" as const } : s)),
          }));
          commitTasks(sanitized);
          if (sanitized.length > 0 && !selectedTaskId) setSelectedTaskId(sanitized[0].id);
        } else {
          const merged = mergeTasksPreservingRunning(parsed);
          commitTasks(merged);
          if (merged.length > 0 && !selectedTaskId) setSelectedTaskId(merged[0].id);
        }
      }
    } catch {
    }
  };

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null;

  const getFlowHeaders = () => {
    let token = "";
    try {
      const raw = localStorage.getItem("igseek:token") || localStorage.getItem("igseek:session");
      if (raw) {
        const parsed = JSON.parse(raw);
        token = parsed?.access_token || parsed?.token || "";
      }
    } catch {  }
    return {
      "content-type": "application/json",
      "x-guest-mode": firestoreUserId ? "false" : "true",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  };

  const collectLocalLibraryFiles = (targetProjectId?: string | null) => {
    const files: Array<{ name: string; type?: string; dataUrl?: string; content?: string }> = [];
    const seen = new Set<string>();

    for (const f of readFlowLibraryFiles()) {
      if (targetProjectId && f.projectId !== targetProjectId) continue;
      if (!targetProjectId && f.projectId) continue;
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      files.push({ name: f.name, type: f.type, content: f.content });
    }

    try {
      const raw = localStorage.getItem("igseek:guest-store");
      if (raw) {
        const store = JSON.parse(raw);
        const allowedChatIds = targetProjectId
          ? new Set(
              (store.chats || [])
                .filter((c: any) => c.project_id === targetProjectId)
                .map((c: any) => c.id)
            )
          : null;

        for (const [chatId, msgs] of Object.entries(store.messages || {})) {
          if (allowedChatIds && !allowedChatIds.has(chatId)) continue;
          if (!Array.isArray(msgs)) continue;
          for (const m of msgs as any[]) {
            if (!m) continue;
            if (m.content) {
              const matches = [...m.content.matchAll(/!\[([^\]]*)\]\((data:[^)]+)\)/g)];
              for (const match of matches) {
                const name = match[1] || "uploaded_file.txt";
                if (!seen.has(name)) {
                  seen.add(name);
                  files.push({ name, type: match[2].startsWith("data:image/") ? "image" : "document", dataUrl: match[2] });
                }
              }
            }
            if (Array.isArray(m.artifacts)) {
              for (const art of m.artifacts) {
                const name = art.title ? (art.title.includes(".") ? art.title : `${art.title}.${art.language || "txt"}`) : "artifact.txt";
                if (!seen.has(name) && art.content !== undefined) {
                  seen.add(name);
                  files.push({ name, type: "artifact", content: art.content });
                }
              }
            }
          }
        }
      }
    } catch {  }

    return files;
  };

  const syncLibraryFiles = async (targetProjectId?: string | null, signal?: AbortSignal) => {
    try {
      const proj = targetProjectId !== undefined ? targetProjectId : selectedProjectId;
      const localFiles = collectLocalLibraryFiles(proj);
      const unifiedItems = await fetchUnifiedLibraryItems({ userId, chats, projects }).catch(() => []);
      const seenNames = new Set(localFiles.map((f) => f.name.toLowerCase()));
      const files = [...localFiles];
      for (const ui of unifiedItems) {
        if (!ui.name || seenNames.has(ui.name.toLowerCase())) continue;
        seenNames.add(ui.name.toLowerCase());
        files.push({
          name: ui.name,
          type: ui.type,
          ...(ui.content !== undefined ? { content: ui.content } : {}),
          ...(ui.dataUrl ? { dataUrl: toBase64DataUrlFromItem(ui) || ui.dataUrl } : {}),
        });
      }
      if (files.length > 0) {
        await fetch("/api/flow", {
          method: "POST",
          signal,
          headers: getFlowHeaders(),
          body: JSON.stringify({ action: "sync_library", projectId: proj || null, files: files.slice(0, 40) }),
        });
      }
      return files;
    } catch (e) {
      if ((e as any)?.name !== "AbortError") {
        console.warn("Failed to sync library files:", e);
      }
      return [];
    }
  };

  useEffect(() => {
    void syncLibraryFiles(selectedProjectId);
  }, [selectedProjectId]);

  const handleCancelPlan = () => {
    const active = planAbortRef.current;
    if (!active) return;
    planAbortRef.current = null;
    active.controller.abort();
    if (isWithinCancelRefundWindow(active.receipt) && refundPrompt(active.receipt)) {
      toast.info(t("Request cancelled within 5s — prompt refunded."));
    } else {
      toast.info(t("Planning stopped"));
    }
    setIsPlanning(false);
  };

  const handleCreatePlan = async (customGoal?: string) => {
    const goal = (customGoal || goalInput).trim();
    if (!goal || isPlanning) return;
    if (!canUsePrompt("flow", usageUid)) {
      const reset = ensureScopeResetTimestamp("flow", usageUid);
      setCooldownResetAt(reset);
      toast.error(
        `${t("Flow prompt limit reached (18/18).")} ${t("Limits will reset in")} ${formatRemainingReset(reset, lang)}.`,
      );
      return;
    }

    const { receipt } = consumePrompt("flow", usageUid);
    const controller = new AbortController();
    planAbortRef.current = { controller, receipt };
    setIsPlanning(true);
    try {
      const syncedFiles = await syncLibraryFiles(selectedProjectId, controller.signal);
      if (controller.signal.aborted) return;

      const res = await fetch("/api/flow", {
        method: "POST",
        signal: controller.signal,
        headers: getFlowHeaders(),
        body: JSON.stringify({
          action: "plan",
          goal,
          autonomy,
          agent,
          model,
          projectId: selectedProjectId || null,
          availableFiles: syncedFiles.map((f) => ({ name: f.name, type: f.type })),
          hasGithub: Boolean(githubToken),
          hasGmail: Boolean(getCachedGmailToken()),
          hasCalendar: Boolean(getCachedCalendarToken()),
        }),
      });

      const resText = await res.text();
      let resData: any = {};
      try {
        resData = JSON.parse(resText);
      } catch {
        throw new Error(`${t("Server error")} (${res.status}): ${t("invalid response format")}`);
      }

      if (!res.ok) throw new Error(resData.error || t("Plan generation failed"));
      const plan = resData.plan || {};

      const newTask: FlowTask = {
        id: "flow_" + Date.now(),
        userId: firestoreUserId || "guest",
        title: plan.title || goal.slice(0, 40),
        goal,
        status: "idle",
        autonomy,
        steps: (plan.steps || []).map((s: any, idx: number) => ({
          id: `step_${idx + 1}`,
          title: s.title || `${t("Step")} ${idx + 1}`,
          description: s.description || "",
          tool: s.tool || "web_search",
          toolParams: s.toolParams || {},
          status: "pending",
          requiresApproval: Boolean(s.requiresApproval),
          output: "",
          error: "",
        })),
        logs: [
          {
            id: `log_init_${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(localeFor(lang)),
            type: "info",
            message: `${t("Generated step-by-step plan:")} ${plan.steps?.length || 0} ${t("steps")}. ${t("Autonomy mode:")} ${autonomy.toUpperCase()}`,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        projectId: selectedProjectId || null,
      };

      if (firestoreUserId) {
        try {
          const payload = cleanForFirestore({ ...newTask });
          delete payload.id;
          const docRef = await addDoc(collection(db, "flow_tasks"), payload);
          newTask.id = docRef.id;
        } catch (e) {
          console.warn("Could not save to firestore, stored locally:", e);
        }
      }

      commitTasks([newTask, ...tasksRef.current]);
      setSelectedTaskId(newTask.id);
      setGoalInput("");
      toast.success(`${t("Plan ready:")} ${newTask.title}`);
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        return;
      }
      refundPrompt(receipt);
      toast.error(err.message || t("Failed to create plan"));
    } finally {
      if (planAbortRef.current?.controller === controller) {
        planAbortRef.current = null;
      }
      setIsPlanning(false);
    }
  };

  const updateTaskInState = (updatedTask: FlowTask) => {
    const next = tasksRef.current.map((t) => (t.id === updatedTask.id ? updatedTask : t));
    commitTasks(next);

    if (firestoreUserId && updatedTask.id) {
      try {
        const payload = cleanForFirestore({
          ...updatedTask,
          userId: firestoreUserId,
          user_id: firestoreUserId,
        });
        delete payload.id;
        void updateDoc(doc(db, "flow_tasks", updatedTask.id), payload).catch(() => {
          void setDoc(doc(db, "flow_tasks", updatedTask.id), payload, { merge: true }).catch((e) => {
            console.warn("Firestore task sync (non-fatal):", e);
          });
        });
      } catch (e) {
        console.warn("Firestore serialization error (non-fatal):", e);
      }
    }
  };

  const appendDeduplicatedLog = (
    existingLogs: FlowLogEntry[],
    newLog: Omit<FlowLogEntry, "id">
  ): FlowLogEntry[] => {
    const last = existingLogs[existingLogs.length - 1];
    if (!last) {
      return [{ ...newLog, id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }];
    }

    const cleanBase = (msg: string) => msg.replace(/\s*\(x\d+\)$/, "").trim();
    if (last.type === newLog.type && cleanBase(last.message) === cleanBase(newLog.message)) {
      const match = last.message.match(/\(x(\d+)\)$/);
      const count = match ? parseInt(match[1], 10) : 1;
      const updated: FlowLogEntry = {
        ...last,
        timestamp: newLog.timestamp,
        message: `${cleanBase(newLog.message)} (x${count + 1})`,
      };
      return [...existingLogs.slice(0, -1), updated];
    }

    return [...existingLogs, { ...newLog, id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }];
  };

  const executeStepCore = async (taskId: string, stepId: string): Promise<boolean> => {
    const currentTask = tasksRef.current.find((t) => t.id === taskId);
    if (!currentTask) return false;

    const stepIndex = currentTask.steps.findIndex((s: FlowStep) => s.id === stepId);
    if (stepIndex === -1) return false;

    const step = currentTask.steps[stepIndex];
    const activeProjectId = currentTask.projectId ?? selectedProjectId ?? null;

    const syncedFiles = await syncLibraryFiles(activeProjectId);

    const updatedSteps = [...currentTask.steps];
    updatedSteps[stepIndex] = { ...step, status: "running", error: "" };

    const actionMsg = `${t("Running tool")} [${step.tool.toUpperCase()}]: ${step.title}`;
    const deduplicatedActionLogs = appendDeduplicatedLog(currentTask.logs, {
      timestamp: new Date().toLocaleTimeString(localeFor(lang)),
      type: "action",
      message: actionMsg,
    });

    const taskUpdated: FlowTask = {
      ...currentTask,
      status: "running",
      steps: updatedSteps,
      logs: deduplicatedActionLogs,
      updatedAt: new Date().toISOString(),
    };
    updateTaskInState(taskUpdated);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 45000);

    try {
      const previousSteps = currentTask.steps
        .slice(0, stepIndex)
        .filter((s) => s.status === "completed")
        .map((s) => ({
          title: s.title,
          tool: s.tool,
          status: s.status,
          output: (s.output || "").slice(0, 6000),
        }));

      const res = await fetch("/api/flow", {
        method: "POST",
        signal: controller.signal,
        headers: getFlowHeaders(),
        body: JSON.stringify({
          action: "run_step",
          step,
          taskContext: {
            goal: currentTask.goal,
            autonomy: currentTask.autonomy,
            agent,
            model,
            projectId: activeProjectId,
            previousSteps,
            availableFiles: syncedFiles.map((f) => ({ name: f.name, type: f.type })),
            githubToken: githubToken || undefined,
            gmailToken: getCachedGmailToken() || undefined,
            calendarToken: getCachedCalendarToken() || undefined,
          },
        }),
      });

      clearTimeout(timeoutId);

      const resText = await res.text();
      let resData: any = {};
      try {
        resData = JSON.parse(resText);
      } catch {
        throw new Error(`${t("Server response error")} (${res.status}): ${t("invalid response format")}`);
      }

      if (!res.ok) {
        throw new Error(resData.error || `${t("Request failed")} (${res.status})`);
      }
      const stepResult = resData.stepResult || { output: resData.output || t("Completed"), error: resData.error };

      const createdArtifacts: Array<{ name: string; type: string; content: string; projectId?: string | null }> = [];
      if (Array.isArray(stepResult.createdFiles)) {
        for (const f of stepResult.createdFiles) {
          if (f?.name && f.content !== undefined) {
            createdArtifacts.push({
              name: f.name,
              type: f.type || "document",
              content: f.content,
              projectId: activeProjectId,
            });
          }
        }
      }
      if (stepResult.artifact?.name && stepResult.artifact?.content !== undefined) {
        if (!createdArtifacts.some((a) => a.name === stepResult.artifact.name)) {
          createdArtifacts.push({
            name: stepResult.artifact.name,
            type: stepResult.artifact.type || "document",
            content: stepResult.artifact.content,
            projectId: activeProjectId,
          });
        }
      }
      if (createdArtifacts.length > 0) {
        upsertFlowLibraryFiles(
          createdArtifacts.map((a) => ({
            ...a,
            taskId: currentTask.id,
            taskTitle: currentTask.title,
          }))
        );
      }

      if (stepResult.emailDraft && !stepResult.emailDraft.sent) {
        saveLocalEmail({
          to: stepResult.emailDraft.to || "",
          from: "Flow Draft",
          subject: stepResult.emailDraft.subject || step.title,
          body: stepResult.emailDraft.body || "",
          snippet: (stepResult.emailDraft.body || "").slice(0, 120),
          labelIds: ["DRAFT"],
        });
      }
      if (stepResult.calendarEvent && !stepResult.calendarEvent.createdInGoogle) {
        saveLocalReminder({
          summary: stepResult.calendarEvent.title,
          description: stepResult.calendarEvent.description,
          start: { dateTime: stepResult.calendarEvent.startTime },
          end: { dateTime: stepResult.calendarEvent.endTime },
          isReminder: true,
        });
      }

      const latestTask = tasksRef.current.find((t) => t.id === taskId) || taskUpdated;
      const finalSteps = [...latestTask.steps];
      const hasError = Boolean(stepResult.error);

      finalSteps[stepIndex] = {
        ...step,
        status: hasError ? "failed" : "completed",
        output: stepResult.output || "",
        error: stepResult.error || "",
      };

      const allDone = finalSteps.every((s) => s.status === "completed");
      const anyFailed = finalSteps.some((s) => s.status === "failed");

      const resultMsg = hasError
        ? `${t("Step failed")} (${step.title}): ${stepResult.error}`
        : `${t("Step completed:")} ${step.title}`;

      const finalLogs = appendDeduplicatedLog(latestTask.logs, {
        timestamp: new Date().toLocaleTimeString(localeFor(lang)),
        type: hasError ? "error" : "success",
        message: resultMsg,
      });

      const existingArtifacts = latestTask.outputArtifacts || [];
      const mergedArtifactsMap = new Map(existingArtifacts.map((a) => [a.name, a]));
      for (const art of createdArtifacts) {
        mergedArtifactsMap.set(art.name, art);
      }

      const finalTask: FlowTask = {
        ...latestTask,
        status: anyFailed ? "failed" : allDone ? "completed" : "idle",
        steps: finalSteps,
        logs: finalLogs,
        outputArtifacts: Array.from(mergedArtifactsMap.values()),
        updatedAt: new Date().toISOString(),
      };

      updateTaskInState(finalTask);
      if (hasError) {
        toast.error(`${step.title}: ${stepResult.error}`);
        return false;
      } else {
        toast.success(`${t("Step completed:")} ${step.title}`);
        return true;
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAborted = controller.signal.aborted;
      const errorMsg = isAborted
        ? t("Step timed out (45s) or execution was stopped.")
        : (err.message || t("Execution error"));

      const latestTask = tasksRef.current.find((t) => t.id === taskId) || taskUpdated;
      const failedSteps = [...latestTask.steps];
      failedSteps[stepIndex] = {
        ...step,
        status: "failed",
        error: errorMsg,
      };
      const errorLogs = appendDeduplicatedLog(latestTask.logs, {
        timestamp: new Date().toLocaleTimeString(localeFor(lang)),
        type: "error",
        message: `${t("Exception:")} ${errorMsg}`,
      });
      updateTaskInState({
        ...latestTask,
        status: "failed",
        steps: failedSteps,
        logs: errorLogs,
      });
      toast.error(errorMsg);
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleStopExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunningStep(false);
    if (selectedTaskId) {
      const currentTask = tasksRef.current.find((t) => t.id === selectedTaskId);
      if (currentTask) {
        const resetSteps = currentTask.steps.map((s) =>
          s.status === "running" ? { ...s, status: "pending" as const } : s
        );
        updateTaskInState({
          ...currentTask,
          status: "idle",
          steps: resetSteps,
          logs: appendDeduplicatedLog(currentTask.logs, {
            timestamp: new Date().toLocaleTimeString(localeFor(lang)),
            type: "action",
            message: t("Execution stopped by user."),
          }),
        });
      }
    }
    toast.info(t("Execution stopped"));
  };

  const handleExecuteStep = async (stepId: string) => {
    if (!selectedTaskId || isRunningStep) return;
    setIsRunningStep(true);
    try {
      await executeStepCore(selectedTaskId, stepId);
    } finally {
      setIsRunningStep(false);
    }
  };

  const runSequentialPipeline = async (taskId: string) => {
    setIsRunningStep(true);
    try {
      while (true) {
        const currentTask = tasksRef.current.find((t) => t.id === taskId);
        if (!currentTask) break;

        const nextStep = currentTask.steps.find((s) => s.status !== "completed");
        if (!nextStep) {
          toast.success(t("All pipeline steps completed successfully!"));
          break;
        }

        if (nextStep.requiresApproval && currentTask.autonomy === "assist") {
          toast.info(`${nextStep.title} — ${t("requires manual approval in Assist mode.")}`);
          break;
        }

        const success = await executeStepCore(currentTask.id, nextStep.id);
        if (!success) {
          toast.error(`${t("Pipeline stopped at step:")} ${nextStep.title}. ${t("You can retry this step.")}`);
          break;
        }
      }
    } finally {
      setIsRunningStep(false);
    }
  };

  const handleRunAllSteps = async () => {
    if (!selectedTaskId || isRunningStep) return;
    const currentTask = tasksRef.current.find((t) => t.id === selectedTaskId);
    if (!currentTask) return;

    const hasIncomplete = currentTask.steps.some((s) => s.status !== "completed");
    if (!hasIncomplete && currentTask.steps.length > 0) {
      await handleRestartAllSteps();
      return;
    }

    await runSequentialPipeline(selectedTaskId);
  };

  const handleRestartAllSteps = async () => {
    if (!selectedTaskId || isRunningStep) return;
    const currentTask = tasksRef.current.find((t) => t.id === selectedTaskId);
    if (!currentTask) return;

    const resetSteps = currentTask.steps.map((s) => ({
      ...s,
      status: "pending" as const,
      output: "",
      error: "",
    }));

    const resetTask: FlowTask = {
      ...currentTask,
      status: "idle",
      steps: resetSteps,
      logs: [
        ...currentTask.logs,
        {
          id: `log_restart_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(localeFor(lang)),
          type: "action",
          message: t("Resetting and restarting pipeline"),
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    updateTaskInState(resetTask);

    setTimeout(() => {
      void runSequentialPipeline(selectedTaskId);
    }, 60);
  };

  const handleDeleteTask = (taskId: string) => {
    const updated = tasksRef.current.filter((t) => t.id !== taskId);
    commitTasks(updated);
    if (firestoreUserId) {
      deleteDoc(doc(db, "flow_tasks", taskId)).catch(() => {});
    }
    if (selectedTaskId === taskId) {
      setSelectedTaskId(updated[0]?.id || null);
    }
    toast.success(t("Task deleted"));
  };

  return (
    <div className="w-full flex flex-col min-h-screen">
      {showIntegrationsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-[24px] border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Github className="h-5 w-5 text-foreground" />
                <h2 className="text-base font-bold text-foreground">GitHub Integration (OAuth / PAT)</h2>
              </div>
              <button
                onClick={() => setShowIntegrationsModal(false)}
                className="rounded-full p-1.5 hover:bg-surface-elevated text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("Connect your GitHub account to run automated repository audits, create branches, make commits, and manage Issues in Flow.")}
            </p>

            <div className="rounded-xl border border-border/60 bg-surface/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{t("Connection status")}</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                    githubUser ? "bg-emerald-500/20 text-emerald-500" : "bg-zinc-500/20 text-zinc-400"
                  }`}
                >
                  {githubUser ? `@${githubUser.login}` : t("Not connected")}
                </span>
              </div>

              {githubUser ? (
                <button
                  onClick={handleDisconnectGithub}
                  className="w-full rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer"
                >
                  {t("Disconnect GitHub account")}
                </button>
              ) : (
                <div className="space-y-2 pt-1">
                  <button
                    onClick={handleConnectGitHubOAuth}
                    disabled={isConnectingGithub}
                    className="w-full glass-button-brand flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
                  >
                    {isConnectingGithub ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Github className="h-4 w-4 fill-current" />
                    )}
                    <span>{t("Sign in with GitHub (OAuth 2.0)")}</span>
                  </button>

                  <button
                    onClick={() => setShowConfig((v) => !v)}
                    className="w-full text-[11px] text-muted-foreground hover:text-foreground text-center pt-1 cursor-pointer"
                  >
                    {showConfig ? t("Hide PAT input") : t("Use Personal Access Token (PAT)")}
                  </button>

                  {showConfig && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <input
                        type="password"
                        value={patInput}
                        onChange={(e) => setPatInput(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-brand"
                      />
                      <button
                        onClick={handleSavePAT}
                        disabled={isConnectingGithub || !patInput.trim()}
                        className="w-full rounded-xl bg-foreground text-background py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                      >
                        {t("Save PAT Token")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {(() => {
        if (!longTextTarget) return null;
        const targetTask =
          longTextTarget.kind === "composer"
            ? null
            : tasks.find((t) => t.id === longTextTarget.taskId) || null;
        let title = t("View and edit text");
        let subtitle: string | undefined;
        let initialText = "";
        let monospace = false;
        let onSave: ((next: string) => void) | undefined;

        if (longTextTarget.kind === "composer") {
          title = t("Goal for Flow");
          subtitle = t("Task draft");
          initialText = goalInput;
          onSave = (next) => {
            setGoalInput(next);
            toast.success(t("Goal text updated"));
          };
        } else if (longTextTarget.kind === "goal" && targetTask) {
          title = t("Flow task goal");
          subtitle = targetTask.title;
          initialText = targetTask.goal;
          onSave = (next) => {
            updateTaskInState({
              ...targetTask,
              goal: next,
              updatedAt: new Date().toISOString(),
            });
            toast.success(t("Task goal updated"));
          };
        } else if (longTextTarget.kind === "step_desc" && targetTask) {
          const step = targetTask.steps.find((s) => s.id === longTextTarget.stepId);
          if (step) {
            title = `${t("Step description")}: ${longTextTarget.stepTitle}`;
            initialText = step.description || "";
            onSave = (next) => {
              updateTaskInState({
                ...targetTask,
                steps: targetTask.steps.map((s) =>
                  s.id === step.id ? { ...s, description: next } : s
                ),
                updatedAt: new Date().toISOString(),
              });
              toast.success(t("Step description updated"));
            };
          }
        } else if (longTextTarget.kind === "step_output" && targetTask) {
          const step = targetTask.steps.find((s) => s.id === longTextTarget.stepId);
          if (step) {
            title = `${t("Step output")}: ${longTextTarget.stepTitle}`;
            subtitle = `${t("Tool")}: ${longTextTarget.tool}`;
            initialText = step.output || "";
            monospace = true;
            onSave = (next) => {
              updateTaskInState({
                ...targetTask,
                steps: targetTask.steps.map((s) =>
                  s.id === step.id ? { ...s, output: next } : s
                ),
                updatedAt: new Date().toISOString(),
              });
              toast.success(t("Step output updated"));
            };
          }
        } else if (longTextTarget.kind === "artifact" && targetTask) {
          const art = targetTask.outputArtifacts?.[longTextTarget.index];
          if (art) {
            title = `${t("Artifact")}: ${art.name}`;
            subtitle = art.type;
            initialText = art.content || "";
            monospace = true;
            onSave = (next) => {
              const nextArtifacts = (targetTask.outputArtifacts || []).map((a, idx) =>
                idx === longTextTarget.index ? { ...a, content: next } : a
              );
              updateTaskInState({
                ...targetTask,
                outputArtifacts: nextArtifacts,
                updatedAt: new Date().toISOString(),
              });
              upsertFlowLibraryFiles([
                {
                  name: art.name,
                  type: art.type,
                  content: next,
                  projectId: targetTask.projectId ?? selectedProjectId ?? null,
                  taskTitle: targetTask.title,
                },
              ]);
              toast.success(`${t("File updated:")} ${art.name}`);
            };
          }
        }

        return (
          <LongTextModal
            isOpen={true}
            title={title}
            subtitle={subtitle}
            initialText={initialText}
            monospace={monospace}
            onClose={() => setLongTextTarget(null)}
            onSave={onSave}
          />
        );
      })()}

      <header className="shrink-0 border-b border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-[#121214]/80 backdrop-blur-md px-4 sm:px-8 py-3 flex items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              title={t("Toggle sidebar")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#18181b] hover:bg-zinc-100 dark:hover:bg-[#222226] text-foreground transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}

          <div className="flex items-center gap-2 select-none">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-black dark:text-[var(--brand)]" />
              IGseek Flow Engine
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 p-1">
            {(["assist", "semi-auto", "autopilot"] as FlowAutonomyLevel[]).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setAutonomy(lvl)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                  autonomy === lvl
                    ? "bg-black dark:bg-[var(--brand)] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {lvl === "assist" && t("Assist")}
                {lvl === "semi-auto" && t("Semi-Auto")}
                {lvl === "autopilot" && t("Autopilot")}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowIntegrationsModal(true)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              githubUser
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Github className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{githubUser ? `@${githubUser.login}` : "GitHub"}</span>
          </button>

          {tasks.length > 0 && (
            <button
              onClick={() => setSelectedTaskId(selectedTaskId ? null : tasks[0].id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                selectedTaskId
                  ? "border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{t("Processes")} ({tasks.length})</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-6 space-y-8">
        {!selectedTask ? (
          <div className="space-y-8 max-w-3xl mx-auto pt-4 sm:pt-8">
            <div className="flex flex-col items-center text-center space-y-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 dark:border-white/10 bg-zinc-100 dark:bg-white/5 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-800 dark:text-zinc-200">
                <Cpu className="h-3.5 w-3.5 text-black dark:text-[var(--brand)]" />
                Autonomous Engine Studio
              </span>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                Autonomous <span className="text-black dark:text-[var(--brand)]">Flow</span>
              </h1>
              <p className="text-sm sm:text-base leading-relaxed text-muted-foreground max-w-xl">
                {t("Delegate an autonomous task to the AI agent. It builds a step-by-step plan, runs web search, executes terminal commands, and writes a final report.")}
              </p>
            </div>

            <div className="w-full">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleCreatePlan();
                }}
                className="relative flex flex-col gap-3 rounded-[24px] border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416]/95 p-4 shadow-xl backdrop-blur-xl focus-within:border-zinc-400 dark:focus-within:border-white/20 transition-all"
              >
                <div className="flex items-center justify-between pb-1">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setProjectMenuOpen((v) => !v)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                        selectedProjectId
                          ? "border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)] shadow-sm"
                          : "border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      <Folder className="h-3.5 w-3.5 text-black dark:text-[var(--brand)] shrink-0" />
                      <span className="max-w-[160px] truncate">
                        {projects.find((p) => p.id === selectedProjectId)?.name || t("To project (Library)")}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
                    </button>

                    {projectMenuOpen && (
                      <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-zinc-200 dark:border-white/15 bg-white dark:bg-[#18181b] p-2.5 shadow-2xl z-50 text-zinc-900 dark:text-white backdrop-blur-xl">
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between">
                          <span>{t("Projects (Library)")}</span>
                          {onOpenLibrary && (
                            <button
                              type="button"
                              onClick={() => {
                                setProjectMenuOpen(false);
                                onOpenLibrary();
                              }}
                              className="text-[10px] text-zinc-500 hover:text-foreground hover:underline"
                            >
                              {t("All in Library →")}
                            </button>
                          )}
                        </div>
                        <div className="py-1 max-h-48 overflow-y-auto space-y-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProjectId(null);
                              setProjectMenuOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                              !selectedProjectId
                                ? "bg-black dark:bg-[var(--brand)] text-white font-medium"
                                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5"
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              <span className="truncate">{t("Global Library (all files)")}</span>
                            </div>
                            {!selectedProjectId && <Check className="h-3 w-3 shrink-0" />}
                          </button>
                          {projects.map((p) => {
                            const isSelected = selectedProjectId === p.id;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setSelectedProjectId(p.id);
                                  setProjectMenuOpen(false);
                                }}
                                className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-black dark:bg-[var(--brand)] text-white font-medium"
                                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Folder className="h-3.5 w-3.5 shrink-0 text-black dark:text-[var(--brand)]" />
                                  <span className="truncate">{p.name}</span>
                                </div>
                                {isSelected && <Check className="h-3 w-3 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                        {onCreateProject && (
                          <div className="border-t border-zinc-100 dark:border-white/5 pt-2 mt-1">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                placeholder={t("New project…")}
                                className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-2 py-1 text-xs outline-none focus:border-zinc-400 dark:focus:border-white/20"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const name = newProjectName.trim();
                                    if (name && onCreateProject) {
                                      setIsCreatingProject(true);
                                      onCreateProject(name)
                                        .then((proj: any) => {
                                          if (proj?.id) setSelectedProjectId(proj.id);
                                          setNewProjectName("");
                                          setProjectMenuOpen(false);
                                        })
                                        .finally(() => setIsCreatingProject(false));
                                    }
                                  }
                                }}
                              />
                              <button
                                type="button"
                                disabled={isCreatingProject || !newProjectName.trim()}
                                onClick={() => {
                                  const name = newProjectName.trim();
                                  if (name && onCreateProject) {
                                    setIsCreatingProject(true);
                                    onCreateProject(name)
                                      .then((proj: any) => {
                                        if (proj?.id) setSelectedProjectId(proj.id);
                                        setNewProjectName("");
                                        setProjectMenuOpen(false);
                                      })
                                      .finally(() => setIsCreatingProject(false));
                                  }
                                }}
                                className="p-1 rounded-lg bg-black dark:bg-[var(--brand)] text-white disabled:opacity-40"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <textarea
                  ref={goalComposerRef}
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  onInput={syncGoalComposerHeight}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                      e.preventDefault();
                      void handleCreatePlan();
                    }
                  }}
                  rows={3}
                  placeholder={t("Set a goal for Flow (e.g. Find 5 competitors, study their sites, compare features, and build a table in Library)…")}
                  className="w-full min-h-[78px] resize-none overflow-hidden bg-transparent px-2 py-1 text-[15px] text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none leading-relaxed"
                />
                {flowExhausted && cooldownResetAt > 0 && (
                  <div className="mx-1">
                    <LimitCooldownCard
                      compact
                      scope="flow"
                      used={flowUsed}
                      limit={flowLimit}
                      resetAt={cooldownResetAt}
                    />
                  </div>
                )}

                {isLongTextOverLimit(goalInput) && (
                  <div className="flex justify-end">
                    <LongTextButton
                      onClick={() => setLongTextTarget({ kind: "composer" })}
                      linesCount={countTextLines(goalInput)}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-100 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;
                          try {
                            await addFileToUnifiedLibrary(file, {
                              projectId: selectedProjectId || null,
                              taskTitle: t("Flow attachment"),
                            });
                            await syncLibraryFiles(selectedProjectId);
                            setGoalInput((prev) => `${prev ? `${prev}\n` : ""}[${t("File in Library")}: ${file.name}]`);
                            toast.success(`${t("File added to Library:")} ${file.name}`);
                          } catch {
                            toast.error(`${t("Failed to read file:")} ${file.name}`);
                          }
                        };
                        input.click();
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
                      title={t("Attach file")}
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setLibraryPickerOpen(true)}
                      className="flex h-9 px-3 items-center gap-1.5 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
                      title={t("Select from Library")}
                    >
                      <BookOpen className="h-3.5 w-3.5 text-black dark:text-[var(--brand)]" />
                      <span className="hidden sm:inline">{t("Library")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                        if (!SR) { toast.error(t("Voice input is not supported in this browser")); return; }
                        if (isRecording) {
                          try { recognitionRef.current?.stop(); } catch {}
                          setIsRecording(false);
                          return;
                        }
                        const rec = new SR();
                        rec.lang = localeFor(lang);
                        rec.continuous = true;
                        rec.interimResults = true;
                        let base = goalInput;
                        rec.onresult = (ev: any) => {
                          let finalTxt = "";
                          let interim = "";
                          for (let i = ev.resultIndex; i < ev.results.length; i++) {
                            const r = ev.results[i];
                            if (r.isFinal) finalTxt += r[0].transcript;
                            else interim += r[0].transcript;
                          }
                          if (finalTxt) {
                            base = (base ? base + " " : "") + finalTxt.trim();
                            setGoalInput(base);
                          } else if (interim) {
                            setGoalInput((base ? base + " " : "") + interim);
                          }
                        };
                        rec.onerror = () => setIsRecording(false);
                        rec.onend = () => setIsRecording(false);
                        recognitionRef.current = rec;
                        try { rec.start(); setIsRecording(true); } catch { setIsRecording(false); }
                      }}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors cursor-pointer ${
                        isRecording
                          ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] animate-pulse"
                          : "border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                      title={isRecording ? t("Stop recording") : t("Voice input")}
                    >
                      {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>

                    <div className="hidden sm:flex items-center gap-1 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 p-1 text-[11px] font-semibold text-muted-foreground">
                      <span className="px-2 uppercase font-mono">
                        {autonomy === "semi-auto" ? t("Semi-Auto") : autonomy === "autopilot" ? t("Autopilot") : t("Assist")}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-mono font-semibold ${
                        flowExhausted
                          ? "border-red-500/40 bg-red-500/10 text-red-500"
                          : "border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-muted-foreground"
                      }`}
                      title={t("Prompts used")}
                    >
                      {flowUsed}/{flowLimit}
                    </span>
                  </div>

                  {isPlanning ? (
                    <button
                      type="button"
                      onClick={handleCancelPlan}
                      title={t("Cancel")}
                      className="flex h-10 px-5 items-center gap-2 rounded-full bg-red-500 hover:bg-red-600 text-white font-semibold text-xs shadow-lg shadow-red-500/25 active:scale-95 cursor-pointer transition-all"
                    >
                      <Square className="h-3.5 w-3.5 fill-current text-white" />
                      <span>{t("Cancel")}</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!goalInput.trim()}
                      title={t("Run Flow")}
                      className="flex h-10 px-5 items-center gap-2 rounded-full bg-black dark:bg-[var(--brand)] hover:bg-zinc-800 dark:hover:brightness-110 text-white font-semibold text-xs shadow-lg shadow-black/20 dark:shadow-[var(--brand-shadow)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                    >
                      <Play className="h-4 w-4 fill-current text-white" />
                      <span>{t("Run Flow")}</span>
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-black dark:text-[var(--brand)]" />
                  <span>{t("Quick scenarios")}</span>
                </span>
                <button
                  type="button"
                  onClick={shuffleScenarios}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  <span>{t("Shuffle")}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {scenariosList.slice(0, 4).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      setGoalInput(t(chip.goalTemplate));
                      setAutonomy(chip.recommendedAutonomy);
                      toast.info(`${t("Selected scenario:")} ${t(chip.name)}`);
                    }}
                    className="w-full min-w-0 h-12 rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416]/90 hover:bg-zinc-50 dark:hover:bg-[#1c1c20] px-4 flex items-center gap-3 shadow-sm transition-all active:scale-98 group cursor-pointer text-left"
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${chip.color}`}>
                      <chip.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[13px] font-medium text-foreground truncate flex-1 group-hover:text-black dark:group-hover:text-[var(--brand)] transition-colors">
                      {t(chip.name)}
                    </span>
                    <span className="text-[10px] font-mono uppercase text-muted-foreground px-2 py-0.5 rounded bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 shrink-0">
                      {t(chip.tag)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {tasks.length > 0 && (
              <div className="pt-4 border-t border-zinc-200 dark:border-white/10 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("Active & previous processes")} ({tasks.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416]/70 hover:border-zinc-400 dark:hover:border-white/20 p-4 transition-all cursor-pointer shadow-sm group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-100 dark:bg-white/5 text-muted-foreground">
                            {task.autonomy === "semi-auto" ? t("Semi-Auto") : task.autonomy === "autopilot" ? t("Autopilot") : t("Assist")}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                              task.status === "completed"
                                ? "bg-emerald-500/20 text-emerald-500"
                                : task.status === "running"
                                ? "bg-amber-500/20 text-amber-500 animate-pulse"
                                : task.status === "failed"
                                ? "bg-red-500/20 text-red-500"
                                : "bg-zinc-500/20 text-zinc-400"
                            }`}
                          >
                            {task.status === "completed"
                              ? t("Completed")
                              : task.status === "running"
                              ? t("Running")
                              : task.status === "failed"
                              ? t("Error")
                              : t("Ready")}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-foreground mt-2 group-hover:text-black dark:group-hover:text-[var(--brand)] transition-colors line-clamp-1">
                          {task.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.goal}</p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-white/5 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{t("Steps:")} {task.steps.length}</span>
                        <span className="text-black dark:text-[var(--brand)] font-semibold group-hover:underline">{t("Open →")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-[24px] border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416]/90 p-5 sm:p-6 shadow-xl backdrop-blur-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-white/5 pb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                    <button
                      onClick={() => setSelectedTaskId(null)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer font-semibold shrink-0 whitespace-nowrap"
                    >
                      {t("← All tasks")}
                    </button>
                    <span className="text-zinc-300 dark:text-zinc-700 shrink-0">•</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase shrink-0 ${
                        selectedTask.status === "completed"
                          ? "bg-emerald-500/20 text-emerald-500"
                          : selectedTask.status === "running"
                          ? "bg-amber-500/20 text-amber-500 animate-pulse"
                          : selectedTask.status === "failed"
                          ? "bg-red-500/20 text-red-500"
                          : "bg-zinc-500/20 text-zinc-400"
                      }`}
                    >
                      {selectedTask.status === "completed"
                        ? t("Completed")
                        : selectedTask.status === "running"
                        ? t("Running")
                        : selectedTask.status === "failed"
                        ? t("Error")
                        : t("Ready")}
                    </span>
                    <span className="text-[10px] font-mono uppercase bg-zinc-100 dark:bg-white/5 px-2 py-0.5 rounded text-muted-foreground shrink-0 whitespace-nowrap">
                      {selectedTask.autonomy === "semi-auto"
                        ? t("SEMI-AUTO")
                        : selectedTask.autonomy === "autopilot"
                        ? t("AUTOPILOT")
                        : t("WITH APPROVAL")}
                    </span>
                    {selectedTask.projectId ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-[var(--brand-soft)] border border-[var(--brand-border)] text-[var(--brand)] px-2 py-0.5 rounded-full max-w-[130px] sm:max-w-[200px] truncate shrink-0">
                        <Folder className="h-3 w-3 shrink-0" />
                        <span className="truncate">{projects.find((p) => p.id === selectedTask.projectId)?.name || t("Project")}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-muted-foreground px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                        <FolderOpen className="h-3 w-3 opacity-60 shrink-0" />
                        {t("Global Library")}
                      </span>
                    )}
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold text-foreground mt-2 break-words leading-tight">{selectedTask.title}</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed break-words">{selectedTask.goal}</p>
                  {isLongTextOverLimit(selectedTask.goal) && (
                    <div className="mt-2">
                      <LongTextButton
                        onClick={() => setLongTextTarget({ kind: "goal", taskId: selectedTask.id })}
                        linesCount={countTextLines(selectedTask.goal)}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                  {isRunningStep ? (
                    <button
                      onClick={handleStopExecution}
                      className="flex h-10 px-5 items-center gap-2 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-lg active:scale-95 cursor-pointer transition-colors"
                      title={t("Stop execution")}
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      <span>{t("Stop")}</span>
                    </button>
                  ) : selectedTask.status === "completed" ? (
                    <button
                      onClick={handleRestartAllSteps}
                      className="flex h-10 px-4 items-center gap-2 rounded-full bg-black dark:bg-[var(--brand)] text-white font-semibold text-xs shadow-lg active:scale-95 cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>{t("Restart")}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleRunAllSteps}
                      className="flex h-10 px-5 items-center gap-2 rounded-full bg-black dark:bg-[var(--brand)] text-white font-semibold text-xs shadow-lg active:scale-95 cursor-pointer"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      <span>{t("Run entire pipeline")}</span>
                    </button>
                  )}

                  <button
                    onClick={() => setSelectedTaskId(null)}
                    className="flex h-10 px-3.5 items-center gap-1.5 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-foreground hover:bg-zinc-200 dark:hover:bg-white/10 text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">{t("New task")}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteTask(selectedTask.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-red-500 hover:bg-red-500/20 cursor-pointer transition-colors"
                    title={t("Delete task")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono text-muted-foreground pt-1">
                <span>
                  {t("Completed")} {selectedTask.steps.filter((s) => s.status === "completed").length} / {selectedTask.steps.length} {t("steps")}
                </span>
                <span>
                  {Math.round(
                    (selectedTask.steps.filter((s) => s.status === "completed").length /
                      (selectedTask.steps.length || 1)) *
                      100
                  )}
                  %
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-black dark:bg-[var(--brand)] transition-all duration-500"
                  style={{
                    width: `${
                      (selectedTask.steps.filter((s) => s.status === "completed").length /
                        (selectedTask.steps.length || 1)) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Layers3 className="h-4 w-4 text-black dark:text-[var(--brand)]" />
                    <span>{t("Step-by-step scenario")} ({selectedTask.steps.length})</span>
                  </span>
                </div>

                <div className="space-y-3">
                  {selectedTask.steps.map((step: FlowStep, idx: number) => {
                    const isComplete = step.status === "completed";
                    const isRunning = step.status === "running";
                    const isFailed = step.status === "failed";

                    return (
                      <div
                        key={step.id}
                        className={`rounded-[22px] border p-4 sm:p-5 transition-all shadow-sm ${
                          isRunning
                            ? "border-amber-500/50 bg-amber-500/5 ring-2 ring-amber-500/20 shadow-md"
                            : isComplete
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : isFailed
                            ? "border-red-500/30 bg-red-500/5"
                            : "border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416]/90 hover:border-zinc-300 dark:hover:border-white/20"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-all ${
                                isComplete
                                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                                  : isRunning
                                  ? "bg-amber-500 text-white animate-pulse shadow-md shadow-amber-500/30"
                                  : isFailed
                                  ? "bg-red-500 text-white"
                                  : "bg-zinc-100 dark:bg-white/10 text-muted-foreground border border-zinc-200 dark:border-white/10"
                              }`}
                            >
                              {isComplete ? <Check className="h-4 w-4" /> : idx + 1}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                              <h3 className="text-sm sm:text-base font-bold text-foreground leading-snug break-words">
                                {step.title}
                              </h3>
                              <span className="rounded-md bg-zinc-100 dark:bg-white/10 px-2 py-0.5 text-[9px] font-mono text-muted-foreground border border-zinc-200 dark:border-white/10 uppercase font-bold shrink-0">
                                {step.tool}
                              </span>
                              {step.requiresApproval && (
                                <span className="rounded bg-red-500/15 text-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase shrink-0">
                                  {t("Approve")}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <button
                              onClick={() => handleExecuteStep(step.id)}
                              disabled={isRunningStep}
                              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 ${
                                isRunning
                                  ? "bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/30 cursor-wait animate-pulse"
                                  : isFailed
                                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                                  : isComplete
                                  ? "text-emerald-500 dark:text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20"
                                  : "bg-black dark:bg-[var(--brand)] text-white hover:brightness-110"
                              }`}
                            >
                              {isRunning ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  <span>{t("Executing…")}</span>
                                </>
                              ) : isFailed ? (
                                <>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>{t("Retry")}</span>
                                </>
                              ) : isComplete ? (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  <span>{t("Retry")}</span>
                                </>
                              ) : (
                                <>
                                  <Play className="h-3.5 w-3.5 fill-current" />
                                  <span>{t("Run")}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {step.description && (
                          <div className="mt-2.5 sm:pl-11 text-xs sm:text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed break-words">
                            <p className="whitespace-pre-wrap break-words">{step.description}</p>
                            {isLongTextOverLimit(step.description) && (
                              <div className="mt-1.5">
                                <LongTextButton
                                  onClick={() =>
                                    setLongTextTarget({
                                      kind: "step_desc",
                                      taskId: selectedTask.id,
                                      stepId: step.id,
                                      stepTitle: step.title,
                                    })
                                  }
                                  linesCount={countTextLines(step.description)}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {isRunning && (
                          <div className="mt-3 sm:ml-11 flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs font-mono text-amber-600 dark:text-amber-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                            <span className="truncate">
                              {step.tool === "terminal"
                                ? `${t("Sandbox")}: $ ${step.toolParams?.command || t("Analyzing files and environment…")}`
                                : step.tool === "web_search"
                                ? `${t("Searching web sources:")} «${step.toolParams?.query || step.title}»`
                                : `${t("Executing tool")} [${step.tool.toUpperCase()}]…`}
                            </span>
                          </div>
                        )}

                        {step.output && (
                          <div className="mt-3 sm:ml-11">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
                              <span>{t("Tool output")} ({step.tool})</span>
                              {isLongTextOverLimit(step.output) && (
                                <LongTextButton
                                  variant="terminal"
                                  onClick={() =>
                                    setLongTextTarget({
                                      kind: "step_output",
                                      taskId: selectedTask.id,
                                      stepId: step.id,
                                      stepTitle: step.title,
                                      tool: step.tool,
                                    })
                                  }
                                  linesCount={countTextLines(step.output)}
                                  className="normal-case tracking-normal"
                                />
                              )}
                            </div>
                            <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-950 p-3 text-[11px] font-mono leading-relaxed text-emerald-400/90 whitespace-pre-wrap max-h-48 overflow-y-auto shadow-inner break-words [overflow-wrap:anywhere]">
                              {step.output}
                            </div>
                          </div>
                        )}

                        {step.error && (
                          <div className="mt-3 sm:ml-11 text-[11px] text-red-500 dark:text-red-400 font-mono bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl break-words [overflow-wrap:anywhere]">
                            {t("Error:")} {step.error}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-5 space-y-4">
                <div className="rounded-[20px] border border-zinc-200 dark:border-white/10 bg-[#0c0c0e] p-4 font-mono shadow-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      </div>
                      <span className="text-xs font-semibold text-zinc-300 ml-2">{t("Flow agent stream")}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono font-semibold uppercase tracking-wider">
                      {selectedTask.autonomy === "semi-auto"
                        ? t("SEMI-AUTO")
                        : selectedTask.autonomy === "autopilot"
                        ? t("AUTOPILOT")
                        : t("WITH APPROVAL")}
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-60 overflow-y-auto text-[11px] leading-relaxed text-zinc-300 pr-1">
                    {selectedTask.logs.map((log) => {
                      const typeLabel =
                        log.type === "action"
                          ? `[${t("ACTION")}]`
                          : log.type === "error"
                          ? `[${t("ERROR")}]`
                          : log.type === "success"
                          ? `[${t("SUCCESS")}]`
                          : `[${t("INFO")}]`;
                      return (
                        <div key={log.id} className="flex items-start gap-2">
                          <span className="text-zinc-600 text-[10px] shrink-0 font-mono">{log.timestamp}</span>
                          <span
                            className={`shrink-0 text-[10px] font-bold uppercase font-mono ${
                              log.type === "error"
                                ? "text-red-400"
                                : log.type === "success"
                                ? "text-emerald-400"
                                : log.type === "action"
                                ? "text-amber-400"
                                : "text-blue-400"
                            }`}
                          >
                            {typeLabel}
                          </span>
                          <span className="break-words [overflow-wrap:anywhere]">{log.message}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selectedTask.outputArtifacts && selectedTask.outputArtifacts.length > 0 && (
                  <div className="rounded-[20px] border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416]/90 p-4 shadow-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-white/5 pb-2.5">
                      <span className="text-xs font-bold text-foreground flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-black dark:text-[var(--brand)]" />
                        <span>{t("Created artifacts")} ({selectedTask.outputArtifacts.length})</span>
                      </span>
                      {onOpenLibrary && (
                        <button
                          onClick={onOpenLibrary}
                          className="text-xs text-black dark:text-[var(--brand)] hover:underline font-semibold cursor-pointer"
                        >
                          {t("Open Library →")}
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {selectedTask.outputArtifacts.map((art, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-foreground block truncate">{art.name}</span>
                            <span className="text-[10px] text-muted-foreground uppercase font-mono">{art.type}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {art.content && isLongTextOverLimit(art.content) && (
                              <LongTextButton
                                label={t("Full text")}
                                onClick={() =>
                                  setLongTextTarget({
                                    kind: "artifact",
                                    taskId: selectedTask.id,
                                    index: idx,
                                    name: art.name,
                                  })
                                }
                                linesCount={countTextLines(art.content)}
                              />
                            )}
                            <button
                              onClick={() => {
                                if (art.content) {
                                  const blob = new Blob([art.content], { type: "text/plain;charset=utf-8" });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = art.name || "artifact.txt";
                                  a.rel = "noopener";
                                  a.style.position = "fixed";
                                  a.style.left = "-10000px";
                                  document.body.appendChild(a);
                                  a.click();
                                  window.setTimeout(() => {
                                    a.remove();
                                    URL.revokeObjectURL(url);
                                  }, 1500);
                                  toast.success(`${t("File downloaded:")} ${art.name}`);
                                }
                              }}
                              className="flex h-8 px-2.5 items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-foreground hover:bg-zinc-100 dark:hover:bg-white/10 text-xs font-medium cursor-pointer"
                              title={t("Download file")}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (art.content) {
                                  void navigator.clipboard.writeText(art.content);
                                  toast.success(`${t("Copied content:")} ${art.name}`);
                                }
                              }}
                              className="flex h-8 px-2.5 items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-foreground hover:bg-zinc-100 dark:hover:bg-white/10 text-xs font-medium cursor-pointer"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              <span>{t("Copy")}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <LibraryPickerModal
        open={libraryPickerOpen}
        onClose={() => setLibraryPickerOpen(false)}
        userId={userId}
        chats={chats}
        projects={projects}
        t={t}
        actionLabel={t("Attach")}
        onSelect={async (item) => {
          try {
            await fetch("/api/flow", {
              method: "POST",
              headers: getFlowHeaders(),
              body: JSON.stringify({
                action: "sync_library",
                projectId: selectedProjectId || null,
                files: [
                  {
                    name: item.name,
                    ...(item.content !== undefined ? { content: item.content } : { dataUrl: item.resolvedDataUrl || item.dataUrl }),
                  },
                ],
              }),
            });
          } catch {
          }
          setGoalInput((prev) => `${prev ? `${prev}\n` : ""}[${t("File in Library")}: ${item.name}]`);
          toast.success(`${t("Attached from Library:")} ${item.name}`);
        }}
      />
    </div>
  );
}
