import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sun, Moon, ChevronDown, Check } from "lucide-react";
import { firebaseClient } from "@/lib/firebase-service";
import { AuthCard } from "@/components/auth/AuthCard";
import { useTheme } from "@/lib/theme";

import { syncDocumentLang, useLang, useT, type LangCode } from "@/lib/i18n";

const LOGIN_LANGUAGES: { code: LangCode; native: string }[] = [
  { code: "en", native: "English" },
  { code: "ru", native: "Русский" },
  { code: "es", native: "Español" },
  { code: "fr", native: "Français" },
  { code: "ar", native: "العربية" },
];

function isSafeNext(v: string | undefined): v is string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//");
}

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — IGseek" },
      { name: "description", content: "Sign in or create an IGseek account." },
      { property: "og:title", content: "Sign in — IGseek" },
      { property: "og:description", content: "Sign in or create an IGseek account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await firebaseClient.auth.getSession();
    if (data.session) {
      const target = isSafeNext(search.next) ? search.next : "/app";
      throw redirect({ to: target as any, replace: true });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { next } = Route.useSearch();
  const safeNext = isSafeNext(next) ? next : "/app";
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const lang = useLang();
  const t = useT();
  const [langOpen, setLangOpen] = useState(false);

  const changeLang = (code: LangCode) => {
    window.localStorage.setItem("igseek:lang", code);
    syncDocumentLang(code);
    window.dispatchEvent(new Event("igseek:lang-change"));
    setLangOpen(false);
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground">
      {/* Top right language + theme controls */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setLangOpen((v) => !v)}
            onBlur={() => setTimeout(() => setLangOpen(false), 120)}
            className="glass-button flex h-9 px-2.5 items-center gap-1 rounded-xl text-xs font-medium text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
            title={t("Language")}
            aria-label={t("Change language")}
          >
            <span>文A</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>
          {langOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-40 rounded-2xl border border-border bg-surface p-1 shadow-xl z-50">
              {LOGIN_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    changeLang(l.code);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs rounded-xl transition-colors cursor-pointer ${
                    lang === l.code
                      ? "bg-foreground/10 font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  <span>{l.native}</span>
                  {lang === l.code && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          className="glass-button flex h-9 w-9 items-center justify-center rounded-xl text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
          title={theme === "dark" ? t("Switch to light") : t("Switch to dark")}
          aria-label={t("Toggle theme")}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* subtle grid pattern */}
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
          void navigate({ to: safeNext as any, replace: true });
        }}
      />
    </div>
  );
}
