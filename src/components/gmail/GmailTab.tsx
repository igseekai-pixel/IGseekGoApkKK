import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mail,
  Send,
  Inbox,
  Trash2,
  Search,
  RefreshCw,
  Plus,
  X,
  Sparkles,
  AlertCircle,
  FileText,
  Clock,
  User,
  ArrowRight,
  Reply,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import {
  GmailMessageSummary,
  getCachedGmailToken,
  connectGmail,
  disconnectGmail,
  listGmailMessages,
  getGmailMessage,
  sendGmailMessage,
  trashGmailMessage,
  getLocalEmails,
  saveLocalEmail,
  deleteLocalEmail,
} from '@/lib/gmail';

interface GmailTabProps {
  onAskAiAboutEmail?: (subject: string, body?: string) => void;
  onNavigateToChat?: () => void;
}

export function GmailTab({ onAskAiAboutEmail, onNavigateToChat }: GmailTabProps) {
  const [isConnected, setIsConnected] = useState<boolean>(!!getCachedGmailToken());
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<'INBOX' | 'SENT' | 'TRASH'>('INBOX');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected email detail view
  const [viewingEmail, setViewingEmail] = useState<GmailMessageSummary | null>(null);

  // Compose email modal
  const [isComposing, setIsComposing] = useState<boolean>(false);
  const [to, setTo] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);

  // Explicit confirmation modals (MANDATORY for Workspace destructive/mutating actions)
  const [confirmSending, setConfirmSending] = useState<boolean>(false);
  const [trashingEmail, setTrashingEmail] = useState<GmailMessageSummary | null>(null);

  // Sync token state
  useEffect(() => {
    const handleAuthChange = (e: CustomEvent) => {
      setIsConnected(e.detail?.connected ?? false);
    };
    window.addEventListener('igseek:gmail-auth-changed' as any, handleAuthChange);
    return () => window.removeEventListener('igseek:gmail-auth-changed' as any, handleAuthChange);
  }, []);

  // Listen to local email updates
  useEffect(() => {
    const handleLocalUpdate = () => {
      if (!isConnected) {
        setMessages(getLocalEmails());
      }
    };
    window.addEventListener('igseek:local-emails-updated', handleLocalUpdate);
    return () => window.removeEventListener('igseek:local-emails-updated', handleLocalUpdate);
  }, [isConnected]);

  // Load emails
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getCachedGmailToken();
      if (token) {
        setIsConnected(true);
        let q = '';
        if (selectedFolder === 'SENT') q = 'in:sent';
        if (selectedFolder === 'TRASH') q = 'in:trash';
        if (selectedFolder === 'INBOX') q = 'in:inbox';

        const remote = await listGmailMessages({ q, maxResults: 20 });
        setMessages(remote);
      } else {
        setIsConnected(false);
        setMessages(getLocalEmails());
      }
    } catch (err: any) {
      console.error('Failed to load Gmail messages:', err);
      setError(err?.message || 'Не удалось загрузить почту');
      setMessages(getLocalEmails());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedFolder]);

  const handleConnect = async () => {
    try {
      setError(null);
      const res = await connectGmail();
      if (res?.accessToken) {
        setIsConnected(true);
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка подключения к Gmail');
    }
  };

  const handleDisconnect = () => {
    disconnectGmail();
    setIsConnected(false);
    setMessages(getLocalEmails());
  };

  const handleSendEmail = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    setSending(true);
    setError(null);

    try {
      if (isConnected) {
        await sendGmailMessage({
          to: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
        });
      } else {
        saveLocalEmail({
          to: to.trim(),
          from: 'Вы (Локально)',
          subject: subject.trim(),
          body: body.trim(),
          snippet: body.trim().slice(0, 100),
          date: new Date().toISOString(),
          labelIds: ['SENT'],
        });
      }

      setTo('');
      setSubject('');
      setBody('');
      setConfirmSending(false);
      setIsComposing(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Не удалось отправить письмо');
    } finally {
      setSending(false);
    }
  };

  const handleConfirmTrash = async () => {
    if (!trashingEmail) return;

    try {
      if (isConnected && !trashingEmail.isLocal) {
        await trashGmailMessage(trashingEmail.id);
      } else {
        deleteLocalEmail(trashingEmail.id);
      }

      setMessages((prev) => prev.filter((m) => m.id !== trashingEmail.id));
      if (viewingEmail?.id === trashingEmail.id) {
        setViewingEmail(null);
      }
      setTrashingEmail(null);
    } catch (err: any) {
      setError(err?.message || 'Не удалось переместить письмо в корзину');
    }
  };

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSubject = msg.subject?.toLowerCase().includes(q);
        const matchesFrom = msg.from?.toLowerCase().includes(q);
        const matchesBody = msg.body?.toLowerCase().includes(q);
        if (!matchesSubject && !matchesFrom && !matchesBody) return false;
      }
      return true;
    });
  }, [messages, searchQuery]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border border-border bg-surface/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand border border-brand/20">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Почта (Gmail)</h1>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {isConnected ? 'Gmail подключен' : 'Локальный режим'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Читайте, отправляйте и анализируйте электронную почту с помощью нейросети IGseek
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              className="glass-button-brand group relative flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white w-full sm:w-auto"
            >
              <Mail className="h-4 w-4" />
              <span>Подключить Gmail</span>
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="glass-button rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40"
            >
              Отключить
            </button>
          )}

          <button
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            title="Обновить почту"
            className="glass-button flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-xs text-brand">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="glass-button p-1 rounded-md hover:opacity-80">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Mail Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Compose Button */}
        <button
          onClick={() => setIsComposing(true)}
          className="glass-button-brand inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          <span>Написать письмо</span>
        </button>

        {/* Folder Selectors */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'INBOX', label: 'Входящие', icon: Inbox },
            { id: 'SENT', label: 'Отправленные', icon: Send },
            { id: 'TRASH', label: 'Корзина', icon: Trash2 },
          ].map((f) => {
            const Icon = f.icon;
            const active = selectedFolder === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setSelectedFolder(f.id as any)}
                className={`glass-button inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium ${
                  active
                    ? 'border-brand/50 bg-brand/15 text-brand shadow-[0_0_15px_-3px_rgba(229,9,20,0.3)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск писем..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/40 transition-colors"
          />
        </div>
      </div>

      {/* Email List */}
      {loading ? (
        <div className="flex flex-col gap-2 py-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-surface/50 animate-pulse border border-border/40" />
          ))}
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl border border-border/50 bg-surface/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand mb-3">
            <Mail className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Писем не найдено</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            {searchQuery
              ? 'Измените параметры поиска'
              : 'В этой папке пока нет писем. Вы можете написать новое письмо с помощью нейросети.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setViewingEmail(msg)}
              className={`group flex flex-col gap-1.5 rounded-2xl border p-4 cursor-pointer transition-all ${
                msg.unread
                  ? 'border-brand/40 bg-surface/90 hover:border-brand'
                  : 'border-border/80 bg-surface hover:border-brand/40'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand text-xs font-semibold">
                    {(msg.from || 'U')[0].toUpperCase()}
                  </div>
                  <div className="truncate text-xs font-semibold text-foreground">{msg.from}</div>
                </div>

                <div className="text-[11px] text-muted-foreground shrink-0">
                  {new Date(msg.date || Date.now()).toLocaleDateString([], {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>

              <div className="text-sm font-medium text-foreground truncate">{msg.subject}</div>
              <p className="text-xs text-muted-foreground truncate leading-relaxed">{msg.snippet}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* View Email Detail Modal */}
      <AnimatePresence>
        {viewingEmail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-2xl max-h-[85vh] rounded-2xl border border-white/15 bg-surface-elevated/90 p-6 shadow-2xl flex flex-col gap-4 overflow-hidden backdrop-blur-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-base font-bold text-foreground">{viewingEmail.subject}</h2>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                    <span>От: <strong className="text-foreground">{viewingEmail.from}</strong></span>
                    <span>•</span>
                    <span>{new Date(viewingEmail.date || Date.now()).toLocaleString()}</span>
                  </div>
                </div>

                <button onClick={() => setViewingEmail(null)} className="glass-button flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="glass-card flex-1 overflow-y-auto pr-1 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap bg-background/50 p-4 rounded-xl border border-white/10">
                {viewingEmail.body || viewingEmail.snippet}
              </div>

              {/* Email Footer Actions */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2">
                  {onAskAiAboutEmail && (
                    <button
                      onClick={() => {
                        const subj = viewingEmail.subject || '';
                        const body = viewingEmail.body || viewingEmail.snippet || '';
                        setViewingEmail(null);
                        onAskAiAboutEmail(subj, body);
                      }}
                      className="glass-button inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-brand hover:border-brand/40"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Спросить AI об этом письме</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setTo(viewingEmail.from || '');
                      setSubject(`Re: ${viewingEmail.subject || ''}`);
                      setViewingEmail(null);
                      setIsComposing(true);
                    }}
                    className="glass-button inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Reply className="h-3.5 w-3.5" />
                    <span>Ответить</span>
                  </button>
                </div>

                <button
                  onClick={() => setTrashingEmail(viewingEmail)}
                  className="glass-button inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Удалить</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Compose Email Modal */}
      <AnimatePresence>
        {isComposing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-lg rounded-2xl border border-white/15 bg-surface-elevated/90 p-5 shadow-2xl flex flex-col gap-4 backdrop-blur-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4 text-brand" /> Новое письмо
                </h3>
                <button onClick={() => setIsComposing(false)} className="glass-button flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                    Получатель (To)
                  </label>
                  <input
                    type="email"
                    placeholder="example@domain.com"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                    Тема
                  </label>
                  <input
                    type="text"
                    placeholder="Заголовок письма..."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                    Текст письма
                  </label>
                  <textarea
                    placeholder="Напишите текст или попросите AI сформулировать..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={6}
                    className="glass-card w-full resize-none rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60 leading-relaxed"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  onClick={() => setIsComposing(false)}
                  className="glass-button rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Отмена
                </button>
                <button
                  onClick={() => setConfirmSending(true)}
                  disabled={!to.trim() || !subject.trim() || !body.trim()}
                  className="glass-button-brand rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Отправить</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Send Email Modal (MANDATORY per Workspace guidelines) */}
      <AnimatePresence>
        {confirmSending && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-md rounded-2xl border border-brand/40 bg-surface-elevated/90 p-5 shadow-2xl flex flex-col gap-4 backdrop-blur-2xl"
            >
              <div className="flex items-center gap-3 text-brand">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Отправить письмо?</h3>
                  <p className="text-xs text-muted-foreground">Письмо будет отправлено адресату.</p>
                </div>
              </div>

              <div className="glass-card text-xs text-foreground/90 bg-background/50 p-3 rounded-xl border border-white/10 flex flex-col gap-1">
                <div><strong>Кому:</strong> {to}</div>
                <div><strong>Тема:</strong> {subject}</div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setConfirmSending(false)}
                  className="glass-button rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={sending}
                  className="glass-button-brand rounded-xl px-4 py-2 text-xs font-semibold text-white"
                >
                  {sending ? 'Отправка...' : 'Да, отправить'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Trash Email Modal (MANDATORY per Workspace guidelines) */}
      <AnimatePresence>
        {trashingEmail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-md rounded-2xl border border-rose-500/40 bg-surface-elevated/90 p-5 shadow-2xl flex flex-col gap-4 backdrop-blur-2xl"
            >
              <div className="flex items-center gap-3 text-brand">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Переместить письмо в корзину?</h3>
                  <p className="text-xs text-muted-foreground">Вы сможете восстановить его из корзины в Gmail.</p>
                </div>
              </div>

              <p className="glass-card text-xs text-foreground/90 bg-background/50 p-3 rounded-xl border border-white/10">
                «<span className="font-medium">{trashingEmail.subject}</span>»
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setTrashingEmail(null)}
                  className="glass-button rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Отмена
                </button>
                <button
                  onClick={handleConfirmTrash}
                  className="glass-button-brand rounded-xl !bg-rose-600 px-4 py-2 text-xs font-semibold text-white"
                >
                  Переместить
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
