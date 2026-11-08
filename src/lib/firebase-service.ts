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

export interface ProfileRecord {
  id: string;
  display_name?: string;
  displayName?: string;
  email?: string;
  theme?: string;
  lang?: string;
  model?: string;
  agent?: string;
  plan?: string;
  pro_lifetime?: boolean;
  proLifetime?: boolean;
  signup_number?: number;
  device_fingerprint?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatRecord {
  id: string;
  user_id: string;
  userId?: string;
  title: string;
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
        const primaryFilter = this.filters[0];
        if (!primaryFilter) {
          return { data: [], error: err };
        }
        const baseQuery = query(collection(db, this.collectionName), where(primaryFilter.field, primaryFilter.op, primaryFilter.value));
        const snap = await getDocs(baseQuery);
        let items = snap.docs.map((d) => normalizeDocData<T>(d.id, d.data()));

        for (const f of this.filters.slice(1)) {
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
          const toSave: any = { ...(r as any) };
          const explicitId = toSave.id;
          delete toSave.id;

          // Normalize both snake_case and camelCase on saves
          if (toSave.user_id && !toSave.userId) toSave.userId = toSave.user_id;
          if (toSave.userId && !toSave.user_id) toSave.user_id = toSave.userId;
          if (toSave.chat_id && !toSave.chatId) toSave.chatId = toSave.chat_id;
          if (toSave.chatId && !toSave.chat_id) toSave.chat_id = toSave.chatId;

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
        console.error('Firestore insert error:', err);
        return { data: null, error: err };
      }
    };

    const p: any = execInsert();
    p.select = (_cols?: any) => ({
      single: async (_arg?: any) => {
        const res = await p;
        return {
          data: Array.isArray(res.data) ? res.data[0] : res.data,
          error: res.error,
        };
      },
      maybeSingle: async (_arg?: any) => {
        const res = await p;
        return {
          data: Array.isArray(res.data) ? res.data[0] : res.data,
          error: res.error,
        };
      },
    });
    return p;
  }

  update(patch: any) {
    return {
      eq: async (field: string, value: any) => {
        try {
          if (field === 'id') {
            await updateDoc(doc(db, this.collectionName, value), patch);
            return { error: null };
          }
          const snap = await getDocs(query(collection(db, this.collectionName), where(field, '==', value)));
          for (const d of snap.docs) {
            await updateDoc(d.ref, patch);
          }
          return { error: null };
        } catch (err: any) {
          console.error('Firestore update error:', err);
          return { error: err };
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
              const snap = await getDocs(
                query(collection(db, this.collectionName), where(field, '==', value)),
              );
              for (const d of snap.docs) {
                await deleteDoc(d.ref);
              }
            }
            return { error: null };
          } catch (err: any) {
            return { error: err };
          }
        };

        const p: any = execDelete();
        p.gt = async (gtField: string, gtValue: any) => {
          try {
            const snap = await getDocs(
              query(
                collection(db, this.collectionName),
                where(field, '==', value),
                where(gtField, '>', gtValue),
              ),
            );
            for (const d of snap.docs) {
              await deleteDoc(d.ref);
            }
            return { error: null };
          } catch (err: any) {
            return { error: err };
          }
        };
        return p;
      },
      in: async (field: string, values: any[]) => {
        try {
          if (field === 'id') {
            for (const val of values) {
              await deleteDoc(doc(db, this.collectionName, val));
            }
          } else {
            const snap = await getDocs(
              query(collection(db, this.collectionName), where(field, 'in', values)),
            );
            for (const d of snap.docs) {
              await deleteDoc(d.ref);
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

export function formatAuthError(err: unknown, lang: string = 'ru'): string {
  if (!err) return '';
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as any)?.code || '';

  if (lang === 'ru') {
    if (code === 'auth/operation-not-allowed' || message.includes('operation-not-allowed')) {
      return 'Вход по email подтверждён. Воспользуйтесь кнопкой мгновенного входа ниже.';
    }
    if (code === 'auth/invalid-credential' || message.includes('invalid-credential') || code === 'auth/wrong-password') {
      return 'Неверный адрес почты или пароль. Пожалуйста, проверьте введённые данные.';
    }
    if (code === 'auth/user-not-found' || message.includes('user-not-found')) {
      return 'Пользователь с таким email не найден. Переключитесь на вкладку «Регистрация».';
    }
    if (code === 'auth/email-already-in-use' || message.includes('email-already-in-use')) {
      return 'Аккаунт с таким email уже существует. Пожалуйста, войдите в систему.';
    }
    if (code === 'auth/weak-password' || message.includes('weak-password')) {
      return 'Пароль слишком короткий. Введите не менее 6 символов.';
    }
    if (code === 'auth/invalid-email' || message.includes('invalid-email')) {
      return 'Пожалуйста, введите корректный email адрес.';
    }
    if (code === 'auth/popup-closed-by-user' || message.includes('popup-closed-by-user')) {
      return 'Вход через Google был отменён.';
    }
    if (code === 'auth/popup-blocked' || message.includes('popup-blocked')) {
      return 'Браузер заблокировал всплывающее окно Google. Разрешите всплывающие окна или войдите по email.';
    }
    if (code === 'auth/too-many-requests' || message.includes('too-many-requests')) {
      return 'Слишком много попыток. Пожалуйста, подождите минуту перед повторной попыткой.';
    }
    if (code === 'auth/network-request-failed' || message.includes('network-request-failed')) {
      return 'Ошибка сети. Проверьте подключение к интернету.';
    }
  }

  if (message.includes('device_already_registered')) {
    return lang === 'ru' ? 'Это устройство уже привязано к другому аккаунту' : 'Device already registered to another account';
  }

  return message;
}

export const firebaseClient = {
  auth: {
    async getSession() {
      const u = auth.currentUser;
      if (!u) {
        await new Promise<void>((resolve) => {
          const unsub = onAuthStateChanged(auth, () => {
            unsub();
            resolve();
          });
          setTimeout(resolve, 350);
        });
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
              theme: 'dark',
              lang: 'ru',
              model: 'instinct',
              agent: 'universal',
              plan: 'free',
              pro_lifetime: false,
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
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const name = options?.data?.display_name || options?.data?.full_name || email.split('@')[0];
        if (name) {
          await updateProfile(cred.user, { displayName: name });
        }

        const uid = cred.user.uid;
        await setDoc(
          doc(db, 'profiles', uid),
          {
            id: uid,
            display_name: name,
            displayName: name,
            email: email.trim(),
            theme: 'dark',
            lang: 'ru',
            model: 'instinct',
            agent: 'universal',
            plan: 'free',
            pro_lifetime: false,
            device_fingerprint: options?.data?.device_fingerprint || null,
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
      }
    },

    async signInWithGoogle() {
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        const uid = cred.user.uid;
        try {
          const profileRef = doc(db, 'profiles', uid);
          const profileSnap = await getDoc(profileRef);
          if (!profileSnap.exists()) {
            await setDoc(profileRef, {
              id: uid,
              display_name: cred.user.displayName || cred.user.email?.split('@')[0] || 'User',
              displayName: cred.user.displayName || cred.user.email?.split('@')[0] || 'User',
              email: cred.user.email,
              theme: 'dark',
              lang: 'ru',
              model: 'instinct',
              agent: 'universal',
              plan: 'free',
              pro_lifetime: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.warn('Profile sync on google signin warning:', e);
        }

        return {
          data: { user: cred.user, session: userToSession(cred.user) },
          error: null,
        };
      } catch (err: any) {
        return { data: { user: null, session: null }, error: err };
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
