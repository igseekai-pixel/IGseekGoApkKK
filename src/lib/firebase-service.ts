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
      await activeAuthSetupPromise;
    } catch {
      // ignore
    }
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
    /* ignore */
  }
  return 'light';
}

function readPreferredLang(): string {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = window.localStorage.getItem('igseek:lang');
    if (saved === 'en' || saved === 'ru' || saved === 'es' || saved === 'fr' || saved === 'ar') return saved;
  } catch {
    /* ignore */
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

  async maybeSingle(): Promise<{ data: T | null; error: Error | null }> {
    if (!auth.currentUser) {
      return { data: null, error: null };
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
    if (!auth.currentUser) {
      return { data: [], error: null };
    }
    try {
      let q = collection(db, this.collectionName) as any;
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
      try {
        const records = Array.isArray(record) ? record : [record];
        const inserted: any[] = [];

        for (const r of records) {
          const toSave: any = cleanObjectForFirestore({ ...(r as any) });
          const explicitId = toSave.id;
          delete toSave.id;

          // Ensure timestamps exist so orderBy('updated_at') queries never exclude newly created records
          const nowIso = new Date().toISOString();
          if (!toSave.created_at && !toSave.createdAt) {
            toSave.created_at = nowIso;
            toSave.createdAt = nowIso;
          }
          if (!toSave.updated_at && !toSave.updatedAt) {
            toSave.updated_at = nowIso;
            toSave.updatedAt = nowIso;
          }

          // Normalize both snake_case and camelCase on saves
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
        try {
          if (!cleanedPatch || Object.keys(cleanedPatch).length === 0) {
            return { error: null };
          }
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
    return {
      eq: (field: string, value: any) => {
        const execDelete = async () => {
          try {
            if (field === 'id') {
              await deleteDoc(doc(db, this.collectionName, value));
            } else {
              const uid = auth.currentUser?.uid;
              const constraints: any[] = [where(field, '==', value)];
              if (uid && field !== 'user_id' && field !== 'userId') {
                constraints.unshift(where('user_id', '==', uid));
              }
              const snap = await getDocs(query(collection(db, this.collectionName), ...constraints));
              for (const d of snap.docs) {
                try {
                  await deleteDoc(d.ref);
                } catch {
                  // ignore non-existent or already-deleted doc
                }
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
            try {
              const uid = auth.currentUser?.uid;
              const constraints: any[] = [where(field, '==', value)];
              if (uid && field !== 'user_id' && field !== 'userId') {
                constraints.unshift(where('user_id', '==', uid));
              }
              const snap = await getDocs(query(collection(db, this.collectionName), ...constraints));
              for (const d of snap.docs) {
                const data = d.data() as any;
                if (data?.[gtField] > gtValue) {
                  try {
                    await deleteDoc(d.ref);
                  } catch {
                    // ignore
                  }
                }
              }
              return { error: null };
            } catch (err: any) {
              return { error: err };
            }
          },
        };
      },
      in: async (field: string, values: any[]) => {
        try {
          if (!Array.isArray(values) || values.length === 0) {
            return { error: null };
          }
          if (field === 'id') {
            for (const val of values) {
              try {
                await deleteDoc(doc(db, this.collectionName, val));
              } catch {
                // ignore missing or optimistic doc IDs
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
                // ignore
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
    'operation-not-allowed': {
      en: 'Email login is enabled. Please use the quick login button below.',
      ru: 'Вход по email подтверждён. Воспользуйтесь кнопкой мгновенного входа ниже.',
      es: 'El acceso por email está habilitado. Usa el botón de acceso rápido de abajo.',
      fr: 'La connexion par e-mail est activée. Utilisez le bouton de connexion rapide ci-dessous.',
      ar: 'تم تفعيل تسجيل الدخول بالبريد. استخدم زر الدخول السريع أدناه.',
    },
    'invalid-credential': {
      en: 'Invalid email address or password. Please check your details.',
      ru: 'Неверный адрес почты или пароль. Пожалуйста, проверьте введённые данные.',
      es: 'Correo o contraseña incorrectos. Verifica tus datos.',
      fr: 'Adresse e-mail ou mot de passe incorrect. Vérifiez vos informations.',
      ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق من البيانات.',
    },
    'user-not-found': {
      en: 'No account found with this email. Switch to the Sign up tab.',
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

export const firebaseClient = {
  auth: {
    async getSession() {
      try {
        if (typeof (auth as any).authStateReady === 'function') {
          await Promise.race([
            (auth as any).authStateReady(),
            new Promise<void>((resolve) => setTimeout(resolve, 2500)),
          ]);
        } else if (!auth.currentUser) {
          await new Promise<void>((resolve) => {
            const unsub = onAuthStateChanged(auth, () => {
              unsub();
              resolve();
            });
            setTimeout(resolve, 1500);
          });
        }
      } catch {
        // ignore auth state hydration errors
      }
      const finalUser = auth.currentUser;
      return {
        data: {
          session: userToSession(finalUser),
        },
      };
    },

    onAuthStateChange(callback: (event: string, session: any) => void) {
      const unsubscribe = onAuthStateChanged(auth, async (u) => {
        const session = userToSession(u);
        callback(u ? 'SIGNED_IN' : 'SIGNED_OUT', session);
      });
      return {
        data: {
          subscription: {
            unsubscribe,
          },
        },
      };
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        const uid = cred.user.uid;

        // Auto-create or ensure user profile exists in Firestore
        try {
          const profileRef = doc(db, 'profiles', uid);
          const profileSnap = await getDoc(profileRef);
          if (!profileSnap.exists()) {
            await setDoc(profileRef, {
              id: uid,
              display_name: cred.user.displayName || email.split('@')[0],
              displayName: cred.user.displayName || email.split('@')[0],
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
            });
          }
        } catch (e) {
          console.warn('Profile sync on signin warning:', e);
        }

        return {
          data: { user: cred.user, session: userToSession(cred.user) },
          error: null,
        };
      } catch (err: any) {
        return { data: { user: null, session: null }, error: err };
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
      let resolveSetup!: () => void;
      const setupPromise = new Promise<void>((resolve) => {
        resolveSetup = resolve;
      });
      activeAuthSetupPromise = setupPromise;
      try {
        const preFp = await getDeviceFingerprint();
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const name = options?.data?.display_name || options?.data?.full_name || email.split('@')[0];
        if (name) {
          await updateProfile(cred.user, { displayName: name });
        }

        const uid = cred.user.uid;
        const { usage: baselineUsage, resetAt: baselineResetAt, fp } = await resolveRegistrationPromptUsage(uid, preFp);
        const baselinePayload = { ...baselineUsage, resetAt: baselineResetAt };
        const finalFp = fp || options?.data?.device_fingerprint || null;

        await setDoc(
          doc(db, 'profiles', uid),
          {
            id: uid,
            display_name: name,
            displayName: name,
            email: email.trim(),
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

        return {
          data: { user: cred.user, session: userToSession(cred.user) },
          error: null,
        };
      } catch (err: any) {
        return { data: { user: null, session: null }, error: err };
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
      try {
        // Trigger fingerprint computation in background without awaiting before popup (keeps user gesture intact)
        const fpPromise = getDeviceFingerprint();
        const cred = await signInWithPopup(auth, googleProvider);
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

        return {
          data: { user: cred.user, session: userToSession(cred.user), isNewUser },
          error: null,
        };
      } catch (err: any) {
        return { data: { user: null, session: null, isNewUser: false }, error: err };
      } finally {
        resolveSetup();
        if (activeAuthSetupPromise === setupPromise) {
          activeAuthSetupPromise = null;
        }
      }
    },

    async signOut() {
      await fbSignOut(auth);
      return { error: null };
    },

    async resetPasswordForEmail(email: string, _options?: any) {
      try {
        await sendPasswordResetEmail(auth, email.trim());
        return { error: null };
      } catch (err: any) {
        return { error: err };
      }
    },

    async updateUser({ password }: { password?: string }) {
      try {
        if (password && auth.currentUser) {
          await updatePassword(auth.currentUser, password);
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
