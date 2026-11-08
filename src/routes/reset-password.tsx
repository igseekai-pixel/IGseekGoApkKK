import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { firebaseClient as supabase } from "@/lib/firebase-service";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: () => ({
    meta: [
      { title: "Reset password — IGseek" },
      { name: "description", content: "Reset your IGseek account password." },
    ],
  }),
});

function ResetPassword() {
  const t = useT();
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setErr(error.message);
    else {
      setDone(true);
      setTimeout(() => nav({ to: "/" }), 1500);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="glass-card w-full max-w-sm rounded-2xl border border-white/15 bg-surface/90 p-6 shadow-2xl backdrop-blur-2xl">
        <h1 className="text-lg font-semibold">{t("New password")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ready ? t("Enter a new password for your account.") : t("Verifying recovery link…")}
        </p>
        {done ? (
          <div className="mt-4 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand">
            {t("Password updated. Redirecting…")}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <input
              type="password"
              required
              minLength={6}
              disabled={!ready}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("New password")}
              className="glass-card rounded-xl border border-white/10 bg-surface-elevated/60 px-4 py-3 text-sm focus:outline-none focus:border-brand/60"
            />
            {err && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-rose-300">
                {err}
              </div>
            )}
            <button
              type="submit"
              disabled={!ready || loading}
              className="glass-button-brand rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? t("Saving…") : t("Save")}
            </button>
            <Link to="/" className="glass-button rounded-xl py-2 text-center text-xs text-muted-foreground hover:text-foreground">
              {t("Cancel")}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
