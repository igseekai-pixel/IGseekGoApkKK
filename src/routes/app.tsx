import { createFileRoute } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { makeT, localeFor, type LangCode as I18nLang } from "@/lib/i18n";

import { firebaseClient as supabase } from "@/lib/firebase-service";
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
import { lovable } from "@/integrations/lovable";
import { AuthCard } from "@/components/auth/AuthCard";
import { useTheme, useAccent, ACCENT_PRESETS } from "@/lib/theme";
import { toast } from "sonner";


const TContext = createContext<(k: string) => string>((k) => k);
const useT = () => useContext(TContext);


import {
  ArrowUp,
  Sparkles,
  TrendingUp,
  Users,
  Hash,
  Image as ImageIcon,
  Plus,
  Search,
  MessageSquare,
  BarChart3,
  Compass,
  Bookmark,
  Library,
  ChevronDown,
  Menu,
  Globe,
  Flame,
  ArrowUpRight,
  Lock,
  LogIn,
  X,
  Check,
  Code2,
  FileCode,
  Download,
  Terminal,
  Cpu,
  Sun,
  Moon,
  Languages,
  Brain,
  Zap,
  Loader2,
  Square,
  Bot,
  NotebookText,
  BookOpen,
  Trash2,
  Pencil,
  Save,
  Sparkle,
  Copy,
  Heart,
  FileText,
  MessageCircle,
  Paperclip,
  Mic,
  MicOff,
  Calendar as CalendarIcon,
  CheckSquare as CheckSquareIcon,
  Mail as MailIcon,
  Rocket,
  Folder,
  Play,
  RefreshCw,
  Monitor,
  Smartphone,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import mermaid from "mermaid";

import logoAsset from "@/assets/igseek-logo.png";
import { getCachedCalendarToken, createCalendarEvent, saveLocalReminder, type CalendarEventPayload } from "@/lib/google-calendar";
import { getCachedTasksToken, createGoogleTask, saveLocalTask } from "@/lib/google-tasks";
import { getCachedGmailToken, sendGmailMessage, saveLocalEmail, connectGmail } from "@/lib/gmail";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "IGseek App — AI chat" },
      { name: "description", content: "Рабочее пространство IGseek: AI-чат, проекты, память и артефакты." },
      { property: "og:title", content: "IGseek App — AI chat" },
      { property: "og:description", content: "Рабочее пространство IGseek: AI-чат, проекты, память и артефакты." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type TabId = "chat" | "library" | "saved" | "engine" | "docs";

const suggestions = [
  { icon: TrendingUp, label: "Analyze trends", hint: "in your niche this week", tag: "Trends" },
  { icon: Users, label: "Competitor audit", hint: "market signals & positioning", tag: "Research" },
  { icon: Hash, label: "Converting topics", hint: "for your next campaign", tag: "Growth" },
  { icon: ImageIcon, label: "Weekly plan", hint: "across formats and channels", tag: "Content" },
];

const navPrimary: { id: TabId; icon: typeof MessageSquare; label: string }[] = [
  { id: "chat", icon: MessageSquare, label: "Chat" },
  { id: "library", icon: Library, label: "Library" },
  { id: "saved", icon: Bookmark, label: "Saved" },
  { id: "engine", icon: Code2, label: "Engine" },
  { id: "docs", icon: FileCode, label: "Docs" },
];


type LangCode = I18nLang;
const LANGUAGES: { code: LangCode; label: string; native: string; flag: string }[] = [
  { code: "en", label: "English", native: "English", flag: "🇬🇧" },
  { code: "ru", label: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "es", label: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "fr", label: "French", native: "Français", flag: "🇫🇷" },
  { code: "ar", label: "Arabic", native: "العربية", flag: "🇸🇦" },
];

type ModelId = "instinct" | "chat" | "f1";
const MODELS: { id: ModelId; name: string; tag: string }[] = [
  { id: "instinct", name: "IGseek 4.0 instinct", tag: "Default" },
  { id: "chat", name: "IGseek 3.2 chat", tag: "Chat" },
  { id: "f1", name: "IGseek F1", tag: "Fast" },
];

type AgentId = "universal" | "coder" | "hacker" | "mentor" | "psy" | "creative";
const AGENTS: { id: AgentId; name: string; tag: string; description: string }[] = [
  { id: "universal", name: "Universal", tag: "Default", description: "Универсальный IGseek." },
  { id: "coder", name: "Coder", tag: "Dev", description: "Инженер: код, архитектура, отладка." },
  { id: "hacker", name: "Hacker", tag: "Red team", description: "Offsec, reverse, low-level." },
  { id: "mentor", name: "Mentor", tag: "Teach", description: "Объясняет с примерами и слоями." },
  { id: "psy", name: "Psy", tag: "Analyst", description: "Холодный психоанализ без сюсюканья." },
  { id: "creative", name: "Creative", tag: "Idea", description: "Сторителлинг, тексты, концепты." },
];

type Plan = "free" | "pro";
type User = { id: string; name: string; email: string; plan: Plan; since: string } | null;

type Artifact = {
  id: string;
  title: string;
  language: string;
  content: string;
  description?: string;
};

type GeneratedImage = {
  id: string;
  title: string;
  prompt: string;
  description?: string;
  dataUrl: string;
};

type WebImagePayload = {
  id: string;
  query: string;
  caption?: string;
  images: Array<{
    title: string;
    url: string;
    thumbnail?: string;
    source?: string;
  }>;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  reasoning?: string;
  artifacts?: Artifact[];
  images?: GeneratedImage[];
  webImages?: WebImagePayload[];
  pendingImage?: {
    title: string;
    prompt: string;
  };
  memorySaved?: boolean;
  calendarEvents?: CalendarEventPayload[];
  taskEvents?: Array<{ id?: string; action: string; title: string; notes?: string; due?: string; taskListId?: string }>;
  gmailEvents?: Array<{
    id?: string;
    action: string;
    to?: string;
    subject?: string;
    body?: string;
    attachments?: Array<{ filename: string; mimeType?: string; dataUrl?: string }>;
  }>;
  refusals?: Array<{ id?: string; action: string; reason: string; alternative: string }>;
};


// ---------------------------------------------------------------------------
// Гостевой режим (заглушка без БД): локальный аккаунт и локальная история чатов.
// ---------------------------------------------------------------------------
const GUEST_ID = "guest";
const GUEST_KEY = "igseek:guest";         // { name, at }
const GUEST_STORE_KEY = "igseek:guest-store"; // { chats, messages }

type GuestStoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  artifacts?: Artifact[];
  images?: GeneratedImage[];
  position: number;
};

type GuestStore = {
  chats: Array<{ id: string; title: string; updated_at: string; is_saved: boolean; project_id: string | null }>;
  messages: Record<string, GuestStoredMessage[]>;
};

function readGuestAccount(): { name: string; email: string } | null {
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: string; email?: string };
    if (typeof parsed.name === "string" && parsed.name.trim()) {
      return { name: parsed.name.trim(), email: parsed.email?.trim() || "" };
    }
    return null;
  } catch {
    return null;
  }
}

function readGuestStore(): GuestStore {
  try {
    const raw = window.localStorage.getItem(GUEST_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GuestStore;
      if (Array.isArray(parsed.chats) && parsed.messages && typeof parsed.messages === "object") {
        // Защита от дублей (раньше сообщения могли записываться дважды из-за
        // двойного вызова React-апдейтера в StrictMode) — дедупликация по id.
        for (const [chatId, list] of Object.entries(parsed.messages)) {
          const seen = new Set<string>();
          parsed.messages[chatId] = (Array.isArray(list) ? list : []).filter((m) => {
            if (!m || typeof m.id !== "string" || seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });
        }
        return parsed;
      }
    }
  } catch {
    // ignore corrupted store
  }
  return { chats: [], messages: {} };
}

function writeGuestStore(store: GuestStore) {
  try {
    window.localStorage.setItem(GUEST_STORE_KEY, JSON.stringify(store));
  } catch {
    // storage full — ignore
  }
}

const GUEST_PROJECTS_KEY = "igseek:guest-projects";
function readGuestProjects(): Array<{ id: string; name: string; updated_at: string }> {
  try {
    const raw = window.localStorage.getItem(GUEST_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeGuestProjects(projects: Array<{ id: string; name: string; updated_at: string }>) {
  try {
    window.localStorage.setItem(GUEST_PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    // ignore
  }
}

function Index() {
  const [input, setInput] = useState("");
  const [user, setUser] = useState<User>(null);
  const isGuest = user?.id === GUEST_ID;
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryPulse, setMemoryPulse] = useState(0);
  const [tab, setTab] = useState<TabId>("chat");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useTheme();
  const [accent, setAccent] = useAccent();
  const [lang, setLang] = useState<LangCode>("en");
  const [langOpen, setLangOpen] = useState(false);
  const [model, setModel] = useState<ModelId>("instinct");
  const [agent, setAgent] = useState<AgentId>("universal");
  const [agentOpen, setAgentOpen] = useState(false);


  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [generatingChatIds, setGeneratingChatIds] = useState<Set<string>>(new Set());
  const [engineGeneratingChatIds, setEngineGeneratingChatIds] = useState<Set<string>>(new Set());
  const [thinking, setThinking] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const backgroundJobsRef = useRef<
    Map<
      string,
      {
        chatId: string;
        controller: AbortController;
        baseMessages: ChatMessage[];
        assistantMsg: ChatMessage;
        assistantPosition: number;
      }
    >
  >(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  const isSending = Boolean(activeChatId && generatingChatIds.has(activeChatId));
  const [activeEngineChatId, setActiveEngineChatId] = useState<string | null>(null);
  const activeEngineChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeEngineChatIdRef.current = activeEngineChatId;
  }, [activeEngineChatId]);
  const [engineChatIds, setEngineChatIds] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem("igseek:engine_chat_ids");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markEngineChatId = (id: string) => {
    setEngineChatIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        window.localStorage.setItem("igseek:engine_chat_ids", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const [chats, setChats] = useState<Array<{ id: string; title: string; updated_at: string; is_saved: boolean; project_id: string | null }>>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [chatSearch, setChatSearch] = useState("");

  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const savingChatIdRef = useRef<string | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; updated_at: string }>>([]);

  const [gmailAuthOpen, setGmailAuthOpen] = useState(false);
  const [pendingGmailAction, setPendingGmailAction] = useState<{
    id?: string;
    action: string;
    to?: string;
    subject?: string;
    body?: string;
    attachments?: Array<{ filename: string; mimeType?: string; dataUrl?: string }>;
  } | null>(null);


  // Prefs
  useEffect(() => {
    setHydrated(true);
    const savedTheme = (window.localStorage.getItem("igseek:theme") as "dark" | "light" | null) ?? "light";
    const savedLang = (window.localStorage.getItem("igseek:lang") as LangCode | null) ?? "en";
    const savedModel = (window.localStorage.getItem("igseek:model") as ModelId | null) ?? "instinct";
    const savedAgent = (window.localStorage.getItem("igseek:agent") as AgentId | null) ?? "universal";
    setTheme(savedTheme);
    setLang(savedLang);
    setModel(savedModel);
    setAgent(savedAgent);
  }, []);

  // Open HUD from inline "memory updated" chip & Gmail auth modal
  useEffect(() => {
    const onOpen = () => { setMemoryOpen(true); setMemoryPulse(0); };
    const onNav = (e: CustomEvent) => { if (e.detail) setTab(e.detail as TabId); };
    const onGmailAuth = (e: any) => {
      setPendingGmailAction(e?.detail || null);
      setGmailAuthOpen(true);
    };
    window.addEventListener("igseek:open-memory", onOpen);
    window.addEventListener("igseek:navigate-tab" as any, onNav);
    window.addEventListener("igseek:open-gmail-auth" as any, onGmailAuth);
    return () => {
      window.removeEventListener("igseek:open-memory", onOpen);
      window.removeEventListener("igseek:navigate-tab" as any, onNav);
      window.removeEventListener("igseek:open-gmail-auth" as any, onGmailAuth);
    };
  }, []);

  // Desktop sidebar collapse: restore saved state, then persist changes
  useEffect(() => {
    const saved = window.localStorage.getItem("igseek:sidebar");
    if (saved === "0") setSidebarOpen(false);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("igseek:sidebar", sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);



  // Auth: subscribe, then hydrate
  useEffect(() => {
    let cancelled = false;

    const loadProfile = async (authUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, plan, created_at, theme, lang, model, agent")
        .eq("id", authUser.id)
        .maybeSingle();
      if (cancelled) return;
      const meta = (authUser.user_metadata ?? {}) as Record<string, string | undefined>;
      const fallbackName =
        profile?.display_name ||
        meta.display_name ||
        meta.full_name ||
        meta.name ||
        (authUser.email ? authUser.email.split("@")[0] : "User");
      setUser({
        id: authUser.id,
        name: fallbackName,
        email: authUser.email ?? "",
        plan: (profile?.plan as Plan) ?? "free",
        since: profile?.created_at ?? new Date().toISOString(),
      });
      setAuthReady(true);
      // Sync preferences from DB
      if (profile) {
        const dbTheme = profile.theme === "dark" ? "dark" : "light";
        const dbLang = profile.lang as LangCode;
        const dbModel = profile.model as ModelId;
        const dbAgent = profile.agent as AgentId;
        setTheme(dbTheme);
        if (dbLang) setLang(dbLang);
        if (dbModel) setModel(dbModel);
        if (dbAgent) setAgent(dbAgent);
      }
      setPrefsHydrated(true);
      // Load chat list and projects
      void refreshChats(authUser.id);
      void refreshProjects(authUser.id);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        // Defer database calls out of the auth callback to avoid locking the client.
        setTimeout(() => loadProfile(session.user), 0);
        return;
      }
      // INITIAL_SESSION can briefly be null while a redirect session is being restored.
      // Only clear an established account after a real sign-out event.
      if (event === "SIGNED_OUT") {
        setUser(null);
        setChats([]);
        setProjects([]);
        setActiveChatId(null);
        setMessages([]);
        setPrefsHydrated(false);
        setAuthReady(true);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        void loadProfile(data.session.user);
      } else {
        // Восстанавливаем локальный/быстрый аккаунт (по умолчанию Me Coder как на скриншотах)
        const guest = readGuestAccount() ?? { name: "Me Coder", email: "mecoder525@gmail.com" };
        setUser({ id: GUEST_ID, name: guest.name, email: guest.email, plan: "free", since: new Date().toISOString() });
        const store = readGuestStore();
        if (store.chats.length === 0) {
          store.chats = [{ id: "welcome-chat", title: "Прив", updated_at: new Date().toISOString(), is_saved: false, project_id: null }];
          store.messages["welcome-chat"] = [
            { id: "msg-1", role: "user", content: "Привет!", position: 0 },
            { id: "msg-2", role: "assistant", content: "Привет! 👋\nЧем могу помочь?", position: 1 },
          ];
          writeGuestStore(store);
        }
        setChats(store.chats);
        setProjects(readGuestProjects());
        setPrefsHydrated(true);
        setAuthReady(true);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshChats = async (uid?: string) => {
    const id = uid ?? user?.id;
    if (!id) return;
    if (id === GUEST_ID) {
      setChats(readGuestStore().chats);
      setChatsLoading(false);
      return;
    }
    setChatsLoading(true);
    const { data } = await supabase
      .from("chats")
      .select("id, title, updated_at, is_saved, project_id")
      .eq("user_id", id)
      .order("updated_at", { ascending: false })
      .limit(200);
    setChats((data ?? []) as typeof chats);
    setChatsLoading(false);
  };

  const refreshProjects = async (uid?: string) => {
    const id = uid ?? user?.id;
    if (!id) return;
    if (id === GUEST_ID || isGuest) {
      setProjects(readGuestProjects());
      return;
    }
    const { data } = await supabase
      .from("projects")
      .select("id, name, updated_at")
      .eq("user_id", id)
      .order("updated_at", { ascending: false });
    setProjects(data ?? []);
  };

  const toggleSaveChat = async (chatId: string, next: boolean) => {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, is_saved: next } : c)));
    if (isGuest) {
      const store = readGuestStore();
      store.chats = store.chats.map((c) => (c.id === chatId ? { ...c, is_saved: next } : c));
      writeGuestStore(store);
      return;
    }
    await supabase.from("chats").update({ is_saved: next }).eq("id", chatId);
  };

  const assignChatToProject = async (chatId: string, projectId: string | null) => {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, project_id: projectId } : c)));
    if (isGuest || user?.id === GUEST_ID) {
      const store = readGuestStore();
      store.chats = store.chats.map((c) => (c.id === chatId ? { ...c, project_id: projectId } : c));
      writeGuestStore(store);
      return;
    }
    await supabase.from("chats").update({ project_id: projectId }).eq("id", chatId);
  };

  const createProject = async (name: string): Promise<ProjectRow | null> => {
    const clean = name.trim().slice(0, 80) || "Untitled project";
    if (isGuest || user?.id === GUEST_ID) {
      const p: ProjectRow = {
        id: `proj-${Date.now()}`,
        name: clean,
        updated_at: new Date().toISOString(),
      };
      const list = [p, ...readGuestProjects()];
      writeGuestProjects(list);
      setProjects(list);
      return p;
    }
    if (!user) return null;
    const { data } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name: clean })
      .select("id, name, updated_at")
      .maybeSingle();
    if (data) setProjects((prev) => [data, ...prev]);
    return data;
  };

  const renameProject = async (projectId: string, name: string) => {
    const clean = name.trim().slice(0, 80) || "Untitled project";
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, name: clean } : p)));
    if (isGuest || user?.id === GUEST_ID) {
      const list = readGuestProjects().map((p) => (p.id === projectId ? { ...p, name: clean } : p));
      writeGuestProjects(list);
      return;
    }
    await supabase.from("projects").update({ name: clean }).eq("id", projectId);
  };

  const deleteProject = async (projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setChats((prev) => prev.map((c) => (c.project_id === projectId ? { ...c, project_id: null } : c)));
    if (isGuest || user?.id === GUEST_ID) {
      const list = readGuestProjects().filter((p) => p.id !== projectId);
      writeGuestProjects(list);
      const store = readGuestStore();
      store.chats = store.chats.map((c) => (c.project_id === projectId ? { ...c, project_id: null } : c));
      writeGuestStore(store);
      return;
    }
    await supabase.from("projects").delete().eq("id", projectId);
  };

  const createEngineChatInProject = async (projectId: string) => {
    const newEngineId = `engine-${Date.now()}`;
    const project = projects.find((p) => p.id === projectId);
    const title = project ? `${project.name} · Engine` : "Engine проект";
    const now = new Date().toISOString();

    markEngineChatId(newEngineId);

    const newChat: ChatRow = {
      id: newEngineId,
      title,
      updated_at: now,
      is_saved: false,
      project_id: projectId,
    };

    setChats((prev) => [newChat, ...prev]);

    if (isGuest || user?.id === GUEST_ID) {
      const store = readGuestStore();
      store.chats = [newChat, ...store.chats];
      store.messages[newEngineId] = [];
      writeGuestStore(store);
    } else if (user) {
      await supabase.from("chats").insert({
        id: newEngineId,
        title,
        user_id: user.id,
        project_id: projectId,
        updated_at: now,
      });
    }

    setActiveEngineChatId(newEngineId);
    setTab("engine");
  };

  const createRegularChatInProject = async (projectId: string) => {
    const newChatId = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = t("New chat");

    const newChat: ChatRow = {
      id: newChatId,
      title,
      updated_at: now,
      is_saved: false,
      project_id: projectId,
    };

    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChatId);
    setMessages([]);

    if (isGuest || user?.id === GUEST_ID) {
      const store = readGuestStore();
      store.chats = [newChat, ...store.chats];
      store.messages[newChatId] = [];
      writeGuestStore(store);
    } else if (user) {
      await supabase.from("chats").insert({
        id: newChatId,
        title,
        user_id: user.id,
        project_id: projectId,
        updated_at: now,
      });
    }

    setTab("chat");
  };



  // Auto-grow the bottom composer textarea
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input, tab]);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    window.localStorage.setItem("igseek:lang", lang);
    window.dispatchEvent(new Event("igseek:lang-change"));
  }, [lang, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("igseek:model", model);
  }, [model, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("igseek:agent", agent);
  }, [agent, hydrated]);

  // Sync preferences to profile when signed in (debounced)
  useEffect(() => {
    if (!user || !prefsHydrated || isGuest) return;
    const uid = user.id;
    const handle = setTimeout(() => {
      void supabase.from("profiles").update({ theme, lang, model, agent }).eq("id", uid);
    }, 400);
    return () => clearTimeout(handle);
  }, [user, prefsHydrated, theme, lang, model, agent]);


  const requireAuth = (fn?: () => void) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    fn?.();
  };

  const signOut = async () => {
    if (isGuest) {
      // Выход из гостевого режима: убираем локальный аккаунт, история остаётся в localStorage.
      window.localStorage.removeItem(GUEST_KEY);
      setUser(null);
      setChats([]);
      setProjects([]);
      setActiveChatId(null);
      setMessages([]);
      setProfileOpen(false);
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfileOpen(false);
  };

  const updateUser = async (patch: Partial<NonNullable<User>>) => {
    if (!user) return;
    const next = { ...user, ...patch };
    setUser(next);
    if (patch.plan) {
      await supabase.from("profiles").update({ plan: patch.plan }).eq("id", user.id);
    }
    if (patch.name) {
      await supabase.from("profiles").update({ display_name: patch.name }).eq("id", user.id);
    }
  };

  const handleAuthed = () => {
    setAuthOpen(false);
    // profile is loaded by the onAuthStateChange subscriber
  };

  const isAuthed = !!user;
  const isLocked = false;
  const t = useMemo(() => makeT(lang), [lang]);

  // Превью прикреплённых картинок: живут отдельно от текста поля
  // (миниатюры-чипы над композером, а не base64-стена в textarea).
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string; dataUrl: string }>>([]);
  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  // Единый поток вложений: кнопка выбора файла, Ctrl+V и drag & drop.
  const attachFiles = async (files: File[]) => {
    if (!files.length) return;
    if (!isAuthed) { setAuthOpen(true); return; }
    if (isLocked) { setProfileOpen(true); return; }
    const MAX = 200 * 1024 * 1024;
    for (const file of files.slice(0, 8)) {
      if (file.size > MAX) {
        alert(t("File is too large") + " (max 200MB)");
        continue;
      }
      if (file.type.startsWith("image/")) {
        // Картинки — в превью-чипы, не в текст поля.
        try {
          const dataUrl = await readFileAsDataURL(file);
          const safeUrl = await normalizeImageForModel(dataUrl);
          setAttachments((prev) =>
            prev.length >= 8 ? prev : [...prev, { id: crypto.randomUUID(), name: file.name || "image", dataUrl: safeUrl }],
          );
        } catch {
          // ignore unreadable image
        }
        continue;
      }
      const marker = `⏳ Reading **${file.name}**…`;
      setInput((prev) => (prev ? prev + "\n\n" : "") + marker);
      try {
        const { parseAttachment } = await import("@/lib/file-parsers");
        const res = await parseAttachment(file);
        setInput((prev) => prev.replace(marker, res.content));
      } catch (err: any) {
        setInput((prev) => prev.replace(marker, `📎 **${file.name}** — failed to read: ${err?.message || String(err)}`));
      }
    }
  };

  // Auto-scroll on new message chunks — только если пользователь у нижнего края.
  useEffect(() => {
    if (stickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  const stopStreaming = () => {
    if (activeChatId) {
      const job = backgroundJobsRef.current.get(activeChatId);
      if (job) {
        job.controller.abort();
        backgroundJobsRef.current.delete(activeChatId);
        setGeneratingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(activeChatId);
          return next;
        });
      }
    }
  };

  const newChat = () => {
    // Не прерываем генерацию в текущем чате — она продолжит выполняться в фоне!
    setMessages([]);
    setInput("");
    setAttachments([]);
    setActiveChatId(null);
    activeChatIdRef.current = null;
  };

  const loadChat = async (chatId: string) => {
    if (!user || chatId === activeChatId) return;
    setActiveChatId(chatId);
    activeChatIdRef.current = chatId;
    setAttachments([]);

    // Если этот чат прямо сейчас генерирует ответ в фоне — мгновенно восстанавливаем текущий поток!
    const activeJob = backgroundJobsRef.current.get(chatId);
    if (activeJob) {
      setMessages([...activeJob.baseMessages, activeJob.assistantMsg]);
      setTab("chat");
      return;
    }

    setMessages([]);
    if (isGuest) {
      const stored = readGuestStore().messages[chatId] ?? [];
      setMessages(
        stored.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content ?? "",
          timestamp: "17:05",
          reasoning: r.reasoning ?? undefined,
          artifacts: r.artifacts ?? undefined,
          images: r.images ?? undefined,
        })),
      );
      setTab("chat");
      return;
    }
    const { data } = await supabase
      .from("chat_messages")
      .select("id, role, content, reasoning, artifacts, images, position")
      .eq("chat_id", chatId)
      .order("position", { ascending: true });
    if (data) {
      setMessages(
        data.map((r) => ({
          id: r.id,
          role: r.role as "user" | "assistant",
          content: r.content ?? "",
          timestamp: "17:05",
          reasoning: r.reasoning ?? undefined,
          artifacts: (r.artifacts as Artifact[] | null) ?? undefined,
          images: (r.images as GeneratedImage[] | null) ?? undefined,
        })),
      );
    }
    setTab("chat");
  };

  const deleteChat = async (chatId: string) => {
    if (!user) return;
    const activeJob = backgroundJobsRef.current.get(chatId);
    if (activeJob) {
      activeJob.controller.abort();
      backgroundJobsRef.current.delete(chatId);
      setGeneratingChatIds((prev) => {
        const next = new Set(prev);
        next.delete(chatId);
        return next;
      });
    }
    if (engineChatIds.has(chatId)) {
      setEngineChatIds((prev) => {
        const next = new Set(prev);
        next.delete(chatId);
        try { window.localStorage.setItem("igseek:engine_chat_ids", JSON.stringify(Array.from(next))); } catch {}
        return next;
      });
      try { window.localStorage.removeItem("igseek:engine_proj_" + chatId); } catch {}
      if (activeEngineChatId === chatId) {
        setActiveEngineChatId(null);
      }
    }
    if (isGuest) {
      const store = readGuestStore();
      store.chats = store.chats.filter((c) => c.id !== chatId);
      delete store.messages[chatId];
      writeGuestStore(store);
      setChats(store.chats);
      if (activeChatId === chatId) {
        setActiveChatId(null);
        activeChatIdRef.current = null;
        setMessages([]);
      }
      return;
    }
    const { error } = await supabase.from("chats").delete().eq("id", chatId);
    if (!error) {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
        activeChatIdRef.current = null;
        setMessages([]);
      }
    }
  };

  const renameChat = async (chatId: string, title: string) => {
    const clean = title.trim().slice(0, 120) || "Untitled";
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title: clean } : c)));
    if (isGuest) {
      const store = readGuestStore();
      store.chats = store.chats.map((c) => (c.id === chatId ? { ...c, title: clean } : c));
      writeGuestStore(store);
      return;
    }
    await supabase.from("chats").update({ title: clean }).eq("id", chatId);
  };


  // Streams assistant response for a given base message list and persists the assistant row in background.
  const runAssistantTurn = async (
    baseMessages: ChatMessage[],
    chatId: string | null,
    assistantMsg: ChatMessage,
    assistantPosition: number,
  ) => {
    const controller = new AbortController();
    const currentAssistantMsg: ChatMessage = { ...assistantMsg };

    if (chatId) {
      backgroundJobsRef.current.set(chatId, {
        chatId,
        controller,
        baseMessages,
        assistantMsg: currentAssistantMsg,
        assistantPosition,
      });
      setGeneratingChatIds((prev) => new Set(prev).add(chatId));
    }

    const updateLiveUi = () => {
      if (chatId) {
        const job = backgroundJobsRef.current.get(chatId);
        if (job) job.assistantMsg = { ...currentAssistantMsg };
      }
      if (activeChatIdRef.current === chatId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...currentAssistantMsg } : m,
          ),
        );
      }
    };

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          messages: baseMessages.map((m) => ({ role: m.role, content: m.content })),
          reasoning: thinking,
          webSearch,
          model,
          agent,
          aiStyle: window.localStorage.getItem("igseek:ai_style") || "",
          aiCreativity: window.localStorage.getItem("igseek:ai_creativity") || "balance",
          aiLength: window.localStorage.getItem("igseek:ai_length") || "medium",
          gmailConnected: !!getCachedGmailToken(),
          userAttachments: attachments.map((a) => ({
            name: a.name,
            dataUrl: a.dataUrl,
            type: a.dataUrl.startsWith("data:") ? a.dataUrl.slice(5, a.dataUrl.indexOf(";")) : "application/octet-stream",
          })),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let errDetail = `HTTP ${res.status}`;
        try {
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const data = await res.json();
            errDetail = data.error || data.message || errDetail;
          } else {
            const text = await res.text();
            errDetail = text.slice(0, 200) || errDetail;
          }
        } catch { /* ignore */ }
        throw new Error(errDetail);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        let snippet = "";
        try {
          snippet = (await res.text()).slice(0, 200);
        } catch { /* ignore */ }
        throw new Error(
          contentType.includes("text/html")
            ? "API route /api/chat returned HTML instead of an event stream. Please ensure the backend server is running."
            : `Unexpected response (${contentType || "unknown"}): ${snippet}`
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "delta";
      let contentBuf = "";
      let reasoningBuf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const chunk of parts) {
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              const raw = line.slice(5).trim();
              if (currentEvent === "delta") {
                try {
                  contentBuf += JSON.parse(raw) as string;
                  currentAssistantMsg.content = contentBuf;
                  if (reasoningBuf) currentAssistantMsg.reasoning = reasoningBuf;
                  updateLiveUi();
                } catch { /* ignore */ }
              } else if (currentEvent === "reasoning") {
                try {
                  reasoningBuf += JSON.parse(raw) as string;
                  currentAssistantMsg.reasoning = reasoningBuf;
                  updateLiveUi();
                } catch { /* ignore */ }
              } else if (currentEvent === "artifact") {
                try {
                  const art = JSON.parse(raw) as Artifact;
                  currentAssistantMsg.artifacts = [...(currentAssistantMsg.artifacts ?? []), art];
                  updateLiveUi();
                } catch { /* ignore */ }
              } else if (currentEvent === "image_start") {
                try {
                  const start = JSON.parse(raw) as { title?: string; prompt?: string };
                  if (start.title && start.prompt) {
                    currentAssistantMsg.pendingImage = { title: start.title, prompt: start.prompt };
                    updateLiveUi();
                  }
                } catch { /* ignore */ }
              } else if (currentEvent === "image") {
                try {
                  const img = JSON.parse(raw) as GeneratedImage;
                  currentAssistantMsg.pendingImage = undefined;
                  currentAssistantMsg.images = [...(currentAssistantMsg.images ?? []), img];
                  updateLiveUi();
                } catch { /* ignore */ }
              } else if (currentEvent === "web_image") {
                try {
                  const webImgPayload = JSON.parse(raw) as WebImagePayload;
                  currentAssistantMsg.webImages = [...(currentAssistantMsg.webImages ?? []), webImgPayload];
                  updateLiveUi();
                } catch { /* ignore */ }
              } else if (currentEvent === "calendar_event") {
                try {
                  const evt = JSON.parse(raw) as CalendarEventPayload;
                  currentAssistantMsg.calendarEvents = [...(currentAssistantMsg.calendarEvents ?? []), evt];
                  updateLiveUi();
                  const token = getCachedCalendarToken();
                  if (token) {
                    void createCalendarEvent(evt).catch(() => saveLocalReminder(evt));
                  } else {
                    saveLocalReminder(evt);
                  }
                } catch { /* ignore */ }
              } else if (currentEvent === "task_event") {
                try {
                  const taskEvt = JSON.parse(raw);
                  currentAssistantMsg.taskEvents = [...(currentAssistantMsg.taskEvents ?? []), taskEvt];
                  updateLiveUi();
                  const token = getCachedTasksToken();
                  if (token) {
                    void createGoogleTask(taskEvt, taskEvt.taskListId || "@default").catch(() => saveLocalTask(taskEvt));
                  } else {
                    saveLocalTask(taskEvt);
                  }
                } catch { /* ignore */ }
              } else if (currentEvent === "gmail_event") {
                try {
                  const gmailEvt = JSON.parse(raw);
                  currentAssistantMsg.gmailEvents = [...(currentAssistantMsg.gmailEvents ?? []), gmailEvt];
                  updateLiveUi();
                  const token = getCachedGmailToken();
                  if (!token) {
                    setPendingGmailAction(gmailEvt);
                    setGmailAuthOpen(true);
                  } else if (gmailEvt.action === "send" && gmailEvt.to && gmailEvt.body) {
                    void sendGmailMessage({
                      to: gmailEvt.to,
                      subject: gmailEvt.subject || "No Subject",
                      body: gmailEvt.body,
                      attachments: gmailEvt.attachments,
                    })
                      .then(() => toast.success(`Письмо успешно отправлено через Gmail!${gmailEvt.attachments?.length ? ` (Вложено файлов: ${gmailEvt.attachments.length})` : ""}`))
                      .catch(() => saveLocalEmail(gmailEvt));
                  }
                } catch { /* ignore */ }
              } else if (currentEvent === "refusal_event") {
                try {
                  const refEvt = JSON.parse(raw);
                  currentAssistantMsg.refusals = [...(currentAssistantMsg.refusals ?? []), refEvt];
                  updateLiveUi();
                } catch { /* ignore */ }
              } else if (currentEvent === "memory_updated") {
                window.dispatchEvent(new CustomEvent("igseek:memory-updated"));
                setMemoryPulse((n) => n + 1);
                currentAssistantMsg.memorySaved = true;
                updateLiveUi();
              } else if (currentEvent === "error") {
                throw new Error("stream error");
              }
            }
          }
        }
      }
      if (!contentBuf.trim() && !reasoningBuf.trim() && !currentAssistantMsg.artifacts?.length && !currentAssistantMsg.images?.length && !currentAssistantMsg.webImages?.length) {
        currentAssistantMsg.content = "⚠️ " + t("Не удалось получить ответ от сервера. Пожалуйста, попробуйте снова.");
      }
      updateLiveUi();
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        const errorDetail = err?.message ? `: ${err.message}` : "";
        currentAssistantMsg.content = currentAssistantMsg.content || ("⚠️ " + t("Something went wrong. Please try again.") + errorDetail);
        updateLiveUi();
      }
    } finally {
      if (chatId) {
        backgroundJobsRef.current.delete(chatId);
        setGeneratingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(chatId);
          return next;
        });

        const asst = currentAssistantMsg;
        if (user) {
          const forGuest = isGuest || user.id === GUEST_ID;
          if (forGuest) {
            const store = readGuestStore();
            const list = (store.messages[chatId] ??= []);
            const existingIdx = list.findIndex((m) => m.id === asst.id);
            const msgRecord = {
              id: asst.id,
              role: "assistant" as const,
              content: asst.content ?? "",
              reasoning: asst.reasoning ?? undefined,
              artifacts: asst.artifacts ?? undefined,
              images: asst.images ?? undefined,
              position: assistantPosition,
            };
            if (existingIdx >= 0) {
              list[existingIdx] = msgRecord;
            } else {
              list.push(msgRecord);
            }
            const now = new Date().toISOString();
            store.chats = store.chats.map((c) => (c.id === chatId ? { ...c, updated_at: now } : c));
            writeGuestStore(store);
            setChats(store.chats);
          } else {
            void (async () => {
              try {
                await supabase.from("chat_messages").insert({
                  id: asst.id,
                  chat_id: chatId,
                  user_id: user.id,
                  role: "assistant",
                  content: asst.content ?? "",
                  reasoning: asst.reasoning ?? null,
                  artifacts: (asst.artifacts as unknown as Json) ?? null,
                  images: (asst.images as unknown as Json) ?? null,
                  position: assistantPosition,
                });
                await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
                void refreshChats();
              } catch { /* ignore */ }
            })();
          }
        }
      }
    }
  };

  const sendChat = async (text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && !attachments.length) || isSending) return;
    if (isLocked) { setProfileOpen(true); return; }

    // Картинки-чипы превращаются в markdown на момент отправки.
    const imageMd = attachments.map((a) => `![${a.name}](${a.dataUrl})`).join("\n");
    const full = imageMd && trimmed ? `${imageMd}\n\n${trimmed}` : imageMd || trimmed;

    const currentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: full, timestamp: currentTime };
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      reasoning: thinking ? "" : undefined,
      timestamp: currentTime,
    };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, assistantMsg]);
    setInput("");
    setAttachments([]);
    if (/(письм|почт|gmail|email|отправь.*письмо|напиши.*на.*@)/i.test(trimmed) && !getCachedGmailToken()) {
      setGmailAuthOpen(true);
    }
    stickToBottomRef.current = true;
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 40);

    let chatId = activeChatId;
    const positionBase = messages.length;
    if (user && isGuest) {
      if (!chatId) {
        chatId = crypto.randomUUID();
        setActiveChatId(chatId);
        activeChatIdRef.current = chatId;
        savingChatIdRef.current = chatId;
        const store = readGuestStore();
        store.chats.unshift({
          id: chatId,
          title: chatTitleFrom(full),
          updated_at: new Date().toISOString(),
          is_saved: false,
          project_id: null,
        });
        store.messages[chatId] = [];
        writeGuestStore(store);
        setChats(store.chats);
      }
      const store = readGuestStore();
      const list = (store.messages[chatId] ??= []);
      if (!list.some((m) => m.id === userMsg.id)) {
        list.push({
          id: userMsg.id,
          role: "user",
          content: userMsg.content,
          position: positionBase,
        });
      }
      const now = new Date().toISOString();
      store.chats = [
        { ...(store.chats.find((c) => c.id === chatId) ?? { id: chatId, title: chatTitleFrom(full), is_saved: false, project_id: null }), updated_at: now },
        ...store.chats.filter((c) => c.id !== chatId),
      ];
      writeGuestStore(store);
      setChats(store.chats);
    } else if (user) {
      if (!chatId) {
        const title = chatTitleFrom(full);
        const { data: created, error: createErr } = await supabase
          .from("chats")
          .insert({ user_id: user.id, title })
          .select("id, title, updated_at")
          .maybeSingle();
        if (!createErr && created) {
          chatId = created.id;
          setActiveChatId(chatId);
          activeChatIdRef.current = chatId;
          savingChatIdRef.current = chatId;
          setChats((prev) => [{ id: created.id, title: created.title, updated_at: created.updated_at, is_saved: false, project_id: null }, ...prev]);
        }
      }
      if (chatId) {
        void supabase.from("chat_messages").insert({
          id: userMsg.id,
          chat_id: chatId,
          user_id: user.id,
          role: "user",
          content: userMsg.content,
          position: positionBase,
        });
      }
    }

    if (chatId) {
      setGeneratingChatIds((prev) => new Set(prev).add(chatId!));
    }

    await runAssistantTurn(nextMessages, chatId, assistantMsg, positionBase + 1);
  };

  // Edit a user message: truncate everything after it, save the edit, regenerate the assistant reply.
  const editMessage = async (msgId: string, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed || isSending) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx < 0 || messages[idx].role !== "user") return;

    if (activeChatId) {
      const job = backgroundJobsRef.current.get(activeChatId);
      if (job) {
        job.controller.abort();
        backgroundJobsRef.current.delete(activeChatId);
        setGeneratingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(activeChatId);
          return next;
        });
      }
    }
    const editedUser: ChatMessage = { ...messages[idx], content: trimmed };
    const baseMessages = [...messages.slice(0, idx), editedUser];
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      reasoning: thinking ? "" : undefined,
    };
    setMessages([...baseMessages, assistantMsg]);
    if (activeChatId) {
      setGeneratingChatIds((prev) => new Set(prev).add(activeChatId));
    }

    if (user && activeChatId) {
      if (isGuest) {
        const store = readGuestStore();
        const list = (store.messages[activeChatId] ?? []).filter((m) => m.position < idx);
        store.messages[activeChatId] = list.map((m) => (m.id === msgId ? { ...m, content: trimmed } : m));
        writeGuestStore(store);
      } else {
        await supabase.from("chat_messages").update({ content: trimmed }).eq("id", msgId);
        await supabase.from("chat_messages").delete().eq("chat_id", activeChatId).gt("position", idx);
      }
    }
    await runAssistantTurn(baseMessages, activeChatId, assistantMsg, idx + 1);
  };

  // Delete a message. If it's a user message, also delete the immediately following assistant reply.
  const deleteMessage = async (msgId: string) => {
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const target = messages[idx];
    const removeAssistant = target.role === "user" && messages[idx + 1]?.role === "assistant";
    const ids = removeAssistant ? [target.id, messages[idx + 1].id] : [target.id];
    const removeCount = ids.length;
    const nextMessages = [...messages.slice(0, idx), ...messages.slice(idx + removeCount)];
    setMessages(nextMessages);
    if (user && activeChatId) {
      if (isGuest) {
        const store = readGuestStore();
        store.messages[activeChatId] = (store.messages[activeChatId] ?? []).filter((m) => !ids.includes(m.id));
        writeGuestStore(store);
      } else {
        await supabase.from("chat_messages").delete().in("id", ids);
      }
    }
  };






  // Экран авторизации (Google + Email / Пароль + Регистрация с подтверждением пароля)
  if (hydrated && authReady && !user) {
    return (
      <TContext.Provider value={t}>
        <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-4 py-8 text-foreground">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <AuthCard
            onSuccess={() => {
              // Firebase onAuthStateChange fires and sets user profile
            }}
            onGuestContinue={(name, email) => {
              const cleanName = (name || email?.split("@")[0] || "Пользователь").trim().slice(0, 60);
              const cleanEmail = (email || "").trim();
              window.localStorage.setItem(GUEST_KEY, JSON.stringify({ name: cleanName, email: cleanEmail, at: Date.now() }));
              setUser({ id: GUEST_ID, name: cleanName, email: cleanEmail, plan: "free", since: new Date().toISOString() });
              setChats(readGuestStore().chats);
              setPrefsHydrated(true);
            }}
          />
        </div>
      </TContext.Provider>
    );
  }

  return (
    <TContext.Provider value={t}>
    <div
      className="flex h-full h-[100dvh] w-full overflow-hidden bg-background text-foreground fixed inset-0"
      onPaste={(e) => {
        const files = Array.from(e.clipboardData?.files ?? []);
        if (files.length) {
          e.preventDefault();
          void attachFiles(files);
        }
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length) {
          e.preventDefault();
          void attachFiles(files);
        }
      }}
    >
      {/* ============ SIDEBAR ============ */}
      {/* Mobile backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside
        className={`${mobileNavOpen ? "fixed inset-y-0 left-0 z-50 flex" : "hidden"} md:relative md:z-auto md:flex h-full max-h-screen w-[280px] shrink-0 flex-col overflow-hidden bg-white dark:bg-surface backdrop-blur-sm transition-[width] duration-300 ease-out ${
          sidebarOpen ? "md:w-[260px] border-r border-zinc-200 dark:border-border" : "md:w-0 md:border-r-0"
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex w-[280px] md:w-[260px] shrink-0 items-center justify-between px-3.5 py-3 border-b border-zinc-200 dark:border-white/5">
          <div className="flex items-center gap-2">
            <img src={logoAsset} alt="IGseek" className="logo-mark h-7 w-7 shrink-0 object-contain" />
            <div className="text-[17px] font-bold tracking-tight select-none">
              <span className="text-black dark:text-[var(--brand)] font-extrabold">IG</span>
              <span className="text-zinc-900 dark:text-white">seek</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Language switcher */}
            <div className="relative">
              <button
                onClick={() => setLangOpen((v) => !v)}
                onBlur={() => setTimeout(() => setLangOpen(false), 120)}
                className="flex h-8 px-2 items-center gap-1 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-[#161618]/80 dark:hover:bg-[#1f1f23] text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors text-xs font-medium"
                title={t("Language")}
                aria-label="Change language"
              >
                <span>文A</span>
                <ChevronDown className="h-3 w-3 text-zinc-400 shrink-0" />
              </button>
              <AnimatePresence>
                {langOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416]/95 backdrop-blur-xl p-1 shadow-2xl text-zinc-900 dark:text-white"
                  >
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setLang(l.code);
                          setLangOpen(false);
                        }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs rounded-xl transition-colors ${
                          lang === l.code ? "text-black dark:text-[var(--brand)] font-semibold bg-zinc-100 dark:bg-[var(--brand-soft)]" : "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 dark:text-white dark:hover:bg-white/[0.08]"
                        }`}
                      >
                        <span className="text-sm leading-none">{l.flag}</span>
                        <span className="flex-1 truncate">{l.native}</span>
                        {lang === l.code && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme toggle */}
            <button
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-[#161618]/80 dark:hover:bg-[#1f1f23] text-zinc-700 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
              title={theme === "dark" ? t("Switch to light") : t("Switch to dark")}
              aria-label={t("Toggle theme")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Close sidebar button */}
            <button
              onClick={() => {
                if (mobileNavOpen) setMobileNavOpen(false);
                else setSidebarOpen(false);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-[#161618]/80 dark:hover:bg-[#1f1f23] text-zinc-700 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
              title={t("Close sidebar")}
              aria-label="Close sidebar"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 w-[280px] md:w-[260px] overflow-y-auto overscroll-contain px-3 py-3">
          <div className="flex flex-col gap-2 w-full">
            {/* New chat */}
            <button
              onClick={() => { requireAuth(() => { setTab("chat"); newChat(); }); setMobileNavOpen(false); }}
              className="w-full rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-[#161618]/90 dark:hover:bg-[#1f1f23] text-zinc-900 dark:text-white px-4 py-2.5 flex items-center gap-3 text-sm font-medium transition-all shadow-sm active:scale-98"
            >
              <Plus className="h-4 w-4 text-black dark:text-[var(--brand)] shrink-0" />
              <span className="whitespace-nowrap">{t("New chat")}</span>
            </button>

            {/* Memory */}
            <button
              onClick={() => { requireAuth(() => setMemoryOpen(true)); setMemoryPulse(0); }}
              className={`w-full rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-[#161618]/90 dark:hover:bg-[#1f1f23] text-zinc-900 dark:text-white px-4 py-2.5 flex items-center justify-between text-sm font-medium transition-all shadow-sm active:scale-98 ${
                memoryPulse > 0 ? "border-zinc-900 dark:border-[var(--brand-border)]" : ""
              }`}
              title={t("Memory")}
            >
              <span className="flex items-center gap-3">
                <NotebookText className="h-4 w-4 text-black dark:text-[var(--brand)] shrink-0" />
                <span className="whitespace-nowrap">{t("Memory")}</span>
              </span>
              {memoryPulse > 0 && (
                <span className="text-[10px] uppercase tracking-wider text-black dark:text-[var(--brand)] font-bold">
                  {`+${memoryPulse}`}
                </span>
              )}
            </button>

            {/* Search */}
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
              <input
                placeholder={t("Search chats")}
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                onFocus={(e) => { if (!isAuthed) { e.target.blur(); setAuthOpen(true); } }}
                className="w-full rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-[#161618]/90 pl-10 pr-4 py-2 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-[var(--brand-border)] transition-colors"
              />
            </div>

            {/* Navigation Primary */}
            <nav className="mt-1 flex flex-col gap-1 w-full">
              {/* Chat */}
              <button
                onClick={() => { setTab("chat"); setMobileNavOpen(false); }}
                className={`w-full rounded-full px-4 py-2.5 flex items-center gap-3 text-sm font-medium transition-all ${
                  tab === "chat"
                    ? "bg-zinc-900 text-white border border-zinc-900 shadow-sm dark:bg-[var(--brand-active-bg)] dark:text-white dark:border-[var(--brand-border)] dark:shadow-[var(--brand-shadow)]"
                    : "border border-transparent text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.04]"
                }`}
              >
                <MessageSquare className={`h-4 w-4 shrink-0 ${tab === "chat" ? "text-white dark:text-[var(--brand)]" : "text-zinc-500 dark:text-zinc-400"}`} />
                <span className="text-left whitespace-nowrap">{t("Chat")}</span>
              </button>



              {/* Other Primary Items */}
              {navPrimary.filter((n) => n.id !== "chat").map(({ id, icon: Icon, label }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setTab(id); setMobileNavOpen(false); }}
                    className={`w-full rounded-full px-4 py-2.5 flex items-center gap-3 text-sm font-medium transition-all ${
                      active
                        ? "bg-zinc-900 text-white border border-zinc-900 shadow-sm dark:bg-[var(--brand-active-bg)] dark:text-white dark:border-[var(--brand-border)] dark:shadow-[var(--brand-shadow)]"
                        : "border border-transparent text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white dark:text-[var(--brand)]" : "text-zinc-500 dark:text-zinc-400"}`} />
                    <span className="text-left whitespace-nowrap">{t(label)}</span>
                    {id === "engine" && (
                      <span className="ml-auto text-[9px] uppercase font-semibold text-zinc-500 bg-zinc-200 dark:bg-zinc-850 px-2 py-0.5 rounded-full">
                        SOON
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Divider */}
            <div className="my-2 border-t border-zinc-200 dark:border-white/10 w-full" />

            {/* Recent chats */}
            <div className="w-full">
              <div className="px-3 pb-1.5 text-[11px] uppercase tracking-wider text-zinc-500 font-medium select-none">
                {t("Recent")}
              </div>
              {isAuthed && chats.length > 0 ? (
                <div className="flex flex-col gap-1 w-full">
                  {chats
                    .filter((c) => !chatSearch.trim() || c.title.toLowerCase().includes(chatSearch.trim().toLowerCase()))
                    .map((c) => {
                    const isEngine = engineChatIds.has(c.id);
                    const active = (tab === "engine" && c.id === activeEngineChatId) || (tab !== "engine" && c.id === activeChatId);
                    const isEditing = editingChatId === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`group relative flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-xs transition-all ${
                          active ? "bg-zinc-200/80 text-zinc-900 font-medium dark:bg-white/[0.08] dark:text-white" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        {isEngine ? (
                          <Cpu className={`h-3.5 w-3.5 shrink-0 ${active ? "text-[var(--brand)]" : "text-zinc-500 dark:text-zinc-400"}`} />
                        ) : (
                          <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${active ? "text-black dark:text-[var(--brand)]" : "opacity-60"}`} />
                        )}
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => { void renameChat(c.id, editingTitle); setEditingChatId(null); }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { void renameChat(c.id, editingTitle); setEditingChatId(null); }
                              if (e.key === "Escape") setEditingChatId(null);
                            }}
                            className="flex-1 min-w-0 bg-transparent text-xs text-zinc-900 dark:text-white outline-none border-b border-zinc-900 dark:border-[var(--brand-border)]"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              if (isEngine) {
                                setActiveEngineChatId(c.id);
                                setTab("engine");
                                setMobileNavOpen(false);
                              } else {
                                void loadChat(c.id);
                                setMobileNavOpen(false);
                              }
                            }}
                            className="flex-1 min-w-0 truncate text-left text-xs flex items-center gap-1.5"
                            title={c.title}
                          >
                            <span className="truncate">{c.title || t("New chat")}</span>
                            {isEngine && (
                              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand-border)]">
                                engine
                              </span>
                            )}
                            {(generatingChatIds.has(c.id) || engineGeneratingChatIds.has(c.id)) && (
                              <span className="shrink-0 flex items-center ml-auto text-[var(--brand)]" title="Нейросеть генерирует ответ…">
                                <Loader2 className="h-3 w-3 animate-spin text-[var(--brand)]" />
                              </span>
                            )}
                          </button>
                        )}
                        {!isEditing && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingChatId(c.id); setEditingTitle(c.title); }}
                              className="p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white transition-colors"
                              title={t("Rename")}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); if (confirm(t("Delete this chat?"))) void deleteChat(c.id); }}
                              className="p-1 rounded-md text-zinc-400 hover:text-[var(--brand)] dark:text-zinc-500 dark:hover:text-[var(--brand)] transition-colors"
                              title={t("Delete")}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {chatsLoading && (
                    <div className="flex items-center justify-center py-2 text-zinc-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-3 py-4 text-center">
                  <div className="text-[12px] text-zinc-500">{t("No chats yet")}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Profile Bottom Card */}
        <div className="shrink-0 border-t border-zinc-200 dark:border-white/10 p-3">
          {isAuthed ? (
            <button
              onClick={() => setProfileOpen(true)}
              className="w-full rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-[#161618]/90 dark:hover:bg-[#1f1f23] p-2.5 flex items-center gap-3 text-left transition-all shadow-sm active:scale-98"
            >
              <div className="relative h-9 w-9 shrink-0 rounded-full bg-black dark:bg-[var(--brand)] flex items-center justify-center text-xs font-bold text-white shadow-sm">
                {(user!.name || "Me Coder").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-zinc-900 dark:text-white truncate leading-tight">
                  {user!.name || "Me Coder"}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate leading-tight mt-0.5">
                  {user!.email || "mecoder525@gmail.com"}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500 -rotate-90" />
            </button>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="w-full rounded-xl bg-black hover:bg-zinc-800 dark:bg-[var(--brand)] dark:hover:brightness-110 text-white py-2 px-3 text-xs font-semibold shadow-sm"
            >
              {t("Sign in")}
            </button>
          )}
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <main className="relative flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Top bar */}
        <header className="shrink-0 relative z-40 flex items-center justify-between px-3 py-2.5 md:px-5 md:py-3.5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              onClick={() => {
                if (window.innerWidth < 768) setMobileNavOpen(true);
                else setSidebarOpen((v) => !v);
              }}
              aria-label="Toggle menu"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 dark:border-white/10 bg-white hover:bg-zinc-100 dark:bg-[#161618]/80 dark:hover:bg-[#1f1f23] text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors shadow-sm"
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Logo */}
            <div className="flex items-center gap-1.5 mr-1 select-none">
              <img src={logoAsset} alt="IGseek" className="logo-mark h-6 w-6 shrink-0 object-contain" />
              <span className="font-bold text-[16px] tracking-tight">
                <span className="text-black dark:text-[var(--brand)] font-extrabold">IG</span>
                <span className="text-zinc-900 dark:text-white">seek</span>
              </span>
            </div>
          </div>
        </header>

        {/* Content */}
        <div
          className={`relative z-10 flex-1 min-h-0 scroll-smooth overscroll-contain ${tab === "engine" ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
          }}
        >
          <div className={`mx-auto flex w-full flex-col px-3 md:px-6 ${tab === "engine" ? "max-w-5xl h-full pb-2 pt-2 min-h-0 flex-1" : "min-h-full max-w-3xl pb-6"} ${tab === "chat" && messages.length === 0 ? "justify-center pt-6" : tab === "engine" ? "" : "pt-4 md:pt-8"}`}>
            <AnimatePresence mode="wait">
              {tab === "chat" && (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <ChatView
                    isAuthed={isAuthed}
                    isLocked={isLocked}
                    input={input}
                    setInput={setInput}
                    attachments={attachments}
                    onRemoveAttachment={removeAttachment}
                    onAttach={() => fileInputRef.current?.click()}
                    onRequireAuth={() => setAuthOpen(true)}
                    onLocked={() => setProfileOpen(true)}
                    messages={messages}
                    isSending={isSending}
                    onSend={sendChat}
                    onStop={stopStreaming}
                    onEdit={editMessage}
                    onDelete={deleteMessage}
                    messagesEndRef={messagesEndRef}
                  />


                </motion.div>
              )}

              {tab === "library" && <TabWrap key="library"><LibraryView
                isAuthed={isAuthed}
                onRequireAuth={() => setAuthOpen(true)}
                projects={projects}
                chats={chats}
                onCreateProject={createProject}
                onRenameProject={renameProject}
                onDeleteProject={deleteProject}
                onAssignChat={assignChatToProject}
                onOpenChat={(id) => { void loadChat(id); }}
                onOpenEngineChat={(id) => {
                  setActiveEngineChatId(id);
                  setTab("engine");
                }}
                onCreateEngineChatInProject={createEngineChatInProject}
                onCreateRegularChatInProject={createRegularChatInProject}
                engineChatIds={engineChatIds}
                userId={user?.id ?? null}
              /></TabWrap>}
              {tab === "saved" && <TabWrap key="saved"><SavedView
                isAuthed={isAuthed}
                onRequireAuth={() => setAuthOpen(true)}
                chats={chats.filter((c) => c.is_saved)}
                onOpenChat={(id) => { void loadChat(id); }}
                onUnsave={(id) => { void toggleSaveChat(id, false); }}
              /></TabWrap>}

              {tab === "engine" && (
                <TabWrap key="engine">
                  <EngineView
                    activeChatId={activeEngineChatId}
                    onActiveChatChange={(id) => setActiveEngineChatId(id)}
                    onGeneratingChange={(id, gen) => {
                      setEngineGeneratingChatIds((prev) => {
                        const next = new Set(prev);
                        if (gen) next.add(id);
                        else next.delete(id);
                        return next;
                      });
                    }}
                    projects={projects}
                    chats={chats}
                    onCreateProject={createProject}
                    onAssignChat={assignChatToProject}
                    onNavigateToLibrary={() => setTab("library")}
                    onSaveEngineChat={(id, title, userText, asstText, currentFiles, currentMessages, targetProjectId) => {
                      markEngineChatId(id);
                      const now = new Date().toISOString();
                      setChats((prev) => {
                        const exists = prev.find((c) => c.id === id);
                        const effectiveProjectId = targetProjectId !== undefined ? targetProjectId : (exists?.project_id ?? null);
                        if (exists) {
                          return prev.map((c) => (c.id === id ? { ...c, updated_at: now, title: title || c.title, project_id: effectiveProjectId } : c));
                        }
                        return [{ id, title, updated_at: now, is_saved: false, project_id: effectiveProjectId }, ...prev];
                      });

                      try {
                        window.localStorage.setItem(
                          `igseek:engine_proj_${id}`,
                          JSON.stringify({ files: currentFiles, chatMessages: currentMessages, title })
                        );
                      } catch {}

                      if (isGuest || user?.id === GUEST_ID) {
                        const store = readGuestStore();
                        const exists = store.chats.find((c) => c.id === id);
                        const effectiveProjectId = targetProjectId !== undefined ? targetProjectId : (exists?.project_id ?? null);
                        if (!exists) {
                          store.chats.unshift({ id, title, updated_at: now, is_saved: false, project_id: effectiveProjectId });
                        } else {
                          store.chats = store.chats.map((c) => (c.id === id ? { ...c, updated_at: now, title: title || c.title, project_id: effectiveProjectId } : c));
                        }
                        store.messages[id] = currentMessages.map((m: any, idx: number) => ({
                          id: m.id,
                          role: m.role,
                          content: m.content,
                          position: idx,
                        }));
                        writeGuestStore(store);
                      } else if (user) {
                        void (async () => {
                          const { data: existing } = await supabase.from("chats").select("id, project_id").eq("id", id).maybeSingle();
                          const effectiveProjectId = targetProjectId !== undefined ? targetProjectId : (existing?.project_id ?? null);
                          if (existing) {
                            await supabase.from("chats").update({ title, updated_at: now, project_id: effectiveProjectId }).eq("id", id);
                          } else {
                            await supabase.from("chats").insert({ id, title, user_id: user.id, updated_at: now, project_id: effectiveProjectId });
                          }
                        })();
                      }
                    }}
                  />
                </TabWrap>
              )}
              {tab === "docs" && <TabWrap key="docs"><DocsView /></TabWrap>}
            </AnimatePresence>
          </div>
        </div>

        {/* Hidden file input — always mounted so both the hero pill and the composer can attach files */}
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void attachFiles(files);
          }}
        />

        {/* ============ COMPOSER ============ */}
        {tab === "chat" && messages.length > 0 && (
          <div className="shrink-0 z-30 px-2 sm:px-4 pb-3 sm:pb-4 pt-1 bg-background/95 dark:bg-background/90 backdrop-blur-md">
            <div className="mx-auto w-full max-w-3xl">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!isAuthed) { setAuthOpen(true); return; }
                  if (isLocked) { setProfileOpen(true); return; }
                  if (isSending) return;
                  sendChat(input);
                }}
                className="relative flex items-center gap-1 sm:gap-1.5 rounded-full border border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-[#141416]/95 p-1 pl-2 sm:p-1.5 sm:pl-3 shadow-lg shadow-zinc-900/5 dark:shadow-2xl backdrop-blur-xl focus-within:border-zinc-400 dark:focus-within:border-white/20 transition-all w-full overflow-hidden"
              >
                {attachments.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-2 flex flex-wrap gap-2 p-2 bg-white/95 dark:bg-[#141416]/95 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-xl backdrop-blur-xl">
                    {attachments.map((a) => (
                      <div
                        key={a.id}
                        className="group/att relative h-12 w-12 sm:h-14 sm:w-14 shrink-0 overflow-hidden rounded-xl border border-zinc-200 dark:border-white/15 bg-background/60"
                      >
                        <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeAttachment(a.id)}
                          title={t("Remove")}
                          className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Paperclip */}
                <button
                  type="button"
                  onClick={() => {
                    if (!isAuthed) { setAuthOpen(true); return; }
                    if (isLocked) { setProfileOpen(true); return; }
                    fileInputRef.current?.click();
                  }}
                  title={t("Attach file")}
                  className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                {/* Input */}
                <textarea
                  ref={composerRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={(e) => {
                    if (!isAuthed) { e.target.blur(); setAuthOpen(true); }
                    else if (isLocked) { e.target.blur(); setProfileOpen(true); }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!isAuthed) { setAuthOpen(true); return; }
                      if (isLocked) { setProfileOpen(true); return; }
                      if (!isSending) sendChat(input);
                    }
                  }}
                  rows={1}
                  readOnly={!isAuthed || isLocked}
                  placeholder={
                    !isAuthed
                      ? t("Sign in to start chatting with IGseek…")
                      : t("Ask IGseek anything…")
                  }
                  className="max-h-32 min-h-[32px] flex-1 min-w-0 resize-none bg-transparent px-1.5 py-1 text-[13.5px] sm:text-[15px] leading-5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
                />

                {/* Mic circular button */}
                <button
                  type="button"
                  onClick={() => {
                    if (!isAuthed) { setAuthOpen(true); return; }
                    if (isLocked) { setProfileOpen(true); return; }
                    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                    if (!SR) { alert(t("Voice input is not supported in this browser")); return; }
                    if (listening) {
                      try { recognitionRef.current?.stop(); } catch {}
                      setListening(false);
                      return;
                    }
                    const rec = new SR();
                    rec.lang = localeFor(lang);
                    rec.continuous = true;
                    rec.interimResults = true;
                    let base = input;
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
                        setInput(base);
                      } else if (interim) {
                        setInput((base ? base + " " : "") + interim);
                      }
                    };
                    rec.onerror = () => setListening(false);
                    rec.onend = () => setListening(false);
                    recognitionRef.current = rec;
                    try { rec.start(); setListening(true); } catch { setListening(false); }
                  }}
                  title={listening ? t("Stop recording") : t("Voice input")}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 dark:border-white/5 bg-zinc-100 hover:bg-zinc-200 dark:bg-[#1e1e22] dark:hover:bg-[#28282e] transition-all ${
                    listening
                      ? "text-black dark:text-[var(--brand)] animate-pulse ring-2 ring-black/20 dark:ring-[var(--brand-border)]"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                  }`}
                >
                  {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </button>

                {/* Brain reasoning button */}
                <button
                  type="button"
                  onClick={() => { if (!isAuthed) { setAuthOpen(true); return; } setThinking((v) => !v); }}
                  title={thinking ? t("Reasoner on") : t("Reasoner off")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 dark:border-white/5 bg-zinc-100 hover:bg-zinc-200 dark:bg-[#1e1e22] dark:hover:bg-[#28282e] transition-all"
                >
                  <Brain className={`h-3.5 w-3.5 ${thinking ? "text-black dark:text-[var(--brand)] font-bold" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"}`} />
                </button>

                {/* Web search button */}
                <button
                  type="button"
                  onClick={() => { if (!isAuthed) { setAuthOpen(true); return; } setWebSearch((v) => !v); }}
                  title={webSearch ? t("Web search on") : t("Web search off")}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 dark:border-white/5 bg-zinc-100 hover:bg-zinc-200 dark:bg-[#1e1e22] dark:hover:bg-[#28282e] transition-all ${
                    webSearch ? "text-black dark:text-[var(--brand)]" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                </button>

                {/* Composer Buttons: Stop button side by side with Send button */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isSending && (
                    <button
                      type="button"
                      onClick={stopStreaming}
                      title={t("Остановить генерацию")}
                      className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 text-white transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      <Square className="h-3 w-3" fill="currentColor" />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isAuthed && !input.trim() && !attachments.length}
                    title={isAuthed ? (isSending ? t("Отправить в очередь") : t("Send")) : t("Sign in to send")}
                    className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-black dark:bg-[var(--brand)] hover:bg-zinc-800 dark:hover:brightness-110 text-white transition-all shadow-md shadow-black/20 dark:shadow-[var(--brand-shadow)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>{authOpen && <AuthModal onClose={() => setAuthOpen(false)} onAuthed={handleAuthed} />}</AnimatePresence>
      <AnimatePresence>
        {profileOpen && user && (
          <ProfileModal
            user={user}
            onClose={() => setProfileOpen(false)}
            onSignOut={signOut}
            onUpdate={updateUser}
            model={model}
            onModelChange={setModel}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {memoryOpen && user && (
          <MemoryModal onClose={() => setMemoryOpen(false)} lang={lang} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {gmailAuthOpen && (
          <GmailAuthModal
            onClose={() => setGmailAuthOpen(false)}
            onConnected={() => {
              setPendingGmailAction(null);
            }}
            pendingEmail={pendingGmailAction}
          />
        )}
      </AnimatePresence>

    </div>
    </TContext.Provider>
  );
}

/* ---------- Tab wrapper ---------- */
function TabWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Chat (hero + conversation) ---------- */
function ChatView({
  isAuthed,
  isLocked,
  input,
  setInput,
  attachments,
  onRemoveAttachment,
  onAttach,
  onRequireAuth,
  onLocked,
  messages,
  isSending,
  onSend,
  onStop,
  onEdit,
  onDelete,
  messagesEndRef,
}: {
  isAuthed: boolean;
  isLocked: boolean;
  input: string;
  setInput: (v: string) => void;
  attachments: Array<{ id: string; name: string; dataUrl: string }>;
  onRemoveAttachment: (id: string) => void;
  onAttach: () => void;
  onRequireAuth: () => void;
  onLocked: () => void;
  messages: ChatMessage[];
  isSending: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
  onEdit: (msgId: string, newText: string) => void;
  onDelete: (msgId: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  const [welcomeChips, setWelcomeChips] = useState<
    Array<{
      icon: any;
      label: string;
      prompt: string;
      category: string;
      color: string;
    }>
  >([]);

  useEffect(() => {
    const pool = [
      {
        icon: TrendingUp,
        label: "Анализ трендов недели",
        prompt: "Найди и проанализируй основные тренды в моей нише за эту неделю",
        category: "Аналитика",
        color: "bg-[var(--brand-soft)] text-[var(--brand)]",
      },
      {
        icon: MailIcon,
        label: "Открытка маме через Gmail",
        prompt: "Сгенерируй открытку с днем рождения и отправь её моей маме по Gmail",
        category: "Почта",
        color: "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400",
      },
      {
        icon: FileText,
        label: "Отправь отчет боссу",
        prompt: "Прочти отчет из памяти и отправь его боссу на электронную почту",
        category: "Отчеты",
        color: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
      },
      {
        icon: CalendarIcon,
        label: "Запланируй встречу",
        prompt: "Запланируй встречу завтра в 15:00 в Google Календаре",
        category: "Календарь",
        color: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
      },
      {
        icon: CheckSquareIcon,
        label: "Список задач в Tasks",
        prompt: "Добавь задачи на сегодня в Google Tasks: 1. Проверить код 2. Отправить отчет",
        category: "Задачи",
        color: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
      },
      {
        icon: ImageIcon,
        label: "Сгенерируй арт",
        prompt: "Сгенерируй футуристический концепт-арт неонового города будущего",
        category: "ИИ Арт",
        color: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400",
      },
      {
        icon: Code2,
        label: "TypeScript сервис",
        prompt: "Напиши эффективный TypeScript-модуль для параллельной обработки данных",
        category: "Код",
        color: "bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400",
      },
      {
        icon: Globe,
        label: "Сводка новостей ИИ",
        prompt: "Найди актуальные новости об искусственном интеллекте за сегодня",
        category: "Веб-поиск",
        color: "bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400",
      },
      {
        icon: Brain,
        label: "Вложения и память",
        prompt: "Прочти мои последние вложения из памяти и расскажи их ключевую суть",
        category: "Память",
        color: "bg-pink-500/10 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400",
      },
      {
        icon: Zap,
        label: "Стратегия маркетинга",
        prompt: "Составь пошаговый план запуска продукта и привлечения клиентов",
        category: "Стратегия",
        color: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
      },
      {
        icon: Users,
        label: "Аудит конкурентов",
        prompt: "Проведи быстрый аудит основных конкурентов и их рыночного позиционирования",
        category: "Анализ",
        color: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
      },
      {
        icon: Hash,
        label: "Темы для контента",
        prompt: "Предложи 5 выигрышных тем для контент-плана на эту неделю",
        category: "Контент",
        color: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
      },
    ];

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setWelcomeChips(shuffled.slice(0, 4));
  }, []);

  const guard = (): boolean => {
    if (!isAuthed) { onRequireAuth(); return false; }
    if (isLocked) { onLocked(); return false; }
    return true;
  };

  const submit = (text: string) => {
    const value = text.trim();
    if (!guard() || (!value && !attachments.length)) return;
    onSend(value);
  };

  if (messages.length > 0) {
    return (
      <div className="flex flex-col gap-5 sm:gap-6 w-full min-w-0 max-w-full">
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            message={m}
            isStreamingLast={isSending && i === messages.length - 1 && m.role === "assistant"}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
    );
  }


  return (
    <>
      {/* Background: Clean adaptive subtle grid */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="absolute left-1/2 top-14 -translate-x-1/2 w-[340px] h-[220px] rounded-full dark:bg-[var(--brand)]/15 blur-[100px] pointer-events-none" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center text-center w-full max-w-2xl mx-auto px-4"
      >
        {/* Large Centered Fox Logo */}
        <div className="relative mb-5 flex items-center justify-center">
          <img
            src={logoAsset}
            alt="IGseek"
            className="logo-mark relative h-20 w-20 object-contain drop-shadow-none dark:drop-shadow-[0_0_28px_var(--brand-glow-shadow)]"
          />
        </div>

        {/* Headline: What are we seeking today? */}
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl text-zinc-900 dark:text-white font-normal tracking-tight">
          {t("What are we")}{" "}
          <span className="font-serif italic text-black dark:text-[var(--brand)] font-normal">{t("seeking")}</span>{" "}
          {t("today?")}
        </h1>

        {/* Subtitle */}
        <p className="mt-3.5 max-w-md text-[14px] md:text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t("Your AI research assistant — explore ideas, analyze signals, and create content that actually performs.")}
        </p>

        {/* Center Pill Composer */}
        <form
          onSubmit={(e) => { e.preventDefault(); submit(input); }}
          className="mt-8 flex w-full max-w-xl items-center gap-2 rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416]/95 p-2 pl-3 shadow-lg shadow-zinc-900/5 dark:shadow-2xl backdrop-blur-xl focus-within:border-zinc-400 dark:focus-within:border-white/20 transition-all"
        >
          <button
            type="button"
            onClick={() => { if (guard()) onAttach(); }}
            title={t("Attach file")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={(e) => {
              if (!isAuthed) { e.currentTarget.blur(); onRequireAuth(); }
              else if (isLocked) { e.currentTarget.blur(); onLocked(); }
            }}
            readOnly={!isAuthed || isLocked}
            placeholder={t("Ask IGseek anything…")}
            className="flex-1 bg-transparent px-2 py-1.5 text-[15px] text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none min-w-0"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            {isSending && onStop && (
              <button
                type="button"
                onClick={onStop}
                title={t("Остановить генерацию")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 text-white transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <Square className="h-3 w-3" fill="currentColor" />
              </button>
            )}
            <button
              type="submit"
              disabled={(!input.trim() && !attachments.length)}
              title={isSending ? t("Отправить в очередь") : t("Send")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black dark:bg-[var(--brand)] hover:bg-zinc-800 dark:hover:brightness-110 text-white transition-all shadow-md shadow-black/20 dark:shadow-[var(--brand-shadow)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* 4 Dynamic Random Prompt Suggestions (2x2 Grid) */}
        <div className="mt-6 sm:mt-7 grid grid-cols-2 gap-2 sm:gap-3 w-full max-w-xl">
          {welcomeChips.map((chip, idx) => (
            <button
              key={idx + chip.label}
              type="button"
              onClick={() => submit(chip.prompt)}
              className="w-full min-w-0 h-11 sm:h-12 rounded-full border border-zinc-200 dark:border-white/10 bg-white hover:bg-zinc-50 dark:bg-[#141416]/90 dark:hover:bg-[#1c1c20] px-3 sm:px-4 flex items-center gap-2 sm:gap-2.5 shadow-sm transition-all active:scale-98 group cursor-pointer"
            >
              <span className={`flex h-6.5 w-6.5 sm:h-7 sm:w-7 items-center justify-center rounded-full shrink-0 ${chip.color}`}>
                <chip.icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-[12px] sm:text-[13px] md:text-sm text-zinc-800 dark:text-zinc-200 font-medium truncate text-left whitespace-nowrap">
                {chip.label}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}
function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="not-prose group relative my-3 max-w-full min-w-0 overflow-hidden rounded-xl border border-border bg-surface/60"
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-background/40 px-3 py-2 min-w-0">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground min-w-0 truncate">
          <Code2 className="h-3.5 w-3.5 text-brand shrink-0" />
          <span className="truncate">{language || "code"}</span>
        </div>
        <button
          type="button"
          onClick={copy}
          className="glass-button shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-brand" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="m-0 max-w-full overflow-x-auto bg-transparent p-3 text-[12px] sm:text-[12.5px] leading-relaxed whitespace-pre font-mono">
        <code className={`language-${language} text-foreground/90 whitespace-pre break-normal`}>{code}</code>
      </pre>
    </motion.div>
  );
}

function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<boolean>(false);
  const uniqueId = useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let active = true;
    async function renderMermaid() {
      try {
        const isDark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "loose",
          fontFamily: "inherit",
        });
        const { svg: renderedSvg } = await mermaid.render(uniqueId.current, code);
        if (active) {
          setSvg(renderedSvg);
          setError(false);
        }
      } catch (err) {
        if (active) {
          setError(true);
        }
      }
    }
    void renderMermaid();
    return () => {
      active = false;
    };
  }, [code]);

  if (error) {
    return <CodeBlock code={code} language="mermaid" />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="not-prose my-3 overflow-x-auto rounded-xl border border-border bg-surface/80 p-4 shadow-sm"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
        <Sparkles className="h-3.5 w-3.5 text-brand" />
        <span>Схема / Диаграмма</span>
      </div>
      <div
        className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto text-foreground"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </motion.div>
  );
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const t = useT();
  const extFor = (lang: string) => {
    const map: Record<string, string> = {
      html: "html", css: "css", javascript: "js", js: "js",
      typescript: "ts", ts: "ts", tsx: "tsx", jsx: "jsx",
      python: "py", py: "py", json: "json", yaml: "yml", yml: "yml",
      sql: "sql", markdown: "md", md: "md", bash: "sh", sh: "sh",
      text: "txt", txt: "txt",
    };
    return map[lang.toLowerCase()] ?? "txt";
  };
  const slug = artifact.title
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "artifact";
  const filename = `${slug}.${extFor(artifact.language)}`;
  const download = () => {
    const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-surface/60 p-3 hover:border-brand/40 transition-colors"
    >
      {/* subtle generation sweep — plays once on mount */}
      <motion.div
        aria-hidden
        initial={{ x: "-120%", opacity: 0.9 }}
        animate={{ x: "120%", opacity: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-brand/15 to-transparent"
      />
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
        <motion.div
          initial={{ opacity: 0.55 }}
          animate={{ opacity: [0.55, 1, 0.9] }}
          transition={{ duration: 1.4, times: [0, 0.6, 1] }}
        >
          <FileCode className="h-5 w-5 text-brand" />
        </motion.div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{artifact.title}</div>
        <div className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
          {t("Code")} · {artifact.language.toUpperCase()}
        </div>
      </div>
      <button
        type="button"
        onClick={download}
        className="glass-button relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-foreground hover:border-brand/40 hover:text-brand"
      >
        <Download className="h-3.5 w-3.5" />
        {t("Download")}
      </button>
    </motion.div>
  );
}

function GeneratedImageCard({ image }: { image: GeneratedImage }) {
  const t = useT();
  const filename =
    image.title
      .toLowerCase()
      .replace(/[^a-z0-9\u0400-\u04ff]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "image";
  const download = () => {
    const a = document.createElement("a");
    a.href = image.dataUrl;
    a.download = `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden rounded-xl border border-border bg-surface/60 hover:border-brand/40 transition-colors"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
            <ImageIcon className="h-4 w-4 text-brand" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{image.title}</div>
            <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("Image")}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={download}
          className="glass-button inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-foreground hover:border-brand/40 hover:text-brand"
        >
          <Download className="h-3.5 w-3.5" />
          {t("Download")}
        </button>
      </div>
      <div className="p-2">
        <img
          src={image.dataUrl}
          alt={image.title}
          className="w-full rounded-lg bg-background object-cover"
          loading="lazy"
        />
        {image.description && (
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
            {image.description}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function WebImageCard({ payload }: { payload: WebImagePayload }) {
  const [selectedImg, setSelectedImg] = useState<string | null>(null);

  if (!payload.images || payload.images.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="overflow-hidden rounded-xl border border-border bg-surface/70 p-3 my-2 shadow-sm"
    >
      <div className="flex items-center justify-between mb-2.5 px-1">
        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-brand" />
          <span>{payload.caption || `Изображения по запросу «${payload.query}»`}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {payload.images.slice(0, 4).map((img, i) => (
          <div
            key={i}
            onClick={() => setSelectedImg(img.url)}
            className="group relative cursor-pointer overflow-hidden rounded-lg border border-border/80 bg-background hover:border-brand/50 transition-all aspect-video"
          >
            <img
              src={img.thumbnail || img.url}
              alt={img.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
              <span className="text-[11px] text-white font-medium line-clamp-1">{img.title}</span>
              {img.source && <span className="text-[9px] text-white/70">{img.source}</span>}
            </div>
          </div>
        ))}
      </div>

      {selectedImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedImg(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-xl bg-background p-2">
            <button
              onClick={() => setSelectedImg(null)}
              className="absolute top-3 right-3 z-10 rounded-full bg-black/60 p-1.5 text-white hover:bg-black"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={selectedImg} alt="" className="max-h-[85vh] w-auto max-w-full rounded-lg object-contain" />
          </div>
        </div>
      )}
    </motion.div>
  );
}

function CalendarEventCard({ event, onGoToCalendar }: { event: CalendarEventPayload; onGoToCalendar: () => void }) {
  const formatTime = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };
  const formatDate = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString([], { day: "numeric", month: "long" });
    } catch {
      return iso;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="overflow-hidden rounded-xl border border-brand/30 bg-surface/80 p-3.5 hover:border-brand/60 transition-colors shadow-sm my-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
            <CalendarIcon className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-sm text-foreground">{event.summary || "Напоминание"}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
              {event.start?.dateTime && (
                <span>{formatDate(event.start.dateTime)} • {formatTime(event.start.dateTime)} - {formatTime(event.end?.dateTime)}</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onGoToCalendar}
          className="glass-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/20 transition-all shrink-0"
        >
          <span>В Календарь</span>
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
      {event.description && (
        <p className="mt-2 text-xs text-muted-foreground/90 bg-background/50 p-2 rounded-md">
          {event.description}
        </p>
      )}
      {event.location && (
        <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
          📍 <span>{event.location}</span>
        </div>
      )}
    </motion.div>
  );
}

function TaskEventCard({ task, onGoToTasks }: { task: { action: string; title: string; notes?: string; due?: string }; onGoToTasks: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="overflow-hidden rounded-xl border border-brand/30 bg-surface/80 p-3.5 hover:border-brand/60 transition-colors shadow-sm my-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
            <CheckSquareIcon className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-sm text-foreground">{task.title || "Задача"}</div>
            {task.due && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Срок: {new Date(task.due).toLocaleDateString([], { day: "numeric", month: "long" })}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onGoToTasks}
          className="glass-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/20 transition-all shrink-0"
        >
          <span>В Задачи</span>
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
      {task.notes && (
        <p className="mt-2 text-xs text-muted-foreground/90 bg-background/50 p-2 rounded-md">
          {task.notes}
        </p>
      )}
    </motion.div>
  );
}

function GmailEventCard({ email, onGoToGmail }: { email: { action: string; to?: string; subject?: string; body?: string }; onGoToGmail: () => void }) {
  const isConnected = !!getCachedGmailToken();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="overflow-hidden rounded-xl border border-red-500/25 bg-surface/80 p-3.5 hover:border-red-500/40 transition-colors shadow-sm my-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
            <MailIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-foreground flex items-center gap-2">
              <span className="truncate">{email.subject || "Письмо Gmail"}</span>
              {isConnected ? (
                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                  ✓ Gmail подключен
                </span>
              ) : (
                <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">
                  Требуется вход
                </span>
              )}
            </div>
            {email.to && (
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                Кому: {email.to}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onGoToGmail}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all shrink-0 cursor-pointer ${
            isConnected
              ? "glass-button text-brand hover:bg-brand/20"
              : "bg-red-600 hover:bg-red-700 text-white font-semibold shadow-sm"
          }`}
        >
          <span>{isConnected ? "В Gmail" : "Войти в Gmail"}</span>
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
      {email.body && (
        <p className="mt-2 text-xs text-muted-foreground/90 bg-background/50 p-2 rounded-md whitespace-pre-wrap">
          {email.body}
        </p>
      )}
    </motion.div>
  );
}

function RefusalEventCard({
  refusal,
}: {
  refusal: { action: string; reason: string; alternative: string };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/[0.05] dark:bg-amber-500/[0.08] p-3.5 my-2 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-amber-700 dark:text-amber-300">
              Граница возможностей
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
              Не поддерживается
            </span>
          </div>
          <div className="text-xs text-foreground font-semibold">
            Действие «{refusal.action}» напрямую невозможно
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {refusal.reason}
          </p>
          {refusal.alternative && (
            <div className="text-xs text-foreground/90 bg-background/60 dark:bg-black/20 p-2 rounded-md mt-1.5 border border-border/50">
              💡 <span className="font-medium text-foreground">Альтернатива:</span> {refusal.alternative}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}


function ImageGenerationPlaceholder({ title }: { title: string }) {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden rounded-xl border border-border bg-surface/60"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <ImageIcon className="h-4 w-4 text-brand" />
            </motion.div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{title}</div>
            <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("Image")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("Generating image")}…
        </div>
      </div>
      <div className="p-2">
        <div className="relative flex h-48 w-full items-center justify-center overflow-hidden rounded-lg bg-background">
          {/* Soft aurora glow */}
          <motion.div
            className="pointer-events-none absolute h-40 w-40 rounded-full bg-brand/20 blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute h-32 w-32 rounded-full bg-brand/10 blur-2xl"
            animate={{ scale: [1.1, 0.9, 1.1], opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            style={{ rotate: 90 }}
          />

          {/* Floating particles */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-brand/40 blur-[1px]"
              initial={{ opacity: 0, x: 0, y: 0 }}
              animate={{
                opacity: [0, 0.8, 0],
                x: [0, (i % 2 === 0 ? 1 : -1) * (20 + i * 8)],
                y: [0, -30 - i * 6],
              }}
              transition={{
                duration: 2.5 + i * 0.4,
                repeat: Infinity,
                delay: i * 0.3,
                ease: "easeOut",
              }}
              style={{ bottom: "40%", left: `${45 + (i - 2.5) * 6}%` }}
            />
          ))}

          {/* Center icon with pulse ring */}
          <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface/80 shadow-sm">
            <motion.div
              className="absolute inset-0 rounded-2xl border border-brand/30"
              animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
            />
            <ImageIcon className="h-6 w-6 text-brand" />
          </div>

          {/* Shimmer sweep */}
          <motion.div
            className="pointer-events-none absolute inset-0 z-20 opacity-20"
            style={{
              background: "linear-gradient(105deg, transparent 40%, rgba(220,38,38,0.15) 50%, transparent 60%)",
            }}
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <div className="mt-2 px-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{t("Almost ready")}…</span>
            <span className="h-1 w-24 overflow-hidden rounded-full bg-surface">
              <motion.span
                className="block h-full rounded-full bg-brand/60"
                initial={{ width: "0%" }}
                animate={{ width: ["0%", "70%", "100%"] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              />
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}


// Разбирает содержимое сообщения пользователя: прикреплённые картинки
// (markdown с data-URL) отдельными частями, остальное — текстом.
// Служебная строка парсера («🖼️ имя (вес)») не показывается — только фото и текст.
function splitUserContent(
  content: string,
): Array<{ type: "text"; text: string } | { type: "image"; url: string }> {
  const re = /!\[[^\]]*\]\((data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+)\)/g;
  const parts: Array<{ type: "text"; text: string } | { type: "image"; url: string }> = [];
  const cleanText = (raw: string) =>
    raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("🖼️"))
      .join("\n")
      .trim();
  const pushText = (raw: string) => {
    const text = cleanText(raw);
    if (text) parts.push({ type: "text", text });
  };
  let last = 0;
  for (const match of content.matchAll(re)) {
    pushText(content.slice(last, match.index));
    parts.push({ type: "image", url: match[1] });
    last = (match.index ?? 0) + match[0].length;
  }
  pushText(content.slice(last));
  return parts;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

// Форматы, которые принимает vision-API DeepSeek. Всё остальное
// (SVG, BMP, TIFF, HEIC…) растеризуем в PNG через canvas — иначе
// сервер получает stream_failed и пользователь видит ошибку.
const MODEL_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);

async function normalizeImageForModel(dataUrl: string): Promise<string> {
  const mime = (dataUrl.slice(5).split(";")[0] || "").toLowerCase();
  if (MODEL_IMAGE_MIME.has(mime)) return dataUrl;
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = dataUrl;
    });
    const w = img.naturalWidth || 512;
    const h = img.naturalHeight || 512;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const png = canvas.toDataURL("image/png");
    return png.length > 10 ? png : dataUrl;
  } catch {
    return dataUrl; // не смогли декодировать — отправляем как есть
  }
}

// Название чата из первого сообщения: без markdown-картинок и base64-стен.
function chatTitleFrom(text: string): string {
  const withoutImages = text.replace(/!\[[^\]]*\]\(data:[^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (withoutImages) return withoutImages.slice(0, 60);
  const alt = text.match(/!\[([^\]]*)\]/)?.[1]?.trim();
  if (alt) return alt.slice(0, 60);
  return "📷 Изображение";
}

function MessageBubble({
  message,
  isStreamingLast,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  isStreamingLast: boolean;
  onEdit?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
}) {
  const t = useT();
  const [showReasoning, setShowReasoning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isUser = message.role === "user";

  const submitEdit = () => {
    const next = draft.trim();
    if (!next || next === message.content) { setIsEditing(false); return; }
    setIsEditing(false);
    onEdit?.(message.id, next);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`group flex w-full min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className="w-full max-w-[88%] sm:max-w-[85%] min-w-0">
        {isUser ? (
          <div className="flex flex-col items-end gap-1 min-w-0 w-full">
            {isEditing ? (
              <div className="w-full min-w-0 max-w-full rounded-2xl border border-brand/40 bg-brand/10 p-2">
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                    if (e.key === "Escape") { setIsEditing(false); setDraft(message.content); }
                  }}
                  rows={Math.min(6, Math.max(2, draft.split("\n").length))}
                  className="w-full resize-none bg-transparent px-2 py-1 text-[14px] md:text-[15px] leading-relaxed outline-none"
                />
                <div className="mt-1 flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => { setIsEditing(false); setDraft(message.content); }}
                    className="glass-button rounded-lg px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {t("Cancel")}
                  </button>
                  <button
                    onClick={submitEdit}
                    className="glass-button-brand rounded-lg px-3 py-1 text-[11px] font-semibold text-primary-foreground"
                  >
                    {t("Save & regenerate")}
                  </button>
                </div>
              </div>
            ) : (
              (() => {
                const parts = splitUserContent(message.content);
                return (
                  <div className="flex flex-col items-end gap-1 min-w-0 max-w-full">
                    {parts.map((p, idx) =>
                      p.type === "image" ? (
                        <img
                          key={idx}
                          src={p.url}
                          alt=""
                          loading="lazy"
                          className="max-h-64 max-w-full rounded-2xl border border-[var(--brand-border)] object-cover"
                        />
                      ) : (
                        <div
                          key={idx}
                          className="max-w-full min-w-0 rounded-[22px] bg-zinc-900 border border-zinc-900 text-white dark:bg-[var(--brand-bubble-bg)] dark:border-[var(--brand-border)] dark:text-white px-4 sm:px-5 py-3 text-[14px] sm:text-[15px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] shadow-sm"
                        >
                          {p.text.replace(/\*\*(.+?)\*\*/g, "$1")}
                        </div>
                      ),
                    )}
                    <div className="text-[11px] text-zinc-500 mt-1 mr-2 text-right select-none">
                      {message.timestamp || "17:05"}
                    </div>
                  </div>
                );
              })()
            )}
            {!isEditing && (onEdit || onDelete) && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity mt-0.5 mr-2">
                {onEdit && (
                  <button
                    onClick={() => { setDraft(message.content); setIsEditing(true); }}
                    className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    title={t("Edit")}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => { if (confirm(t("Delete this message?"))) onDelete(message.id); }}
                    className="p-1 rounded-md text-zinc-500 hover:text-[var(--brand)]"
                    title={t("Delete")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>

        ) : (
          <div className="flex flex-col items-start min-w-0 w-full">
            <div className="min-w-0 w-full">
              <div className="w-full sm:w-fit max-w-full min-w-0 overflow-hidden rounded-[22px] border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-[#161619] px-4 sm:px-5 py-3.5 text-zinc-900 dark:text-white shadow-sm break-words">
                {message.reasoning !== undefined && (
                  <div className="mb-2 rounded-lg border border-border/60 bg-background/40">
                    <button
                      type="button"
                      onClick={() => setShowReasoning((v) => !v)}
                      className="glass-button flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      <Brain className="h-3.5 w-3.5 text-brand" />
                      {t("Thinking")}
                      {isStreamingLast && !message.content && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      <ChevronDown
                        className={`ml-auto h-3 w-3 transition-transform ${showReasoning ? "" : "-rotate-90"}`}
                      />
                    </button>
                    {showReasoning && message.reasoning && (
                      <div className="border-t border-border/50 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                        {message.reasoning}
                      </div>
                    )}
                  </div>
                )}
                {message.content ? (
                  <div className="py-0.5 min-w-0 max-w-full">
                    <div className="prose prose-sm dark:prose-invert max-w-none min-w-0 break-words [overflow-wrap:anywhere] prose-p:my-2 prose-p:leading-relaxed prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:font-bold prose-headings:tracking-tight prose-headings:break-words prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-code:text-brand prose-a:text-brand">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          table({ children }: any) {
                            return (
                              <div className="not-prose my-3 w-full max-w-full overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/15 bg-white/50 dark:bg-[#1a1a1d] shadow-sm">
                                <table className="w-full min-w-max border-collapse text-left text-xs sm:text-sm">
                                  {children}
                                </table>
                              </div>
                            );
                          },
                          thead({ children }: any) {
                            return (
                              <thead className="border-b border-zinc-200 dark:border-white/15 bg-zinc-100/90 dark:bg-[#222226] text-zinc-900 dark:text-zinc-100 font-semibold">
                                {children}
                              </thead>
                            );
                          },
                          tbody({ children }: any) {
                            return <tbody className="divide-y divide-zinc-200 dark:divide-white/10">{children}</tbody>;
                          },
                          tr({ children }: any) {
                            return <tr className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">{children}</tr>;
                          },
                          th({ children }: any) {
                            return (
                              <th className="px-3 py-2 font-semibold text-zinc-900 dark:text-zinc-100 border-r last:border-r-0 border-zinc-200 dark:border-white/10 whitespace-nowrap">
                                {children}
                              </th>
                            );
                          },
                          td({ children }: any) {
                            return (
                              <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200 border-r last:border-r-0 border-zinc-200 dark:border-white/10 whitespace-pre-wrap leading-relaxed">
                                {children}
                              </td>
                            );
                          },
                          code({ inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || "");
                            const lang = match?.[1] ?? "text";
                            const raw = String(children ?? "").replace(/\n$/, "");
                            if (inline || (!match && !raw.includes("\n"))) {
                              return (
                                <code
                                  className="rounded bg-surface px-1.5 py-0.5 text-[0.85em] text-brand border border-border/60"
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            }
                            if (lang === "mermaid") {
                              return <MermaidBlock code={raw} />;
                            }
                            return <CodeBlock code={raw} language={lang} />;
                          },
                          pre({ children }: any) {
                            return <>{children}</>;
                          },
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                      {isStreamingLast && (
                        <span className="inline-block h-3 w-1.5 -mb-0.5 ml-0.5 animate-pulse bg-brand" />
                      )}
                    </div>
                  </div>
                ) : (
                  !message.reasoning && !message.artifacts?.length && (
                    isStreamingLast ? (
                      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
                        {t("Thinking")}…
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[13px] text-amber-500/90 dark:text-amber-400/90">
                        <span>⚠️ {t("Ответ не получен. Попробуйте отправить запрос снова.")}</span>
                      </div>
                    )
                  )
                )}
                {message.content && (
                  <div className="mt-2 text-[11px] text-zinc-500 select-none">
                    {message.timestamp || "17:05"}
                  </div>
                )}
              </div>
              {message.artifacts?.length ? (
                <div className="mt-3 space-y-2">
                  {message.artifacts.map((a) => (
                    <ArtifactCard key={a.id} artifact={a} />
                  ))}
                </div>
              ) : null}
              {message.pendingImage && (
                <div className="mt-3 space-y-2">
                  <ImageGenerationPlaceholder title={message.pendingImage.title} />
                </div>
              )}
              {message.images?.length ? (
                <div className="mt-3 space-y-2">
                  {message.images.map((img) => (
                    <GeneratedImageCard key={img.id} image={img} />
                  ))}
                </div>
              ) : null}
              {message.webImages?.length ? (
                <div className="mt-3 space-y-2">
                  {message.webImages.map((wi) => (
                    <WebImageCard key={wi.id} payload={wi} />
                  ))}
                </div>
              ) : null}
              {message.calendarEvents?.length ? (
                <div className="mt-3 space-y-2">
                  {message.calendarEvents.map((evt, idx) => (
                    <CalendarEventCard key={idx} event={evt} onGoToCalendar={() => window.open("https://calendar.google.com", "_blank")} />
                  ))}
                </div>
              ) : null}
              {message.taskEvents?.length ? (
                <div className="mt-3 space-y-2">
                  {message.taskEvents.map((t, idx) => (
                    <TaskEventCard key={idx} task={t} onGoToTasks={() => window.open("https://tasks.google.com", "_blank")} />
                  ))}
                </div>
              ) : null}
              {message.gmailEvents?.length ? (
                <div className="mt-3 space-y-2">
                  {message.gmailEvents.map((g, idx) => (
                    <GmailEventCard
                      key={idx}
                      email={g}
                      onGoToGmail={() => {
                        const token = getCachedGmailToken();
                        if (!token) {
                          window.dispatchEvent(new CustomEvent("igseek:open-gmail-auth", { detail: g }));
                        } else {
                          window.open("https://mail.google.com", "_blank");
                        }
                      }}
                    />
                  ))}
                </div>
              ) : null}
              {message.refusals?.length ? (
                <div className="mt-3 space-y-2">
                  {message.refusals.map((ref, idx) => (
                    <RefusalEventCard key={idx} refusal={ref} />
                  ))}
                </div>
              ) : null}
              {message.memorySaved && message.role === "assistant" && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/[0.06] px-2.5 py-1 text-[11px] text-muted-foreground"
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                  </span>
                  <NotebookText className="h-3 w-3 text-brand" />
                  <span>{t("Memory updated")}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent("igseek:open-memory"))}
                    className="font-medium text-brand hover:underline"
                  >
                    {t("open HUD")}
                  </button>
                </motion.div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}



/* ---------- Locked view helper ---------- */
function LockedShell({
  title,
  description,
  icon: Icon,
  isAuthed,
  onRequireAuth,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Compass;
  isAuthed: boolean;
  onRequireAuth: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-brand" />
            <h2 className="font-display text-2xl md:text-3xl tracking-tight">{title}</h2>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-xl">{description}</p>
        </div>
        {!isAuthed && (
          <button
            onClick={onRequireAuth}
            className="glass-button-brand shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-transform"
          >
            <LogIn className="h-3.5 w-3.5" /> {t("Sign in")}
          </button>
        )}
      </div>
      <div className={isAuthed ? "" : "relative"}>
        <div className={isAuthed ? "" : "pointer-events-none select-none blur-[2px] opacity-60"}>{children}</div>
        {!isAuthed && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-6">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
              <Lock className="h-3.5 w-3.5 text-brand" />
              {t("Sign in to unlock")} {title.toLowerCase()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Discover ---------- */
type DiscoverItem = { tag: string; title: string; url: string; source: string };
const DISCOVER_ITEMS: DiscoverItem[] = [
  { tag: "Trends", title: "Google Trends — real-time search trends", url: "https://trends.google.com/trends/", source: "trends.google.com" },
  { tag: "Trends", title: "Exploding Topics — emerging niches", url: "https://explodingtopics.com/", source: "explodingtopics.com" },
  { tag: "Social", title: "TikTok Creative Center — trending hashtags", url: "https://ads.tiktok.com/business/creativecenter/pc/en", source: "tiktok.com" },
  { tag: "Video", title: "YouTube Trending", url: "https://www.youtube.com/feed/trending", source: "youtube.com" },
  { tag: "News", title: "Hacker News — tech front page", url: "https://news.ycombinator.com/", source: "news.ycombinator.com" },
  { tag: "News", title: "Reddit — r/popular", url: "https://www.reddit.com/r/popular/", source: "reddit.com" },
  { tag: "Design", title: "Dribbble — visual inspiration", url: "https://dribbble.com/shots/popular", source: "dribbble.com" },
  { tag: "Design", title: "Behance — creative work", url: "https://www.behance.net/", source: "behance.net" },
  { tag: "Product", title: "Product Hunt — new launches", url: "https://www.producthunt.com/", source: "producthunt.com" },
];

function DiscoverView() {
  const t = useT();
  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-brand" />
          <h2 className="font-display text-2xl md:text-3xl tracking-tight">{t("Discover")}</h2>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-xl">
          {t("Curated links to the live web — trends, launches and inspiration. Opens in a new tab.")}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DISCOVER_ITEMS.map((i) => (
          <a
            key={i.url}
            href={i.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl border border-border p-4 transition-colors hover:border-brand/40 hover:bg-accent/40"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-md bg-accent/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{i.tag}</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-brand transition-colors" />
            </div>
            <div className="mt-3 text-sm font-medium">{i.title}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{i.source}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ---------- Analytics ---------- */
function AnalyticsView({ isAuthed, onRequireAuth }: { isAuthed: boolean; onRequireAuth: () => void }) {
  const t = useT();
  const bars = [42, 58, 36, 74, 66, 88, 71];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <LockedShell
      title={t("Analytics")}
      description={t("Track performance metrics and engagement patterns across your content.")}
      icon={BarChart3}
      isAuthed={isAuthed}
      onRequireAuth={onRequireAuth}
    >
      <div className="grid grid-cols-3 gap-3">
        {[
          { l: t("Followers"), v: "48,204", d: "+2.1%" },
          { l: t("Reach (7d)"), v: "312K", d: "+14%" },
          { l: t("Engagement"), v: "6.8%", d: "+0.4%" },
        ].map((k) => (
          <div key={k.l} className="rounded-xl border border-border p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.l}</div>
            <div className="mt-1 text-xl font-semibold">{k.v}</div>
            <div className="mt-0.5 text-[11px] text-brand">{k.d}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-border p-4">
        <div className="text-sm font-medium">{t("Weekly reach")}</div>
        <div className="mt-4 flex h-32 items-end gap-3">
          {bars.map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="w-full rounded-t bg-brand/70" style={{ height: `${h}%` }} />
              <div className="text-[10px] text-muted-foreground">{days[i]}</div>
            </div>
          ))}
        </div>
      </div>
    </LockedShell>
  );
}

/* ---------- Library (Projects) ---------- */
type ChatRow = { id: string; title: string; updated_at: string; is_saved: boolean; project_id: string | null };
type ProjectRow = { id: string; name: string; updated_at: string };

function LibraryView({
  isAuthed,
  onRequireAuth,
  projects,
  chats,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onAssignChat,
  onOpenChat,
  onOpenEngineChat,
  onCreateEngineChatInProject,
  onCreateRegularChatInProject,
  engineChatIds,
  userId,
}: {
  isAuthed: boolean;
  onRequireAuth: () => void;
  projects: ProjectRow[];
  chats: ChatRow[];
  onCreateProject: (name: string) => Promise<ProjectRow | null>;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onAssignChat: (chatId: string, projectId: string | null) => Promise<void>;
  onOpenChat: (id: string) => void;
  onOpenEngineChat: (id: string) => void;
  onCreateEngineChatInProject: (projectId: string) => void;
  onCreateRegularChatInProject: (projectId: string) => void;
  engineChatIds?: Set<string>;
  userId: string | null;
}) {
  const t = useT();
  const [libTab, setLibTab] = useState<"files" | "projects">("files");
  const [fileQuery, setFileQuery] = useState("");
  const [fileCategory, setFileCategory] = useState<"all" | "image" | "doc" | "artifact">("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Array<Artifact & { chatId: string }>>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const openProject = openProjectId ? projects.find((p) => p.id === openProjectId) ?? null : null;
  const projectChats = useMemo(
    () => chats.filter((c) => c.project_id === openProjectId),
    [chats, openProjectId],
  );
  const unassignedChats = useMemo(
    () => chats.filter((c) => !c.project_id),
    [chats],
  );

  // Load artifacts for open project
  useEffect(() => {
    let cancelled = false;
    if (!openProjectId || !userId || projectChats.length === 0) {
      setArtifacts([]);
      return;
    }
    (async () => {
      const ids = projectChats.map((c) => c.id);
      const { data } = await supabase
        .from("chat_messages")
        .select("chat_id, artifacts")
        .in("chat_id", ids)
        .not("artifacts", "is", null);
      if (cancelled || !data) return;
      const flat: Array<Artifact & { chatId: string }> = [];
      for (const row of data) {
        const arr = (row.artifacts as Artifact[] | null) ?? [];
        for (const a of arr) flat.push({ ...a, chatId: row.chat_id as string });
      }
      setArtifacts(flat);
    })();
    return () => { cancelled = true; };
  }, [openProjectId, userId, projectChats]);

  // Collect all files across all chats for Media Library
  const allLibraryFiles = useMemo(() => {
    const store = readGuestStore();
    const list: Array<{
      id: string;
      name: string;
      type: "image" | "doc" | "artifact";
      dataUrl?: string;
      url?: string;
      chatId: string;
      chatTitle: string;
      messageId: string;
      timestamp?: string;
      source: "user_upload" | "generated" | "artifact";
      snippet?: string;
    }> = [];

    const chatTitleMap = new Map<string, string>();
    chats.forEach((c) => chatTitleMap.set(c.id, c.title));

    for (const [chatId, msgs] of Object.entries(store.messages)) {
      const title = chatTitleMap.get(chatId) || "Диалог";
      if (!Array.isArray(msgs)) continue;

      for (const m of msgs) {
        if (!m) continue;
        // 1. User uploaded markdown images/files ![name](dataUrl)
        if (m.content) {
          const matches = [...m.content.matchAll(/!\[([^\]]*)\]\((data:[^)]+)\)/g)];
          for (const match of matches) {
            const name = match[1] || "Вложенный файл";
            const dataUrl = match[2];
            const isImg = dataUrl.startsWith("data:image/");
            list.push({
              id: `${m.id}_${name}`,
              name,
              type: isImg ? "image" : "doc",
              dataUrl,
              chatId,
              chatTitle: title,
              messageId: m.id,
              source: "user_upload",
            });
          }
        }
        // 2. AI Generated Images
        if (Array.isArray(m.images)) {
          for (const img of m.images) {
            list.push({
              id: img.id || `${m.id}_img`,
              name: img.title || "Сгенерированное фото",
              type: "image",
              dataUrl: img.dataUrl,
              chatId,
              chatTitle: title,
              messageId: m.id,
              source: "generated",
              snippet: img.prompt,
            });
          }
        }
        // 3. Artifacts
        if (Array.isArray(m.artifacts)) {
          for (const art of m.artifacts) {
            list.push({
              id: art.id || `${m.id}_art`,
              name: art.title ? (art.title.includes(".") ? art.title : `${art.title}.${art.language || "txt"}`) : "Артефакт.txt",
              type: "artifact",
              dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(art.content || "")}`,
              chatId,
              chatTitle: title,
              messageId: m.id,
              source: "artifact",
              snippet: art.description || art.content?.slice(0, 80),
            });
          }
        }
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, refreshKey]);

  const filteredLibraryFiles = useMemo(() => {
    return allLibraryFiles.filter((item) => {
      const matchesSearch = !fileQuery.trim() || item.name.toLowerCase().includes(fileQuery.trim().toLowerCase()) || item.chatTitle.toLowerCase().includes(fileQuery.trim().toLowerCase());
      const matchesCat = fileCategory === "all" || item.type === fileCategory;
      return matchesSearch && matchesCat;
    });
  }, [allLibraryFiles, fileQuery, fileCategory]);

  const handleDownload = (file: typeof allLibraryFiles[0]) => {
    const link = document.createElement("a");
    link.href = file.dataUrl || file.url || "#";
    link.download = file.name || "attachment";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Скачивание файла «${file.name}» началось`);
  };

  const handleRename = (file: typeof allLibraryFiles[0]) => {
    const newName = prompt("Введите новое имя файла:", file.name);
    if (!newName || !newName.trim() || newName.trim() === file.name) return;
    const clean = newName.trim();

    const store = readGuestStore();
    const msgs = store.messages[file.chatId];
    if (msgs) {
      store.messages[file.chatId] = msgs.map((m) => {
        if (m.id !== file.messageId) return m;
        let content = m.content || "";
        if (content.includes(`![${file.name}]`)) {
          content = content.replaceAll(`![${file.name}]`, `![${clean}]`);
        }
        const images = m.images?.map((img) => (img.title === file.name ? { ...img, title: clean } : img));
        const artifactsArr = m.artifacts?.map((art) => (art.title === file.name ? { ...art, title: clean } : art));
        return { ...m, content, images, artifacts: artifactsArr };
      });
      writeGuestStore(store);
      toast.success(`Файл переименован в «${clean}»`);
      setRefreshKey((k) => k + 1);
    }
  };

  const handleDelete = (file: typeof allLibraryFiles[0]) => {
    if (!confirm(`Удалить файл «${file.name}» из истории диалога?`)) return;
    const store = readGuestStore();
    const msgs = store.messages[file.chatId];
    if (msgs) {
      store.messages[file.chatId] = msgs.map((m) => {
        if (m.id !== file.messageId) return m;
        let content = m.content || "";
        const escaped = file.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        content = content.replace(new RegExp(`!\\[${escaped}\\]\\(data:[^)]+\\)\\n?`, "g"), "").trim();
        const images = m.images?.filter((img) => img.title !== file.name);
        const artifactsArr = m.artifacts?.filter((art) => art.title !== file.name && `${art.title}.${art.language}` !== file.name);
        return { ...m, content, images, artifacts: artifactsArr };
      });
      writeGuestStore(store);
      toast.success(`Файл «${file.name}» удален`);
      setRefreshKey((k) => k + 1);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const p = await onCreateProject(name);
    setCreating(false);
    setNewName("");
    if (p) setOpenProjectId(p.id);
  };

  return (
    <LockedShell
      title={t("Library")}
      description={t("Все приложенные файлы за всё время во всех чатах и рабочие пространства проектов.")}
      icon={Library}
      isAuthed={isAuthed}
      onRequireAuth={onRequireAuth}
    >
      {/* Top Tab Bar: Files vs Projects */}
      <div className="mb-5 flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setLibTab("files")}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
            libTab === "files"
              ? "bg-zinc-900 text-white dark:bg-[var(--brand)] dark:text-white shadow-sm"
              : "glass-button text-muted-foreground hover:text-foreground"
          }`}
        >
          <Paperclip className="h-4 w-4" />
          <span>Все файлы и вложения ({allLibraryFiles.length})</span>
        </button>
        <button
          onClick={() => setLibTab("projects")}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
            libTab === "projects"
              ? "bg-zinc-900 text-white dark:bg-[var(--brand)] dark:text-white shadow-sm"
              : "glass-button text-muted-foreground hover:text-foreground"
          }`}
        >
          <Folder className="h-4 w-4" />
          <span>Проекты ({projects.length})</span>
        </button>
      </div>

      {libTab === "files" ? (
        <div>
          {/* Controls: Search & Category Filter */}
          <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={fileQuery}
                onChange={(e) => setFileQuery(e.target.value)}
                placeholder="Поиск по названию файла или чата…"
                className="w-full rounded-xl border border-border bg-surface/60 pl-9 pr-3 py-2 text-xs outline-none focus:border-brand"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: "all", label: "Все" },
                { id: "image", label: "Картинки" },
                { id: "doc", label: "Документы & Код" },
                { id: "artifact", label: "Артефакты" },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setFileCategory(c.id as any)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                    fileCategory === c.id
                      ? "bg-brand/20 text-brand border border-brand/30"
                      : "glass-button text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Files Grid */}
          {filteredLibraryFiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-8 text-center">
              <Paperclip className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
              <div className="text-sm font-semibold">Файлы не найдены</div>
              <p className="text-xs text-muted-foreground mt-1">
                Прикрепляйте картинки, документы и файлы к сообщениям в чате — они автоматически появятся здесь.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredLibraryFiles.map((file) => (
                <div
                  key={file.id}
                  className="glass-card group flex flex-col justify-between rounded-xl border border-border/80 bg-surface/50 p-3.5 hover:border-brand/40 transition-all shadow-sm"
                >
                  <div>
                    {/* Thumbnail or File Type Header */}
                    {file.type === "image" && file.dataUrl ? (
                      <div className="relative mb-2.5 h-32 w-full overflow-hidden rounded-lg bg-black/40 border border-border/60">
                        <img src={file.dataUrl} alt={file.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <span className="absolute left-2 top-2 rounded bg-black/70 backdrop-blur-md px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">
                          {file.source === "generated" ? "ИИ Арт" : "Фото"}
                        </span>
                      </div>
                    ) : (
                      <div className="mb-2.5 flex h-12 w-full items-center gap-3 rounded-lg bg-surface-elevated p-2.5 border border-border/60">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-brand/15 text-brand font-bold">
                          {file.type === "artifact" ? <Code2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold">{file.name}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">{file.type}</div>
                        </div>
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground leading-tight">{file.name}</div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="truncate max-w-[160px]" title={file.chatTitle}>💬 {file.chatTitle}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions bar */}
                  <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
                    <button
                      onClick={() => onOpenChat(file.chatId)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline cursor-pointer"
                      title="Перейти в чат с этим файлом"
                    >
                      <MessageSquare className="h-3 w-3" />
                      <span>В чат</span>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDownload(file)}
                        className="glass-button p-1.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Скачать файл"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleRename(file)}
                        className="glass-button p-1.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Переименовать"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(file)}
                        className="glass-button p-1.5 rounded-lg text-muted-foreground hover:text-destructive cursor-pointer"
                        title="Удалить"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : !openProject ? (
        <div>
          <div className="glass-card mb-4 flex flex-col gap-2 rounded-xl border border-white/10 bg-surface/60 p-3 sm:flex-row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              placeholder={t("New project name")}
              className="flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <button
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim()}
              className="glass-button-brand inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> {t("Create project")}
            </button>
          </div>
          {projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground">
                <Library className="h-4 w-4" />
              </div>
              <div className="mt-3 text-sm font-medium">{t("No projects yet")}</div>
              <p className="mt-1 text-[12px] text-muted-foreground">{t("Create a project to group chats and artifacts.")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {projects.map((p) => {
                const count = chats.filter((c) => c.project_id === p.id).length;
                const isEditing = editingId === p.id;
                return (
                  <div key={p.id} className="glass-card group flex items-center justify-between rounded-xl border border-border/80 bg-surface/50 p-4 transition-colors hover:border-brand/40">
                    <button
                      onClick={() => setOpenProjectId(p.id)}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editName}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => { void onRenameProject(p.id, editName); setEditingId(null); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { void onRenameProject(p.id, editName); setEditingId(null); }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full bg-transparent text-sm font-medium outline-none border-b border-brand/50"
                        />
                      ) : (
                        <div className="truncate text-sm font-medium">{p.name}</div>
                      )}
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{count} {t("chats")}</div>
                    </button>
                    <div className="ml-3 flex items-center gap-1.5 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(p.id); setEditName(p.name); }}
                        className="glass-button p-1.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                        title={t("Rename")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (confirm(t("Delete this project?"))) void onDeleteProject(p.id); }}
                        className="glass-button p-1.5 rounded-lg text-muted-foreground hover:text-brand cursor-pointer"
                        title={t("Delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          <button
            onClick={() => { setOpenProjectId(null); setAddOpen(false); }}
            className="glass-button mb-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] text-muted-foreground hover:text-foreground cursor-pointer"
          >
            ← {t("All projects")}
          </button>
          <div className="glass-card mb-4 rounded-xl border border-border/80 bg-surface/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("Project")}</div>
                <div className="mt-0.5 truncate text-lg font-semibold">{openProject.name}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onCreateEngineChatInProject(openProject.id)}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-soft)] hover:brightness-110 px-3 py-1.5 text-xs font-semibold text-[var(--brand)] transition-colors shadow-sm cursor-pointer"
                  title="Создать код и Vercel-проект в Engine для этого проекта"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>+ Engine-чат</span>
                </button>
                <button
                  onClick={() => onCreateRegularChatInProject(openProject.id)}
                  className="glass-button flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-foreground hover:border-brand/40 hover:text-brand cursor-pointer"
                  title="Создать обычный диалог в этом проекте"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>+ Чат</span>
                </button>
                <button
                  onClick={() => setAddOpen((v) => !v)}
                  className={`glass-button shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium cursor-pointer ${
                    addOpen ? "border-brand text-brand" : "hover:border-brand/40 hover:text-brand"
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" /> {t("Add chat")}
                </button>
              </div>
            </div>
            {addOpen && (
              <div className="glass-card mt-3 rounded-lg border border-border/60 bg-background/60 p-2.5">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Выберите чат для добавления в проект
                  </span>
                  <span className="text-[11px] text-muted-foreground/80">
                    Доступно: {unassignedChats.length}
                  </span>
                </div>
                {unassignedChats.length === 0 ? (
                  <div className="px-2 py-4 text-center text-[12px] text-muted-foreground">
                    {t("No unassigned chats.")}
                    <div className="mt-2.5 flex items-center justify-center gap-2">
                      <button
                        onClick={() => onCreateEngineChatInProject(openProject.id)}
                        className="text-xs text-[var(--brand)] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Cpu className="h-3 w-3" /> + Создать Engine-чат
                      </button>
                      <span>•</span>
                      <button
                        onClick={() => onCreateRegularChatInProject(openProject.id)}
                        className="text-xs text-brand hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <MessageSquare className="h-3 w-3" /> + Создать обычный чат
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                    {unassignedChats.map((c) => {
                      const isEngine = engineChatIds?.has(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => { void onAssignChat(c.id, openProject.id); }}
                          className="glass-button flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground hover:text-foreground group cursor-pointer"
                        >
                          {isEngine ? (
                            <Cpu className="h-3.5 w-3.5 text-[var(--brand)] shrink-0" />
                          ) : (
                            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span className="truncate flex-1">{c.title || t("New chat")}</span>
                          {isEngine && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand-border)]">
                              engine
                            </span>
                          )}
                          <Plus className="ml-2 h-3.5 w-3.5 text-brand opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mb-2 flex items-center justify-between px-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("Chats")}</div>
            <div className="text-[10px] text-muted-foreground/70">{projectChats.length}</div>
          </div>
          {projectChats.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-[12px] text-muted-foreground">
              {t("No chats in this project yet.")}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {projectChats.map((c) => {
                const isEngine = engineChatIds?.has(c.id);
                return (
                  <div key={c.id} className="glass-card group flex items-center gap-2 rounded-lg border border-border/70 bg-surface/40 px-3 py-2">
                    {isEngine ? (
                      <Cpu className="h-3.5 w-3.5 text-[var(--brand)] shrink-0" />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5 text-brand shrink-0" />
                    )}
                    <button
                      onClick={() => {
                        if (isEngine) {
                          onOpenEngineChat(c.id);
                        } else {
                          onOpenChat(c.id);
                        }
                      }}
                      className="min-w-0 flex-1 truncate text-left text-[13px] flex items-center gap-2 hover:underline cursor-pointer"
                    >
                      <span className="truncate">{c.title || t("New chat")}</span>
                      {isEngine && (
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand-border)]">
                          engine
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => { void onAssignChat(c.id, null); }}
                      className="glass-button opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-brand cursor-pointer"
                      title={t("Remove from project")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 mb-2 flex items-center justify-between px-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("Artifacts")}</div>
            <div className="text-[10px] text-muted-foreground/70">{artifacts.length}</div>
          </div>
          {artifacts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-[12px] text-muted-foreground">
              {t("Artifacts created in this project's chats will appear here.")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {artifacts.map((a) => (
                <button
                  key={a.id + a.chatId}
                  onClick={() => onOpenChat(a.chatId)}
                  className="glass-card group flex items-center gap-3 rounded-lg border border-border/70 bg-surface/40 px-3 py-2.5 text-left transition-colors hover:border-brand/40"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <FileCode className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{a.title}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{a.language}</div>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-brand" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </LockedShell>
  );
}

/* ---------- Saved ---------- */
function SavedView({
  isAuthed,
  onRequireAuth,
  chats,
  onOpenChat,
  onUnsave,
}: {
  isAuthed: boolean;
  onRequireAuth: () => void;
  chats: ChatRow[];
  onOpenChat: (id: string) => void;
  onUnsave: (id: string) => void;
}) {
  const t = useT();
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return t("just now");
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
    return d.toLocaleDateString();
  };
  return (
    <LockedShell
      title={t("Saved")}
      description={t("Bookmarked chats — one click away. Save any chat from the sidebar bookmark icon.")}
      icon={Bookmark}
      isAuthed={isAuthed}
      onRequireAuth={onRequireAuth}
    >
      {chats.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground">
            <Bookmark className="h-4 w-4" />
          </div>
          <div className="mt-3 text-sm font-medium">{t("Nothing saved yet")}</div>
          <p className="mt-1 text-[12px] text-muted-foreground">{t("Hover a chat in the sidebar and tap the bookmark to save it here.")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {chats.map((c) => (
            <div key={c.id} className="glass-card group flex items-center gap-3 rounded-xl border border-border/80 bg-surface/40 px-4 py-3 transition-colors hover:border-brand/40">
              <Bookmark className="h-4 w-4 text-brand shrink-0 fill-current" />
              <button onClick={() => onOpenChat(c.id)} className="min-w-0 flex-1 truncate text-left text-sm">
                {c.title || t("New chat")}
              </button>
              <span className="shrink-0 text-[11px] text-muted-foreground">{fmt(c.updated_at)}</span>
              <button
                onClick={() => onUnsave(c.id)}
                className="glass-button shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-brand opacity-0 group-hover:opacity-100 transition-opacity"
                title={t("Remove from Saved")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </LockedShell>
  );
}

function DeployVercelModal({
  onClose,
  files,
  onDownloadZip,
  isZipping,
}: {
  onClose: () => void;
  files: Record<string, string>;
  onDownloadZip: () => void;
  isZipping: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const vercelJsonCode = files["vercel.json"] || `{\n  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]\n}`;

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(vercelJsonCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-3 sm:p-5 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-xl max-h-[82vh] flex flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416] p-4 sm:p-6 shadow-2xl text-zinc-900 dark:text-white my-auto">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 sm:right-4 sm:top-4 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/10 pb-3 shrink-0 pr-8">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black dark:bg-[var(--brand)] text-white shadow-md">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold tracking-tight">{t("Deploy to Vercel")}</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{t("Vercel Deployment Instructions")}</p>
          </div>
        </div>

        {/* Modal Instructions Content (Scrollable) */}
        <div className="mt-3 space-y-4 text-xs leading-relaxed flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">
          <div className="space-y-2">
            <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
              Способ 1: Публикация через Vercel CLI (Рекомендуемый)
            </div>
            <ol className="list-decimal pl-4 space-y-1.5 text-zinc-600 dark:text-zinc-300">
              <li>Нажмите кнопку ниже, чтобы скачать архив с исходным кодом (ZIP).</li>
              <li>Распакуйте архив на вашем компьютере и откройте терминал в этой папке.</li>
              <li>
                Запустите команду деплоя:
                <code className="ml-1 rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-[var(--brand)]">
                  npx vercel --prod
                </code>
              </li>
            </ol>
          </div>

          <div className="space-y-2 border-t border-zinc-200 dark:border-white/10 pt-3">
            <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
              Способ 2: Публикация через GitHub + Vercel
            </div>
            <ol className="list-decimal pl-4 space-y-1.5 text-zinc-600 dark:text-zinc-300">
              <li>Загрузите исходные файлы проекта в новый репозиторий GitHub.</li>
              <li>Перейдите на <a href="https://vercel.com/new" target="_blank" rel="noreferrer" className="text-[var(--brand)] underline font-medium">vercel.com/new</a> и импортируйте ваш репозиторий.</li>
              <li>Vercel автоматически соберет и опубликует ваш проект с постоянным URL!</li>
            </ol>
          </div>

          <div className="space-y-2 border-t border-zinc-200 dark:border-white/10 pt-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{t("Vercel Configuration")} (vercel.json)</span>
              <button
                onClick={copyConfig}
                className="flex items-center gap-1 text-[11px] font-medium text-[var(--brand)] hover:underline cursor-pointer"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? "Скопировано" : "Скопировать vercel.json"}</span>
              </button>
            </div>
            <pre className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-zinc-900 p-3 font-mono text-[11px] text-zinc-800 dark:text-zinc-200 overflow-x-auto">
              {vercelJsonCode}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 sm:gap-3 border-t border-zinc-200 dark:border-white/10 pt-3 shrink-0">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 dark:border-white/10 px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            {t("Cancel")}
          </button>
          <button
            onClick={onDownloadZip}
            disabled={isZipping}
            className="flex items-center gap-2 rounded-xl bg-black dark:bg-[var(--brand)] hover:bg-zinc-800 dark:hover:brightness-110 px-4 py-2 text-xs font-bold text-white transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            {isZipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span>Скачать ZIP для Vercel</span>
          </button>
        </div>
      </div>
    </motion.div>,
    document.body
  );
}

const INITIAL_ENGINE_FILES: Record<string, string> = {
  "src/App.tsx": `import React from 'react';

export default function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', background: '#09090b', color: '#f4f4f5', minHeight: '100vh' }}>
      <h1 style={{ color: '#ef4444', fontSize: '2.25rem', fontWeight: 800, margin: 0 }}>IGseek Engine Studio ✦</h1>
      <p style={{ color: '#a1a1aa', marginTop: '0.5rem' }}>Готовое веб-приложение для публикации на Vercel</p>
      
      <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#18181b', borderRadius: '1rem', border: '1px solid #27272a' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#ffffff' }}>🚀 App Studio</h3>
        <p style={{ color: '#71717a', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          Опишите задачу в чате или редактируйте файлы во вкладке «Файлы», а затем нажмите «Деплой»!
        </p>
      </div>
    </div>
  );
}`,
  "index.html": `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IGseek Vercel App</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body style="margin:0;padding:0;background:#09090b;color:#fff;">
  <div id="root"></div>
</body>
</html>`,
  "styles.css": `body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background-color: #09090b;
  color: #ffffff;
}`,
  "package.json": `{
  "name": "igseek-vercel-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}`,
  "vercel.json": `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}`,
  "README.md": `# IGseek Engine Vercel App

Проект сгенерирован в IGseek Code Engine.

## Инструкция по деплою на Vercel

1. Скачайте .zip архив проекта.
2. Откройте терминал в папке проекта и запустите:
   \`\`\`bash
   npm i -g vercel
   vercel --prod
   \`\`\`
3. Готово! Приложение опубликовано в сети.`
};

const INITIAL_ENGINE_MESSAGES: Array<{ id: string; role: "user" | "assistant"; content: string; filesUpdated?: string[] }> = [
  {
    id: "init",
    role: "assistant",
    content: "Привет! Я IGseek Code Engine. Опишите проект — я создам готовую Vercel-сборку и размещу исходники во вкладке **Файлы**.",
  },
];

/* ---------- Engine (public, no auth) ---------- */
function EngineView({
  activeChatId,
  onActiveChatChange,
  onGeneratingChange,
  onSaveEngineChat,
  projects = [],
  chats = [],
  onCreateProject,
  onAssignChat,
  onNavigateToLibrary,
}: {
  activeChatId?: string | null;
  onActiveChatChange?: (id: string | null) => void;
  onGeneratingChange?: (id: string, isGenerating: boolean) => void;
  onSaveEngineChat?: (
    id: string,
    title: string,
    userText: string,
    asstText: string,
    currentFiles: Record<string, string>,
    currentMessages: any[],
    targetProjectId?: string | null
  ) => void;
  projects?: ProjectRow[];
  chats?: ChatRow[];
  onCreateProject?: (name: string) => Promise<ProjectRow | null>;
  onAssignChat?: (chatId: string, projectId: string | null) => Promise<void>;
  onNavigateToLibrary?: () => void;
}) {
  const t = useT();
  const [hasStarted, setHasStarted] = useState(false);
  const [engineTab, setEngineTab] = useState<"chat" | "preview" | "files">("chat");
  const [activeFile, setActiveFile] = useState("src/App.tsx");
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [newFileName, setNewFileName] = useState("");
  const [isAddingFile, setIsAddingFile] = useState(false);

  // Project selector state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeEngineJobsRef = useRef<Map<string, AbortController>>(new Map());
  const activeChatIdRef = useRef<string | null>(activeChatId ?? null);
  useEffect(() => {
    activeChatIdRef.current = activeChatId ?? null;
  }, [activeChatId]);

  const stopGenerating = () => {
    if (activeChatId && activeEngineJobsRef.current.has(activeChatId)) {
      activeEngineJobsRef.current.get(activeChatId)?.abort();
      activeEngineJobsRef.current.delete(activeChatId);
      onGeneratingChange?.(activeChatId, false);
    } else {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  };

  const handleStartNewChat = () => {
    // Не прерываем текущую генерацию — она продолжит выполняться в фоне и сохранится в проекте!
    setHasStarted(false);
    setPrompt("");
    setFiles(INITIAL_ENGINE_FILES);
    setChatMessages(INITIAL_ENGINE_MESSAGES);
    setActiveFile("src/App.tsx");
    setEngineTab("chat");
    setSelectedProjectId(null);
    setIsGenerating(false);
    onActiveChatChange?.(null);
  };

  // Sync selectedProjectId when activeChatId changes
  useEffect(() => {
    if (!activeChatId) {
      setSelectedProjectId(null);
      return;
    }
    const currentChatRow = chats.find((c) => c.id === activeChatId);
    if (currentChatRow) {
      setSelectedProjectId(currentChatRow.project_id);
    }
  }, [activeChatId, chats]);

  const handleSelectProject = async (projectId: string | null) => {
    setSelectedProjectId(projectId);
    setProjectMenuOpen(false);
    if (activeChatId) {
      await onAssignChat?.(activeChatId, projectId);
    }
  };

  const handleCreateProjectInline = async () => {
    const trimmed = newProjectName.trim();
    if (!trimmed || isCreatingProject) return;
    setIsCreatingProject(true);
    try {
      const created = await onCreateProject?.(trimmed);
      if (created) {
        setSelectedProjectId(created.id);
        if (activeChatId) {
          await onAssignChat?.(activeChatId, created.id);
        }
      }
      setNewProjectName("");
      setProjectMenuOpen(false);
    } finally {
      setIsCreatingProject(false);
    }
  };

  // Chat messages history inside Engine Studio
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string; filesUpdated?: string[] }>>(INITIAL_ENGINE_MESSAGES);

  // Project file system store
  const [files, setFiles] = useState<Record<string, string>>(INITIAL_ENGINE_FILES);

  // Load project when activeChatId changes
  useEffect(() => {
    if (!activeChatId) {
      setHasStarted(false);
      setFiles(INITIAL_ENGINE_FILES);
      setChatMessages(INITIAL_ENGINE_MESSAGES);
      setActiveFile("src/App.tsx");
      setIsGenerating(false);
      return;
    }
    // Если этот проект сейчас генерируется в фоне — восстанавливаем состояние генерации!
    if (activeEngineJobsRef.current.has(activeChatId)) {
      setIsGenerating(true);
      abortControllerRef.current = activeEngineJobsRef.current.get(activeChatId) ?? null;
    } else {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
    try {
      const raw = window.localStorage.getItem(`igseek:engine_proj_${activeChatId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.files && typeof parsed.files === "object") {
          setFiles(parsed.files);
        }
        if (Array.isArray(parsed.chatMessages) && parsed.chatMessages.length > 0) {
          setChatMessages(parsed.chatMessages);
          setHasStarted(true);
        }
      }
    } catch {}
  }, [activeChatId]);

  useEffect(() => {
    if (engineTab === "chat" && hasStarted) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, engineTab, hasStarted, isGenerating]);

  const downloadProjectZip = async () => {
    setIsZipping(true);
    try {
      const JSZipModule = (await import("jszip")).default;
      const zip = new JSZipModule();
      for (const [path, content] of Object.entries(files)) {
        zip.file(path, content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "igseek-vercel-project.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Ошибка экспорта ZIP");
    } finally {
      setIsZipping(false);
    }
  };

  const handleAddNewFile = () => {
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    if (files[trimmed]) {
      alert("Файл с таким именем уже существует!");
      return;
    }
    const updated = { ...files, [trimmed]: "// Новый файл\n" };
    setFiles(updated);
    setActiveFile(trimmed);
    setNewFileName("");
    setIsAddingFile(false);
    if (activeChatId) {
      try {
        const raw = window.localStorage.getItem(`igseek:engine_proj_${activeChatId}`);
        const parsed = raw ? JSON.parse(raw) : {};
        window.localStorage.setItem(`igseek:engine_proj_${activeChatId}`, JSON.stringify({ ...parsed, files: updated }));
      } catch {}
    }
  };

  const handleDeleteFile = (fileName: string) => {
    if (Object.keys(files).length <= 1) {
      alert("Нельзя удалить единственный файл проекта!");
      return;
    }
    if (confirm(`Удалить файл ${fileName}?`)) {
      const next = { ...files };
      delete next[fileName];
      setFiles(next);
      const remaining = Object.keys(next);
      if (remaining.length) setActiveFile(remaining[0]);
      if (activeChatId) {
        try {
          const raw = window.localStorage.getItem(`igseek:engine_proj_${activeChatId}`);
          const parsed = raw ? JSON.parse(raw) : {};
          window.localStorage.setItem(`igseek:engine_proj_${activeChatId}`, JSON.stringify({ ...parsed, files: next }));
        } catch {}
      }
    }
  };

  const generateWithAI = async (customPrompt?: string) => {
    const targetPrompt = (customPrompt ?? prompt).trim();
    if (!targetPrompt || isGenerating) return;

    setHasStarted(true);
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMsgId = `user-${Date.now()}`;
    const newChatMsgs = [...chatMessages, { id: userMsgId, role: "user" as const, content: targetPrompt }];
    setChatMessages(newChatMsgs);
    setPrompt("");

    const currentChatId = activeChatId || `engine-${Date.now()}`;
    if (!activeChatId) {
      onActiveChatChange?.(currentChatId);
      activeChatIdRef.current = currentChatId;
    }
    activeEngineJobsRef.current.set(currentChatId, controller);
    onGeneratingChange?.(currentChatId, true);

    try {
      const systemInstruction = `Ты — экспертный AI Code Engine в IGseek. Твоя задача — сгенерировать готовое React-приложение для Vercel.
КРИТИЧЕСКИ ВАЖНО:
1. В тексте ответа не пиши гигантские файлы кода напрямую!
2. Вся коммуникация в чате должна состоять из краткого отчета, объяснения, что было сделано или исправлено.
3. Код каждого файла помещай в спец-блоки с именем файла в заголовке, например:
\`\`\`file:src/App.tsx
import React from 'react';
export default function App() { ... }
\`\`\`
или
\`\`\`file:styles.css
/* CSS code */
\`\`\`
или
\`\`\`file:vercel.json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
\`\`\`
Наш Engine Studio автоматически распарсит эти блоки и запишет файлы напрямую в файловую систему проекта.`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemInstruction },
            ...newChatMsgs.map((m) => ({ role: m.role, content: m.content })),
          ],
          reasoning,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        toast.error("Ошибка запроса к AI Engine: HTTP " + res.status);
        return;
      }
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("text/event-stream")) {
        toast.error("Сервер не вернул поток событий. Проверьте деплой /api/chat.");
        return;
      }

      const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data:")) {
              try { fullText += JSON.parse(line.slice(5)); } catch {}
            }
          }
        }

        // Parse files from response
        const fileRegex = /```file:(.+?)\n([\s\S]*?)```/g;
        const updatedFilesList: string[] = [];
        const newFilesMap: Record<string, string> = {};
        let match;

        while ((match = fileRegex.exec(fullText)) !== null) {
          const filePath = match[1].trim();
          const fileContent = match[2].trim();
          if (filePath && fileContent) {
            newFilesMap[filePath] = fileContent;
            updatedFilesList.push(filePath);
          }
        }

        // Also check if simple React component was output
        if (!updatedFilesList.length) {
          const tsxMatch = /```(?:tsx|jsx|html)?\s*([\s\S]*?)```/.exec(fullText);
          if (tsxMatch && tsxMatch[1]) {
            newFilesMap["src/App.tsx"] = tsxMatch[1].trim();
            updatedFilesList.push("src/App.tsx");
          }
        }

        const nextFiles = { ...files, ...newFilesMap };

        // Clean explanatory text for chat display (removing the file blocks)
        let cleanText = fullText.replace(/```file:[\s\S]*?```/g, "").trim();
        if (!cleanText) {
          cleanText = "✅ Код проекта успешно сгенерирован и записан в файлы! Все исходники доступны во вкладке **Файлы**.";
        }

        const nextChatMsgs = [
          ...newChatMsgs,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant" as const,
            content: cleanText,
            filesUpdated: updatedFilesList.length ? updatedFilesList : undefined,
          },
        ];

        const projectTitle = targetPrompt.length > 35 ? targetPrompt.slice(0, 35) + "…" : targetPrompt;
        try {
          window.localStorage.setItem(
            `igseek:engine_proj_${currentChatId}`,
            JSON.stringify({ files: nextFiles, chatMessages: nextChatMsgs, title: projectTitle })
          );
        } catch {}

        onSaveEngineChat?.(
          currentChatId,
          projectTitle,
          targetPrompt,
          cleanText,
          nextFiles,
          nextChatMsgs,
          selectedProjectId
        );

        if (activeChatIdRef.current === currentChatId) {
          setFiles(nextFiles);
          setChatMessages(nextChatMsgs);
        }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        if (activeChatIdRef.current === currentChatId) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: `stop-${Date.now()}`,
              role: "assistant",
              content: "⏹ Создание остановлено пользователем.",
            },
          ]);
        }
      } else {
        if (activeChatIdRef.current === currentChatId) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              content: "Произошла ошибка при генерации. Попробуйте еще раз.",
            },
          ]);
        }
      }
    } finally {
      activeEngineJobsRef.current.delete(currentChatId);
      onGeneratingChange?.(currentChatId, false);
      if (activeChatIdRef.current === currentChatId) {
        abortControllerRef.current = null;
        setIsGenerating(false);
      }
    }
  };

  const previewHtml = useMemo(() => {
    const appCode = files["src/App.tsx"] || "";
    const css = files["styles.css"] || "";
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      background: #09090b;
      color: #fff;
    }
    ${css}
  </style>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    try {
      ${appCode.replace(/import\s+.*?from\s+['"].*?['"];?/g, "")}
      if (typeof App !== 'undefined') {
        ReactDOM.createRoot(document.getElementById('root')).render(<App />);
      } else {
        document.getElementById('root').innerHTML = ${JSON.stringify(appCode)};
      }
    } catch (e) {
      document.getElementById('root').innerHTML = '<div style="padding:1rem;color:#ef4444;font-family:monospace;">Render Error: ' + e.message + '</div>';
    }
  </script>
</body>
</html>`;
  }, [files]);

  const renderProjectSelector = () => {
    const currentProj = projects.find((p) => p.id === selectedProjectId);
    return (
      <div className="relative inline-block text-left">
        <button
          type="button"
          onClick={() => setProjectMenuOpen((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
            currentProj
              ? "border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)] shadow-sm"
              : "border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          }`}
        >
          <Folder className="h-3.5 w-3.5 text-[var(--brand)] shrink-0" />
          <span className="max-w-[140px] truncate">
            {currentProj ? currentProj.name : "В проект (Library)"}
          </span>
          <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
        </button>

        {projectMenuOpen && (
          <div className="absolute left-0 mt-2 w-64 rounded-2xl border border-zinc-200 dark:border-white/15 bg-white dark:bg-[#18181b] p-2.5 shadow-2xl z-50 text-zinc-900 dark:text-white backdrop-blur-xl">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between">
              <span>Проекты (Library)</span>
              {onNavigateToLibrary && (
                <button
                  type="button"
                  onClick={() => { setProjectMenuOpen(false); onNavigateToLibrary(); }}
                  className="text-[var(--brand)] hover:underline cursor-pointer lowercase"
                >
                  все проекты →
                </button>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto py-1 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => void handleSelectProject(null)}
                className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left cursor-pointer transition-colors ${
                  !selectedProjectId
                    ? "bg-zinc-100 dark:bg-white/10 font-semibold text-zinc-900 dark:text-white"
                    : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5"
                }`}
              >
                <span>Без проекта</span>
                {!selectedProjectId && <Check className="h-3 w-3 text-[var(--brand)]" />}
              </button>

              {projects.map((p) => {
                const isSelected = p.id === selectedProjectId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void handleSelectProject(p.id)}
                    className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-left cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[var(--brand-soft)] font-semibold text-[var(--brand)]"
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5"
                    }`}
                  >
                    <span className="truncate flex-1 pr-2">{p.name}</span>
                    {isSelected && <Check className="h-3 w-3 text-[var(--brand)] shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 mt-1 border-t border-zinc-100 dark:border-white/5">
              <div className="flex items-center gap-1.5">
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCreateProjectInline();
                    }
                  }}
                  placeholder="Новый проект…"
                  className="flex-1 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1 text-xs outline-none focus:border-[var(--brand)]"
                />
                <button
                  type="button"
                  onClick={() => void handleCreateProjectInline()}
                  disabled={!newProjectName.trim() || isCreatingProject}
                  className="rounded-xl bg-black dark:bg-[var(--brand)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40 cursor-pointer"
                >
                  {isCreatingProject ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto px-2">
      {/* Vercel Deploy Modal */}
      <AnimatePresence>
        {deployModalOpen && (
          <DeployVercelModal
            onClose={() => setDeployModalOpen(false)}
            files={files}
            onDownloadZip={() => void downloadProjectZip()}
            isZipping={isZipping}
          />
        )}
      </AnimatePresence>

      {/* ================= VIEW 1: WELCOMING START SCREEN (BEFORE CREATION STARTS) ================= */}
      {!hasStarted ? (
        <div className="space-y-6 max-w-4xl mx-auto px-2 pt-4">
          {/* Header */}
          <div className="flex flex-col items-center text-center max-w-xl mx-auto space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 dark:border-white/10 bg-zinc-100 dark:bg-white/5 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-800 dark:text-zinc-200">
              <Sparkles className="h-3.5 w-3.5 text-black dark:text-[var(--brand)]" />
              IGseek Engine Studio
            </span>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">
              AI Code <span className="text-black dark:text-[var(--brand)]">Engine</span>
            </h1>
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              {t("Build interactive apps, components & dashboards directly in your browser.")}
            </p>
            <div className="pt-1 flex items-center justify-center">
              {renderProjectSelector()}
            </div>
          </div>

          {/* Centered Welcoming Composer Card */}
          <div className="mx-auto w-full max-w-2xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void generateWithAI();
              }}
              className="relative flex flex-col gap-3 rounded-[24px] border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416]/95 p-4 shadow-xl backdrop-blur-xl transition-all focus-within:border-zinc-400 dark:focus-within:border-white/20"
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void generateWithAI();
                  }
                }}
                rows={2}
                placeholder={t("Build something with IGseek…")}
                className="w-full resize-none bg-transparent px-1 py-1 text-[15px] text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
              />

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) setPrompt((prev) => `${prev}\n[Файл: ${file.name}]`);
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
                    onClick={() => setIsRecording((v) => !v)}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors cursor-pointer ${
                      isRecording
                        ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                        : "border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                    title={t("Voice")}
                  >
                    <Mic className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setReasoning((v) => !v)}
                    className={`flex h-9 px-4 items-center gap-2 rounded-full border text-xs font-medium transition-all cursor-pointer ${
                      reasoning
                        ? "border-zinc-900 dark:border-[var(--brand-border)] bg-zinc-900 dark:bg-[var(--brand-soft)] text-white dark:text-[var(--brand)] shadow-sm"
                        : "border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    <Brain className="h-4 w-4 text-black dark:text-[var(--brand)]" />
                    <span>{t("Thinking")}</span>
                  </button>
                </div>

                {isGenerating ? (
                  <button
                    type="button"
                    onClick={stopGenerating}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black dark:bg-[var(--brand)] hover:bg-zinc-800 dark:hover:brightness-110 text-white transition-all shadow-md active:scale-95 cursor-pointer"
                    title={t("Stop")}
                  >
                    <Square className="h-3 w-3" fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!prompt.trim()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black dark:bg-[var(--brand)] hover:bg-zinc-800 dark:hover:brightness-110 text-white transition-all shadow-md active:scale-95 disabled:opacity-30 cursor-pointer"
                    title={t("Send")}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>

            {/* Prompt Chips */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-2.5">
              {[
                {
                  title: t("SaaS Landing"),
                  prompt: "Create a modern dark-mode SaaS landing page with animated hero, features grid, pricing tier cards and CTA",
                  icon: Cpu,
                },
                {
                  title: t("E-commerce Dashboard"),
                  prompt: "Build an e-commerce dashboard with sales metric cards, revenue charts, recent orders table and status tags",
                  icon: BarChart3,
                },
                {
                  title: t("Mobile App UI"),
                  prompt: "Design a mobile fitness activity tracker UI with daily step goals progress ring, workout cards, and activity log",
                  icon: Terminal,
                },
                {
                  title: t("REST API Service"),
                  prompt: "Create an interactive REST API tester component with HTTP method dropdown and formatted JSON viewer",
                  icon: Code2,
                },
              ].map((item, idx) => {
                const IconComp = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => void generateWithAI(item.prompt)}
                    className="flex items-center gap-2.5 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white hover:bg-zinc-50 dark:bg-[#141416]/90 dark:hover:bg-[#1c1c20] p-3 text-left shadow-sm transition-all hover:scale-[1.01] active:scale-98 cursor-pointer"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/5 text-black dark:text-[var(--brand)]">
                      <IconComp className="h-4 w-4" />
                    </span>
                    <span className="text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ================= VIEW 2: ACTIVE STUDIO WORKSPACE (SHOWN AFTER CREATION STARTS) ================= */
        <div className="flex flex-col h-[calc(100vh-100px)] md:h-[calc(100vh-110px)] max-w-5xl mx-auto w-full space-y-3 overflow-hidden">
          {/* Top Navigation Bar with 3 Tabs + Deploy Button */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-white/10 pb-3">
            {/* Left New Chat Button & Project Selector */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartNewChat}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer shadow-sm"
                title={t("New chat")}
              >
                <Plus className="h-3.5 w-3.5 text-black dark:text-[var(--brand)]" />
                <span>{t("New chat")}</span>
              </button>
              {renderProjectSelector()}
            </div>

            {/* Center 3 Top Tabs: Chat / Preview / Files */}
            <div className="flex items-center rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 p-1 text-xs font-medium">
              <button
                onClick={() => setEngineTab("chat")}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 transition-all cursor-pointer ${
                  engineTab === "chat"
                    ? "bg-black dark:bg-white text-white dark:text-black font-semibold shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>{t("Chat")}</span>
              </button>

              <button
                onClick={() => setEngineTab("preview")}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 transition-all cursor-pointer ${
                  engineTab === "preview"
                    ? "bg-black dark:bg-white text-white dark:text-black font-semibold shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <Play className="h-3.5 w-3.5" />
                <span>{t("Preview")}</span>
              </button>

              <button
                onClick={() => setEngineTab("files")}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 transition-all cursor-pointer ${
                  engineTab === "files"
                    ? "bg-black dark:bg-white text-white dark:text-black font-semibold shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <Folder className="h-3.5 w-3.5" />
                <span>{t("Files")} ({Object.keys(files).length})</span>
              </button>
            </div>

            {/* Right Deploy Button */}
            <button
              onClick={() => setDeployModalOpen(true)}
              className="flex items-center gap-1.5 rounded-2xl bg-black dark:bg-[var(--brand)] hover:bg-zinc-800 dark:hover:brightness-110 px-4 py-2 text-xs font-bold text-white transition-all shadow-md shadow-black/10 dark:shadow-[var(--brand-shadow)] active:scale-95 cursor-pointer"
            >
              <Rocket className="h-4 w-4" />
              <span>{t("Deploy")}</span>
            </button>
          </div>

          {/* ================= TAB 1: CHAT ================= */}
          {engineTab === "chat" && (
            <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
              {/* Chat Messages (ONLY THIS AREA SCROLLS) */}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-smooth flex flex-col gap-3 p-2 rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-zinc-50/50 dark:bg-zinc-900/40 shadow-inner">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-black text-white dark:bg-zinc-800 dark:text-white"
                          : "bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>

                      {/* Summary of files updated */}
                      {msg.filesUpdated && msg.filesUpdated.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-zinc-200 dark:border-white/10 flex flex-col gap-2">
                          <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5" />
                            <span>Обновлены файлы: {msg.filesUpdated.join(", ")}</span>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => setEngineTab("preview")}
                              className="flex items-center gap-1 rounded-lg bg-zinc-200 dark:bg-white/10 hover:bg-zinc-300 dark:hover:bg-white/20 px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer"
                            >
                              <Play className="h-3 w-3" />
                              <span>{t("Launch Preview")}</span>
                            </button>
                            <button
                              onClick={() => setEngineTab("files")}
                              className="flex items-center gap-1 rounded-lg bg-zinc-200 dark:bg-white/10 hover:bg-zinc-300 dark:hover:bg-white/20 px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer"
                            >
                              <Folder className="h-3 w-3" />
                              <span>{t("Files")}</span>
                            </button>
                            <button
                              onClick={() => setDeployModalOpen(true)}
                              className="flex items-center gap-1 rounded-lg bg-black dark:bg-[var(--brand)] text-white px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer"
                            >
                              <Rocket className="h-3 w-3" />
                              <span>{t("Deploy")}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isGenerating && (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 p-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--brand)]" />
                    <span>DeepSeek генерирует Vercel-проект…</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Bar (FIXED AT BOTTOM) */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void generateWithAI();
                }}
                className="shrink-0 relative flex items-center gap-2 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141416]/95 p-2 shadow-lg backdrop-blur-xl"
              >
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Опишите доработки или изменения в проекте…"
                  className="flex-1 bg-transparent px-3 py-1.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none"
                />
                {isGenerating ? (
                  <button
                    type="button"
                    onClick={stopGenerating}
                    title={t("Stop")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black dark:bg-[var(--brand)] hover:bg-zinc-800 dark:hover:brightness-110 text-white transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Square className="h-3 w-3" fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!prompt.trim()}
                    title={t("Send")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black dark:bg-[var(--brand)] hover:bg-zinc-800 dark:hover:brightness-110 text-white disabled:opacity-30 active:scale-95 cursor-pointer"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                )}
              </form>
            </div>
          )}

          {/* ================= TAB 2: PREVIEW ================= */}
          {engineTab === "preview" && (
            <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-xl overflow-hidden">
              <div className="shrink-0 flex flex-wrap items-center justify-between border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900/80 px-4 py-2.5 gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Live Preview (Vercel Build)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 p-0.5 text-xs">
                    <button
                      onClick={() => setPreviewDevice("desktop")}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 transition-colors cursor-pointer ${
                        previewDevice === "desktop" ? "bg-black dark:bg-white text-white dark:text-black font-semibold" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      <span>Desktop</span>
                    </button>
                    <button
                      onClick={() => setPreviewDevice("mobile")}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 transition-colors cursor-pointer ${
                        previewDevice === "mobile" ? "bg-black dark:bg-white text-white dark:text-black font-semibold" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      <span>Mobile</span>
                    </button>
                  </div>

                  <button
                    onClick={() => setDeployModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-black dark:bg-[var(--brand)] text-white px-3 py-1.5 text-xs font-semibold hover:bg-zinc-800 dark:hover:brightness-110 transition-colors cursor-pointer"
                  >
                    <Rocket className="h-3.5 w-3.5" />
                    <span>{t("Deploy")}</span>
                  </button>
                </div>
              </div>

              {/* Scrollable preview body container */}
              <div className="flex-1 min-h-0 flex items-start justify-center bg-zinc-900 p-2 md:p-4 overflow-y-auto">
                <div
                  className={`transition-all duration-300 ${
                    previewDevice === "mobile"
                      ? "w-[375px] max-w-full h-[667px] max-h-full rounded-3xl border-4 border-zinc-800 shadow-2xl overflow-hidden shrink-0 my-auto"
                      : "w-full h-full min-h-[400px] rounded-xl border border-zinc-800 shadow-xl overflow-hidden"
                  }`}
                >
                  <iframe
                    title="Engine Live Preview"
                    srcDoc={previewHtml}
                    className="h-full w-full bg-zinc-950 border-0"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 3: FILES ================= */}
          {engineTab === "files" && (
            <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-xl overflow-y-auto md:overflow-hidden">
              <div className="md:col-span-1 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900/50 p-3 flex flex-col gap-2 shrink-0 md:h-full md:overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-white/10">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <Folder className="h-3.5 w-3.5 text-[var(--brand)]" />
                    <span>Файлы проекта</span>
                  </span>
                  <button
                    onClick={() => setIsAddingFile((v) => !v)}
                    className="p-1 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
                    title={t("New File")}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {isAddingFile && (
                  <div className="flex items-center gap-1.5 p-1">
                    <input
                      autoFocus
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      placeholder="src/Header.tsx"
                      className="w-full rounded-lg border border-zinc-300 dark:border-white/20 bg-white dark:bg-zinc-800 px-2 py-1 text-xs outline-none"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddNewFile(); }}
                    />
                    <button
                      onClick={handleAddNewFile}
                      className="rounded-lg bg-black dark:bg-[var(--brand)] px-2 py-1 text-xs text-white cursor-pointer"
                    >
                      ОК
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-1 overflow-y-auto max-h-40 md:max-h-none md:flex-1">
                  {Object.keys(files).map((filename) => {
                    const isActive = activeFile === filename;
                    return (
                      <div
                        key={filename}
                        onClick={() => setActiveFile(filename)}
                        className={`flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors ${
                          isActive
                            ? "bg-black dark:bg-[var(--brand-soft)] text-white dark:text-[var(--brand)] font-semibold"
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <FileCode className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          <span className="truncate">{filename}</span>
                        </div>

                        {isActive && Object.keys(files).length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteFile(filename); }}
                            className="p-1 text-zinc-400 hover:text-[var(--brand)] transition-colors"
                            title={t("Delete File")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-zinc-200 dark:border-white/10 shrink-0">
                  <button
                    onClick={() => void downloadProjectZip()}
                    disabled={isZipping}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
                  >
                    {isZipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    <span>Экспорт .zip Vercel</span>
                  </button>
                </div>
              </div>

              <div className="md:col-span-3 flex flex-col bg-zinc-950 text-zinc-100 flex-1 min-h-[360px] md:min-h-0 md:h-full">
                <div className="shrink-0 flex items-center justify-between border-b border-zinc-800 px-4 py-2.5 bg-zinc-900/60 text-xs font-mono">
                  <span className="text-zinc-300 font-semibold flex items-center gap-2">
                    <FileCode className="h-3.5 w-3.5 text-[var(--brand)]" />
                    <span>{activeFile}</span>
                  </span>
                  <span className="text-zinc-500 text-[11px]">
                    {files[activeFile]?.length || 0} символов
                  </span>
                </div>

                <div className="relative flex-1 p-2 min-h-0 overflow-hidden flex flex-col">
                  <textarea
                    value={files[activeFile] || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFiles((prev) => {
                        const updated = { ...prev, [activeFile]: val };
                        if (activeChatId) {
                          try {
                            const raw = window.localStorage.getItem(`igseek:engine_proj_${activeChatId}`);
                            const parsed = raw ? JSON.parse(raw) : {};
                            window.localStorage.setItem(
                              `igseek:engine_proj_${activeChatId}`,
                              JSON.stringify({ ...parsed, files: updated })
                            );
                          } catch {}
                        }
                        return updated;
                      });
                    }}
                    className="w-full flex-1 min-h-[300px] resize-none bg-transparent p-3 font-mono text-xs sm:text-sm leading-relaxed text-zinc-200 outline-none overflow-y-auto"
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocsView() {
  const t = useT();
  const docs = [
    {
      title: t("Privacy Policy"),
      desc: t("How we handle your data."),
      href: "https://telegra.ph/Politika-konfidencialnosti-06-21-31",
    },
    {
      title: t("User Agreement"),
      desc: t("General terms of use."),
      href: "https://telegra.ph/Polzovatelskoe-soglashenie-04-01-19",
    },
    {
      title: t("Project & AI Agreement"),
      desc: t("Rules that cover the project and its AI."),
      href: "https://telegra.ph/Polzovatelskoe-soglashenie-proekta-i-nejroseti-06-24",
    },
  ];
  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10">
          <FileText className="h-6 w-6 text-brand" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
          {t("Docs")}
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          {t("Legal documents and support contacts.")}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3">
        {docs.map((d) => (
          <a
            key={d.href}
            href={d.href}
            target="_blank"
            rel="noreferrer noopener"
            className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand/50"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated">
                <FileText className="h-4 w-4 text-brand" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{d.title}</div>
                <p className="mt-0.5 text-[12px] text-muted-foreground truncate">{d.desc}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground group-hover:border-brand/50 group-hover:text-brand">
              {t("Open")} <ArrowUpRight className="h-3 w-3" />
            </span>
          </a>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <MessageCircle className="h-3.5 w-3.5 text-brand" />
          {t("Support contact")}
        </div>
        <a
          href="https://t.me/SMIling_O_O"
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
        >
          @SMIling_O_O
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
        <p className="mt-1 text-[12px] text-muted-foreground">{t("Reach out on Telegram")}</p>
      </div>
    </div>
  );
}




function GmailAuthModal({
  onClose,
  onConnected,
  pendingEmail,
}: {
  onClose: () => void;
  onConnected?: () => void;
  pendingEmail?: { id?: string; action: string; to?: string; subject?: string; body?: string } | null;
}) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await connectGmail();
      if (res?.accessToken) {
        toast.success("Gmail успешно подключен!");
        if (pendingEmail && pendingEmail.to && pendingEmail.body) {
          try {
            await sendGmailMessage({
              to: pendingEmail.to,
              subject: pendingEmail.subject || "Без темы",
              body: pendingEmail.body,
            });
            toast.success(`Письмо успешно отправлено на ${pendingEmail.to}!`);
          } catch (e: any) {
            console.error("Failed to send pending email:", e);
          }
        }
        onConnected?.();
        onClose();
      }
    } catch (err: any) {
      console.error("Gmail connect error:", err);
      setError(err?.message || "Не удалось подключиться к Google");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 12 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161618] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          title="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3.5 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 shadow-sm shrink-0">
            <MailIcon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white leading-tight">
              Вход в Gmail
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Интеграция с вашей почтой Google
            </p>
          </div>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
          Для работы с вашей почтой (чтение входящих, поиск писем, создание и отправка) нейросети требуется авторизация в Google. Войдите в свой Google аккаунт для продолжения.
        </p>

        {pendingEmail && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 dark:bg-red-500/10 p-3 text-xs">
            <div className="font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5 mb-1">
              <span>📧</span> <span>Подготовлено письмо:</span>
            </div>
            {pendingEmail.to && (
              <div className="text-zinc-600 dark:text-zinc-400 truncate">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">Кому:</span> {pendingEmail.to}
              </div>
            )}
            {pendingEmail.subject && (
              <div className="text-zinc-600 dark:text-zinc-400 truncate">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">Тема:</span> {pendingEmail.subject}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2 mb-6">
          <div className="flex items-center gap-2.5 text-xs text-zinc-600 dark:text-zinc-400">
            <Check className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Нейросеть сможет сама читать и искать нужные письма</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-zinc-600 dark:text-zinc-400">
            <Check className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Автоматическое составление и отправка по вашей команде</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-zinc-600 dark:text-zinc-400">
            <Check className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Безопасная прямая авторизация через официальный Google OAuth</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 text-xs text-red-500 dark:text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-200 dark:border-white/10 px-4 py-2.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs py-2.5 px-4 flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-60 cursor-pointer active:scale-98"
          >
            {connecting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Подключение...</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Войти через Google</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AuthModal({
  onClose,
  onAuthed,
}: {
  onClose: () => void;
  onAuthed: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-xl"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <AuthCard
        isModal={true}
        onClose={onClose}
        onSuccess={() => {
          onAuthed();
          onClose();
        }}
      />
    </motion.div>
  );
}

function SidebarToggleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.85719 3H15.1428C16.2266 2.99999 17.1007 2.99998 17.8086 3.05782C18.5375 3.11737 19.1777 3.24318 19.77 3.54497C20.7108 4.02433 21.4757 4.78924 21.955 5.73005C22.2568 6.32234 22.3826 6.96253 22.4422 7.69138C22.5 8.39925 22.5 9.27339 22.5 10.3572V13.6428C22.5 14.7266 22.5 15.6008 22.4422 16.3086C22.3826 17.0375 22.2568 17.6777 21.955 18.27C21.4757 19.2108 20.7108 19.9757 19.77 20.455C19.1777 20.7568 18.5375 20.8826 17.8086 20.9422C17.1008 21 16.2266 21 15.1428 21H8.85717C7.77339 21 6.89925 21 6.19138 20.9422C5.46253 20.8826 4.82234 20.7568 4.23005 20.455C3.28924 19.9757 2.52433 19.2108 2.04497 18.27C1.74318 17.6777 1.61737 17.0375 1.55782 16.3086C1.49998 15.6007 1.49999 14.7266 1.5 13.6428V10.3572C1.49999 9.27341 1.49998 8.39926 1.55782 7.69138C1.61737 6.96253 1.74318 6.32234 2.04497 5.73005C2.52433 4.78924 3.28924 4.02433 4.23005 3.54497C4.82234 3.24318 5.46253 3.11737 6.19138 3.05782C6.89926 2.99998 7.77341 2.99999 8.85719 3ZM6.35424 5.05118C5.74907 5.10062 5.40138 5.19279 5.13803 5.32698C4.57354 5.6146 4.1146 6.07354 3.82698 6.63803C3.69279 6.90138 3.60062 7.24907 3.55118 7.85424C3.50078 8.47108 3.5 9.26339 3.5 10.4V13.6C3.5 14.7366 3.50078 15.5289 3.55118 16.1458C3.60062 16.7509 3.69279 17.0986 3.82698 17.362C4.1146 17.9265 4.57354 18.3854 5.13803 18.673C5.40138 18.8072 5.74907 18.8994 6.35424 18.9488C6.97108 18.9992 7.76339 19 8.9 19H9.5V5H8.9C7.76339 5 6.97108 5.00078 6.35424 5.05118ZM11.5 5V19H15.1C16.2366 19 17.0289 18.9992 17.6458 18.9488C18.2509 18.8994 18.5986 18.8072 18.862 18.673C19.4265 18.3854 19.8854 17.9265 20.173 17.362C20.3072 17.0986 20.3994 16.7509 20.4488 16.1458C20.4992 15.5289 20.5 14.7366 20.5 13.6V10.4C20.5 9.26339 20.4992 8.47108 20.4488 7.85424C20.3994 7.24907 20.3072 6.90138 20.173 6.63803C19.8854 6.07354 19.4265 5.6146 18.862 5.32698C18.5986 5.19279 18.2509 5.10062 17.6458 5.05118C17.0289 5.00078 16.2366 5 15.1 5H11.5ZM5 8.5C5 7.94772 5.44772 7.5 6 7.5H7C7.55229 7.5 8 7.94772 8 8.5C8 9.05229 7.55229 9.5 7 9.5H6C5.44772 9.5 5 9.05229 5 8.5ZM5 12C5 11.4477 5.44772 11 6 11H7C7.55229 11 8 11.4477 8 12C8 12.5523 7.55229 13 7 13H6C5.44772 13 5 12.5523 5 12Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GoogleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.3 14.7 2.3 12 2.3 6.9 2.3 2.8 6.4 2.8 12s4.1 9.7 9.2 9.7c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

function AppleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M16.365 12.83c-.02-2.03 1.66-3.01 1.73-3.06-.94-1.38-2.41-1.57-2.93-1.6-1.25-.13-2.44.74-3.07.74-.64 0-1.61-.72-2.65-.7-1.36.02-2.62.79-3.32 2.01-1.42 2.46-.36 6.09 1.01 8.08.67.97 1.47 2.06 2.51 2.02 1.01-.04 1.39-.65 2.61-.65s1.57.65 2.64.63c1.09-.02 1.78-.99 2.44-1.97.77-1.13 1.09-2.22 1.1-2.28-.02-.01-2.11-.81-2.13-3.22zm-2.11-5.9c.56-.68.94-1.62.83-2.55-.81.03-1.79.54-2.37 1.21-.52.6-.98 1.56-.86 2.47.9.07 1.83-.46 2.4-1.13z" />
    </svg>
  );
}

/* ---------- Profile modal (subscription management & settings) ---------- */
function ProfileModal({
  user,
  onClose,
  onSignOut,
  onUpdate,
  model,
  onModelChange,
}: {
  user: NonNullable<User>;
  onClose: () => void;
  onSignOut: () => void;
  onUpdate?: (patch: Partial<NonNullable<User>>) => void;
  model?: ModelId;
  onModelChange?: (m: ModelId) => void;
}) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<"settings" | "personalization" | "account">("settings");
  const [accent, setAccent] = useAccent();
  const [theme, setTheme] = useTheme();
  const [selectedModel, setSelectedModel] = useState<ModelId>(() => {
    return (window.localStorage.getItem("igseek:model") as ModelId | null) ?? model ?? "instinct";
  });
  const [styleInput, setStyleInput] = useState(() => window.localStorage.getItem("igseek:ai_style") || "");
  const [creativity, setCreativity] = useState(() => window.localStorage.getItem("igseek:ai_creativity") || "balance");
  const [lengthOpt, setLengthOpt] = useState(() => window.localStorage.getItem("igseek:ai_length") || "medium");
  const [currentAgent, setCurrentAgent] = useState(() => window.localStorage.getItem("igseek:agent") || "universal");

  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const memberSince = new Date(user.since).toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
  });

  const handleSave = () => {
    window.localStorage.setItem("igseek:model", selectedModel);
    onModelChange?.(selectedModel);
    window.localStorage.setItem("igseek:ai_style", styleInput);
    window.localStorage.setItem("igseek:ai_creativity", creativity);
    window.localStorage.setItem("igseek:ai_length", lengthOpt);
    window.localStorage.setItem("igseek:agent", currentAgent);
    window.dispatchEvent(new Event("igseek:settings-save"));
    onClose();
  };

  const handleReset = () => {
    setSelectedModel("instinct");
    window.localStorage.setItem("igseek:model", "instinct");
    onModelChange?.("instinct");
    setStyleInput("");
    setCreativity("balance");
    setLengthOpt("medium");
    setCurrentAgent("universal");
    window.localStorage.removeItem("igseek:ai_style");
    window.localStorage.removeItem("igseek:ai_creativity");
    window.localStorage.removeItem("igseek:ai_length");
    window.localStorage.setItem("igseek:agent", "universal");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card relative w-full max-w-lg rounded-2xl border border-white/15 bg-surface/95 p-6 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] my-auto max-h-[90vh] flex flex-col"
      >
        <button
          onClick={onClose}
          className="glass-button absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground cursor-pointer z-10"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header & User Info */}
        <div className="flex items-center gap-3 border-b border-border/70 pb-4 shrink-0 pr-8">
          <div className="relative h-10 w-10 shrink-0 rounded-full bg-brand flex items-center justify-center text-xs font-bold text-white shadow-md">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate text-foreground">{user.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">{user.email || "Гость"}</div>
          </div>
        </div>

        {/* Tabs Switcher Row */}
        <div className="flex items-center justify-center border-b border-border/70 py-3 shrink-0">
          <div className="flex w-full max-w-sm rounded-xl border border-border bg-surface-elevated/60 p-0.5 text-xs">
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex-1 rounded-lg py-1.5 text-center font-medium transition-colors cursor-pointer truncate ${
                activeTab === "settings" ? "bg-foreground text-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Нейросеть
            </button>
            <button
              onClick={() => setActiveTab("personalization")}
              className={`flex-1 rounded-lg py-1.5 text-center font-medium transition-colors cursor-pointer truncate ${
                activeTab === "personalization" ? "bg-foreground text-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Интерфейс
            </button>
            <button
              onClick={() => setActiveTab("account")}
              className={`flex-1 rounded-lg py-1.5 text-center font-medium transition-colors cursor-pointer truncate ${
                activeTab === "account" ? "bg-foreground text-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Аккаунт
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-5 pr-1 text-xs">
          {activeTab === "settings" ? (
            <>
              {/* Reset button top-right in settings */}
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand" />
                  Параметры AI и стиль
                </span>
                <button
                  onClick={handleReset}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                >
                  Сброс
                </button>
              </div>

              {/* 1. Model Selection */}
              <div className="space-y-2">
                <label className="font-medium text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-brand" />
                  Модель нейросети
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Выбери базовую языковую модель для общения и генерации
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {MODELS.map((m) => {
                    const isSelected = selectedModel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedModel(m.id)}
                        className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? "border-brand bg-brand/15 text-brand shadow-sm ring-1 ring-brand/50 font-semibold"
                            : "border-border/70 bg-surface-elevated/40 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 w-full">
                          <span className="font-medium text-xs text-foreground truncate">{m.name}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-brand shrink-0" />}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {m.tag}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Character / Style */}
              <div className="space-y-1.5">
                <label className="font-medium text-foreground flex items-center gap-1.5">
                  ✍️ Характер / стиль общения
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Опиши как должен общаться AI — тон, манеру, персонажа
                </p>
                <textarea
                  value={styleInput}
                  onChange={(e) => setStyleInput(e.target.value)}
                  placeholder="Напр: отвечай как циничный детектив из нуара, всегда кратко и с сарказмом"
                  rows={3}
                  className="w-full rounded-xl border border-border/80 bg-surface-elevated/50 p-3 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand transition-colors resize-none"
                />
              </div>

              {/* 3. Creativity */}
              <div className="space-y-2">
                <label className="font-medium text-foreground flex items-center gap-1.5">
                  🌡️ Креативность
                </label>
                <p className="text-[11px] text-muted-foreground">Точность vs непредсказуемость ответов</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "exact", label: "🎯 Точно" },
                    { id: "balance", label: "⚖️ Баланс" },
                    { id: "vivid", label: "🎨 Живо" },
                    { id: "chaos", label: "🎲 Хаос" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCreativity(item.id)}
                      className={`rounded-xl border p-2.5 text-center font-medium transition-all cursor-pointer ${
                        creativity === item.id
                          ? "border-brand bg-brand/15 text-brand shadow-sm"
                          : "border-border/70 bg-surface-elevated/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Answer Length */}
              <div className="space-y-2">
                <label className="font-medium text-foreground flex items-center gap-1.5">
                  📏 Длина ответов
                </label>
                <p className="text-[11px] text-muted-foreground">Как много пишет AI в одном сообщении</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "short", label: "⚡ Коротко", hint: "~1-3 предл." },
                    { id: "medium", label: "📝 Средне", hint: "~1 абзац" },
                    { id: "long", label: "📖 Длинно", hint: "подробно" },
                    { id: "unlimited", label: "∞ Без лимита", hint: "полный лонгрид" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLengthOpt(item.id)}
                      className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                        lengthOpt === item.id
                          ? "border-brand bg-brand/15 text-brand shadow-sm"
                          : "border-border/70 bg-surface-elevated/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="font-medium">{item.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{item.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Mode / Agent */}
              <div className="space-y-2">
                <label className="font-medium text-foreground flex items-center gap-1.5">
                  🤖 Режим / Агент
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: "universal", name: "Универсальный", desc: "Дерзкий, саркастичный, всеядный" },
                    { id: "coder", name: "Код", desc: "Программирование, дебаггинг" },
                    { id: "mentor", name: "Обучение", desc: "Объясняет, конспектирует" },
                    { id: "psy", name: "Психолог", desc: "Жёсткая честность, без сахара" },
                    { id: "hacker", name: "Хакер", desc: "Кибербез, OSINT, всё техническое" },
                  ].map((agentItem) => (
                    <button
                      key={agentItem.id}
                      type="button"
                      onClick={() => setCurrentAgent(agentItem.id as any)}
                      className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                        currentAgent === agentItem.id
                          ? "border-brand bg-brand/15 text-brand shadow-sm"
                          : "border-border/70 bg-surface-elevated/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="font-medium">{agentItem.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{agentItem.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : activeTab === "personalization" ? (
            <>
              {/* Personalization Tab */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-brand" />
                    Интерфейс и оформление
                  </span>
                  <button
                    onClick={() => setAccent("default")}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  >
                    Сброс акцента
                  </button>
                </div>

                {/* Theme toggle */}
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground flex items-center gap-1.5">
                    🌓 Тема интерфейса
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className={`rounded-xl border p-2.5 flex items-center justify-center gap-2 font-medium transition-all cursor-pointer ${
                        theme === "dark"
                          ? "border-brand bg-brand/15 text-brand shadow-sm"
                          : "border-border/70 bg-surface-elevated/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Moon className="h-4 w-4" /> Тёмная
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className={`rounded-xl border p-2.5 flex items-center justify-center gap-2 font-medium transition-all cursor-pointer ${
                        theme === "light"
                          ? "border-[#18181b] bg-[#18181b]/15 text-[#18181b] dark:border-white dark:bg-white/15 dark:text-white shadow-sm"
                          : "border-border/70 bg-surface-elevated/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Sun className="h-4 w-4" /> Светлая
                    </button>
                  </div>
                </div>

                {/* Accent Color Section */}
                <div className="space-y-2">
                  <label className="font-medium text-foreground flex items-center gap-1.5">
                    🎨 Акцент цвета
                  </label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Основной цвет элементов интерфейса. По умолчанию для светлой темы — чёрный, для тёмной — красный.
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {ACCENT_PRESETS.map((item) => {
                      const isSelected = accent === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setAccent(item.id)}
                          className={`rounded-xl border p-2.5 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer text-center ${
                            isSelected
                              ? "border-brand bg-brand/15 text-brand shadow-sm ring-1 ring-brand/50 font-semibold"
                              : "border-border/70 bg-surface-elevated/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span
                            className="h-5 w-5 rounded-full border border-white/20 shadow-sm shrink-0"
                            style={{ background: item.swatch }}
                          />
                          <span className="text-[11px] leading-none truncate w-full">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Account Tab */}
              <div className="glass-card rounded-xl border border-border/80 bg-surface-elevated/40 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles className="h-4 w-4 text-brand" />
                  Возможности аккаунта
                </div>
                <ul className="space-y-2 text-[12px] text-foreground/90">
                  {[
                    "Мульти-модельный AI-чат и reasoning",
                    "Специализированные агенты и эксперты",
                    "Генерация кода и интерактивные артефакты",
                    "Семантическая память и веб-поиск",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-brand shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                <span>Аккаунт с {memberSince}</span>
                <button
                  onClick={onSignOut}
                  className="glass-button inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                >
                  <LogIn className="h-3.5 w-3.5 rotate-180" />
                  Выйти из аккаунта
                </button>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-5 flex items-center justify-end gap-3 border-t border-border/70 pt-4 shrink-0">
          <button
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="rounded-xl bg-foreground text-background dark:bg-[var(--brand)] dark:text-white hover:opacity-90 px-5 py-2 text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            Сохранить
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}


/* ---------- Memory HUD Modal (long-term memory notebook) ---------- */
type MemoryAttachment = {
  name: string;
  type: string;
  size?: number;
  dataUrl?: string;
  textContent?: string;
};

type Memory = { id: string; content: string; kind: string; created_at: string; attachment?: MemoryAttachment };

const KIND_LABELS: Record<string, { label: string; color: string }> = {
  name: { label: "Имя", color: "text-emerald-400" },
  preference: { label: "Предпочтение", color: "text-brand" },
  tech: { label: "Технологии", color: "text-sky-400" },
  project: { label: "Проект", color: "text-amber-400" },
  goal: { label: "Цель", color: "text-fuchsia-400" },
  device: { label: "Устройство", color: "text-cyan-400" },
  interest: { label: "Интерес", color: "text-orange-400" },
  style: { label: "Стиль", color: "text-violet-400" },
  other: { label: "Другое", color: "text-muted-foreground" },
};

function MemoryModal({ onClose, lang: _lang }: { onClose: () => void; lang: LangCode }) {
  const t = useT();
  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftAttachment, setDraftAttachment] = useState<MemoryAttachment | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [query, setQuery] = useState("");
  const memFileInputRef = useRef<HTMLInputElement | null>(null);

  const authHeader = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ? { authorization: `Bearer ${data.session.access_token}` } : {};
  };

  const load = async () => {
    setLoading(true);
    try {
      const h = await authHeader();
      const res = await fetch("/api/memory", { headers: h as HeadersInit });
      if (res.ok) {
        const j = (await res.json()) as { items: Memory[] };
        setItems(j.items);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onUpdated = () => load();
    window.addEventListener("igseek:memory-updated", onUpdated);
    return () => window.removeEventListener("igseek:memory-updated", onUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMemFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    const isTxt =
      file.type.startsWith("text/") ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".json") ||
      file.name.endsWith(".md") ||
      file.name.endsWith(".js") ||
      file.name.endsWith(".ts");

    if (isTxt) {
      reader.onload = (ev) => {
        const textContent = (ev.target?.result as string)?.slice(0, 4000);
        const r2 = new FileReader();
        r2.onload = (ev2) => {
          setDraftAttachment({
            name: file.name,
            type: file.type || "text/plain",
            size: file.size,
            dataUrl: ev2.target?.result as string,
            textContent,
          });
        };
        r2.readAsDataURL(file);
      };
      reader.readAsText(file);
    } else {
      reader.onload = (ev) => {
        setDraftAttachment({
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          dataUrl: ev.target?.result as string,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const addMemory = async () => {
    const text = draft.trim();
    if (!text && !draftAttachment) return;
    setSaving(true);
    try {
      const h = await authHeader();
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "content-type": "application/json", ...(h as Record<string, string>) },
        body: JSON.stringify({
          content: text || `Вложение в памяти: ${draftAttachment?.name}`,
          attachment: draftAttachment,
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as { items: Memory[] };
        setItems(j.items);
        setDraft("");
        setDraftAttachment(null);
        if (memFileInputRef.current) memFileInputRef.current.value = "";
      }
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const h = await authHeader();
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "content-type": "application/json", ...(h as Record<string, string>) },
        body: JSON.stringify({ id: editing.id, content: editing.content }),
      });
      if (res.ok) {
        const j = (await res.json()) as { items: Memory[] };
        setItems(j.items);
        setEditing(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const h = await authHeader();
    setItems((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) setSelectedId(null);
    await fetch("/api/memory", {
      method: "DELETE",
      headers: { "content-type": "application/json", ...(h as Record<string, string>) },
      body: JSON.stringify({ id }),
    });
  };

  const downloadMemAttachment = (att: MemoryAttachment) => {
    if (!att.dataUrl) return;
    const link = document.createElement("a");
    link.href = att.dataUrl;
    link.download = att.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filtered = items.filter((m) =>
    query
      ? m.content.toLowerCase().includes(query.toLowerCase()) ||
        (m.attachment?.name && m.attachment.name.toLowerCase().includes(query.toLowerCase()))
      : true,
  );
  const selected = items.find((m) => m.id === selectedId) ?? null;

  const grouped = filtered.reduce<Record<string, Memory[]>>((acc, m) => {
    const k = m.kind || "other";
    (acc[k] ||= []).push(m);
    return acc;
  }, {});

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-md p-2 sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="glass-card relative flex h-[88vh] md:h-[84vh] w-full max-w-5xl flex-col md:flex-row overflow-hidden rounded-2xl border border-white/15 bg-surface/90 shadow-[0_40px_120px_-30px_rgba(255,0,0,0.35)] backdrop-blur-2xl"
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 8, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HUD grid backdrop */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />

        {/* LEFT PANEL: list & creation (visible on mobile if !selectedId) */}
        <div
          className={`relative z-10 flex w-full md:w-[340px] lg:w-[360px] md:shrink-0 flex-col border-r border-white/10 bg-background/60 backdrop-blur-md ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="absolute inset-0 rounded-md bg-brand/30 blur-md" />
                <div className="glass-card relative flex h-7 w-7 items-center justify-center rounded-md border border-brand/40 bg-background">
                  <NotebookText className="h-3.5 w-3.5 text-brand" />
                </div>
              </div>
              <div>
                <div className="text-[13px] font-semibold tracking-tight leading-none">{t("Memory HUD")}</div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  {items.length} {t("entries")}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="glass-button flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-white/10 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search memory")}
                className="glass-card w-full rounded-lg border border-white/10 bg-surface-elevated/70 pl-9 pr-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:border-brand/50 transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {loading ? (
              <div className="flex items-center gap-2 px-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Loading memory")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="mx-1 rounded-xl border border-dashed border-border/70 p-6 text-center">
                <BookOpen className="mx-auto h-6 w-6 text-brand/60" />
                <div className="mt-2 text-[12px] font-medium">{t("No memories yet")}</div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {t("IGseek will remember important facts about you from your conversations.")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {Object.entries(grouped).map(([kind, list]) => {
                  const meta = KIND_LABELS[kind] ?? KIND_LABELS.other;
                  return (
                    <div key={kind}>
                      <div className="mb-1.5 flex items-center gap-2 px-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                        <span className={`h-1 w-1 rounded-full bg-current ${meta.color}`} />
                        <span>{meta.label}</span>
                        <span className="text-muted-foreground/50">{list.length}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {list.map((m) => {
                          const active = m.id === selectedId;
                          return (
                            <button
                              key={m.id}
                              onClick={() => setSelectedId(m.id)}
                              className={`glass-button group relative rounded-lg px-3 py-2 text-left text-[12px] leading-snug cursor-pointer ${
                                active
                                  ? "border-brand/60 bg-brand/15 text-brand shadow-[0_0_15px_-3px_rgba(229,9,20,0.3)]"
                                  : "text-foreground/90"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <span className="line-clamp-2 flex-1">{m.content}</span>
                                {m.attachment && (
                                  <span className="shrink-0 rounded bg-brand/20 text-brand px-1.5 py-0.5 text-[9px] font-bold flex items-center gap-0.5">
                                    <Paperclip className="h-2.5 w-2.5" />
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Draft attachment preview pill */}
          {draftAttachment && (
            <div className="px-3 pt-2">
              <div className="flex items-center justify-between rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1.5 text-xs text-brand">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-[11px] font-semibold">{draftAttachment.name}</span>
                  {draftAttachment.size && (
                    <span className="text-[10px] opacity-75">({Math.round(draftAttachment.size / 1024)} KB)</span>
                  )}
                </div>
                <button
                  onClick={() => setDraftAttachment(null)}
                  className="p-0.5 hover:opacity-80 cursor-pointer"
                  title="Убрать вложение"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Creation bar with paperclip */}
          <div className="border-t border-white/10 p-3">
            <input
              ref={memFileInputRef}
              type="file"
              onChange={handleMemFileChange}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => memFileInputRef.current?.click()}
                className="glass-button flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-brand transition-colors cursor-pointer"
                title="Прикрепить файл к памяти"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={1}
                placeholder={t("Add a memory or text…")}
                className="glass-card flex-1 resize-none rounded-lg border border-white/10 bg-surface-elevated/60 px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:border-brand/50"
              />
              <button
                onClick={addMemory}
                disabled={saving || (!draft.trim() && !draftAttachment)}
                className="glass-button-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white disabled:opacity-50 cursor-pointer"
                title={t("Save")}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: details or summary (visible on mobile if selectedId or desktop) */}
        <div
          className={`relative z-10 flex-1 flex-col ${
            selectedId ? "flex" : "hidden md:flex"
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 sm:px-5 py-3">
            <div className="flex items-center gap-2">
              {selectedId && (
                <button
                  onClick={() => setSelectedId(null)}
                  className="md:hidden glass-button mr-1 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Назад"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <Sparkle className="h-3.5 w-3.5 text-brand" />
              <span className="text-[12px] font-semibold tracking-tight">
                {selected ? t("Memory entry") : t("Memory summary")}
              </span>
              {!selected && (
                <span className="rounded-md border border-brand/30 bg-brand/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-brand">
                  auto
                </span>
              )}
            </div>
            {selected && (
              <button
                onClick={() => setSelectedId(null)}
                className="hidden md:inline-flex glass-button rounded-lg px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                ← {t("Back to overview")}
              </button>
            )}
            {!selected && (
              <button
                onClick={onClose}
                className="md:hidden glass-button flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-5">
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="mx-auto max-w-xl"
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <span className={KIND_LABELS[selected.kind]?.color ?? "text-brand"}>●</span>
                    <span>{KIND_LABELS[selected.kind]?.label ?? selected.kind}</span>
                    <span>·</span>
                    <span>{new Date(selected.created_at).toLocaleDateString()}</span>
                  </div>

                  {editing?.id === selected.id ? (
                    <textarea
                      value={editing.content}
                      onChange={(e) => setEditing({ id: selected.id, content: e.target.value })}
                      rows={5}
                      className="glass-card mt-4 w-full resize-none rounded-xl border border-brand/40 bg-surface-elevated/70 p-4 text-[15px] leading-relaxed focus:outline-none focus:border-brand/60"
                      autoFocus
                    />
                  ) : (
                    <p className="glass-card mt-4 rounded-xl border border-white/10 bg-surface-elevated/40 p-5 text-[15px] leading-relaxed text-foreground/95">
                      {selected.content}
                    </p>
                  )}

                  {/* Attachment in detail view */}
                  {selected.attachment && (
                    <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="h-4 w-4 text-brand shrink-0" />
                          <span className="text-xs font-semibold text-foreground truncate">{selected.attachment.name}</span>
                          {selected.attachment.size && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              ({Math.round(selected.attachment.size / 1024)} KB)
                            </span>
                          )}
                        </div>
                        {selected.attachment.dataUrl && (
                          <button
                            onClick={() => downloadMemAttachment(selected.attachment!)}
                            className="glass-button shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-brand hover:underline cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" /> Скачать
                          </button>
                        )}
                      </div>

                      {/* Image preview */}
                      {selected.attachment.dataUrl?.startsWith("data:image/") && (
                        <div className="mt-3 max-h-56 overflow-hidden rounded-lg border border-border/60">
                          <img
                            src={selected.attachment.dataUrl}
                            alt={selected.attachment.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}

                      {/* Text content preview */}
                      {selected.attachment.textContent && (
                        <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] font-mono leading-relaxed text-muted-foreground max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {selected.attachment.textContent}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    {editing?.id === selected.id ? (
                      <>
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="glass-button-brand inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
                        >
                          <Save className="h-3.5 w-3.5" /> {t("Save")}
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="glass-button rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {t("Cancel")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditing({ id: selected.id, content: selected.content })}
                          className="glass-button inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t("Edit")}
                        </button>
                        <button
                          onClick={() => remove(selected.id)}
                          className="glass-button inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-brand hover:border-destructive/40 hover:text-destructive cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {t("Forget")}
                        </button>
                      </>
                    )}
                  </div>

                  <div className="glass-card mt-8 rounded-xl border border-dashed border-border/60 p-4 text-[11px] leading-relaxed text-muted-foreground">
                    {t("This fact and its attachment are automatically loaded into IGseek's context when relevant to your next message.")}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="summary"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="mx-auto max-w-2xl"
                >
                  <h2 className="text-xl font-semibold tracking-tight">{t("What IGseek knows about you")}</h2>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    {t("A living notebook. Facts and attachments are added, updated and forgotten as we talk.")}
                  </p>

                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {Object.entries(grouped).length === 0 && !loading && (
                      <div className="col-span-full rounded-xl border border-dashed border-border/60 p-8 text-center text-[12px] text-muted-foreground">
                        {t("Chat with IGseek — memories will appear here automatically.")}
                      </div>
                    )}
                    {Object.entries(grouped).map(([kind, list]) => {
                      const meta = KIND_LABELS[kind] ?? KIND_LABELS.other;
                      return (
                        <div
                          key={kind}
                          className="group rounded-xl border border-border/60 bg-surface-elevated/40 p-4 transition-colors hover:border-brand/40"
                        >
                          <div className="flex items-center justify-between">
                            <div className={`text-[10px] uppercase tracking-[0.18em] ${meta.color}`}>
                              {meta.label}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{list.length}</div>
                          </div>
                          <ul className="mt-3 space-y-1.5">
                            {list.slice(0, 4).map((m) => (
                              <li key={m.id}>
                                <button
                                  onClick={() => setSelectedId(m.id)}
                                  className="line-clamp-2 text-left text-[12px] leading-snug text-foreground/85 hover:text-brand transition-colors cursor-pointer"
                                >
                                  {m.content}
                                </button>
                              </li>
                            ))}
                            {list.length > 4 && (
                              <li className="text-[11px] text-muted-foreground">
                                +{list.length - 4} {t("more")}
                              </li>
                            )}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="border-t border-border/60 px-5 py-2.5 text-[10px] text-muted-foreground flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
              <span>{t("Semantic memory · live")}</span>
            </div>
            <div>IGseek · LTM v1</div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
