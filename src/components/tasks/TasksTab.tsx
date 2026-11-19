import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckSquare,
  Square,
  Plus,
  Search,
  Calendar as CalendarIcon,
  Clock,
  Trash2,
  Pencil,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  ListTodo,
  AlertCircle,
  X,
  ExternalLink,
  ChevronDown,
  Filter,
} from 'lucide-react';
import {
  GoogleTask,
  GoogleTaskList,
  getCachedTasksToken,
  connectGoogleTasks,
  disconnectGoogleTasks,
  listTaskLists,
  listGoogleTasks,
  createGoogleTask,
  updateGoogleTask,
  deleteGoogleTask,
  getLocalTasks,
  saveLocalTask,
  toggleLocalTaskStatus,
  deleteLocalTask,
} from '@/lib/google-tasks';

import { localeFor, useLang, useT } from '@/lib/i18n';

interface TasksTabProps {
  onAskAiAboutTask?: (taskTitle: string, taskNotes?: string) => void;
  onNavigateToChat?: () => void;
}

export function TasksTab({ onAskAiAboutTask, onNavigateToChat }: TasksTabProps) {
  const t = useT();
  const lang = useLang();
  const dateLocale = localeFor(lang);
  const [isConnected, setIsConnected] = useState<boolean>(!!getCachedTasksToken());
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [taskLists, setTaskLists] = useState<GoogleTaskList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('@default');
  const [tasks, setTasks] = useState<GoogleTask[]>([]);

  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'today'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');
  const [newDue, setNewDue] = useState<string>('');

  const [editingTask, setEditingTask] = useState<GoogleTask | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editDue, setEditDue] = useState<string>('');

  const [deletingTask, setDeletingTask] = useState<GoogleTask | null>(null);

  useEffect(() => {
    const handleAuthChange = (e: CustomEvent) => {
      setIsConnected(e.detail?.connected ?? false);
    };
    window.addEventListener('igseek:tasks-auth-changed' as any, handleAuthChange);
    return () => window.removeEventListener('igseek:tasks-auth-changed' as any, handleAuthChange);
  }, []);

  useEffect(() => {
    const handleLocalUpdate = () => {
      if (!isConnected) {
        setTasks(getLocalTasks());
      }
    };
    window.addEventListener('igseek:local-tasks-updated', handleLocalUpdate);
    return () => window.removeEventListener('igseek:local-tasks-updated', handleLocalUpdate);
  }, [isConnected]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getCachedTasksToken();
      if (token) {
        setIsConnected(true);
        try {
          const lists = await listTaskLists();
          setTaskLists(lists);
        } catch {
          setTaskLists([{ id: '@default', title: t('My tasks') }]);
        }
        const remoteTasks = await listGoogleTasks(selectedListId, true);
        setTasks(remoteTasks);
      } else {
        setIsConnected(false);
        setTasks(getLocalTasks());
      }
    } catch (err: any) {
      console.error('Failed to load tasks:', err);
      setError(err?.message || t('Failed to load tasks'));
      setTasks(getLocalTasks());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedListId]);

  const handleConnect = async () => {
    try {
      setError(null);
      const res = await connectGoogleTasks();
      if (res?.accessToken) {
        setIsConnected(true);
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || t('Google Tasks connection error'));
    }
  };

  const handleDisconnect = () => {
    disconnectGoogleTasks();
    setIsConnected(false);
    setTasks(getLocalTasks());
  };

  const handleToggleTask = async (task: GoogleTask) => {
    const nextStatus = task.status === 'completed' ? 'needsAction' : 'completed';
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

    try {
      if (isConnected && !task.isLocal) {
        await updateGoogleTask(task.id, { status: nextStatus }, selectedListId);
      } else {
        toggleLocalTaskStatus(task.id);
      }
    } catch (err: any) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
      setError(t('Failed to update task status'));
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const payload = {
      title: newTitle.trim(),
      notes: newNotes.trim() || undefined,
      due: newDue ? new Date(newDue).toISOString() : undefined,
      taskListId: selectedListId,
    };

    try {
      if (isConnected) {
        const created = await createGoogleTask(payload, selectedListId);
        setTasks((prev) => [created, ...prev]);
      } else {
        const local = saveLocalTask({
          title: payload.title,
          notes: payload.notes,
          due: payload.due,
          status: 'needsAction',
        });
        setTasks((prev) => [local, ...prev]);
      }

      setNewTitle('');
      setNewNotes('');
      setNewDue('');
      setIsAdding(false);
    } catch (err: any) {
      setError(err?.message || t('Failed to create task'));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingTask || !editTitle.trim()) return;

    const patch = {
      title: editTitle.trim(),
      notes: editNotes.trim() || undefined,
      due: editDue ? new Date(editDue).toISOString() : undefined,
    };

    try {
      if (isConnected && !editingTask.isLocal) {
        const updated = await updateGoogleTask(editingTask.id, patch, selectedListId);
        setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? updated : t)));
      } else {
        saveLocalTask({
          ...editingTask,
          ...patch,
        });
        setTasks((prev) =>
          prev.map((t) => (t.id === editingTask.id ? { ...t, ...patch } : t))
        );
      }
      setEditingTask(null);
    } catch (err: any) {
      setError(err?.message || t('Failed to save changes'));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTask) return;

    try {
      if (isConnected && !deletingTask.isLocal) {
        await deleteGoogleTask(deletingTask.id, selectedListId);
      } else {
        deleteLocalTask(deletingTask.id);
      }
      setTasks((prev) => prev.filter((t) => t.id !== deletingTask.id));
      setDeletingTask(null);
    } catch (err: any) {
      setError(err?.message || t('Failed to delete task'));
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(q);
        const matchesNotes = task.notes?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesNotes) return false;
      }

      if (filter === 'active') return task.status === 'needsAction';
      if (filter === 'completed') return task.status === 'completed';
      if (filter === 'today') {
        if (!task.due) return false;
        const due = new Date(task.due);
        const today = new Date();
        return (
          due.getDate() === today.getDate() &&
          due.getMonth() === today.getMonth() &&
          due.getFullYear() === today.getFullYear()
        );
      }

      return true;
    });
  }, [tasks, filter, searchQuery]);

  const activeCount = useMemo(
    () => tasks.filter((t) => t.status === 'needsAction').length,
    [tasks]
  );
  const completedCount = useMemo(
    () => tasks.filter((t) => t.status === 'completed').length,
    [tasks]
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border border-border bg-surface/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand border border-brand/20">
            <CheckSquare className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">{t('Tasks')}</h1>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {isConnected ? t('Google Tasks connected') : t('Local tasks')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('Manage your to-do lists and sync tasks with IGseek AI')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              className="glass-button-brand group relative flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white w-full sm:w-auto"
            >
              <CheckSquare className="h-4 w-4" />
              <span>{t('Connect Google Tasks')}</span>
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="glass-button rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40"
            >
              {t('Disconnect Google')}
            </button>
          )}

          <button
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            title={t('Refresh')}
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

      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {isConnected && taskLists.length > 0 && (
          <div className="relative shrink-0">
            <div className="glass-card flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium">
              <ListTodo className="h-4 w-4 text-brand" />
              <select
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                className="bg-transparent pr-6 text-foreground outline-none cursor-pointer"
              >
                {taskLists.map((list) => (
                  <option key={list.id} value={list.id} className="bg-surface text-foreground">
                    {list.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('Search tasks…')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-card w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/40 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: `${t('All')} (${tasks.length})` },
            { id: 'active', label: `${t('Active')} (${activeCount})` },
            { id: 'today', label: t('Today') },
            { id: 'completed', label: `${t('Completed')} (${completedCount})` },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`glass-button rounded-xl px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                filter === f.id
                  ? 'border-brand/50 bg-brand/15 text-brand shadow-[0_0_15px_-3px_rgba(229,9,20,0.3)]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!isAdding ? (
        <button
          onClick={() => setIsAdding(true)}
          className="glass-button flex items-center justify-center gap-2 rounded-2xl border-dashed p-3.5 text-xs font-semibold text-muted-foreground hover:border-brand/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4 text-brand" />
          <span>{t('Add new task')}</span>
        </button>
      ) : (
        <motion.form
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleCreateTask}
          className="glass-composer flex flex-col gap-3 rounded-2xl p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 text-brand" /> {t('New task')}
            </span>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="glass-button flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <input
            type="text"
            placeholder={t('Task title…')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
            className="glass-card w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50"
          />

          <textarea
            placeholder={t('Notes or description (optional)…')}
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            rows={2}
            className="glass-card w-full resize-none rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-brand" />
              <span>{t('Due date:')}</span>
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="glass-card rounded-lg border border-border bg-background/60 px-2 py-1 text-xs text-foreground outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="glass-button rounded-xl px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {t('Cancel')}
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="glass-button-brand rounded-xl px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {t('Create')}
              </button>
            </div>
          </div>
        </motion.form>
      )}

      {loading ? (
        <div className="flex flex-col gap-2 py-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-surface/50 animate-pulse border border-border/40" />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl border border-border/50 bg-surface/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand mb-3">
            <CheckSquare className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{t('No tasks found')}</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            {searchQuery
              ? t('Try changing your search query')
              : filter === 'completed'
              ? t('You have no completed tasks yet')
              : t('Create a task manually or ask IGseek AI in chat!')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredTasks.map((task) => {
            const isCompleted = task.status === 'completed';
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`group flex flex-col gap-2 rounded-2xl border p-4 transition-all ${
                  isCompleted
                    ? 'border-border/40 bg-surface/30 opacity-75'
                    : 'border-border/80 bg-surface hover:border-brand/40 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => handleToggleTask(task)}
                      className="mt-0.5 text-muted-foreground hover:text-brand transition-colors shrink-0"
                      title={isCompleted ? t('Mark as incomplete') : t('Mark as complete')}
                    >
                      {isCompleted ? (
                        <CheckSquare className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Square className="h-5 w-5 hover:text-brand" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm font-medium ${
                          isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'
                        }`}
                      >
                        {task.title}
                      </div>

                      {task.notes && (
                        <p className="text-xs text-muted-foreground/90 mt-1 whitespace-pre-wrap leading-relaxed">
                          {task.notes}
                        </p>
                      )}

                      {task.due && (
                        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
                          <CalendarIcon className="h-3 w-3 text-brand" />
                          <span>
                            {t('Due date:')} {new Date(task.due).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    {onAskAiAboutTask && (
                      <button
                        onClick={() => onAskAiAboutTask(task.title, task.notes)}
                        className="glass-button flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-brand hover:border-brand/40"
                        title={t('Ask AI for help with this task')}
                      >
                        <Sparkles className="h-3 w-3" />
                        <span className="hidden md:inline">{t('AI help')}</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setEditingTask(task);
                        setEditTitle(task.title);
                        setEditNotes(task.notes || '');
                        setEditDue(task.due ? task.due.split('T')[0] : '');
                      }}
                      className="glass-button p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
                      title={t('Edit')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => setDeletingTask(task)}
                      className="glass-button p-1.5 rounded-lg text-muted-foreground hover:border-destructive/40 hover:text-destructive"
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

      <AnimatePresence>
        {editingTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-lg rounded-2xl border border-border bg-surface-elevated/90 p-5 shadow-2xl flex flex-col gap-4 backdrop-blur-2xl"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-brand" /> {t('Edit task')}
                </h3>
                <button onClick={() => setEditingTask(null)} className="glass-button flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                    {t('Title')}
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="glass-card w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none focus:border-brand/60"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                    {t('Notes')}
                  </label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={3}
                    className="glass-card w-full resize-none rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                    {t('Due date')}
                  </label>
                  <input
                    type="date"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    className="glass-card w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  onClick={() => setEditingTask(null)}
                  className="glass-button rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editTitle.trim()}
                  className="glass-button-brand rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {t('Save')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingTask && (
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
                  <h3 className="text-sm font-semibold text-foreground">{t('Delete task?')}</h3>
                  <p className="text-xs text-muted-foreground">{t('This action cannot be undone.')}</p>
                </div>
              </div>

              <p className="glass-card text-xs text-foreground/90 bg-background/50 p-3 rounded-xl border border-border">
                «<span className="font-medium">{deletingTask.title}</span>»
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setDeletingTask(null)}
                  className="glass-button rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="glass-button-brand rounded-xl !bg-rose-600 px-4 py-2 text-xs font-semibold text-white"
                >
                  {t('Delete')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
