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

import { localeFor, useLang, useT } from '@/lib/i18n';

interface CalendarTabProps {
  onAskAiAboutEvent?: (eventSummary: string, eventTime?: string) => void;
  onNavigateToChat?: () => void;
}

export function CalendarTab({ onAskAiAboutEvent, onNavigateToChat }: CalendarTabProps) {
  const t = useT();
  const lang = useLang();
  const dateLocale = localeFor(lang);
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
            setError(t('Google Calendar session expired. Please reconnect.'));
          } else {
            setError(t('Failed to load Google Calendar events. Check your connection.'));
          }
        }
      }

      const localList = getLocalReminders().map((e) => ({ ...e, isReminder: true }));
      // Combine and deduplicate
      const combined = [...googleEvents, ...localList];
      setEvents(combined);
    } catch (err: any) {
      setError(err.message || t('Error loading events'));
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
      setError(err.message || t('Failed to connect Google Calendar'));
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
      setError(err.message || t('Error saving event'));
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
      setError(err.message || t('Failed to delete event'));
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
                  {t('Calendar & Reminders')}
                </h2>
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {t('Google Calendar connected')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3 w-3" />
                    {t('Local mode')}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('Schedule meetings, set dates and manage events directly or via AI agent.')}
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
                <span>{t('Connect Google Calendar')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDisconnect}
                className="glass-button rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40"
              >
                {t('Disconnect Google')}
              </button>
            )}

            <button
              type="button"
              onClick={() => openCreateModal()}
              className="glass-button-brand inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              <span>{t('Create event')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar & Search */}
      <div className="shrink-0 border-b border-border bg-surface/60 px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {[
              { id: 'upcoming', label: t('Upcoming'), icon: Clock },
              { id: 'today', label: t('Today'), icon: CalendarDays },
              { id: 'week', label: t('Week'), icon: CalendarRange },
              { id: 'month', label: t('Month'), icon: CalendarIcon },
              { id: 'local', label: t('Reminders'), icon: Bell },
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
                placeholder={t('Search events…')}
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
              title={t('Refresh calendar')}
              className="glass-button p-2 rounded-xl text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Error notification banner if any */}
      {error && (
        <div className="shrink-0 border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-500 dark:text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="glass-button p-1 rounded-md text-rose-500 dark:text-rose-400 hover:opacity-80">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Events List Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading && events.length === 0 ? (
          <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
            {t('Loading calendar events…')}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <div className="glass-card flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-elevated/40 text-muted-foreground">
              <CalendarIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">{t('No events found')}</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {searchQuery
                ? t('No results match your search.')
                : t('You have no scheduled events or reminders in this period.')}
            </p>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="glass-button-brand mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              <span>{t('Schedule meeting or reminder')}</span>
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
                ? startDt.toLocaleDateString(dateLocale, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : t('No date specified');

              const timeFormatted = isAllDay
                ? t('All day')
                : startDt && endDt
                ? `${startDt.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })} – ${endDt.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}`
                : startDt
                ? startDt.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <motion.div
                  key={evt.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card group relative overflow-hidden rounded-2xl border border-border bg-surface/70 p-4 transition-all hover:border-brand/40 shadow-xs backdrop-blur-xl"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl bg-brand/10 border border-brand/20 text-brand">
                        <span className="text-[10px] font-bold uppercase leading-none">
                          {startDt ? startDt.toLocaleDateString(dateLocale, { month: 'short' }).slice(0, 3) : t('Note')}
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
                              {t('Reminder')}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-brand" />
                            {dateFormatted} {timeFormatted && `· ${timeFormatted}`}
                          </span>
                          {evt.location && (
                            <span className="flex items-center gap-1 text-foreground/80">
                              <MapPin className="h-3 w-3 text-amber-500" />
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

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0 border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0">
                      {/* AI Chat button */}
                      {onAskAiAboutEvent && (
                        <button
                          type="button"
                          onClick={() => {
                            onAskAiAboutEvent(evt.summary, `${dateFormatted} ${timeFormatted}`);
                            onNavigateToChat?.();
                          }}
                          className="glass-button flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand hover:border-brand/50"
                          title={t('Discuss this event with AI')}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">{t('Ask AI')}</span>
                        </button>
                      )}

                      {/* Google Calendar Link */}
                      {evt.htmlLink && (
                        <a
                          href={evt.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="glass-button flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                          title={t('Open in Google Calendar')}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}

                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={() => openCreateModal(evt)}
                        className="glass-button rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                        title={t('Edit')}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => setDeletingEvent(evt)}
                        className="glass-button rounded-lg p-1.5 text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                        title={t('Delete')}
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
                {editingEvent ? t('Edit event') : t('Create event / reminder')}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {connected
                  ? t('The event will be saved to your Google Calendar.')
                  : t('The event will be saved to your local reminders.')}
              </p>

              <form onSubmit={handleSaveEvent} className="mt-4 space-y-3.5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">{t('Title *')}</label>
                  <input
                    type="text"
                    required
                    value={formSummary}
                    onChange={(e) => setFormSummary(e.target.value)}
                    placeholder={t('Project call / Meeting / Buy groceries')}
                    className="glass-card w-full rounded-xl border border-border bg-background/60 px-3.5 py-2 text-sm text-foreground outline-none focus:border-brand/60"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">{t('Start date')}</label>
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={(e) => {
                        setFormStartDate(e.target.value);
                        if (e.target.value > formEndDate) setFormEndDate(e.target.value);
                      }}
                      className="glass-card w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">{t('Start time')}</label>
                    <input
                      type="time"
                      required
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="glass-card w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">{t('End date')}</label>
                    <input
                      type="date"
                      required
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="glass-card w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">{t('End time')}</label>
                    <input
                      type="time"
                      required
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="glass-card w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">{t('Location / Meeting link')}</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder={t('Google Meet / Office / Room #3')}
                    className="glass-card w-full rounded-xl border border-border bg-background/60 px-3.5 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">{t('Remind before')}</label>
                  <select
                    value={formReminderMins}
                    onChange={(e) => setFormReminderMins(Number(e.target.value))}
                    className="glass-card w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                  >
                    <option value={0}>{t('At start time')}</option>
                    <option value={10}>{t('10 minutes before')}</option>
                    <option value={15}>{t('15 minutes before')}</option>
                    <option value={30}>{t('30 minutes before')}</option>
                    <option value={60}>{t('1 hour before')}</option>
                    <option value={1440}>{t('1 day before')}</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">{t('Description / Notes')}</label>
                  <textarea
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder={t('Meeting agenda, lists or details…')}
                    className="glass-card w-full rounded-xl border border-border bg-background/60 px-3.5 py-2 text-xs text-foreground outline-none focus:border-brand/60 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="glass-button rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {t('Cancel')}
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
                    <span>{editingEvent ? t('Save changes') : t('Create event')}</span>
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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{t('Delete event?')}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('This action cannot be undone.')}</p>
                </div>
              </div>

              <div className="glass-card my-4 rounded-xl border border-border bg-background/50 p-3 text-xs">
                <div className="font-semibold text-foreground">{deletingEvent.summary}</div>
                {deletingEvent.start.dateTime && (
                  <div className="text-muted-foreground mt-1">
                    {new Date(deletingEvent.start.dateTime).toLocaleString(dateLocale)}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingEvent(null)}
                  className="glass-button rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {t('Cancel')}
                </button>

                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={loading}
                  className="glass-button-brand flex items-center gap-1.5 rounded-xl !bg-rose-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  <span>{t('Yes, delete')}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
