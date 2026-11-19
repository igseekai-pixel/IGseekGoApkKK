import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Eye, Maximize2, Pencil, Save, X } from "lucide-react";
import { useT } from "@/lib/i18n";

export function stripAttachmentsForLineCount(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(/<!--IGFILE:[\s\S]*?<!--\/IGFILE-->/g, "")
    .replace(/!\[[^\]]*\]\(data:[^)]+\)/g, "")
    .replace(/data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/gi, "")
    .trim();
}

export function countTextLines(
  text: string | undefined | null,
  charsPerLine = 65
): number {
  const cleaned = stripAttachmentsForLineCount(text);
  if (!cleaned) return 0;
  const rawLines = cleaned.split(/\r?\n/);
  let visualLines = 0;
  for (const line of rawLines) {
    visualLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }
  return Math.max(rawLines.length, visualLines);
}

export function isLongTextOverLimit(
  text: string | undefined | null,
  maxLines = 5,
  charsPerLine = 65
): boolean {
  return countTextLines(text, charsPerLine) > maxLines;
}

export function LongTextButton({
  onClick,
  linesCount,
  label,
  variant = "default",
  className = "",
}: {
  onClick: () => void;
  linesCount?: number;
  label?: string;
  variant?: "default" | "user-bubble" | "terminal" | "compact";
  className?: string;
}) {
  const t = useT();
  const displayLabel = label ?? t("Full text");
  const styles =
    variant === "user-bubble"
      ? "border-zinc-300 dark:border-white/20 bg-zinc-100 hover:bg-zinc-200 dark:bg-white/10 dark:hover:bg-white/20 text-zinc-800 dark:text-zinc-100"
      : variant === "terminal"
      ? "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
      : "border-zinc-200 dark:border-white/15 bg-white/90 hover:bg-zinc-100 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-200";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer shadow-xs shrink-0 ${styles} ${className}`}
      title={displayLabel}
    >
      <Maximize2 className="h-3 w-3 shrink-0" />
      <span>{displayLabel}</span>
      {typeof linesCount === "number" && linesCount > 0 && (
        <span className="opacity-65 font-mono text-[10px]">({linesCount} {t("lines")})</span>
      )}
    </button>
  );
}

export function LongTextModal({
  isOpen,
  title,
  subtitle,
  initialText,
  onClose,
  onSave,
  onSaveAndRegenerate,
  readOnly = false,
  monospace = false,
}: {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  initialText: string;
  onClose: () => void;
  onSave?: (nextText: string) => void;
  onSaveAndRegenerate?: (nextText: string) => void;
  readOnly?: boolean;
  monospace?: boolean;
}) {
  const t = useT();
  const [draft, setDraft] = useState(initialText);
  const [mode, setMode] = useState<"edit" | "view">(readOnly ? "view" : "edit");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(initialText);
      setMode(readOnly ? "view" : "edit");
      setCopied(false);
    }
  }, [isOpen, initialText, readOnly]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !readOnly && onSave) {
        e.preventDefault();
        onSave(draft);
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, draft, readOnly, onSave, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const lineCount = countTextLines(draft);
  const explicitLines = draft ? draft.split(/\r?\n/).length : 0;
  const charCount = draft.length;
  const hasChanges = draft !== initialText;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3 sm:p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/15 bg-white dark:bg-[#141416] text-zinc-900 dark:text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-white/10 px-4 sm:px-6 py-3.5 bg-zinc-50/80 dark:bg-white/[0.02]">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base font-bold truncate">{title}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
              {subtitle && <span className="truncate max-w-[200px] sm:max-w-xs">{subtitle}</span>}
              {subtitle && <span>•</span>}
              <span>{t("Lines:")} {explicitLines} ({t("vis. ~")}{lineCount})</span>
              <span>•</span>
              <span>{t("Chars:")} {charCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!readOnly && (
              <div className="flex items-center rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMode("view")}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                    mode === "view"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>{t("Preview")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                    mode === "edit"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>{t("Edit")}</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white transition-colors cursor-pointer"
              title={t("Close (Esc)")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden p-4 sm:p-6 flex flex-col">
          {mode === "view" || readOnly ? (
            <div
              className={`flex-1 min-h-[45vh] max-h-[65vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/70 p-4 text-[13.5px] sm:text-[14.5px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] select-text ${
                monospace ? "font-mono text-[12.5px]" : "font-sans"
              }`}
            >
              {draft || <span className="text-zinc-400 italic">{t("No text")}</span>}
            </div>
          ) : (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("Type or edit text…")}
              className={`flex-1 min-h-[45vh] sm:min-h-[55vh] w-full resize-none rounded-2xl border border-zinc-300 dark:border-white/15 bg-zinc-50 dark:bg-zinc-950/80 p-4 text-[13.5px] sm:text-[14.5px] leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-zinc-500 dark:focus:border-[var(--brand)] focus:outline-none ${
                monospace ? "font-mono text-[12.5px]" : "font-sans"
              }`}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 dark:border-white/10 px-4 sm:px-6 py-3.5 bg-zinc-50/80 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? t("Copied") : t("Copy")}</span>
            </button>
            {hasChanges && !readOnly && (
              <button
                type="button"
                onClick={() => setDraft(initialText)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                {t("Reset")}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
            >
              {readOnly ? t("Close") : t("Cancel")}
            </button>

            {!readOnly && onSaveAndRegenerate && (
              <button
                type="button"
                disabled={!draft.trim()}
                onClick={() => {
                  onSaveAndRegenerate(draft);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-[var(--brand-border)] bg-zinc-100 dark:bg-[var(--brand-soft)] hover:bg-zinc-200 dark:hover:brightness-110 px-3.5 py-2 text-xs font-semibold text-zinc-900 dark:text-[var(--brand)] transition-all disabled:opacity-40 cursor-pointer"
              >
                <span>{t("Save & regenerate")}</span>
              </button>
            )}

            {!readOnly && onSave && (
              <button
                type="button"
                onClick={() => {
                  onSave(draft);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-black dark:bg-[var(--brand)] hover:bg-zinc-800 dark:hover:brightness-110 px-4 py-2 text-xs font-semibold text-white shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{t("Save")}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
