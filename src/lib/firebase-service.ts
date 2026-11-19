import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
  onAuthStateChanged,
  getAdditionalUserInfo,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  type User,
} from './firebase';
import { getDeviceFingerprint } from './device-fingerprint';
import { resolveRegistrationPromptUsage } from './prompt-limits';

let activeAuthSetupPromise: Promise<void> | null = null;

export async function waitForAuthProfileSetup(): Promise<void> {
  if (activeAuthSetupPromise) {
    try {
      await Promise.race([
        activeAuthSetupPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    } catch {
    }
  }
}

export function isEmbeddedWebView(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const ref = (typeof document !== 'undefined' ? document.referrer : '') || '';
  const hasNativeBridge = Boolean(
    (window as any).Capacitor?.isNativePlatform?.() ||
      (window as any).Capacitor ||
      (window as any).cordova ||
      (window as any).Android ||
      (window as any).webkit?.messageHandlers,
  );
  const isAndroidAppReferrer = /^android-app:\/\//i.test(ref);
  const uaDataBrands = (navigator as any).userAgentData?.brands;
  const hasWebViewBrand = Array.isArray(uaDataBrands)
    ? uaDataBrands.some((b: any) => /WebView/i.test(String(b?.brand || '')))
    : false;
  const isAndroidWebView =
    /\bwv\b/i.test(ua) ||
    (/Android/i.test(ua) && /Version\/\d+\.\d+/i.test(ua)) ||
    /IGseekAndroidApp|Capacitor|Cordova|Crosswalk|WebView/i.test(ua);
  const isIosWebView = /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  const isStandalone = Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches || (navigator as any).standalone,
  );

  return (
    hasNativeBridge ||
    isAndroidAppReferrer ||
    hasWebViewBrand ||
    isAndroidWebView ||
    isIosWebView ||
    (isMobile && (inIframe || isStandalone))
  );
}

async function withTimeout<T>(promise: Promise<T>, ms: number, errorCode = 'auth/network-request-failed'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(makeAuthError(errorCode)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface ProfileRecord {
  id: string;
  display_name?: string;
  displayName?: string;
  email?: string;
  theme?: string;
  lang?: string;
  model?: string;
  agent?: string;
  ai_style?: string;
  aiStyle?: string;
  ai_creativity?: string;
  aiCreativity?: string;
  ai_length?: string;
  aiLength?: string;
  accent?: string;
  needs_accent_onboarding?: boolean;
  defaults_v2_migrated?: boolean;
  plan?: string;
  pro_lifetime?: boolean;
  proLifetime?: boolean;
  signup_number?: number;
  device_fingerprint?: string;
  prompt_usage?: { engine?: number; chat?: number; flow?: number; image?: number; resetAt?: { engine?: number; chat?: number; flow?: number; image?: number } };
  promptUsage?: { engine?: number; chat?: number; flow?: number; image?: number; resetAt?: { engine?: number; chat?: number; flow?: number; image?: number } };
  created_at?: string;
  updated_at?: string;
}

function readPreferredTheme(): string {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem('igseek:theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
  }
  return 'light';
}

function readPreferredLang(): string {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = window.localStorage.getItem('igseek:lang');
    if (saved === 'en' || saved === 'ru' || saved === 'es' || saved === 'fr' || saved === 'ar') return saved;
  } catch {
  }
  return 'en';
}

export interface ChatRecord {
  id: string;
  user_id: string;
  userId?: string;
  title: string;
  chat_type?: 'chat' | 'engine';
  chatType?: 'chat' | 'engine';
  is_saved?: boolean;
  project_id?: string | null;
  projectId?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ChatMessageRecord {
  id: string;
  chat_id: string;
  chatId?: string;
  user_id: string;
  userId?: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string | null;
  artifacts?: any[];
  images?: any[];
  position: number;
  created_at?: string;
}

export interface ProjectRecord {
  id: string;
  user_id: string;
  userId?: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentRecord {
  id: string;
  user_id: string;
  userId?: string;
  provider_txn_id: string;
  amount: number;
  currency: string;
  status: string;
  purpose?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MemoryRecord {
  id: string;
  user_id: string;
  userId?: string;
  content: string;
  kind: string;
  created_at?: string;
  updated_at?: string;
}

function normalizeDocData<T = any>(id: string, rawData: any): T {
  const norm: Record<string, any> = { id, ...(rawData || {}) };
  if (norm.user_id && !norm.userId) norm.userId = norm.user_id;
  if (norm.userId && !norm.user_id) norm.user_id = norm.userId;
  if (norm.chat_id && !norm.chatId) norm.chatId = norm.chat_id;
  if (norm.chatId && !norm.chat_id) norm.chat_id = norm.chatId;
  if (norm.project_id !== undefined && norm.projectId === undefined) norm.projectId = norm.project_id;
  if (norm.projectId !== undefined && norm.project_id === undefined) norm.project_id = norm.projectId;
  if (norm.display_name && !norm.displayName) norm.displayName = norm.display_name;
  if (norm.displayName && !norm.display_name) norm.display_name = norm.displayName;
  if (norm.pro_lifetime !== undefined && norm.proLifetime === undefined) norm.proLifetime = norm.pro_lifetime;
  if (norm.proLifetime !== undefined && norm.pro_lifetime === undefined) norm.pro_lifetime = norm.proLifetime;
  if (norm.device_fingerprint !== undefined && norm.deviceFingerprint === undefined) norm.deviceFingerprint = norm.device_fingerprint;
  if (norm.deviceFingerprint !== undefined && norm.device_fingerprint === undefined) norm.device_fingerprint = norm.deviceFingerprint;
  if (norm.created_at && !norm.createdAt) norm.createdAt = norm.created_at;
  if (norm.createdAt && !norm.created_at) norm.created_at = norm.createdAt;
  if (norm.updated_at && !norm.updatedAt) norm.updatedAt = norm.updated_at;
  if (norm.updatedAt && !norm.updated_at) norm.updated_at = norm.updatedAt;
  return norm as unknown as T;
}

const LOCAL_USER_KEY = 'igseek:local_user';
const LOCAL_ACCOUNTS_KEY = 'igseek:accounts_v1';
const LOCAL_DB_PREFIX = 'igseek:local_db:';

interface StoredLocalAccount {
  uid: string;
  email: string;
  displayName: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

function makeAuthError(code: string, message?: string): Error & { code: string } {
  const err = new Error(message || code) as Error & { code: string };
  err.code = code;
  return err;
}

function safeBase64Id(input: string): string {
  try {
    const bytes = new TextEncoder().encode(input.toLowerCase());
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/[^a-zA-Z0-9_-]/g, '');
  } catch {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const raw = `${salt}:${password}:igseek_v1`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
}

const SESSION_COOKIE_NAME = 'igseek_sess_v1';

function getNativeBridge(): { getItem?: (k: string) => string | null; setItem?: (k: string, v: string) => void; removeItem?: (k: string) => void } | null {
  if (typeof window === 'undefined') return null;
  return (window as any).IGseekNativeBridge || null;
}

function nativePersistGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.localStorage.getItem(key);
    if (val) return val;
  } catch {
  }
  try {
    const bridge = getNativeBridge();
    if (bridge && typeof bridge.getItem === 'function') {
      const nVal = bridge.getItem(key);
      if (nVal) {
        try {
          window.localStorage.setItem(key, nVal);
        } catch {
        }
        return nVal;
      }
    }
  } catch {
  }
  return null;
}

function nativePersistSet(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
  }
  try {
    const bridge = getNativeBridge();
    if (bridge && typeof bridge.setItem === 'function') {
      bridge.setItem(key, value);
    }
  } catch {
  }
}

function nativePersistRemove(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
  }
  try {
    const bridge = getNativeBridge();
    if (bridge && typeof bridge.removeItem === 'function') {
      bridge.removeItem(key);
    }
  } catch {
  }
}

function readSessionCookiePayload(): { v?: number; u?: any; h?: number } | null {
  if (typeof document === 'undefined' || typeof document.cookie !== 'string') return null;
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
    if (!m || !m[1]) return null;
    const parsed = JSON.parse(decodeURIComponent(m[1]));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeSessionCookiePayload(localUserPayload: { uid: string; email: string; displayName: string; token: string } | null, hasLoggedIn: boolean) {
  if (typeof document === 'undefined') return;
  try {
    const secureFlag = typeof window !== 'undefined' && (window as any).location?.protocol === 'https:' ? '; Secure' : '';
    if (!localUserPayload && !hasLoggedIn) {
      document.cookie = `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax${secureFlag}`;
      return;
    }
    const payload = {
      v: 1,
      h: hasLoggedIn ? 1 : 0,
      ...(localUserPayload ? { u: localUserPayload } : {}),
    };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    if (encoded.length <= 3500) {
      document.cookie = `${SESSION_COOKIE_NAME}=${encoded}; Max-Age=2592000; Path=/; SameSite=Lax${secureFlag}`;
    }
  } catch {
  }
}

function readLocalAccounts(): Record<string, StoredLocalAccount> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = nativePersistGet(LOCAL_ACCOUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalAccounts(accounts: Record<string, StoredLocalAccount>) {
  if (typeof window === 'undefined') return;
  try {
    nativePersistSet(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
  }
}

function buildLocalUserObject(payload: { uid: string; email: string; displayName: string; token: string }): any {
  return {
    uid: payload.uid,
    email: payload.email,
    displayName: payload.displayName,
    accessToken: payload.token || 'local_token',
    emailVerified: true,
    isAnonymous: false,
    metadata: {},
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => payload.token || 'local_token',
    getIdTokenResult: async () => ({} as any),
    reload: async () => {},
    toJSON: () => ({}),
  };
}

function getLocalFallbackUser(): any {
  if (typeof window === 'undefined') return null;
  try {
    let raw = nativePersistGet(LOCAL_USER_KEY);
    if (!raw) {
      const cookieData = readSessionCookiePayload();
      if (cookieData?.u?.uid && cookieData?.u?.email) {
        raw = JSON.stringify(cookieData.u);
        nativePersistSet(LOCAL_USER_KEY, raw);
        nativePersistSet('igseek:clean_slate_v6', '1');
        nativePersistSet('igseek:has_logged_in', '1');
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.uid || !parsed?.email) return null;
    return buildLocalUserObject({
      uid: parsed.uid,
      email: parsed.email,
      displayName: parsed.displayName || parsed.email.split('@')[0] || 'User',
      token: parsed.token || 'local_token',
    });
  } catch {
    return null;
  }
}

function setLocalFallbackUser(uid: string, email: string, name?: string) {
  const cleanEmail = email.trim();
  const payload = {
    uid,
    email: cleanEmail,
    displayName: name || cleanEmail.split('@')[0] || 'User',
    token: `local_token_${uid}_${Date.now()}`,
  };
  if (typeof window !== 'undefined') {
    try {
      nativePersistSet('igseek:clean_slate_v6', '1');
      nativePersistSet(LOCAL_USER_KEY, JSON.stringify(payload));
      nativePersistSet('igseek:has_logged_in', '1');
      writeSessionCookiePayload(payload, true);
    } catch {
    }
  }
  return buildLocalUserObject(payload);
}

function clearLocalFallbackSession() {
  if (typeof window === 'undefined') return;
  try {
    nativePersistRemove(LOCAL_USER_KEY);
    writeSessionCookiePayload(null, Boolean(auth.currentUser));
  } catch {
  }
}

function readLocalCollection(collectionName: string): Record<string, any> {
  if (typeof window === 'undefined') return {};
  try {
    const key = `${LOCAL_DB_PREFIX}${collectionName}`;
    const raw = collectionName === 'profiles' ? nativePersistGet(key) : window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalCollection(collectionName: string, data: Record<string, any>) {
  if (typeof window === 'undefined') return;
  try {
    const key = `${LOCAL_DB_PREFIX}${collectionName}`;
    const serialized = JSON.stringify(data);
    if (collectionName === 'profiles') {
      nativePersistSet(key, serialized);
    } else {
      window.localStorage.setItem(key, serialized);
    }
  } catch {
  }
}

function isUsingLocalDb(): boolean {
  return !auth.currentUser && Boolean(getLocalFallbackUser());
}

const authListeners = new Set<(event: string, session: any) => void>();

function notifyAuthListeners(event: string, user: any) {
  const session = userToSession(user);
  for (const cb of Array.from(authListeners)) {
    try {
      cb(event, session);
    } catch {
    }
  }
}

function userToSession(u: User | null) {
  if (!u) return null;
  return {
    access_token: (u as any).accessToken || u.uid,
    token_type: 'bearer',
    user: {
      id: u.uid,
      email: u.email ?? '',
      user_metadata: {
        full_name: u.displayName ?? '',
        name: u.displayName ?? '',
      },
    },
  };
}

async function userToFreshSession(u: any) {
  if (!u) return null;
  let token = (u as any).accessToken || u.uid;
  if (typeof u.getIdToken === 'function') {
    try {
      token = await u.getIdToken();
    } catch {
      token = (u as any).accessToken || u.uid;
    }
  }
  return {
    access_token: token,
    token_type: 'bearer',
    user: {
      id: u.uid,
      email: u.email ?? '',
      user_metadata: {
        full_name: u.displayName ?? '',
        name: u.displayName ?? '',
      },
    },
  };
}

function cleanObjectForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter((v) => v !== undefined)
      .map(cleanObjectForFirestore);
  }
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      const res = cleanObjectForFirestore(val);
      if (res !== undefined) {
        clean[key] = res;
      }
    }
  }
  return clean;
}

class FirestoreQueryBuilder<T = any> {
  private collectionName: string;
  private filters: Array<{ field: string; op: any; value: any }> = [];
  private orderBys: Array<{ field: string; direction: 'asc' | 'desc' }> = [];
  private limitCount?: number;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  select(_columns = '*') {
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push({ field, op: '==', value });
    return this;
  }

  gt(field: string, value: any) {
    this.filters.push({ field, op: '>', value });
    return this;
  }

  in(field: string, values: any[]) {
    this.filters.push({ field, op: 'in', value: values });
    return this;
  }

  not(field: string, _op: string, value: any) {
    if (value === null) {
      this.filters.push({ field, op: '!=', value: null });
    } else {
      this.filters.push({ field, op: '!=', value });
    }
    return this;
  }

  order(field: string, { ascending = true }: { ascending?: boolean } = {}) {
    this.orderBys.push({ field, direction: ascending ? 'asc' : 'desc' });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  private applyFiltersAndSort(items: any[]): any[] {
    let out = items;
    for (const f of this.filters) {
      if (f.op === '==') out = out.filter((i: any) => i[f.field] === f.value);
      if (f.op === '!=') out = out.filter((i: any) => i[f.field] !== f.value);
      if (f.op === '>') out = out.filter((i: any) => i[f.field] > f.value);
      if (f.op === 'in') out = out.filter((i: any) => Array.isArray(f.value) && f.value.includes(i[f.field]));
    }
    for (const o of this.orderBys) {
      out.sort((a: any, b: any) => {
        if (a[o.field] < b[o.field]) return o.direction === 'asc' ? -1 : 1;
        if (a[o.field] > b[o.field]) return o.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    if (this.limitCount && out.length > this.limitCount) {
      out = out.slice(0, this.limitCount);
    }
    return out;
  }

  async maybeSingle(): Promise<{ data: T | null; error: Error | null }> {
    const localUser = getLocalFallbackUser();
    if (!auth.currentUser && !localUser) {
      return { data: null, error: null };
    }
    if (isUsingLocalDb()) {
      const store = readLocalCollection(this.collectionName);
      const idFilter = this.filters.find((f) => f.field === 'id' && f.op === '==');
      if (idFilter && typeof idFilter.value === 'string') {
        const hit = store[idFilter.value];
        return { data: hit ? normalizeDocData<T>(idFilter.value, hit) : null, error: null };
      }
      const items = Object.entries(store).map(([id, raw]) => normalizeDocData<T>(id, raw));
      const filtered = this.applyFiltersAndSort(items);
      return { data: filtered.length > 0 ? filtered[0] : null, error: null };
    }

    try {
      const idFilter = this.filters.find((f) => f.field === 'id' && f.op === '==');
      if (idFilter && typeof idFilter.value === 'string') {
        const snap = await getDoc(doc(db, this.collectionName, idFilter.value));
        if (!snap.exists()) return { data: null, error: null };
        return { data: normalizeDocData<T>(snap.id, snap.data()), error: null };
      }

      const res = await this.execute();
      if (res.error) return { data: null, error: res.error };
      const first = res.data && res.data.length > 0 ? res.data[0] : null;
      return { data: first, error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  }

  async single(): Promise<{ data: T | null; error: Error | null }> {
    const res = await this.maybeSingle();
    if (!res.data && !res.error) {
      return { data: null, error: new Error('Document not found') };
    }
    return res;
  }

  async then<TResult1 = { data: T[] | null; error: Error | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: T[] | null; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const result = await this.execute();
    if (onfulfilled) return onfulfilled(result);
    return result as any;
  }

  private async execute(): Promise<{ data: T[] | null; error: Error | null }> {
    const localUser = getLocalFallbackUser();
    if (!auth.currentUser && !localUser) {
      return { data: [], error: null };
    }
    if (isUsingLocalDb()) {
      const store = readLocalCollection(this.collectionName);
      const items = Object.entries(store).map(([id, raw]) => normalizeDocData<T>(id, raw));
      return { data: this.applyFiltersAndSort(items), error: null };
    }

    try {
      const q = collection(db, this.collectionName) as any;
      const constraints: any[] = [];

      for (const f of this.filters) {
        constraints.push(where(f.field, f.op, f.value));
      }

      for (const o of this.orderBys) {
        constraints.push(orderBy(o.field, o.direction));
      }

      const finalQuery = constraints.length > 0 ? query(q, ...constraints) : q;
      const snap = await getDocs(finalQuery);
      const items = snap.docs.map((d) => normalizeDocData<T>(d.id, d.data()));
      return { data: items, error: null };
    } catch (err: any) {
      if (err?.message?.includes('permission') || err?.code === 'permission-denied') {
        return { data: [], error: err };
      }
      try {
        const primaryFilter =
          this.filters.find((f) => f.field === 'user_id' || f.field === 'userId') ?? this.filters[0];
        if (!primaryFilter) {
          return { data: [], error: err };
        }
        const baseQuery = query(collection(db, this.collectionName), where(primaryFilter.field, primaryFilter.op, primaryFilter.value));
        const snap = await getDocs(baseQuery);
        let items = snap.docs.map((d) => normalizeDocData<T>(d.id, d.data()));

        for (const f of this.filters) {
          if (f === primaryFilter) continue;
          if (f.op === '==') items = items.filter((i: any) => i[f.field] === f.value);
          if (f.op === '!=') items = items.filter((i: any) => i[f.field] !== f.value);
          if (f.op === '>') items = items.filter((i: any) => i[f.field] > f.value);
          if (f.op === 'in') items = items.filter((i: any) => Array.isArray(f.value) && f.value.includes(i[f.field]));
        }

        for (const o of this.orderBys) {
          items.sort((a: any, b: any) => {
            if (a[o.field] < b[o.field]) return o.direction === 'asc' ? -1 : 1;
            if (a[o.field] > b[o.field]) return o.direction === 'asc' ? 1 : -1;
            return 0;
          });
        }

        if (this.limitCount && items.length > this.limitCount) {
          items = items.slice(0, this.limitCount);
        }

        return { data: items, error: null };
      } catch (innerErr: any) {
        return { data: [], error: innerErr };
      }
    }
  }

  insert(record: any) {
    const execInsert = async () => {
      const records = Array.isArray(record) ? record : [record];
      const inserted: any[] = [];

      if (isUsingLocalDb()) {
        const store = readLocalCollection(this.collectionName);
        for (const r of records) {
          const toSave: any = cleanObjectForFirestore({ ...(r as any) });
          const docId = toSave.id || `${this.collectionName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          delete toSave.id;
          const nowIso = new Date().toISOString();
          if (!toSave.created_at && !toSave.createdAt) {
            toSave.created_at = nowIso;
            toSave.createdAt = nowIso;
          }
          if (!toSave.updated_at && !toSave.updatedAt) {
            toSave.updated_at = nowIso;
            toSave.updatedAt = nowIso;
          }
          if (toSave.user_id && !toSave.userId) toSave.userId = toSave.user_id;
          if (toSave.userId && !toSave.user_id) toSave.user_id = toSave.userId;
          if (toSave.chat_id && !toSave.chatId) toSave.chatId = toSave.chat_id;
          if (toSave.chatId && !toSave.chat_id) toSave.chat_id = toSave.chatId;
          store[docId] = toSave;
          inserted.push(normalizeDocData(docId, toSave));
        }
        writeLocalCollection(this.collectionName, store);
        return {
          data: Array.isArray(record) ? inserted : inserted[0],
          error: null,
        };
      }

      try {
        for (const r of records) {
          const toSave: any = cleanObjectForFirestore({ ...(r as any) });
          const explicitId = toSave.id;
          delete toSave.id;

          const nowIso = new Date().toISOString();
          if (!toSave.created_at && !toSave.createdAt) {
            toSave.created_at = nowIso;
            toSave.createdAt = nowIso;
          }
          if (!toSave.updated_at && !toSave.updatedAt) {
            toSave.updated_at = nowIso;
            toSave.updatedAt = nowIso;
          }

          if (toSave.user_id && !toSave.userId) toSave.userId = toSave.user_id;
          if (toSave.userId && !toSave.user_id) toSave.user_id = toSave.userId;
          if (toSave.chat_id && !toSave.chatId) toSave.chatId = toSave.chat_id;
          if (toSave.chatId && !toSave.chat_id) toSave.chat_id = toSave.chatId;
          if (toSave.chat_type && !toSave.chatType) toSave.chatType = toSave.chat_type;
          if (toSave.chatType && !toSave.chat_type) toSave.chat_type = toSave.chatType;

          if (explicitId) {
            await setDoc(doc(db, this.collectionName, explicitId), toSave);
            inserted.push(normalizeDocData(explicitId, toSave));
          } else {
            const docRef = await addDoc(collection(db, this.collectionName), toSave);
            inserted.push(normalizeDocData(docRef.id, toSave));
          }
        }

        return {
          data: Array.isArray(record) ? inserted : inserted[0],
          error: null,
        };
      } catch (err: any) {
        console.warn('Firestore insert error (handled):', err);
        return { data: Array.isArray(record) ? record : record, error: null };
      }
    };

    const p: any = execInsert();
    p.select = (_cols?: any) => ({
      single: async (_arg?: any) => {
        const res = await p;
        return {
          data: Array.isArray(res.data) ? res.data[0] : res.data,
          error: null,
        };
      },
      maybeSingle: async (_arg?: any) => {
        const res = await p;
        return {
          data: Array.isArray(res.data) ? res.data[0] : res.data,
          error: null,
        };
      },
    });
    return p;
  }

  update(patch: any) {
    const cleanedPatch = cleanObjectForFirestore(patch);
    delete cleanedPatch.id;
    return {
      eq: async (field: string, value: any) => {
        if (!cleanedPatch || Object.keys(cleanedPatch).length === 0) {
          return { error: null };
        }
        if (isUsingLocalDb()) {
          const store = readLocalCollection(this.collectionName);
          if (field === 'id') {
            store[value] = { ...(store[value] || {}), ...cleanedPatch };
          } else {
            const uid = getLocalFallbackUser()?.uid;
            for (const [docId, docData] of Object.entries(store)) {
              const row = docData as any;
              if (row?.[field] === value && (!uid || field === 'user_id' || field === 'userId' || row.user_id === uid || row.userId === uid)) {
                store[docId] = { ...row, ...cleanedPatch };
              }
            }
          }
          writeLocalCollection(this.collectionName, store);
          return { error: null };
        }

        try {
          if (field === 'id') {
            try {
              await updateDoc(doc(db, this.collectionName, value), cleanedPatch);
            } catch (updErr: any) {
              if (this.collectionName === 'profiles' && (updErr?.code === 'not-found' || String(updErr?.message || '').includes('No document to update'))) {
                await setDoc(doc(db, this.collectionName, value), { id: value, ...cleanedPatch }, { merge: true });
              } else {
                throw updErr;
              }
            }
            return { error: null };
          }
          const uid = auth.currentUser?.uid;
          const constraints: any[] = [where(field, '==', value)];
          if (uid && field !== 'user_id' && field !== 'userId') {
            constraints.unshift(where('user_id', '==', uid));
          }
          const snap = await getDocs(query(collection(db, this.collectionName), ...constraints));
          for (const d of snap.docs) {
            await updateDoc(d.ref, cleanedPatch);
          }
          return { error: null };
        } catch (err: any) {
          console.warn('Firestore update error (handled):', err);
          return { error: null };
        }
      },
    };
  }

  delete() {
    const cleanLocal = (field: string, value: any) => {
      const store = readLocalCollection(this.collectionName);
      if (field === 'id') {
        delete store[value];
      } else {
        const uid = getLocalFallbackUser()?.uid || auth.currentUser?.uid;
        for (const [docId, docData] of Object.entries(store)) {
          const row = docData as any;
          const matchesField =
            row?.[field] === value || (field === 'chat_id' && row?.chatId === value);
          if (
            matchesField &&
            (!uid || field === 'user_id' || field === 'userId' || row.user_id === uid || row.userId === uid)
          ) {
            delete store[docId];
          }
        }
      }
      writeLocalCollection(this.collectionName, store);
    };

    const deleteByOwnerFilter = async (uid: string, field: string, value: any) => {
      const seen = new Set<string>();
      const refs: any[] = [];
      for (const ownerField of ['user_id', 'userId']) {
        try {
          const snap = await getDocs(query(collection(db, this.collectionName), where(ownerField, '==', uid)));
          for (const d of snap.docs) {
            if (seen.has(d.id)) continue;
            const data = d.data() as any;
            const matches =
              data?.[field] === value || (field === 'chat_id' && data?.chatId === value);
            if (matches) {
              seen.add(d.id);
              refs.push(d.ref);
            }
          }
        } catch {
        }
      }
      await Promise.all(
        refs.map((r) => deleteDoc(r).catch(() => {})),
      );
    };

    return {
      eq: (field: string, value: any) => {
        const execDelete = async () => {
          cleanLocal(field, value);
          if (isUsingLocalDb()) {
            return { error: null };
          }
          if (!auth.currentUser) {
            return { error: null };
          }

          const uid = auth.currentUser.uid;
          try {
            if (field === 'id') {
              try {
                await deleteDoc(doc(db, this.collectionName, value));
                return { error: null };
              } catch (idErr: any) {
                const code = String(idErr?.code || '');
                const msg = String(idErr?.message || '');
                if (code === 'not-found' || code === 'permission-denied' || msg.includes('permission')) {
                  let stillExists = false;
                  for (const ownerField of ['user_id', 'userId']) {
                    try {
                      const snap = await getDocs(
                        query(collection(db, this.collectionName), where(ownerField, '==', uid)),
                      );
                      const hit = snap.docs.find((d) => d.id === value);
                      if (hit) {
                        stillExists = true;
                        await deleteDoc(hit.ref);
                        stillExists = false;
                        break;
                      }
                    } catch {
                    }
                  }
                  if (!stillExists) {
                    return { error: null };
                  }
                }
                return { error: idErr };
              }
            } else {
              try {
                const constraints: any[] = [where(field, '==', value)];
                if (field !== 'user_id' && field !== 'userId') {
                  constraints.unshift(where('user_id', '==', uid));
                }
                const snap = await getDocs(query(collection(db, this.collectionName), ...constraints));
                await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
                if (field === 'chat_id') {
                  await deleteByOwnerFilter(uid, field, value);
                }
              } catch {
                await deleteByOwnerFilter(uid, field, value);
              }
            }
            return { error: null };
          } catch (err: any) {
            return { error: err };
          }
        };

        return {
          then<TResult1 = { error: any }, TResult2 = never>(
            onfulfilled?: ((value: { error: any }) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
          ): Promise<TResult1 | TResult2> {
            return execDelete().then(onfulfilled, onrejected);
          },
          gt: async (gtField: string, gtValue: any) => {
            const store = readLocalCollection(this.collectionName);
            const uidLocal = getLocalFallbackUser()?.uid || auth.currentUser?.uid;
            for (const [docId, docData] of Object.entries(store)) {
              const row = docData as any;
              if (
                row?.[field] === value &&
                row?.[gtField] > gtValue &&
                (!uidLocal || field === 'user_id' || field === 'userId' || row.user_id === uidLocal || row.userId === uidLocal)
              ) {
                delete store[docId];
              }
            }
            writeLocalCollection(this.collectionName, store);
            if (isUsingLocalDb() || !auth.currentUser) {
              return { error: null };
            }
            try {
              const uid = auth.currentUser.uid;
              let docsToCheck: any[] = [];
              try {
                const constraints: any[] = [where(field, '==', value)];
                if (field !== 'user_id' && field !== 'userId') {
                  constraints.unshift(where('user_id', '==', uid));
                }
                const snap = await getDocs(query(collection(db, this.collectionName), ...constraints));
                docsToCheck = snap.docs;
              } catch {
                const snap = await getDocs(
                  query(collection(db, this.collectionName), where('user_id', '==', uid)),
                );
                docsToCheck = snap.docs.filter((d) => (d.data() as any)?.[field] === value);
              }
              await Promise.all(
                docsToCheck
                  .filter((d) => (d.data() as any)?.[gtField] > gtValue)
                  .map((d) => deleteDoc(d.ref).catch(() => {})),
              );
              return { error: null };
            } catch (err: any) {
              return { error: err };
            }
          },
        };
      },
      in: async (field: string, values: any[]) => {
        if (!Array.isArray(values) || values.length === 0) {
          return { error: null };
        }
        if (isUsingLocalDb()) {
          const store = readLocalCollection(this.collectionName);
          if (field === 'id') {
            for (const val of values) delete store[val];
          } else {
            const uid = getLocalFallbackUser()?.uid;
            for (const [docId, docData] of Object.entries(store)) {
              const row = docData as any;
              if (values.includes(row?.[field]) && (!uid || row.user_id === uid || row.userId === uid)) {
                delete store[docId];
              }
            }
          }
          writeLocalCollection(this.collectionName, store);
          return { error: null };
        }

        try {
          if (field === 'id') {
            for (const val of values) {
              try {
                await deleteDoc(doc(db, this.collectionName, val));
              } catch {
              }
            }
          } else {
            const uid = auth.currentUser?.uid;
            const constraints: any[] = [where(field, 'in', values.slice(0, 30))];
            if (uid && field !== 'user_id' && field !== 'userId') {
              constraints.unshift(where('user_id', '==', uid));
            }
            const snap = await getDocs(
              query(collection(db, this.collectionName), ...constraints),
            );
            for (const d of snap.docs) {
              try {
                await deleteDoc(d.ref);
              } catch {
              }
            }
          }
          return { error: null };
        } catch (err: any) {
          return { error: err };
        }
      },
    };
  }
}

export function formatAuthError(err: unknown, lang: string = 'en'): string {
  if (!err) return '';
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as any)?.code || '';
  const l = (['en', 'ru', 'es', 'fr', 'ar'].includes(lang) ? lang : 'en') as 'en' | 'ru' | 'es' | 'fr' | 'ar';

  const authTranslations: Record<string, Record<'en' | 'ru' | 'es' | 'fr' | 'ar', string>> = {
    'webview-google-blocked': {
      en: 'Google sign-in is blocked inside the APK WebView by Google policy. Please sign in or register using your email and password below.',
      ru: 'Вход через Google заблокирован политикой Google внутри WebView APK. Войдите или зарегистрируйтесь по почте и паролю.',
      es: 'El acceso con Google está bloqueado dentro del WebView del APK. Inicia sesión o regístrate con tu correo y contraseña.',
      fr: 'La connexion Google est bloquée dans le WebView APK par la politique Google. Connectez-vous ou inscrivez-vous par e-mail.',
      ar: 'تسجيل الدخول عبر Google محظور داخل WebView للتطبيق. يرجى الدخول أو التسجيل بالبريد الإلكتروني وكلمة المرور.',
    },
    'auth-timeout': {
      en: 'Authentication timed out. Please try again or use email sign-in.',
      ru: 'Время ожидания авторизации истекло. Попробуйте ещё раз или войдите по почте.',
      es: 'Se agotó el tiempo de espera. Inténtalo de nuevo o usa el correo.',
      fr: 'La connexion a expiré. Réessayez ou utilisez la connexion par e-mail.',
      ar: 'انتهت مهلة المصادقة. حاول مرة أخرى أو استخدم البريد الإلكتروني.',
    },
    'password-reset-unavailable': {
      en: 'Password reset by email is currently unavailable. Please contact support or register a new account.',
      ru: 'Сброс пароля по почте сейчас недоступен. Обратитесь в поддержку или создайте новый аккаунт.',
      es: 'El restablecimiento por correo no está disponible ahora. Contacta con soporte o crea una cuenta nueva.',
      fr: 'La réinitialisation par e-mail est indisponible. Contactez le support ou créez un nouveau compte.',
      ar: 'إعادة تعيين كلمة المرور عبر البريد غير متاحة حاليًا. تواصل مع الدعم أو أنشئ حسابًا جديدًا.',
    },
    'operation-not-allowed': {
      en: 'Password sign-in is unavailable for this account (it may have been created with Google). Please register a new email or sign in with Google on the web.',
      ru: 'Вход по паролю для этого аккаунта недоступен (возможно, он создан через Google). Зарегистрируйте другой email или войдите через Google на сайте.',
      es: 'El acceso con contraseña no está disponible para esta cuenta (pudo haberse creado con Google). Registra otro correo o entra con Google en la web.',
      fr: 'La connexion par mot de passe est indisponible pour ce compte (peut-être créé avec Google). Utilisez un autre e-mail ou Google sur le web.',
      ar: 'الدخول بكلمة المرور غير متاح لهذا الحساب (ربما أُنشيء عبر Google). سجّل ببريد آخر أو ادخل عبر Google على الموقع.',
    },
    'invalid-credential': {
      en: 'Invalid email address or password. Please check your details.',
      ru: 'Неверный адрес почты или пароль. Пожалуйста, проверьте введённые данные.',
      es: 'Correo o contraseña incorrectos. Verifica tus datos.',
      fr: 'Adresse e-mail ou mot de passe incorrect. Vérifiez vos informations.',
      ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق من البيانات.',
    },
    'user-not-found': {
      en: 'No account found with this email. Switch to the Register tab.',
      ru: 'Пользователь с таким email не найден. Переключитесь на вкладку «Регистрация».',
      es: 'No se encontró ninguna cuenta con este correo. Cambia a la pestaña «Registro».',
      fr: 'Aucun compte trouvé avec cet e-mail. Passez à l’onglet « Inscription ».',
      ar: 'لا يوجد حساب بهذا البريد الإلكتروني. انتقل إلى تبويب «التسجيل».',
    },
    'email-already-in-use': {
      en: 'An account with this email already exists. Please sign in instead.',
      ru: 'Аккаунт с таким email уже существует. Пожалуйста, войдите в систему.',
      es: 'Ya existe una cuenta con este correo. Por favor, inicia sesión.',
      fr: 'Un compte existe déjà avec cet e-mail. Veuillez vous connecter.',
      ar: 'يوجد حساب بهذا البريد الإلكتروني بالفعل. يرجى تسجيل الدخول.',
    },
    'weak-password': {
      en: 'Password is too short. Please enter at least 6 characters.',
      ru: 'Пароль слишком короткий. Введите не менее 6 символов.',
      es: 'La contraseña es demasiado corta. Introduce al menos 6 caracteres.',
      fr: 'Le mot de passe est trop court. Saisissez au moins 6 caractères.',
      ar: 'كلمة المرور قصيرة جدًا. أدخل 6 أحرف على الأقل.',
    },
    'invalid-email': {
      en: 'Please enter a valid email address.',
      ru: 'Пожалуйста, введите корректный email адрес.',
      es: 'Por favor, introduce un correo electrónico válido.',
      fr: 'Veuillez saisir une adresse e-mail valide.',
      ar: 'يرجى إدخال بريد إلكتروني صحيح.',
    },
    'popup-closed-by-user': {
      en: 'Google sign-in was cancelled.',
      ru: 'Вход через Google был отменён.',
      es: 'Se canceló el inicio de sesión con Google.',
      fr: 'La connexion avec Google a été annulée.',
      ar: 'تم إلغاء تسجيل الدخول عبر Google.',
    },
    'cancelled-popup-request': {
      en: 'Google sign-in window was closed. Please try again.',
      ru: 'Окно входа Google было закрыто. Попробуйте ещё раз.',
      es: 'Se cerró la ventana de Google. Inténtalo de nuevo.',
      fr: 'La fenêtre Google a été fermée. Veuillez réessayer.',
      ar: 'تم إغلاق نافذة Google. حاول مرة أخرى.',
    },
    'popup-blocked': {
      en: 'The browser blocked the Google popup. Allow popups or sign in with email.',
      ru: 'Браузер заблокировал всплывающее окно Google. Разрешите всплывающие окна или войдите по email.',
      es: 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes o entra con email.',
      fr: 'Le navigateur a bloqué la fenêtre Google. Autorisez les popups ou connectez-vous par e-mail.',
      ar: 'حظر المتصفح نافذة Google المنبثقة. اسمح بالنوافذ المنبثقة أو سجّل بالبريد.',
    },
    'too-many-requests': {
      en: 'Too many attempts. Please wait a minute before trying again.',
      ru: 'Слишком много попыток. Пожалуйста, подождите минуту перед повторной попыткой.',
      es: 'Demasiados intentos. Espera un minuto antes de volver a intentarlo.',
      fr: 'Trop de tentatives. Patientez une minute avant de réessayer.',
      ar: 'محاولات كثيرة جدًا. يرجى الانتظار دقيقة قبل المحاولة مرة أخرى.',
    },
    'network-request-failed': {
      en: 'Network error. Please check your internet connection.',
      ru: 'Ошибка сети. Проверьте подключение к интернету.',
      es: 'Error de red. Verifica tu conexión a internet.',
      fr: 'Erreur réseau. Vérifiez votre connexion Internet.',
      ar: 'خطأ في الشبكة. تحقق من اتصالك بالإنترنت.',
    },
    'device_already_registered': {
      en: 'This device is already linked to another account.',
      ru: 'Это устройство уже привязано к другому аккаунту.',
      es: 'Este dispositivo ya está vinculado a otra cuenta.',
      fr: 'Cet appareil est déjà associé à un autre compte.',
      ar: 'هذا الجهاز مرتبط بحساب آخر بالفعل.',
    },
  };

  if (message.includes('disallowed_useragent') || message.includes('missing initial state') || message.includes('sessionStorage')) {
    return authTranslations['webview-google-blocked'][l];
  }

  for (const [key, map] of Object.entries(authTranslations)) {
    if (
      code === `auth/${key}` ||
      (key === 'invalid-credential' && (code === 'auth/wrong-password' || message.includes('wrong-password'))) ||
      message.includes(key)
    ) {
      return map[l];
    }
  }

  return message;
}

let cleanSlateSignOutPromise: Promise<void> | null = null;

async function ensureCleanSlateAuthReset(): Promise<void> {
  if (typeof window === 'undefined' || !(window as any).__igseekCleanSlateAuthReset) {
    return;
  }
  if (!cleanSlateSignOutPromise) {
    cleanSlateSignOutPromise = (async () => {
      try {
        if (typeof (auth as any).authStateReady === 'function') {
          await Promise.race([
            (auth as any).authStateReady(),
            new Promise<void>((resolve) => setTimeout(resolve, 1200)),
          ]);
        }
        if (auth.currentUser) {
          await fbSignOut(auth);
        }
      } catch {
      } finally {
        try {
          nativePersistRemove('igseek:has_logged_in');
          nativePersistRemove('igseek:guest');
          nativePersistRemove('igseek:guest_account');
          nativePersistRemove(LOCAL_USER_KEY);
          nativePersistRemove('igseek:cloud_uid');
          writeSessionCookiePayload(null, false);
        } catch {}
        (window as any).__igseekCleanSlateAuthReset = false;
      }
    })();
  }
  await cleanSlateSignOutPromise;
}

export const firebaseClient = {
  auth: {
    async getSession() {
      await ensureCleanSlateAuthReset();
      const quickLocal = getLocalFallbackUser();
      if (auth.currentUser || quickLocal) {
        const u = auth.currentUser || quickLocal;
        if (auth.currentUser) {
          nativePersistSet('igseek:has_logged_in', '1');
          nativePersistSet('igseek:clean_slate_v6', '1');
          writeSessionCookiePayload(null, true);
        }
        return {
          data: {
            session: await userToFreshSession(u),
          },
        };
      }

      const hasLoggedInHint = nativePersistGet('igseek:has_logged_in') === '1' || Boolean(readSessionCookiePayload()?.h);
      const waitMs = hasLoggedInHint ? 4500 : 1200;

      try {
        if (typeof (auth as any).authStateReady === 'function') {
          await Promise.race([
            (auth as any).authStateReady(),
            new Promise<void>((resolve) => setTimeout(resolve, waitMs)),
          ]);
        } else if (!auth.currentUser) {
          await new Promise<void>((resolve) => {
            const unsub = onAuthStateChanged(auth, () => {
              unsub();
              resolve();
            });
            setTimeout(resolve, waitMs);
          });
        }
      } catch {
      }
      const finalUser = auth.currentUser || getLocalFallbackUser();
      if (auth.currentUser) {
        nativePersistSet('igseek:has_logged_in', '1');
        nativePersistSet('igseek:clean_slate_v6', '1');
        writeSessionCookiePayload(null, true);
      }
      return {
        data: {
          session: await userToFreshSession(finalUser),
        },
      };
    },

    onAuthStateChange(callback: (event: string, session: any) => void) {
      authListeners.add(callback);
      let readyDone = false;
      if (typeof (auth as any).authStateReady === 'function') {
        void (auth as any).authStateReady().then(() => {
          readyDone = true;
        }).catch(() => {
          readyDone = true;
        });
      } else {
        readyDone = true;
      }

      const unsubscribeFirebase = onAuthStateChanged(auth, async (u) => {
        if (typeof window !== 'undefined' && (window as any).__igseekCleanSlateAuthReset) {
          await ensureCleanSlateAuthReset();
          if (u && !auth.currentUser) {
            callback('SIGNED_OUT', null);
            return;
          }
        }
        const activeU = auth.currentUser || u || getLocalFallbackUser();
        if (activeU) {
          if (auth.currentUser) {
            nativePersistSet('igseek:has_logged_in', '1');
            nativePersistSet('igseek:clean_slate_v6', '1');
            writeSessionCookiePayload(null, true);
          }
          callback('SIGNED_IN', userToSession(activeU));
          return;
        }
        if (!readyDone && typeof (auth as any).authStateReady === 'function') {
          await Promise.race([
            (auth as any).authStateReady(),
            new Promise<void>((resolve) => setTimeout(resolve, 4000)),
          ]).catch(() => {});
          readyDone = true;
          const postWaitUser = auth.currentUser || getLocalFallbackUser();
          if (postWaitUser) {
            callback('SIGNED_IN', userToSession(postWaitUser));
            return;
          }
        }
        callback('SIGNED_OUT', null);
      });
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authListeners.delete(callback);
              unsubscribeFirebase();
            },
          },
        },
      };
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const cleanEmail = email.trim();
      const emailKey = cleanEmail.toLowerCase();

      const tryLocalSignIn = async () => {
        const accounts = readLocalAccounts();
        const acc = accounts[emailKey];
        if (!acc) return { found: false as const };
        const hash = await hashPassword(password, acc.salt);
        if (hash !== acc.passwordHash) {
          return { found: true as const, valid: false as const };
        }
        const localUser = setLocalFallbackUser(acc.uid, acc.email, acc.displayName);
        notifyAuthListeners('SIGNED_IN', localUser);
        return { found: true as const, valid: true as const, user: localUser };
      };

      try {
        const cred = await withTimeout(
          signInWithEmailAndPassword(auth, cleanEmail, password),
          12_000,
          'auth/network-request-failed',
        );
        clearLocalFallbackSession();
        const uid = cred.user.uid;

        try {
          const profileRef = doc(db, 'profiles', uid);
          const profileSnap = await withTimeout(getDoc(profileRef), 4000).catch(() => null);
          if (profileSnap && !profileSnap.exists()) {
            void setDoc(profileRef, {
              id: uid,
              display_name: cred.user.displayName || cleanEmail.split('@')[0],
              displayName: cred.user.displayName || cleanEmail.split('@')[0],
              email: cred.user.email,
              theme: readPreferredTheme(),
              lang: readPreferredLang(),
              accent: 'default',
              needs_accent_onboarding: false,
              defaults_v2_migrated: true,
              model: 'instinct',
              agent: 'universal',
              plan: 'free',
              pro_lifetime: false,
              prompt_usage: { engine: 0, chat: 0, flow: 0, image: 0, resetAt: { engine: 0, chat: 0, flow: 0, image: 0 } },
              promptUsage: { engine: 0, chat: 0, flow: 0, image: 0, resetAt: { engine: 0, chat: 0, flow: 0, image: 0 } },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).catch((e) => console.warn('Profile create on signin warning:', e));
          }
        } catch (e) {
          console.warn('Profile sync on signin warning:', e);
        }

        const session = userToSession(cred.user);
        notifyAuthListeners('SIGNED_IN', cred.user);
        return {
          data: { user: cred.user, session },
          error: null,
        };
      } catch (err: any) {
        const code = err?.code || '';
        const localResult = await tryLocalSignIn();
        if (localResult.found) {
          if (localResult.valid) {
            return {
              data: { user: localResult.user, session: userToSession(localResult.user) },
              error: null,
            };
          }
          return {
            data: { user: null, session: null },
            error: makeAuthError('auth/invalid-credential'),
          };
        }

        if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
          return {
            data: { user: null, session: null },
            error: makeAuthError('auth/operation-not-allowed'),
          };
        }

        return {
          data: { user: null, session: null },
          error: err,
        };
      }
    },

    async signUp({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { emailRedirectTo?: string; data?: any };
    }) {
      const cleanEmail = email.trim();
      const emailKey = cleanEmail.toLowerCase();
      const name = options?.data?.display_name || options?.data?.full_name || cleanEmail.split('@')[0] || 'User';

      let resolveSetup!: () => void;
      const setupPromise = new Promise<void>((resolve) => {
        resolveSetup = resolve;
      });
      activeAuthSetupPromise = setupPromise;

      try {
        const preFp = await withTimeout(getDeviceFingerprint(), 1500).catch(() => '');
        const cred = await withTimeout(
          createUserWithEmailAndPassword(auth, cleanEmail, password),
          12_000,
          'auth/network-request-failed',
        );
        clearLocalFallbackSession();
        if (name) {
          await withTimeout(updateProfile(cred.user, { displayName: name }), 3000).catch(() => {});
        }

        const uid = cred.user.uid;
        const promptSyncPromise = (async () => {
          const { usage: baselineUsage, resetAt: baselineResetAt, fp } = await resolveRegistrationPromptUsage(uid, preFp).catch(() => ({
            usage: { engine: 0, chat: 0, flow: 0, image: 0 },
            resetAt: { engine: 0, chat: 0, flow: 0, image: 0 },
            fp: preFp,
          }));
          const baselinePayload = { ...baselineUsage, resetAt: baselineResetAt };
          const finalFp = fp || options?.data?.device_fingerprint || null;

          await setDoc(
            doc(db, 'profiles', uid),
            {
              id: uid,
              display_name: name,
              displayName: name,
              email: cleanEmail,
              theme: options?.data?.theme || readPreferredTheme(),
              lang: options?.data?.lang || readPreferredLang(),
              accent: options?.data?.accent || 'default',
              needs_accent_onboarding: options?.data?.needs_accent_onboarding ?? false,
              defaults_v2_migrated: true,
              model: 'instinct',
              agent: 'universal',
              plan: 'free',
              pro_lifetime: false,
              prompt_usage: baselinePayload,
              promptUsage: baselinePayload,
              device_fingerprint: finalFp,
              deviceFingerprint: finalFp,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { merge: true },
          );
        })();

        await withTimeout(promptSyncPromise, 4000).catch((e) => {
          console.warn('Signup profile sync timeout/warning (continuing):', e);
        });

        const session = userToSession(cred.user);
        notifyAuthListeners('SIGNED_IN', cred.user);
        return {
          data: { user: cred.user, session },
          error: null,
        };
      } catch (err: any) {
        const code = err?.code || '';
        const shouldUseLocalAccountFallback =
          code === 'auth/operation-not-allowed' ||
          code === 'auth/admin-restricted-operation' ||
          code === 'auth/network-request-failed';

        if (!shouldUseLocalAccountFallback) {
          return {
            data: { user: null, session: null },
            error: err,
          };
        }

        const accounts = readLocalAccounts();
        if (accounts[emailKey]) {
          return {
            data: { user: null, session: null },
            error: makeAuthError('auth/email-already-in-use'),
          };
        }

        const uid = `local_${safeBase64Id(emailKey)}_${Date.now().toString(36)}`;
        const salt = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        const passwordHash = await hashPassword(password, salt);
        const nowIso = new Date().toISOString();

        accounts[emailKey] = {
          uid,
          email: cleanEmail,
          displayName: name,
          salt,
          passwordHash,
          createdAt: nowIso,
        };
        writeLocalAccounts(accounts);

        const preFp = await withTimeout(getDeviceFingerprint(), 1500).catch(() => '');
        const { usage: baselineUsage, resetAt: baselineResetAt } = await withTimeout(
          resolveRegistrationPromptUsage(uid, preFp),
          2500,
        ).catch(() => ({
          usage: { engine: 0, chat: 0, flow: 0, image: 0 },
          resetAt: { engine: 0, chat: 0, flow: 0, image: 0 },
        }));
        const baselinePayload = { ...baselineUsage, resetAt: baselineResetAt };

        const profiles = readLocalCollection('profiles');
        profiles[uid] = {
          id: uid,
          display_name: name,
          displayName: name,
          email: cleanEmail,
          theme: options?.data?.theme || readPreferredTheme(),
          lang: options?.data?.lang || readPreferredLang(),
          accent: options?.data?.accent || 'default',
          needs_accent_onboarding: options?.data?.needs_accent_onboarding ?? false,
          defaults_v2_migrated: true,
          model: 'instinct',
          agent: 'universal',
          plan: 'free',
          pro_lifetime: false,
          prompt_usage: baselinePayload,
          promptUsage: baselinePayload,
          created_at: nowIso,
          updated_at: nowIso,
        };
        writeLocalCollection('profiles', profiles);

        const localUser = setLocalFallbackUser(uid, cleanEmail, name);
        notifyAuthListeners('SIGNED_IN', localUser);

        return {
          data: { user: localUser, session: userToSession(localUser) },
          error: null,
        };
      } finally {
        resolveSetup();
        if (activeAuthSetupPromise === setupPromise) {
          activeAuthSetupPromise = null;
        }
      }
    },

    async signInWithGoogle() {
      let resolveSetup!: () => void;
      const setupPromise = new Promise<void>((resolve) => {
        resolveSetup = resolve;
      });
      activeAuthSetupPromise = setupPromise;

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        const fpPromise = getDeviceFingerprint().catch(() => '');
        const cred = await Promise.race([
          signInWithPopup(auth, googleProvider),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(makeAuthError('auth/auth-timeout')), 90_000);
          }),
        ]);
        if (timeoutId) clearTimeout(timeoutId);
        clearLocalFallbackSession();

        const uid = cred.user.uid;
        let isNewUser = Boolean(getAdditionalUserInfo(cred)?.isNewUser);
        try {
          const profileRef = doc(db, 'profiles', uid);
          const profileSnap = await getDoc(profileRef);
          if (!profileSnap.exists() || isNewUser) {
            isNewUser = true;
            const preFp = await fpPromise;
            const { usage: baselineUsage, resetAt: baselineResetAt, fp } = await resolveRegistrationPromptUsage(uid, preFp);
            const baselinePayload = { ...baselineUsage, resetAt: baselineResetAt };
            await setDoc(
              profileRef,
              {
                id: uid,
                display_name: cred.user.displayName || cred.user.email?.split('@')[0] || 'User',
                displayName: cred.user.displayName || cred.user.email?.split('@')[0] || 'User',
                email: cred.user.email,
                theme: readPreferredTheme(),
                lang: readPreferredLang(),
                accent: 'default',
                needs_accent_onboarding: true,
                defaults_v2_migrated: true,
                model: 'instinct',
                agent: 'universal',
                plan: 'free',
                pro_lifetime: false,
                prompt_usage: baselinePayload,
                promptUsage: baselinePayload,
                device_fingerprint: fp || null,
                deviceFingerprint: fp || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { merge: true },
            );
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('igseek:accent-onboarding-required', { detail: { uid } }));
            }
          }
        } catch (e) {
          console.warn('Profile sync on google signin warning:', e);
        }

        notifyAuthListeners('SIGNED_IN', cred.user);
        return {
          data: { user: cred.user, session: userToSession(cred.user), isNewUser },
          error: null,
        };
      } catch (err: any) {
        if (timeoutId) clearTimeout(timeoutId);
        return { data: { user: null, session: null, isNewUser: false }, error: err };
      } finally {
        resolveSetup();
        if (activeAuthSetupPromise === setupPromise) {
          activeAuthSetupPromise = null;
        }
      }
    },

    async signOut() {
      try {
        await fbSignOut(auth);
      } catch {
      }
      clearLocalFallbackSession();
      try {
        nativePersistRemove('igseek:has_logged_in');
        nativePersistRemove('igseek:cloud_uid');
        writeSessionCookiePayload(null, false);
      } catch {}
      notifyAuthListeners('SIGNED_OUT', null);
      return { error: null };
    },

    async resetPasswordForEmail(email: string, _options?: any) {
      const cleanEmail = email.trim();
      try {
        await withTimeout(sendPasswordResetEmail(auth, cleanEmail), 10_000, 'auth/network-request-failed');
        return { error: null };
      } catch (err: any) {
        const code = err?.code || '';
        if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
          return { error: makeAuthError('auth/password-reset-unavailable') };
        }
        return { error: err };
      }
    },

    async updateUser({ password }: { password?: string }) {
      try {
        if (password && auth.currentUser) {
          await updatePassword(auth.currentUser, password);
        } else if (password && isUsingLocalDb()) {
          const localUser = getLocalFallbackUser();
          const emailKey = String(localUser?.email || '').toLowerCase();
          const accounts = readLocalAccounts();
          if (emailKey && accounts[emailKey]) {
            const salt = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            accounts[emailKey].salt = salt;
            accounts[emailKey].passwordHash = await hashPassword(password, salt);
            writeLocalAccounts(accounts);
          }
        }
        return { error: null };
      } catch (err: any) {
        return { error: err };
      }
    },
  },

  from(collectionName: string) {
    return new FirestoreQueryBuilder(collectionName);
  },

  async rpc(funcName: string, args: Record<string, any> = {}) {
    try {
      if (funcName === 'bind_device_fingerprint') {
        const uid = auth.currentUser?.uid;
        if (!uid) return { data: null, error: new Error('not_authenticated') };
        const fp = args._fp;
        if (fp) {
          await setDoc(doc(db, 'profiles', uid), { device_fingerprint: fp, deviceFingerprint: fp }, { merge: true });
        }
        return { data: 'ok', error: null };
      }

      if (funcName === 'get_signup_slots_left') {
        return { data: 23, error: null };
      }

      return { data: null, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },
};

export const supabase = firebaseClient;
export const supabaseAdmin = firebaseClient;
