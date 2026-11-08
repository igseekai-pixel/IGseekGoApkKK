import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { getCachedCalendarToken } from './google-calendar';

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  due?: string; // ISO RFC 3339 timestamp
  status: 'needsAction' | 'completed';
  completed?: string; // ISO RFC 3339 timestamp
  deleted?: boolean;
  updated?: string;
  position?: string;
  taskListId?: string;
  isLocal?: boolean;
  createdAt?: string;
}

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface TaskPayload {
  title: string;
  notes?: string;
  due?: string;
  status?: 'needsAction' | 'completed';
  taskListId?: string;
}

let cachedTasksToken: string | null = null;

export function getCachedTasksToken(): string | null {
  return cachedTasksToken || getCachedCalendarToken();
}

export function setCachedTasksToken(token: string | null): void {
  cachedTasksToken = token;
  window.dispatchEvent(new CustomEvent('igseek:tasks-auth-changed', { detail: { connected: !!token } }));
}

/**
 * Initiates Google OAuth popup with Google Tasks scopes
 */
export async function connectGoogleTasks(): Promise<{ accessToken: string; userEmail?: string } | null> {
  try {
    const tasksScopes = [
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/tasks.readonly',
    ];

    tasksScopes.forEach((scope) => {
      googleProvider.addScope(scope);
    });

    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google OAuth access token');
    }

    setCachedTasksToken(credential.accessToken);
    return {
      accessToken: credential.accessToken,
      userEmail: result.user.email ?? undefined,
    };
  } catch (error) {
    console.error('Google Tasks OAuth error:', error);
    throw error;
  }
}

export function disconnectGoogleTasks(): void {
  setCachedTasksToken(null);
}

/* -------------------------------------------------------------------------- */
/*                            Google Tasks REST API                            */
/* -------------------------------------------------------------------------- */

const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';

async function fetchTasksApi(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getCachedTasksToken();
  if (!token) {
    throw new Error('Google Tasks is not connected. Please authenticate with Google.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${TASKS_API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    setCachedTasksToken(null);
    throw new Error('Google Tasks access token expired or invalid. Please re-connect.');
  }

  if (res.status === 204) {
    return { success: true };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google Tasks API error (${res.status}): ${errText || res.statusText}`);
  }

  return res.json();
}

/**
 * Fetch all task lists for the user
 */
export async function listTaskLists(): Promise<GoogleTaskList[]> {
  const data = await fetchTasksApi('/users/@me/lists');
  return (data.items || []).map((item: any) => ({
    id: item.id,
    title: item.title || 'Мои задачи',
    updated: item.updated,
  }));
}

/**
 * Fetch tasks from a specific task list
 */
export async function listGoogleTasks(
  taskListId: string = '@default',
  showCompleted: boolean = true
): Promise<GoogleTask[]> {
  const encodedListId = encodeURIComponent(taskListId);
  const params = new URLSearchParams({
    showCompleted: showCompleted ? 'true' : 'false',
    showHidden: 'true',
    maxResults: '100',
  });

  const data = await fetchTasksApi(`/lists/${encodedListId}/tasks?${params.toString()}`);
  return (data.items || []).map((item: any) => ({
    id: item.id,
    title: item.title || 'Без названия',
    notes: item.notes,
    due: item.due,
    status: item.status || 'needsAction',
    completed: item.completed,
    deleted: item.deleted,
    updated: item.updated,
    position: item.position,
    taskListId,
  }));
}

/**
 * Create a task in Google Tasks
 */
export async function createGoogleTask(
  taskData: TaskPayload,
  taskListId: string = '@default'
): Promise<GoogleTask> {
  const encodedListId = encodeURIComponent(taskListId);
  const payload: any = {
    title: taskData.title,
    notes: taskData.notes,
    status: taskData.status || 'needsAction',
  };

  if (taskData.due) {
    payload.due = taskData.due;
  }

  const result = await fetchTasksApi(`/lists/${encodedListId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    id: result.id,
    title: result.title,
    notes: result.notes,
    due: result.due,
    status: result.status,
    completed: result.completed,
    updated: result.updated,
    taskListId,
  };
}

/**
 * Update an existing task in Google Tasks
 */
export async function updateGoogleTask(
  taskId: string,
  taskData: Partial<GoogleTask>,
  taskListId: string = '@default'
): Promise<GoogleTask> {
  const encodedListId = encodeURIComponent(taskListId);
  const encodedTaskId = encodeURIComponent(taskId);

  const payload: any = {};
  if (taskData.title !== undefined) payload.title = taskData.title;
  if (taskData.notes !== undefined) payload.notes = taskData.notes;
  if (taskData.due !== undefined) payload.due = taskData.due;
  if (taskData.status !== undefined) payload.status = taskData.status;

  if (taskData.status === 'completed' && !payload.completed) {
    payload.completed = new Date().toISOString();
  }

  const result = await fetchTasksApi(`/lists/${encodedListId}/tasks/${encodedTaskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return {
    id: result.id,
    title: result.title,
    notes: result.notes,
    due: result.due,
    status: result.status,
    completed: result.completed,
    updated: result.updated,
    taskListId,
  };
}

/**
 * Delete a task from Google Tasks (MUST be preceded by explicit user confirmation)
 */
export async function deleteGoogleTask(taskId: string, taskListId: string = '@default'): Promise<boolean> {
  const encodedListId = encodeURIComponent(taskListId);
  const encodedTaskId = encodeURIComponent(taskId);
  await fetchTasksApi(`/lists/${encodedListId}/tasks/${encodedTaskId}`, {
    method: 'DELETE',
  });
  return true;
}

/* -------------------------------------------------------------------------- */
/*                         Local Offline Backup Store                         */
/* -------------------------------------------------------------------------- */

const LOCAL_TASKS_KEY = 'igseek:local_tasks';

export function getLocalTasks(): GoogleTask[] {
  try {
    const raw = localStorage.getItem(LOCAL_TASKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GoogleTask[];
  } catch {
    return [];
  }
}

export function saveLocalTask(task: Omit<GoogleTask, 'id'> & { id?: string }): GoogleTask {
  const list = getLocalTasks();
  const newTask: GoogleTask = {
    ...task,
    id: task.id || `local_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    status: task.status || 'needsAction',
    isLocal: true,
    createdAt: new Date().toISOString(),
  };
  const updated = [newTask, ...list.filter((item) => item.id !== newTask.id)];
  try {
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('igseek:local-tasks-updated'));
  return newTask;
}

export function toggleLocalTaskStatus(id: string): GoogleTask | null {
  const list = getLocalTasks();
  let updatedTask: GoogleTask | null = null;
  const updated = list.map((item) => {
    if (item.id === id) {
      const nextStatus = item.status === 'completed' ? 'needsAction' : 'completed';
      updatedTask = {
        ...item,
        status: nextStatus,
        completed: nextStatus === 'completed' ? new Date().toISOString() : undefined,
      };
      return updatedTask;
    }
    return item;
  });

  try {
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('igseek:local-tasks-updated'));
  return updatedTask;
}

export function deleteLocalTask(id: string): void {
  const list = getLocalTasks();
  const updated = list.filter((item) => item.id !== id);
  try {
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('igseek:local-tasks-updated'));
}
