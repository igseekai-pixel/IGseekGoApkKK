import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { getCachedCalendarToken } from './google-calendar';

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  unread?: boolean;
  labelIds?: string[];
  body?: string;
  isLocal?: boolean;
}

export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
  messagesUnread?: number;
  threadsUnread?: number;
}

export interface EmailAttachment {
  filename: string;
  mimeType?: string;
  dataUrl?: string;
  contentBase64?: string;
}

export interface SendEmailPayload {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  attachments?: EmailAttachment[];
}

let cachedGmailToken: string | null = null;

export function getCachedGmailToken(): string | null {
  return cachedGmailToken || getCachedCalendarToken();
}

export function setCachedGmailToken(token: string | null): void {
  cachedGmailToken = token;
  window.dispatchEvent(new CustomEvent('igseek:gmail-auth-changed', { detail: { connected: !!token } }));
}

/**
 * Initiates Google OAuth popup with Gmail scopes
 */
export async function connectGmail(): Promise<{ accessToken: string; userEmail?: string } | null> {
  try {
    const gmailScopes = [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.labels',
    ];

    gmailScopes.forEach((scope) => {
      googleProvider.addScope(scope);
    });

    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google OAuth access token');
    }

    setCachedGmailToken(credential.accessToken);
    return {
      accessToken: credential.accessToken,
      userEmail: result.user.email ?? undefined,
    };
  } catch (error) {
    console.error('Gmail OAuth error:', error);
    throw error;
  }
}

export function disconnectGmail(): void {
  setCachedGmailToken(null);
}

/* -------------------------------------------------------------------------- */
/*                              Gmail REST API                                */
/* -------------------------------------------------------------------------- */

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function fetchGmailApi(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getCachedGmailToken();
  if (!token) {
    throw new Error('Gmail is not connected. Please authenticate with Google.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${GMAIL_API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    setCachedGmailToken(null);
    throw new Error('Gmail access token expired or invalid. Please re-connect Gmail.');
  }

  if (res.status === 204) {
    return { success: true };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gmail API error (${res.status}): ${errText || res.statusText}`);
  }

  return res.json();
}

/**
 * List messages matching query
 */
export async function listGmailMessages(params: {
  q?: string;
  maxResults?: number;
  labelIds?: string[];
} = {}): Promise<GmailMessageSummary[]> {
  const queryParams = new URLSearchParams({
    maxResults: String(params.maxResults || 25),
  });

  if (params.q) queryParams.set('q', params.q);
  if (params.labelIds && params.labelIds.length > 0) {
    params.labelIds.forEach((id) => queryParams.append('labelIds', id));
  }

  const listRes = await fetchGmailApi(`/messages?${queryParams.toString()}`);
  const rawList: Array<{ id: string; threadId: string }> = listRes.messages || [];

  if (rawList.length === 0) return [];

  // Fetch full details for the top messages concurrently
  const details = await Promise.all(
    rawList.slice(0, 20).map(async (item) => {
      try {
        return await getGmailMessage(item.id);
      } catch {
        return null;
      }
    })
  );

  return details.filter((item): item is GmailMessageSummary => item !== null);
}

/**
 * Get detailed message
 */
export async function getGmailMessage(messageId: string): Promise<GmailMessageSummary> {
  const msg = await fetchGmailApi(`/messages/${messageId}?format=full`);
  const headers: GmailMessageHeader[] = msg.payload?.headers || [];

  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const subject = getHeader('subject') || 'Без темы';
  const from = getHeader('from') || 'Неизвестный отправитель';
  const to = getHeader('to') || '';
  const date = getHeader('date') || new Date().toISOString();

  // Extract body content
  let body = msg.snippet || '';
  if (msg.payload?.parts && msg.payload.parts.length > 0) {
    const textPart = msg.payload.parts.find((p: any) => p.mimeType === 'text/plain') || msg.payload.parts[0];
    if (textPart?.body?.data) {
      body = decodeBase64Url(textPart.body.data);
    }
  } else if (msg.payload?.body?.data) {
    body = decodeBase64Url(msg.payload.body.data);
  }

  const unread = (msg.labelIds || []).includes('UNREAD');

  return {
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet,
    subject,
    from,
    to,
    date,
    unread,
    labelIds: msg.labelIds || [],
    body,
  };
}

/**
 * Send email message via Gmail API (MUST be preceded by explicit user confirmation)
 */
export async function sendGmailMessage(payload: SendEmailPayload): Promise<{ id: string; threadId: string }> {
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(payload.subject)))}?=`;

  let emailRaw = "";
  if (payload.attachments && payload.attachments.length > 0) {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const parts: string[] = [
      `To: ${payload.to}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      payload.body,
    ];

    for (const att of payload.attachments) {
      let base64Data = att.contentBase64 || "";
      let mimeType = att.mimeType || "application/octet-stream";

      if (att.dataUrl && att.dataUrl.startsWith("data:")) {
        const commaIdx = att.dataUrl.indexOf(",");
        if (commaIdx !== -1) {
          const meta = att.dataUrl.slice(5, commaIdx);
          base64Data = att.dataUrl.slice(commaIdx + 1);
          const detectedMime = meta.split(";")[0];
          if (detectedMime) mimeType = detectedMime;
        }
      }

      if (!base64Data) continue;

      const filename = att.filename || "attachment";
      parts.push(
        `--${boundary}`,
        `Content-Type: ${mimeType}; name="${filename}"`,
        `Content-Disposition: attachment; filename="${filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        base64Data
      );
    }

    parts.push(`--${boundary}--`, '');
    emailRaw = parts.join('\r\n');
  } else {
    const messageParts = [
      `To: ${payload.to}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      payload.body,
    ];
    emailRaw = messageParts.join('\n');
  }

  const encodedEmail = encodeBase64Url(emailRaw);

  const requestBody: any = { raw: encodedEmail };
  if (payload.threadId) {
    requestBody.threadId = payload.threadId;
  }

  const result = await fetchGmailApi('/messages/send', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });

  return {
    id: result.id,
    threadId: result.threadId,
  };
}

/**
 * Move message to trash (MUST be preceded by explicit user confirmation)
 */
export async function trashGmailMessage(messageId: string): Promise<boolean> {
  await fetchGmailApi(`/messages/${messageId}/trash`, {
    method: 'POST',
  });
  return true;
}

/**
 * List user Gmail labels
 */
export async function listGmailLabels(): Promise<GmailLabel[]> {
  const data = await fetchGmailApi('/labels');
  return (data.labels || []).map((l: any) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    messagesUnread: l.messagesUnread,
    threadsUnread: l.threadsUnread,
  }));
}

/* Base64url helpers */
function encodeBase64Url(str: string): string {
  const base64 = btoa(unescape(encodeURIComponent(str)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(base64url: string): string {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    return atob(base64);
  }
}

/* -------------------------------------------------------------------------- */
/*                         Local Offline Backup Store                         */
/* -------------------------------------------------------------------------- */

const LOCAL_EMAILS_KEY = 'igseek:local_emails';

export function getLocalEmails(): GmailMessageSummary[] {
  try {
    const raw = localStorage.getItem(LOCAL_EMAILS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GmailMessageSummary[];
  } catch {
    return [];
  }
}

export function saveLocalEmail(email: Omit<GmailMessageSummary, 'id' | 'threadId'> & { id?: string; threadId?: string }): GmailMessageSummary {
  const list = getLocalEmails();
  const id = email.id || `local_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newEmail: GmailMessageSummary = {
    ...email,
    id,
    threadId: email.threadId || id,
    isLocal: true,
    date: email.date || new Date().toISOString(),
  };
  const updated = [newEmail, ...list.filter((item) => item.id !== newEmail.id)];
  try {
    localStorage.setItem(LOCAL_EMAILS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('igseek:local-emails-updated'));
  return newEmail;
}

export function deleteLocalEmail(id: string): void {
  const list = getLocalEmails();
  const updated = list.filter((item) => item.id !== id);
  try {
    localStorage.setItem(LOCAL_EMAILS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('igseek:local-emails-updated'));
}
