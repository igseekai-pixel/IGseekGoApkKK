import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Play,
  Pause,
  Menu,
  X,
  Bot,
  Sparkles,
  Code2,
  GraduationCap,
  MessageSquare,
  Brain,
  ShieldAlert,
  Cpu,
  Zap,
  Layers,
  ArrowUpRight,
  Check,
  FileCode2,
  Wand2,
  Volume2,
  VolumeX,
  Maximize2,
  Heart,
  Loader2,
  Sun,
  Moon,
} from "lucide-react";

import logoAsset from "@/assets/igseek-logo.png";
import trailerAsset from "@/assets/welcome-trailer.mp4.asset.json";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IGseek — AI copilot for creators & builders" },
      {
        name: "description",
        content:
          "IGseek — специализированные AI-агенты, reasoning-режим и артефакты кода в одном чате. Красно-чёрный минимализм, скорость и глубина.",
      },
      { property: "og:title", content: "IGseek — AI copilot for creators & builders" },
      { property: "og:description", content: "IGseek — специализированные AI-агенты, reasoning-режим и артефакты кода в одном чате. Красно-чёрный минимализм, скорость и глубина." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

type TabKey = "engine" | "models";

const NAV: { label: string; key: TabKey }[] = [
  { label: "ENGINE", key: "engine" },
  { label: "MODELS", key: "models" },
];

function Logo({ size = 24 }: { size?: number }) {
  return (
    <img
      src={logoAsset}
      alt="IGseek"
      width={size}
      height={size}
      className="logo-mark rounded-md object-contain"
      style={{ width: size, height: size }}
    />
  );
}

/* -------------------------- Ticker -------------------------- */
function Ticker() {
  const items = ["Multi-agent", "Instinct 4.0", "F1", "3.2 Chat", "Reasoner", "Artifacts"];
  const loop = [...items, ...items, ...items, ...items];
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 border-t border-border bg-surface/70 py-4 backdrop-blur"
      style={{
        maskImage: "linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)",
      }}
    >
      <div
        className="flex items-center gap-14 whitespace-nowrap"
        style={{ animation: "igseek-ticker 28s linear infinite", width: "max-content" }}
      >
        {loop.map((t, i) => (
          <div key={i} className="flex items-center gap-3 opacity-80">
            <span className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface-elevated text-foreground">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <span className="text-[20px] font-normal tracking-wide text-foreground">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------- Info Panels -------------------------- */

const AGENTS = [
  { icon: Sparkles, name: "Universal", desc: "Universal IGseek without specialization — a base for any task." },
  { icon: Code2, name: "Coder", desc: "Hardcore engineer: code, architecture, debugging, refactoring." },
  { icon: ShieldAlert, name: "Hacker", desc: "Red-team bias: reverse, offsec, low-level and vuln analysis." },
  { icon: GraduationCap, name: "Mentor", desc: "Explains complex things simply, in layers, with examples." },
  { icon: Brain, name: "Psy", desc: "Cold psychoanalysis and blunt situation breakdown." },
  { icon: MessageSquare, name: "Creative", desc: "Storytelling, ideas, copy, concepts and creative formats." },
];

const MODELS = [
  { name: "IGseek 4.0 instinct", tag: "default", desc: "Flagship: depth and quality for complex tasks." },
  { name: "IGseek 3.2 chat", tag: "chat", desc: "Conversational model with long context and soft tone." },
  { name: "IGseek F1", tag: "flash", desc: "Ultra-fast answers for iterations and short queries." },
  { name: "IGseek Reasoner", tag: "reasoner", desc: "Reasoning mode with explicit chain of thought." },
];

const ENGINE_FEATURES = [
  { icon: FileCode2, title: "Real files", desc: "AI writes real project files, not snippets." },
  { icon: Layers, title: "Full project", desc: "Multi-file structure, dependencies, configs." },
  { icon: Wand2, title: "Vibe-code", desc: "Describe an idea in words — get a working prototype." },
  { icon: ArrowUpRight, title: "Export", desc: "Download the archive and continue locally." },
];




function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 16, filter: "blur(8px)" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-surface/95 p-6 shadow-xl backdrop-blur-2xl sm:p-10"
    >
      <div className="relative">{children}</div>
    </motion.div>
  );
}

function GoToChatButton({ label }: { label?: string }) {
  const t = useT();
  const text = label ?? t("Go to chat");
  return (
    <Link
      to="/app"
      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-md transition-transform duration-300 hover:-translate-y-0.5 hover:opacity-90"
    >
      <Play size={14} fill="currentColor" />
      <span className="tracking-wider">{text}</span>
      <ArrowUpRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}




const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

function AgentsPanel() {
  const t = useT();
  return (
    <PanelShell>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-pixel text-xs uppercase tracking-[0.3em] text-foreground font-semibold">Agents</p>
          <h2 className="font-serif-i mt-1 text-3xl sm:text-5xl text-foreground">{t("Six minds. One chat.")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t("Each agent is a distinct character and knowledge profile. Switch instantly without losing context.")}
          </p>
        </div>
        <GoToChatButton label={t("Try agents")} />
      </div>
      <motion.div variants={stagger} initial="hidden" animate="show" className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((a) => (
          <motion.div
            key={a.name}
            variants={item}
            whileHover={{ y: -4 }}
            className="group relative overflow-hidden rounded-2xl border border-border bg-surface-elevated/40 p-4 transition-colors hover:border-foreground/30 hover:bg-surface-elevated/80"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-foreground/10 text-foreground">
                <a.icon size={18} />
              </span>
              <span className="text-base font-semibold text-foreground">{a.name}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(a.desc)}</p>
          </motion.div>
        ))}
      </motion.div>
    </PanelShell>
  );
}

function EnginePanel() {
  const t = useT();
  return (
    <PanelShell>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-pixel text-xs uppercase tracking-[0.3em] text-foreground font-semibold">{t("Engine · soon")}</p>
          <h2 className="font-serif-i mt-1 text-3xl sm:text-5xl text-foreground">{t("Vibe-code entire projects.")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t("A tool where AI writes real files and you download the finished project. Coming in the next update.")}
          </p>
        </div>
        <GoToChatButton label={t("Back to chat")} />
      </div>
      <motion.div variants={stagger} initial="hidden" animate="show" className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ENGINE_FEATURES.map((f) => (
          <motion.div
            key={f.title}
            variants={item}
            whileHover={{ y: -4 }}
            className="rounded-2xl border border-border bg-surface-elevated/40 p-4 transition-colors hover:border-foreground/30"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-foreground/10 text-foreground">
              <f.icon size={18} />
            </span>
            <div className="mt-3 text-base font-semibold text-foreground">{t(f.title)}</div>
            <p className="mt-1 text-sm text-muted-foreground">{t(f.desc)}</p>
          </motion.div>
        ))}
      </motion.div>
      <div className="mt-6 rounded-xl border border-dashed border-border bg-surface-elevated/30 px-4 py-3 text-xs text-muted-foreground">
        {t("Status: in development — follow updates in the app.")}
      </div>
    </PanelShell>
  );
}

function ModelsPanel() {
  const t = useT();
  return (
    <PanelShell>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-pixel text-xs uppercase tracking-[0.3em] text-foreground font-semibold">Models</p>
          <h2 className="font-serif-i mt-1 text-3xl sm:text-5xl text-foreground">{t("Three IGseek models + R1.")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t("Pick by task: speed, conversation or deep reasoning.")}
          </p>
        </div>
        <GoToChatButton label={t("Choose model")} />
      </div>
      <motion.div variants={stagger} initial="hidden" animate="show" className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MODELS.map((m) => (
          <motion.div
            key={m.name}
            variants={item}
            whileHover={{ y: -4 }}
            className="group relative overflow-hidden rounded-2xl border border-border bg-surface-elevated/40 p-5 transition-colors hover:border-foreground/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-foreground/10 text-foreground">
                  <Cpu size={18} />
                </span>
                <span className="text-base font-semibold text-foreground">{m.name}</span>
              </div>
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                {m.tag}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t(m.desc)}</p>
          </motion.div>
        ))}
      </motion.div>
    </PanelShell>
  );
}




/* -------------------------- Trailer Showcase -------------------------- */
function TrailerShowcase() {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {});
  }, []);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const goFullscreen = () => {
    const v = videoRef.current as any;
    if (!v) return;
    (v.requestFullscreen || v.webkitEnterFullscreen || v.webkitRequestFullscreen)?.call(v);
  };

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * 4, y: px * 4 });
  };
  const onLeave = () => {
    setTilt({ x: 0, y: 0 });
    setHovered(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      className="relative mt-12 w-full max-w-5xl px-2 sm:mt-16 sm:px-4"
    >
      {/* Section label */}
      <div className="mb-4 flex items-center justify-center gap-3 sm:mb-6">
        <span className="h-px w-8 bg-border" />
        <span className="font-pixel text-[10px] uppercase tracking-[0.35em] text-foreground font-semibold">
          {t("Welcome · trailer")}
        </span>
        <span className="h-px w-8 bg-border" />
      </div>

      <div
        ref={wrapRef}
        onMouseEnter={() => setHovered(true)}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="group relative z-10 mx-auto"
        style={{
          perspective: 1400,
        }}
      >
        <motion.div
          animate={{ rotateX: tilt.x, rotateY: tilt.y }}
          transition={{ type: "spring", stiffness: 120, damping: 15 }}
          style={{ transformStyle: "preserve-3d" }}
          className="relative overflow-hidden rounded-2xl border border-border bg-black shadow-xl"
        >
          {/* Window chrome */}
          <div className="relative z-10 flex items-center justify-between border-b border-white/10 bg-black/80 px-4 py-2.5 backdrop-blur">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.25em] text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
              igseek.ai / trailer
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <button
                onClick={toggleMute}
                className="grid h-7 w-7 place-items-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button
                onClick={goFullscreen}
                className="grid h-7 w-7 place-items-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Fullscreen"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

          {/* Video */}
          <div className="relative aspect-video w-full bg-black">
            <video
              ref={videoRef}
              src={trailerAsset.url}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
              onClick={toggle}
            />

            {/* Vignette */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
              }}
            />

            {/* Hover play/pause */}
            <button
              onClick={toggle}
              className="absolute inset-0 grid place-items-center focus:outline-none"
              aria-label={playing ? "Pause" : "Play"}
            >
              <motion.span
                initial={false}
                animate={{
                  opacity: hovered || !playing ? 1 : 0,
                  scale: hovered || !playing ? 1 : 0.85,
                }}
                transition={{ duration: 0.25 }}
                className="grid h-16 w-16 place-items-center rounded-full bg-foreground text-background shadow-lg sm:h-20 sm:w-20"
              >
                {playing ? <Pause size={22} fill="currentColor" /> : <Play size={24} fill="currentColor" className="translate-x-0.5" />}
              </motion.span>
            </button>

            {/* Bottom badge */}
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-white/15 bg-black/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.25em] text-white/80 backdrop-blur sm:bottom-4 sm:left-4">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              {t("Live demo")}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Caption */}
      <p className="mt-6 text-center text-xs text-muted-foreground sm:text-sm">
        {t("90 seconds to feel IGseek — agents, reasoning and artifacts in action.")}
      </p>
    </motion.div>
  );
}


const PANELS: Record<TabKey, () => React.ReactElement> = {
  engine: EnginePanel,
  models: ModelsPanel,
};

/* -------------------------- Page -------------------------- */
function Landing() {
  const t = useT();
  const [theme, setTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<TabKey | null>(null);

  const openTab = (k: TabKey) => {
    setTab(k);
    setMenuOpen(false);
  };
  const closeTab = () => setTab(null);

  const ActivePanel = tab ? PANELS[tab] : null;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <style>{`
        .font-pixel { font-family: 'basis33', 'JetBrains Mono', monospace; letter-spacing: 0.02em; }
        .font-serif-i { font-family: 'Instrument Serif', serif; }
        @keyframes igseek-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes igseek-breathe { 0%,100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.06); } }
      `}</style>

      {/* Subtle grid — same as /app */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.05] text-foreground"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* NAV pill */}
      <div className="relative z-30 flex justify-center px-3 pt-3 md:pt-6">
        <nav className="flex items-center gap-3 rounded-xl border border-border bg-surface/85 px-3 py-2 shadow-sm backdrop-blur-md sm:gap-5 sm:px-4 sm:py-3 md:gap-6 md:px-6">
          <button onClick={closeTab} className="flex items-center gap-2">
            <Logo size={22} />
            <span className="text-[13px] font-semibold tracking-[0.2em] sm:text-sm text-foreground">IGSEEK</span>
          </button>
          <div className="hidden items-center gap-5 sm:flex md:gap-6">
            {NAV.map((n) => {
              const active = tab === n.key;
              return (
                <button
                  key={n.label}
                  onClick={() => openTab(n.key)}
                  className={`relative text-sm font-medium tracking-wide transition-colors ${
                    active ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {n.label}
                  {active && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute -bottom-1 left-0 right-0 h-[2px] rounded-full bg-foreground"
                    />
                  )}
                </button>
              );
            })}
            <Link
              to="/app"
              className="text-sm font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              APP
            </Link>
            <button
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              className="p-1 rounded-lg text-muted-foreground transition-colors hover:text-foreground"
              title={theme === "dark" ? "Переключить на светлую" : "Переключить на тёмную"}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <div className="flex items-center gap-2 sm:hidden">
            <button
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              className="p-1 rounded-lg text-muted-foreground transition-colors hover:text-foreground"
              title={theme === "dark" ? "Переключить на светлую" : "Переключить на тёмную"}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="p-1 text-muted-foreground transition-opacity hover:text-foreground"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
          </div>
        </nav>
      </div>


      {/* HERO or PANEL */}
      <div className="relative z-10 mt-6 flex flex-1 flex-col items-center overflow-y-auto px-4 pb-24 text-center sm:mt-8 md:mt-12 md:pb-28">
        <AnimatePresence mode="wait">
          {!tab ? (
            <motion.div
              key="hero"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center"
            >
              <div className="mb-5 inline-flex items-center gap-2 rounded-xl border border-border bg-surface/80 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm sm:mb-6 sm:px-4 sm:py-2 sm:text-sm shadow-xs">
                <Logo size={18} />
                <span>{t("Powered by IGseek")}</span>
              </div>

              <h1 className="font-serif-i max-w-4xl px-2 text-[2.25rem] leading-[1] tracking-tight text-foreground sm:text-5xl md:text-7xl lg:text-8xl">
                {t("One chat.")}<br />
                <span>{t("Many")} </span>
                <span className="font-pixel align-baseline" style={{ fontSize: "0.82em" }}>{t("minds")}</span>.
              </h1>

              <p className="mt-4 max-w-3xl px-2 text-[13px] leading-relaxed text-muted-foreground sm:mt-6 sm:text-sm md:text-base">
                {t("Specialized AI agents, reasoning mode and code artifacts in one interface. Universal, Coder, Hacker, Mentor, Psy and Creative — switch between minds without losing context and get depth where you need it.")}
              </p>

              <Link
                to="/app"
                className="group mt-7 inline-flex items-center gap-3 rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-md transition-all duration-300 hover:opacity-90 sm:mt-8 sm:px-8 sm:py-3.5"
              >
                <Play size={14} fill="currentColor" />
                <span className="tracking-wider">{t("START CHATTING")}</span>
              </Link>

              <div className="mt-6 flex flex-wrap items-stretch justify-center gap-2 text-sm text-foreground sm:gap-3">
                <div className="flex items-center gap-2 rounded-md border border-border bg-surface/80 px-3 py-2 backdrop-blur-sm sm:px-4 shadow-xs">
                  <span className="text-sm font-bold tracking-tight sm:text-base">Agents</span>
                  <span className="text-xs text-muted-foreground">x6</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border bg-surface/80 px-3 py-2 backdrop-blur-sm sm:px-4 shadow-xs">
                  <span className="text-lg font-bold sm:text-xl">R.</span>
                  <span className="text-xs text-muted-foreground">reasoner</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border bg-surface/80 px-3 py-2 backdrop-blur-sm sm:px-4 shadow-xs">
                  <Zap size={14} className="text-foreground" />
                  <span className="text-[10px] font-bold tracking-tight sm:text-xs">Artifacts</span>
                  <span className="text-xs text-muted-foreground">beta</span>
                </div>
              </div>

              <p className="mt-5 text-xs text-muted-foreground">
                {t("6 specialized agents · 3 IGseek models · IGseek Reasoner inside")}
              </p>

              <TrailerShowcase />
            </motion.div>
          ) : (
            <motion.div
              key={tab}
              className="flex w-full flex-col items-center pb-28"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="mb-4 flex w-full max-w-5xl items-center justify-between">
                <button
                  onClick={closeTab}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/80 px-3 py-1.5 text-xs text-foreground backdrop-blur-md transition-colors hover:bg-surface-elevated"
                >
                  <X size={12} /> {t("Close")}
                </button>
              </div>
              {ActivePanel && <ActivePanel />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      

      {/* MOBILE MENU */}
      <div
        className={`fixed inset-0 z-50 flex flex-col bg-background/98 backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-sm font-semibold tracking-[0.2em] text-foreground">IGSEEK</span>
          </div>
          <button className="p-2 transition-opacity hover:opacity-70 text-foreground" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <X size={24} />
          </button>
        </div>
        <nav className="flex flex-1 flex-col items-center justify-center gap-8">
          {NAV.map((n, i) => (
            <button
              key={n.label}
              onClick={() => openTab(n.key)}
              className={`text-2xl tracking-widest text-foreground transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                menuOpen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
              }`}
              style={{ transitionDelay: menuOpen ? `${100 + i * 60}ms` : "0ms" }}
            >
              {n.label}
            </button>
          ))}
          <Link
            to="/app"
            onClick={() => setMenuOpen(false)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-foreground px-6 py-3 text-sm font-semibold tracking-wider text-background shadow-md hover:opacity-90"
          >
            <Play size={14} fill="currentColor" /> {t("GO TO CHAT")}
          </Link>

        </nav>
      </div>
    </div>
  );
}
