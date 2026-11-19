import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Check, Code2, FileText, Image as ImageIcon, Loader2, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  addFileToUnifiedLibrary,
  fetchUnifiedLibraryItems,
  toBase64DataUrlFromItem,
  type UnifiedLibraryItem,
} from "@/lib/unified-library";

export function LibraryPickerModal({
  open,
  onClose,
  onSelect,
  userId,
  chats,
  projects,
  t = (s: string) => s,
  actionLabel,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (item: UnifiedLibraryItem & { resolvedDataUrl?: string }) => void;
  userId?: string | null;
  chats?: Array<{ id: string; title: string }>;
  projects?: Array<{ id: string; name: string }>;
  t?: (k: string) => string;
  actionLabel?: string;
}) {
  const [items, setItems] = useState<UnifiedLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | "doc" | "artifact" | "image">("all");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await fetchUnifiedLibraryItems({ userId, chats, projects });
      setItems(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void reload();
    const onUpdated = () => void reload();
    window.addEventListener("igseek:library-updated", onUpdated);
    return () => window.removeEventListener("igseek:library-updated", onUpdated);
  }, [open, userId]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const q = query.trim().toLowerCase();
      const matchQ =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.chatTitle.toLowerCase().includes(q) ||
        (item.content && item.content.toLowerCase().includes(q));
      const matchC = category === "all" || item.type === category;
      return matchQ && matchC;
    });
  }, [items, query, category]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const added = await addFileToUnifiedLibrary(file, { taskTitle: t("Library") });
      toast.success(`${t("Added to Library:")} ${file.name}`);
      await reload();
      const resolvedDataUrl = toBase64DataUrlFromItem(added);
      onSelect({ ...added, resolvedDataUrl });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || t("Failed to upload file to Library"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 8, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[80vh] max-h-[640px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/15 bg-white dark:bg-[#141416] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 dark:bg-[var(--brand-soft)] text-zinc-900 dark:text-[var(--brand)] border border-zinc-200 dark:border-[var(--brand-border)]">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight">
                    {t("Library")}
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {t("Select a file, report, artifact, or image from your Library")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={uploadInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleUpload}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => uploadInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-white/15 bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  <span>{t("Upload")}</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="border-b border-zinc-200 dark:border-white/10 p-3 space-y-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("Search Library files…")}
                  className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-[var(--brand-border)]"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {[
                  { id: "all", label: t("All") },
                  { id: "doc", label: t("Documents") },
                  { id: "artifact", label: t("Code & Data") },
                  { id: "image", label: t("Images") },
                ].map((tabItem) => (
                  <button
                    key={tabItem.id}
                    type="button"
                    onClick={() => setCategory(tabItem.id as any)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                      category === tabItem.id
                        ? "bg-zinc-900 text-white dark:bg-[var(--brand)]"
                        : "bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    {tabItem.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-xs text-zinc-500 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t("Loading Library…")}</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 dark:border-white/10 p-8 text-center">
                  <BookOpen className="mx-auto h-7 w-7 text-zinc-400 mb-2" />
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    {t("No files found in Library")}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {t("Upload a file above or create files in Chat / Flow / Engine.")}
                  </p>
                </div>
              ) : (
                filtered.map((item) => {
                  const Icon =
                    item.type === "image" ? ImageIcon : item.type === "artifact" ? Code2 : FileText;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const resolvedDataUrl = toBase64DataUrlFromItem(item);
                        onSelect({ ...item, resolvedDataUrl });
                        onClose();
                      }}
                      className="group w-full flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/70 dark:bg-white/[0.03] hover:border-zinc-400 dark:hover:border-[var(--brand-border)] hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] p-2.5 text-left transition-all cursor-pointer"
                    >
                      {item.type === "image" && item.dataUrl ? (
                        <img
                          src={item.dataUrl}
                          alt={item.name}
                          className="h-10 w-10 shrink-0 rounded-lg object-cover border border-zinc-200 dark:border-white/10"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-200/70 dark:bg-white/10 text-zinc-700 dark:text-zinc-300">
                          <Icon className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
                            {item.name}
                          </span>
                          <span className="shrink-0 rounded bg-zinc-200/80 dark:bg-white/10 px-1.5 py-0.5 text-[9px] uppercase font-medium text-zinc-600 dark:text-zinc-400">
                            {item.source}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                          {item.snippet || item.chatTitle}
                        </div>
                      </div>
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-zinc-900 dark:bg-[var(--brand)] px-2.5 py-1 text-[11px] font-medium text-white opacity-90 group-hover:opacity-100">
                        <Check className="h-3 w-3" />
                        <span>{actionLabel || t("Select")}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
