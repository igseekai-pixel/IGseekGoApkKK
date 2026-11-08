import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

export interface CalendarReminderOverride {
  method: 'popup' | 'email';
  minutes: number;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  htmlLink?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  reminders?: {
    useDefault: boolean;
    overrides?: CalendarReminderOverride[];
  };
  colorId?: string;
  calendarId?: string;
  isReminder?: boolean;
  createdAt?: string;
}

export type CalendarEventPayload = {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  reminderMinutes?: number[];
  colorId?: string;
  calendarId?: string;
};

export interface CalendarListEntry {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  timeZone?: string;
}

// In-memory token cache as mandated by system guidelines (never stored in localStorage)
let cachedCalendarToken: string | null = null;

export function getCachedCalendarToken(): string | null {
  return cachedCalendarToken;
}

export function setCachedCalendarToken(token: string | null): void {
  cachedCalendarToken = token;
  if (token) {
    window.dispatchEvent(new CustomEvent('igseek:calendar-auth-changed', { detail: { connected: true } }));
  } else {
    window.dispatchEvent(new CustomEvent('igseek:calendar-auth-changed', { detail: { connected: false } }));
  }
}

/**
 * Initiates Google OAuth popup with Google Calendar scopes to authorize Calendar API
 */
export async function connectGoogleCalendar(): Promise<{ accessToken: string; userEmail?: string } | null> {
  try {
    // Add Calendar scopes to provider
    const calendarScopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.settings.readonly',
    ];

    calendarScopes.forEach((scope) => {
      googleProvider.addScope(scope);
    });

    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google OAuth access token');
    }

    setCachedCalendarToken(credential.accessToken);
    return {
      accessToken: credential.accessToken,
      userEmail: result.user.email ?? undefined,
    };
  } catch (error) {
    console.error('Google Calendar OAuth error:', error);
    throw error;
  }
}

export function disconnectGoogleCalendar(): void {
  setCachedCalendarToken(null);
}

/* -------------------------------------------------------------------------- */
/*                           Google Calendar REST API                          */
/* -------------------------------------------------------------------------- */

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

async function fetchCalendarApi(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getCachedCalendarToken();
  if (!token) {
    throw new Error('Google Calendar is not connected. Please authenticate with Google.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${CALENDAR_API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Token expired or revoked
    setCachedCalendarToken(null);
    throw new Error('Google Calendar access token expired or invalid. Please re-connect Google Calendar.');
  }

  if (res.status === 204) {
    return { success: true };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google Calendar API error (${res.status}): ${errText || res.statusText}`);
  }

  return res.json();
}

/**
 * List all calendars available to the user
 */
export async function listUserCalendars(): Promise<CalendarListEntry[]> {
  const data = await fetchCalendarApi('/users/me/calendarList');
  return (data.items || []).map((item: any) => ({
    id: item.id,
    summary: item.summary,
    description: item.description,
    primary: item.primary,
    backgroundColor: item.backgroundColor,
    foregroundColor: item.foregroundColor,
    timeZone: item.timeZone,
  }));
}

/**
 * Fetch calendar events
 */
export async function listCalendarEvents(params: {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  q?: string;
  maxResults?: number;
  singleEvents?: boolean;
  orderBy?: 'startTime' | 'updated';
} = {}): Promise<CalendarEvent[]> {
  const calendarId = encodeURIComponent(params.calendarId || 'primary');
  const queryParams = new URLSearchParams({
    singleEvents: params.singleEvents !== false ? 'true' : 'false',
    orderBy: params.orderBy || 'startTime',
    maxResults: String(params.maxResults || 250),
  });

  if (params.timeMin) queryParams.set('timeMin', params.timeMin);
  if (params.timeMax) queryParams.set('timeMax', params.timeMax);
  if (params.q) queryParams.set('q', params.q);

  const data = await fetchCalendarApi(`/calendars/${calendarId}/events?${queryParams.toString()}`);
  
  return (data.items || []).map((item: any) => ({
    id: item.id,
    summary: item.summary || 'Без названия',
    description: item.description,
    location: item.location,
    start: item.start || {},
    end: item.end || {},
    htmlLink: item.htmlLink,
    status: item.status,
    reminders: item.reminders,
    colorId: item.colorId,
    calendarId: params.calendarId || 'primary',
  }));
}

/**
 * Create a new event or reminder on Google Calendar
 */
export async function createCalendarEvent(
  eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    reminderMinutes?: number[];
    colorId?: string;
    calendarId?: string;
  }
): Promise<CalendarEvent> {
  const calendarId = encodeURIComponent(eventData.calendarId || 'primary');
  
  const payload: any = {
    summary: eventData.summary,
    description: eventData.description,
    location: eventData.location,
    start: eventData.start,
    end: eventData.end,
    colorId: eventData.colorId,
  };

  if (eventData.reminderMinutes && eventData.reminderMinutes.length > 0) {
    payload.reminders = {
      useDefault: false,
      overrides: eventData.reminderMinutes.map((mins) => ({
        method: 'popup',
        minutes: mins,
      })),
    };
  }

  const result = await fetchCalendarApi(`/calendars/${calendarId}/events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    id: result.id,
    summary: result.summary,
    description: result.description,
    location: result.location,
    start: result.start || {},
    end: result.end || {},
    htmlLink: result.htmlLink,
    status: result.status,
    reminders: result.reminders,
    colorId: result.colorId,
    calendarId: eventData.calendarId || 'primary',
  };
}

/**
 * Update an existing Google Calendar event
 */
export async function updateCalendarEvent(
  eventId: string,
  eventData: Partial<{
    summary: string;
    description: string;
    location: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    reminderMinutes: number[];
    colorId: string;
  }>,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const encodedCalId = encodeURIComponent(calendarId);
  const payload: any = {};

  if (eventData.summary !== undefined) payload.summary = eventData.summary;
  if (eventData.description !== undefined) payload.description = eventData.description;
  if (eventData.location !== undefined) payload.location = eventData.location;
  if (eventData.start) payload.start = eventData.start;
  if (eventData.end) payload.end = eventData.end;
  if (eventData.colorId !== undefined) payload.colorId = eventData.colorId;

  if (eventData.reminderMinutes) {
    payload.reminders = {
      useDefault: false,
      overrides: eventData.reminderMinutes.map((mins) => ({
        method: 'popup',
        minutes: mins,
      })),
    };
  }

  const result = await fetchCalendarApi(`/calendars/${encodedCalId}/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return {
    id: result.id,
    summary: result.summary,
    description: result.description,
    location: result.location,
    start: result.start || {},
    end: result.end || {},
    htmlLink: result.htmlLink,
    status: result.status,
    reminders: result.reminders,
    colorId: result.colorId,
    calendarId,
  };
}

/**
 * Delete an event from Google Calendar (MUST be preceded by user confirmation in UI)
 */
export async function deleteCalendarEvent(eventId: string, calendarId: string = 'primary'): Promise<boolean> {
  const encodedCalId = encodeURIComponent(calendarId);
  await fetchCalendarApi(`/calendars/${encodedCalId}/events/${eventId}`, {
    method: 'DELETE',
  });
  return true;
}

/**
 * Query free/busy slots across calendars
 */
export async function checkCalendarFreeBusy(params: {
  timeMin: string;
  timeMax: string;
  calendarIds?: string[];
}): Promise<any> {
  const items = (params.calendarIds || ['primary']).map((id) => ({ id }));
  return fetchCalendarApi('/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      items,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/*                     Local Backup / Offline Store for Reminders              */
/* -------------------------------------------------------------------------- */

const LOCAL_REMINDERS_KEY = 'igseek:local_reminders';

export function getLocalReminders(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(LOCAL_REMINDERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CalendarEvent[];
  } catch {
    return [];
  }
}

export function saveLocalReminder(event: Omit<CalendarEvent, 'id'> & { id?: string }): CalendarEvent {
  const list = getLocalReminders();
  const newEvt: CalendarEvent = {
    ...event,
    id: event.id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  const updated = [newEvt, ...list.filter((item) => item.id !== newEvt.id)];
  try {
    localStorage.setItem(LOCAL_REMINDERS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('igseek:local-reminders-updated'));
  return newEvt;
}

export function deleteLocalReminder(id: string): void {
  const list = getLocalReminders();
  const updated = list.filter((item) => item.id !== id);
  try {
    localStorage.setItem(LOCAL_REMINDERS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('igseek:local-reminders-updated'));
}
