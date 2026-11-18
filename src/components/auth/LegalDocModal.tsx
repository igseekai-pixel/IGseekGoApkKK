import { useEffect, useState } from "react";
import { Loader2, X, ExternalLink, FileText } from "lucide-react";
import { isEmbeddedWebView } from "@/lib/firebase-service";
import { useT } from "@/lib/i18n";

export type LegalDocType = "terms" | "privacy" | "ai";

interface LegalDocModalProps {
  docType: LegalDocType | null;
  fallbackTitle: string;
  externalUrl: string;
  onClose: () => void;
}

export function LegalDocModal({
  docType,
  fallbackTitle,
  externalUrl,
  onClose,
}: LegalDocModalProps) {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(fallbackTitle);
  const [body, setBody] = useState("");
  const inWebView = isEmbeddedWebView();

  useEffect(() => {
    if (!docType) return;
    let cancelled = false;
    setLoading(true);
    setTitle(fallbackTitle);
    setBody("");

    fetch(`/api/legal?type=${encodeURIComponent(docType)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancelled) return;
        if (data?.title) setTitle(String(data.title));
        if (data?.body) setBody(String(data.body));
      })
      .catch(() => {
        if (cancelled) return;
        setBody(
          docType === "privacy"
            ? "IGseek уважает конфиденциальность пользователей. Данные аккаунта используются исключительно для работы сервиса и авторизации."
            : "Используя IGseek, вы соглашаетесь соблюдать правила платформы и использовать сервис ответственно.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [docType, fallbackTitle]);

  if (!docType) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-surface text-left text-foreground shadow-2xl dark:border-white/15 dark:bg-[#141416]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 dark:border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-[var(--brand)]" />
            <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--brand)]" />
              <span>{t("Loading document...")}</span>
            </div>
          ) : (
            body
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 dark:border-white/10">
          {!inWebView && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>{t("Open")}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[var(--brand)] px-4 py-1.5 text-xs font-semibold text-white hover:brightness-110 transition-all"
          >
            {t("Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
