import { useEffect, useState } from "react";
import { Clock, ShieldAlert } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import {
  PROMPT_LIMITS,
  type PromptScope,
  formatRemainingReset,
} from "@/lib/prompt-limits";

export interface LimitCooldownPayload {
  scope: PromptScope;
  used?: number;
  limit?: number;
  resetAt: number;
}

export function LimitCooldownCard({
  scope,
  used,
  limit,
  resetAt,
  compact = false,
}: {
  scope: PromptScope;
  used?: number;
  limit?: number;
  resetAt: number;
  compact?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [resetAt]);

  const maxLimit = limit ?? PROMPT_LIMITS[scope];
  const currentUsed = used ?? maxLimit;
  const remainingText = formatRemainingReset(resetAt, lang, now);
  const isReady = resetAt > 0 && now >= resetAt;

  const scopeLabel =
    scope === "engine"
      ? t("Engine")
      : scope === "flow"
        ? t("Flow")
        : scope === "image"
          ? t("Photos")
          : t("Chat");

  const exhaustedLabel =
    scope === "image" ? t("Daily photo limit exhausted") : t("Prompt limit exhausted");

  const exhaustedDescription =
    scope === "image"
      ? t("You have used all 8 daily photo generations and edits. Limits renew automatically every 24 hours, and text chat remains unlimited.")
      : t("You have used all available prompts for this workspace. Free limits renew automatically every 12 hours.");

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="font-medium leading-snug">
            {isReady
              ? t("Limits have been refreshed. You can send again.")
              : `${exhaustedLabel} (${currentUsed}/${maxLimit}). ${t("Limits will reset in")} ${remainingText}.`}
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold">
          {currentUsed}/{maxLimit}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] dark:bg-amber-500/[0.09] p-4 text-left shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {scopeLabel} — {exhaustedLabel}
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {currentUsed}/{maxLimit}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
            {isReady
              ? t("Limits have been refreshed. You can send again.")
              : exhaustedDescription}
          </p>
          {!isReady && (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-white/70 dark:bg-black/25 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                {t("Limits will reset in")} <span className="font-mono">{remainingText}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
