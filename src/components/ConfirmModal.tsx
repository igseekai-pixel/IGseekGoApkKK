import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";

export type ConfirmDialogConfig = {
  title: string;
  description?: string;
  itemLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => Promise<void> | void;
};

export function ConfirmModal({
  config,
  onClose,
}: {
  config: ConfirmDialogConfig | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!config) {
      setBusy(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [config, busy, onClose]);

  if (typeof document === "undefined") return null;

  const isDanger = (config?.variant ?? "danger") === "danger";
  const isWarning = config?.variant === "warning";

  const handleConfirm = async () => {
    if (!config || busy) return;
    setBusy(true);
    try {
      await config.onConfirm();
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {config && (
        <motion.div
          key="igseek-confirm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={() => {
            if (!busy) onClose();
          }}
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
        >
          <motion.div
            key="igseek-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="igseek-confirm-title"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-[400px] rounded-t-3xl sm:rounded-2xl border border-zinc-200 dark:border-white/15 bg-white dark:bg-[#141417] text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden"
          >
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
              <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            </div>

            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-3.5">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                    isDanger
                      ? "bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400"
                      : isWarning
                        ? "bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400"
                        : "bg-zinc-100 dark:bg-white/10 border-zinc-200 dark:border-white/15 text-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  {isDanger ? <Trash2 className="h-4.5 w-4.5" /> : <AlertTriangle className="h-4.5 w-4.5" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      id="igseek-confirm-title"
                      className="text-[15px] font-semibold leading-snug text-zinc-900 dark:text-white"
                    >
                      {config.title}
                    </h3>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onClose}
                      className="-mt-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {config.itemLabel && (
                    <div className="mt-2 rounded-xl border border-zinc-200/80 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {config.itemLabel}
                    </div>
                  )}

                  {config.description && (
                    <p className="mt-2.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {config.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                  className="inline-flex min-h-[44px] sm:min-h-[38px] items-center justify-center rounded-xl border border-zinc-200 dark:border-white/15 bg-zinc-100/80 hover:bg-zinc-200/80 dark:bg-white/[0.06] dark:hover:bg-white/[0.11] px-4 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {config.cancelLabel || "Cancel"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleConfirm()}
                  className={`inline-flex min-h-[44px] sm:min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                    isDanger
                      ? "bg-red-600 hover:bg-red-500 active:bg-red-700"
                      : isWarning
                        ? "bg-amber-600 hover:bg-amber-500"
                        : "bg-zinc-900 dark:bg-[var(--brand)] hover:opacity-90"
                  }`}
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{config.confirmLabel || "Delete"}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
