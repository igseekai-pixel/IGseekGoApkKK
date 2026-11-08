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

interface TasksTabProps {
  onAskAiAboutTask?: (taskTitle: string, taskNotes?: string) => void;
  onNavigateToChat?: () => void;
}

export function TasksTab({ onAskAiAboutTask, onNavigateToChat }: TasksTabProps) {
  const [isConnected, setIsConnected] = useState<boolean>(!!getCachedTasksToken());
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [taskLists, setTaskLists] = useState<GoogleTaskList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('@default');
  const [tasks, setTasks] = useState<GoogleTask[]>([]);

  // Filter and search
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'today'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Create task modal / inline composer state
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');
  const [newDue, setNewDue] = useState<string>('');

  // Edit modal state
  const [editingTask, setEditingTask] = useState<GoogleTask | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editDue, setEditDue] = useState<string>('');

  // Deletion modal state
  const [deletingTask, setDeletingTask] = useState<GoogleTask | null>(null);

  // Sync token state
  useEffect(() => {
    const handleAuthChange = (e: CustomEvent) => {
      setIsConnected(e.detail?.connected ?? false);
    };
    window.addEventListener('igseek:tasks-auth-changed' as any, handleAuthChange);
    return () => window.removeEventListener('igseek:tasks-auth-changed' as any, handleAuthChange);
  }, []);

  // Listen to local task updates
  useEffect(() => {
    const handleLocalUpdate = () => {
      if (!isConnected) {
        setTasks(getLocalTasks());
      }
    };
    window.addEventListener('igseek:local-tasks-updated', handleLocalUpdate);
    return () => window.removeEventListener('igseek:local-tasks-updated', handleLocalUpdate);
  }, [isConnected]);

  // Load data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getCachedTasksToken();
      if (token) {
        setIsConnected(true);
        // Load task lists
        try {
          const lists = await listTaskLists();
          setTaskLists(lists);
        } catch {
          setTaskLists([{ id: '@default', title: 'Мои задачи' }]);
        }
        // Load tasks from selected list
        const remoteTasks = await listGoogleTasks(selectedListId, true);
        setTasks(remoteTasks);
      } else {
        setIsConnected(false);
        setTasks(getLocalTasks());
      }
    } catch (err: any) {
      console.error('Failed to load tasks:', err);
      setError(err?.message || 'Не удалось загрузить задачи');
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
      setError(err?.message || 'Ошибка подключения к Google Задачам');
    }
  };

  const handleDisconnect = () => {
    disconnectGoogleTasks();
    setIsConnected(false);
    setTasks(getLocalTasks());
  };

  const handleToggleTask = async (task: GoogleTask) => {
    const nextStatus = task.status === 'completed' ? 'needsAction' : 'completed';
    // Optimistic UI update
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
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
      setError('Не удалось обновить статус задачи');
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
      setError(err?.message || 'Не удалось создать задачу');
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
      setError(err?.message || 'Не удалось сохранить изменения');
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
      setError(err?.message || 'Не удалось удалить задачу');
    }
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(q);
        const matchesNotes = task.notes?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesNotes) return false;
      }

      // Status filters
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
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border border-border bg-surface/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand border border-brand/20">
            <CheckSquare className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Задачи</h1>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {isConnected ? 'Google Tasks подключен' : 'Локальные задачи'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Управляйте списками дел и синхронизируйте задачи с нейросетью IGseek
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
              <span>Подключить Google Задачи</span>
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="glass-button rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40"
            >
              Отключить Google
            </button>
          )}

          <button
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            title="Обновить"
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

      {/* Task Controls: Lists Dropdown, Search, Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Task lists selector if connected */}
        {isConnected && taskLists.length > 0 && (
          <div className="relative shrink-0">
            <div className="glass-card flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-3 py-2 text-xs font-medium">
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

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск по задачам..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-card w-full rounded-xl border border-white/10 bg-surface pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/40 transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: `Все (${tasks.length})` },
            { id: 'active', label: `Активные (${activeCount})` },
            { id: 'today', label: 'Сегодня' },
            { id: 'completed', label: `Завершённые (${completedCount})` },
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

      {/* Add Task Button or Form */}
      {!isAdding ? (
        <button
          onClick={() => setIsAdding(true)}
          className="glass-button flex items-center justify-center gap-2 rounded-2xl border-dashed p-3.5 text-xs font-semibold text-muted-foreground hover:border-brand/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4 text-brand" />
          <span>Добавить новую задачу</span>
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
              <Plus className="h-3.5 w-3.5 text-brand" /> Новая задача
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
            placeholder="Название задачи..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
            className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50"
          />

          <textarea
            placeholder="Заметки или описание (необязательно)..."
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            rows={2}
            className="glass-card w-full resize-none rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand/50"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-brand" />
              <span>Срок:</span>
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="glass-card rounded-lg border border-white/10 bg-background/60 px-2 py-1 text-xs text-foreground outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="glass-button rounded-xl px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="glass-button-brand rounded-xl px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Создать
              </button>
            </div>
          </div>
        </motion.form>
      )}

      {/* Task List Items */}
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
          <h3 className="text-sm font-semibold text-foreground">Задач не найдено</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            {searchQuery
              ? 'Попробуйте изменить поисковый запрос'
              : filter === 'completed'
              ? 'У вас пока нет выполненных задач'
              : 'Создайте задачу вручную или попросите нейросеть IGseek в чате!'}
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
                      title={isCompleted ? 'Отметить как невыполненную' : 'Отметить как выполненную'}
                    >
                      {isCompleted ? (
                        <CheckSquare className="h-5 w-5 text-emerald-400" />
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
                            Срок: {new Date(task.due).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    {onAskAiAboutTask && (
                      <button
                        onClick={() => onAskAiAboutTask(task.title, task.notes)}
                        className="glass-button flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-brand hover:border-brand/40"
                        title="Попросить AI помочь с этой задачей"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span className="hidden md:inline">AI помощь</span>
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
                      title="Редактировать"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => setDeletingTask(task)}
                      className="glass-button p-1.5 rounded-lg text-muted-foreground hover:border-destructive/40 hover:text-destructive"
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

      {/* Edit Modal */}
      <AnimatePresence>
        {editingTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-lg rounded-2xl border border-white/15 bg-surface-elevated/90 p-5 shadow-2xl flex flex-col gap-4 backdrop-blur-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-brand" /> Редактировать задачу
                </h3>
                <button onClick={() => setEditingTask(null)} className="glass-button flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                    Название
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-sm text-foreground outline-none focus:border-brand/60"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                    Заметки
                  </label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={3}
                    className="glass-card w-full resize-none rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">
                    Срок
                  </label>
                  <input
                    type="date"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    className="glass-card w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus:border-brand/60"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  onClick={() => setEditingTask(null)}
                  className="glass-button rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editTitle.trim()}
                  className="glass-button-brand rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Сохранить
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal (MANDATORY per Workspace guidelines) */}
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
                  <h3 className="text-sm font-semibold text-foreground">Удалить задачу?</h3>
                  <p className="text-xs text-muted-foreground">Это действие нельзя будет отменить.</p>
                </div>
              </div>

              <p className="glass-card text-xs text-foreground/90 bg-background/50 p-3 rounded-xl border border-white/10">
                «<span className="font-medium">{deletingTask.title}</span>»
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setDeletingTask(null)}
                  className="glass-button rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Отмена
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="glass-button-brand rounded-xl !bg-rose-600 px-4 py-2 text-xs font-semibold text-white"
                >
                  Удалить
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
