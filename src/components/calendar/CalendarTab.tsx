import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Search,
  ExternalLink,
  Trash2,
  Edit2,
  RefreshCw,
  Bell,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Loader2,
  Check,
  CalendarDays,
  CalendarRange,
  ListTodo,
} from 'lucide-react';
import {
  getCachedCalendarToken,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getLocalReminders,
  saveLocalReminder,
  deleteLocalReminder,
  type CalendarEvent,
} from '@/lib/google-calendar';

interface CalendarTabProps {
  onAskAiAboutEvent?: (eventSummary: string, eventTime?: string) => void;
  onNavigateToChat?: () => void;
}

export function CalendarTab({ onAskAiAboutEvent, onNavigateToChat }: CalendarTabProps) {
  const [connected, setConnected] = useState<boolean>(!!getCachedCalendarToken());
  const [loading, setLoading] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [filterView, setFilterView] = useState<'upcoming' | 'today' | 'week' | 'month' | 'local'>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<CalendarEvent | null>(null);

  // Form states
  const [formSummary, setFormSummary] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formStartDate, setFormStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formStartTime, setFormStartTime] = useState('12:00');
  const [formEndDate, setFormEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formEndTime, setFormEndTime] = useState('13:00');
  const [formReminderMins, setFormReminderMins] = useState<number>(15);
  const [saving, setSaving] = useState(false);

  // Listen for calendar auth changes & local reminders updates
  useEffect(() => {
    const handleAuthChange = (e: any) => {
      setConnected(!!e.detail?.connected);
    };
    const handleLocalUpdate = () => {
      void loadEvents();
    };

    window.addEventListener('igseek:calendar-auth-changed', handleAuthChange);
    window.addEventListener('igseek:local-reminders-updated', handleLocalUpdate);

    void loadEvents();

    return () => {
      window.removeEventListener('igseek:calendar-auth-changed', handleAuthChange);
      window.removeEventListener('igseek:local-reminders-updated', handleLocalUpdate);
    };
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getCachedCalendarToken();
      let googleEvents: CalendarEvent[] = [];

      if (token) {
        try {
          const now = new Date();
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          googleEvents = await listCalendarEvents({
            timeMin: thirtyDaysAgo,
            maxResults: 150,
          });
        } catch (err: any) {
          console.warn('Failed to fetch Google Calendar events:', err);
          if (err.message?.includes('expired') || err.message?.includes('401')) {
            setError('Сессия Google Календаря истекла. Пожалуйста, подключитесь снова.');
          } else {
            setError('Не удалось загрузить события из Google Календаря. Проверьте подключение.');
          }
        }
      }

      const localList = getLocalReminders().map((e) => ({ ...e, isReminder: true }));
      // Combine and deduplicate
      const combined = [...googleEvents, ...localList];
      setEvents(combined);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки событий');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await connectGoogleCalendar();
      if (res?.accessToken) {
        setConnected(true);
        await loadEvents();
      }
    } catch (err: any) {
      setError(err.message || 'Не удалось подключить Google Календарь');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnectGoogleCalendar();
    setConnected(false);
    void loadEvents();
  };

  const openCreateModal = (evtToEdit?: CalendarEvent) => {
    if (evtToEdit) {
      setEditingEvent(evtToEdit);
      setFormSummary(evtToEdit.summary || '');
      setFormDescription(evtToEdit.description || '');
      setFormLocation(evtToEdit.location || '');
      
      const startDt = evtToEdit.start.dateTime ? new Date(evtToEdit.start.dateTime) : new Date();
      setFormStartDate(startDt.toISOString().slice(0, 10));
      setFormStartTime(startDt.toTimeString().slice(0, 5));

      const endDt = evtToEdit.end.dateTime ? new Date(evtToEdit.end.dateTime) : new Date(startDt.getTime() + 3600000);
      setFormEndDate(endDt.toISOString().slice(0, 10));
      setFormEndTime(endDt.toTimeString().slice(0, 5));

      const firstRem = evtToEdit.reminders?.overrides?.[0]?.minutes;
      setFormReminderMins(firstRem ?? 15);
    } else {
      setEditingEvent(null);
      setFormSummary('');
      setFormDescription('');
      setFormLocation('');
      
      const now = new Date();
      const inOneHour = new Date(now.getTime() + 3600000);
      setFormStartDate(now.toISOString().slice(0, 10));
      setFormStartTime(now.toTimeString().slice(0, 5));
      setFormEndDate(inOneHour.toISOString().slice(0, 10));
      setFormEndTime(inOneHour.toTimeString().slice(0, 5));
      setFormReminderMins(15);
    }
    setCreateModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSummary.trim()) return;

    setSaving(true);
    setError(null);

    const startISO = new Date(`${formStartDate}T${formStartTime}:00`).toISOString();
    const endISO = new Date(`${formEndDate}T${formEndTime}:00`).toISOString();

    try {
      const token = getCachedCalendarToken();

      if (editingEvent) {
        if (!editingEvent.isReminder && token && !editingEvent.id.startsWith('local_')) {
          // Update in Google Calendar
          await updateCalendarEvent(editingEvent.id, {
            summary: formSummary.trim(),
            description: formDescription.trim(),
            location: formLocation.trim(),
            start: { dateTime: startISO },
            end: { dateTime: endISO },
            reminderMinutes: [formReminderMins],
          });
        } else {
          // Update local
          saveLocalReminder({
            id: editingEvent.id,
            summary: formSummary.trim(),
            description: formDescription.trim(),
            location: formLocation.trim(),
            start: { dateTime: startISO },
            end: { dateTime: endISO },
            reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: formReminderMins }] },
          });
        }
      } else {
        if (token) {
          // Create in Google Calendar
          await createCalendarEvent({
            summary: formSummary.trim(),
            description: formDescription.trim(),
            location: formLocation.trim(),
            start: { dateTime: startISO },
            end: { dateTime: endISO },
            reminderMinutes: [formReminderMins],
          });
        } else {
          // Create locally
          saveLocalReminder({
            summary: formSummary.trim(),
            description: formDescription.trim(),
            location: formLocation.trim(),
            start: { dateTime: startISO },
            end: { dateTime: endISO },
            reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: formReminderMins }] },
          });
        }
      }

      setCreateModalOpen(false);
      await loadEvents();
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения события');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingEvent) return;
    setLoading(true);
    try {
      if (deletingEvent.isReminder || deletingEvent.id.startsWith('local_')) {
        deleteLocalReminder(deletingEvent.id);
      } else {
        await deleteCalendarEvent(deletingEvent.id);
      }
      setDeletingEvent(null);
      await loadEvents();
    } catch (err: any) {
      setError(err.message || 'Не удалось удалить событие');
    } finally {
      setLoading(false);
    }
  };

  // Filter events logic
  const filteredEvents = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return events
      .filter((evt) => {
        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchSum = evt.summary.toLowerCase().includes(q);
          const matchDesc = evt.description?.toLowerCase().includes(q);
          const matchLoc = evt.location?.toLowerCase().includes(q);
          if (!matchSum && !matchDesc && !matchLoc) return false;
        }

        const startStr = evt.start.dateTime || evt.start.date || '';
        const evtDate = new Date(startStr);

        if (filterView === 'today') {
          return startStr.startsWith(todayStr);
        }
        if (filterView === 'week') {
          return evtDate >= now && evtDate <= weekAhead;
        }
        if (filterView === 'month') {
          return evtDate >= now && evtDate <= monthAhead;
        }
        if (filterView === 'local') {
          return evt.isReminder || evt.id.startsWith('local_');
        }
        // Upcoming (default)
        return evtDate >= new Date(now.getTime() - 12 * 3600 * 1000);
      })
      .sort((a, b) => {
        const tA = new Date(a.start.dateTime || a.start.date || 0).getTime();
        const tB = new Date(b.start.dateTime || b.start.date || 0).getTime();
        return tA - tB;
      });
  }, [events, filterView, searchQuery]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Top Banner / Google Calendar Sync Control */}
      <div className="shrink-0 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 border border-brand/30 text-brand shadow-sm">
              <CalendarIcon className="h-5 w-5 text-brand" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Календарь и Напоминания
                </h2>
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Google Календарь подключен
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                    <AlertCircle className="h-3 w-3" />
                    Локальный режим
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Планируйте встречи, ставьте даты и работайте с событиями напрямую и через AI-агента.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!connected ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="glass-button inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm"
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                )}
                <span>Подключить Google Календарь</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDisconnect}
                className="glass-button rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40"
              >
                Отключить Google
              </button>
            )}

            <button
              type="button"
              onClick={() => openCreateModal()}
              className="glass-button-brand inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              <span>Создать событие</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar & Search */}
      <div className="shrink-0 border-b border-border bg-surface/60 px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {[
              { id: 'upcoming', label: 'Ближайшие', icon: Clock },
              { id: 'today', label: 'Сегодня', icon: CalendarDays },
              { id: 'week', label: 'Неделя', icon: CalendarRange },
              { id: 'month', label: 'Месяц', icon: CalendarIcon },
              { id: 'local', label: 'Напоминания', icon: Bell },
            ].map((f) => {
              const IconComp = f.icon;
              const active = filterView === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilterView(f.id as any)}
                  className={`glass-button inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    active
                      ? 'border-brand/50 bg-brand/15 text-brand shadow-[0_0_15px_-3px_rgba(229,9,20,0.3)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <IconComp className="h-3.5 w-3.5" />
                  <span>{f.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по событиям…"
                className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/60"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <button
              onClick={() => void loadEvents()}
              disabled={loading}
              title="Обновить календарь"
              className="glass-button p-2 rounded-xl text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Error notification banner if any */}
      {error && (
        <div className="shrink-0 border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="glass-button p-1 rounded-md text-rose-400 hover:text-rose-200">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Events List Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading && events.length === 0 ? (
          <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
            Загружаем события календаря…
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <div className="glass-card flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-surface-elevated/40 text-muted-foreground">
              <CalendarIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">Событий не найдено</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {searchQuery
                ? 'По вашему запросу ничего не найдено.'
                : 'У вас нет запланированных событий или напоминаний в этом периоде.'}
            </p>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="glass-button-brand mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              <span>Запланировать встречу или напоминание</span>
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-3">
            {filteredEvents.map((evt) => {
              const startDt = evt.start.dateTime
                ? new Date(evt.start.dateTime)
                : evt.start.date
                ? new Date(evt.start.date)
                : null;
              const endDt = evt.end.dateTime ? new Date(evt.end.dateTime) : null;

              const isAllDay = !evt.start.dateTime && !!evt.start.date;
              const dateFormatted = startDt
                ? startDt.toLocaleDateString('ru-RU', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Дата не указана';

              const timeFormatted = isAllDay
                ? 'Весь день'
                : startDt && endDt
                ? `${startDt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} – ${endDt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
                : startDt
                ? startDt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <motion.div
                  key={evt.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card group relative overflow-hidden rounded-2xl border border-white/10 bg-surface/70 p-4 transition-all hover:border-brand/40 shadow-xs backdrop-blur-xl"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl bg-brand/10 border border-brand/20 text-brand">
                        <span className="text-[10px] font-bold uppercase leading-none">
                          {startDt ? startDt.toLocaleDateString('ru-RU', { month: 'short' }).slice(0, 3) : 'Заметка'}
                        </span>
                        <span className="text-sm font-black leading-none mt-0.5">
                          {startDt ? startDt.getDate() : '•'}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-foreground truncate">{evt.summary}</h4>
                          {evt.isReminder && (
                            <span className="rounded-md border border-brand/30 bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                              Напоминание
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-brand" />
                            {dateFormatted} {timeFormatted && `· ${timeFormatted}`}
                          </span>
                          {evt.location && (
                            <span className="flex items-center gap-1 text-zinc-300">
                              <MapPin className="h-3 w-3 text-amber-400" />
                              {evt.location}
                            </span>
                          )}
                        </div>

                        {evt.description && (
                          <p className="mt-2 text-xs text-muted-foreground/90 line-clamp-2 leading-relaxed">
                            {evt.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0 border-t border-white/5 pt-2 sm:border-t-0 sm:pt-0">
                      {/* AI Chat button */}
                      {onAskAiAboutEvent && (
                        <button
                          type="button"
                          onClick={() => {
                            onAskAiAboutEvent(evt.summary, `${dateFormatted} ${timeFormatted}`);
                            onNavigateToChat?.();
                          }}
                          className="glass-button flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand hover:border-brand/50"
                          title="Обсудить это событие с AI"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">Спросить AI</span>
                        </button>
                      )}

                      {/* Google Calendar Link */}
                      {evt.htmlLink && (
                        <a
                          href={evt.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="glass-button flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                          title="Открыть в Google Календаре"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}

                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={() => openCreateModal(evt)}
                        className="glass-button rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                        title="Редактировать"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => setDeletingEvent(evt)}
                        className="glass-button rounded-lg p-1.5 text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                        title="Удалить"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Create / Edit Event */}
      <AnimatePresence>
        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="glass-card relative w-full max-w-lg rounded-2xl border border-white/15 bg-surface/90 p-6 shadow-2xl backdrop-blur-2xl"
            >
              <button
                onClick={() => setCreateModalOpen(false)}
                className="glass-button absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              <h3 className="text-lg font-semibold text-foreground">
                {editingEvent ? 'Редактировать событие' : 'Создать событие / напоминание'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {connected
                  ? 'Событие сохранится в вашем Google Календаре.'
                  : 'Событие сохранится в ваших локальных напоминаниях.'}
              </p>

              <form onSubmit={handleSaveEvent} className="mt-4 space-y-3.5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Название *</label>
                  <input
                    type="text"
                    required
                    value={formSummary}
                    onChange={(e) => setFormSummary(e.target.value)}
                    placeholder="Созвон по проекту / Встреча / Купить продукты"
                    className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3.5 py-2 text-sm text-foreground outline-none focus:border-brand/60"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Дата начала</label>
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={(e) => {
                        setFormStartDate(e.target.value);
                        if (e.target.value > formEndDate) setFormEndDate(e.target.value);
                      }}
                      className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Время начала</label>
                    <input
                      type="time"
                      required
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Дата окончания</label>
                    <input
                      type="date"
                      required
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Время окончания</label>
                    <input
                      type="time"
                      required
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Место / Ссылка на встречу</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="Google Meet / Офис / Переговорная #3"
                    className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3.5 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Напомнить за</label>
                  <select
                    value={formReminderMins}
                    onChange={(e) => setFormReminderMins(Number(e.target.value))}
                    className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                  >
                    <option value={0}>В момент начала</option>
                    <option value={10}>За 10 минут</option>
                    <option value={15}>За 15 минут</option>
                    <option value={30}>За 30 минут</option>
                    <option value={60}>За 1 час</option>
                    <option value={1440}>За 1 день</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Описание / Заметки</label>
                  <textarea
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Повестка встречи, списки или детали…"
                    className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3.5 py-2 text-xs text-foreground outline-none focus:border-brand/60 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="glass-button rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Отмена
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="glass-button-brand flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    <span>{editingEvent ? 'Сохранить изменения' : 'Создать событие'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal: Delete Event (MANDATORY per workspace-integration skill) */}
      <AnimatePresence>
        {deletingEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card relative w-full max-w-md rounded-2xl border border-rose-500/30 bg-surface/90 p-6 shadow-2xl backdrop-blur-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Удалить событие?</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Это действие нельзя будет отменить.</p>
                </div>
              </div>

              <div className="glass-card my-4 rounded-xl border border-white/10 bg-background/50 p-3 text-xs">
                <div className="font-semibold text-foreground">{deletingEvent.summary}</div>
                {deletingEvent.start.dateTime && (
                  <div className="text-muted-foreground mt-1">
                    {new Date(deletingEvent.start.dateTime).toLocaleString('ru-RU')}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingEvent(null)}
                  className="glass-button rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Отмена
                </button>

                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={loading}
                  className="glass-button-brand flex items-center gap-1.5 rounded-xl !bg-rose-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  <span>Да, удалить</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
