import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { firebaseClient } from "@/lib/firebase-service";
import { AuthCard } from "@/components/auth/AuthCard";
import { useTheme } from "@/lib/theme";

function isSafeNext(v: string | undefined): v is string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//");
}

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Вход в IGseek" },
      { name: "description", content: "Войдите или создайте аккаунт IGseek." },
      { property: "og:title", content: "Вход в IGseek" },
      { property: "og:description", content: "Войдите или создайте аккаунт IGseek." },
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
      throw redirect({ href: target });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { next } = Route.useSearch();
  const safeNext = isSafeNext(next) ? next : "/app";
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    const { data: sub } = firebaseClient.auth.onAuthStateChange(async (_e, session) => {
      if (session) {
        window.location.href = safeNext;
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [safeNext]);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground">
      {/* Top right theme toggle */}
      <div className="absolute right-4 top-4 z-20">
        <button
          onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          className="glass-button flex h-9 w-9 items-center justify-center rounded-xl text-foreground hover:bg-foreground/5 transition-colors"
          title={theme === "dark" ? "Переключить на светлую" : "Переключить на тёмную"}
          aria-label="Toggle theme"
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
          window.location.href = safeNext;
        }}
        onGuestContinue={(name, email) => {
          const cleanName = (name || email?.split("@")[0] || "Пользователь").trim().slice(0, 60);
          const cleanEmail = (email || "").trim();
          window.localStorage.setItem("igseek:guest_account", JSON.stringify({ name: cleanName, email: cleanEmail, at: Date.now() }));
          window.location.href = safeNext;
        }}
      />
    </div>
  );
}
