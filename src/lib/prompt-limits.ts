import { useEffect, useState } from "react";
import { auth, db, doc, getDoc, setDoc } from "./firebase";
import { getDeviceFingerprint } from "./device-fingerprint";

export type PromptScope = "engine" | "chat" | "flow" | "image";

export const PROMPT_LIMITS: Record<PromptScope, number> = {
  engine: 18,
  chat: Number.POSITIVE_INFINITY,
  flow: 18,
  image: 8,
};

export const UNLIMITED_SCOPES: Record<PromptScope, boolean> = {
  engine: false,
  chat: true,
  flow: false,
  image: false,
};

export function isScopeUnlimited(scope: PromptScope): boolean {
  return Boolean(UNLIMITED_SCOPES[scope]);
}

export const CANCEL_REFUND_WINDOW_MS = 5000;
export const PROMPT_RESET_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const IMAGE_RESET_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function getPromptResetIntervalMs(scope: PromptScope = "engine"): number {
  return scope === "image" ? IMAGE_RESET_INTERVAL_MS : PROMPT_RESET_INTERVAL_MS;
}

export type PromptUsage = Record<PromptScope, number>;
export type PromptResetAt = Record<PromptScope, number>;

export interface PromptLimitsSnapshot {
  usage: PromptUsage;
  resetAt: PromptResetAt;
}

export interface PromptReceipt {
  scope: PromptScope;
  uid: string;
  nextCount: number;
  startedAt: number;
  refunded: boolean;
  deviceDelta: number;
}

const SCOPES: PromptScope[] = ["engine", "chat", "flow", "image"];

const EMPTY_USAGE: PromptUsage = {
  engine: 0,
  chat: 0,
  flow: 0,
  image: 0,
};

const EMPTY_RESET_AT: PromptResetAt = {
  engine: 0,
  chat: 0,
  flow: 0,
  image: 0,
};

const STORAGE_PREFIX = "igseek:prompt_usage:";
const DEVICE_USAGE_PREFIX = "igseek:device_usage:";
const EVENT_NAME = "igseek:prompt-usage-change";

let deviceSyncQueue: Promise<void> = Promise.resolve();

function enqueueDeviceSync(fn: () => Promise<void>): void {
  deviceSyncQueue = deviceSyncQueue.then(fn).catch((err) => {
    console.warn("Device prompt sync warning:", err);
  });
}

function storageKeyFor(uid?: string | null): string {
  const clean = uid && uid.trim() ? uid.trim() : "guest";
  return `${STORAGE_PREFIX}${clean}`;
}

function deviceStorageKeyFor(fp: string): string {
  return `${DEVICE_USAGE_PREFIX}${fp}`;
}

function clampCount(val: unknown, limit: number): number {
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Number.isFinite(limit) ? Math.min(limit, Math.floor(n)) : Math.floor(n);
}

function clampTimestamp(val: unknown): number {
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export function normalizePromptUsage(raw: any): PromptUsage {
  return {
    engine: clampCount(raw?.engine, PROMPT_LIMITS.engine),
    chat: clampCount(raw?.chat, PROMPT_LIMITS.chat),
    flow: clampCount(raw?.flow, PROMPT_LIMITS.flow),
    image: clampCount(raw?.image, PROMPT_LIMITS.image),
  };
}

export function normalizePromptSnapshot(raw: any, now = Date.now()): {
  snapshot: PromptLimitsSnapshot;
  changed: boolean;
} {
  const usage = normalizePromptUsage(raw);
  const rawReset = raw?.resetAt ?? raw;
  const resetAt: PromptResetAt = {
    engine: clampTimestamp(rawReset?.engine ?? raw?.engineResetAt),
    chat: clampTimestamp(rawReset?.chat ?? raw?.chatResetAt),
    flow: clampTimestamp(rawReset?.flow ?? raw?.flowResetAt),
    image: clampTimestamp(rawReset?.image ?? raw?.imageResetAt),
  };

  let changed = false;
  for (const scope of SCOPES) {
    if (isScopeUnlimited(scope)) {
      if (resetAt[scope] !== 0) {
        resetAt[scope] = 0;
        changed = true;
      }
      continue;
    }
    if (resetAt[scope] > 0 && now >= resetAt[scope]) {
      usage[scope] = 0;
      resetAt[scope] = 0;
      changed = true;
    } else if (usage[scope] >= PROMPT_LIMITS[scope] && resetAt[scope] === 0) {
      resetAt[scope] = now + getPromptResetIntervalMs(scope);
      changed = true;
    } else if (usage[scope] < PROMPT_LIMITS[scope] && resetAt[scope] !== 0) {
      resetAt[scope] = 0;
      changed = true;
    }
  }

  return { snapshot: { usage, resetAt }, changed };
}

function serializeProfilePromptPayload(snapshot: PromptLimitsSnapshot) {
  return {
    engine: snapshot.usage.engine,
    chat: snapshot.usage.chat,
    flow: snapshot.usage.flow,
    image: snapshot.usage.image,
    resetAt: {
      engine: snapshot.resetAt.engine,
      chat: snapshot.resetAt.chat,
      flow: snapshot.resetAt.flow,
      image: snapshot.resetAt.image,
    },
  };
}

function syncProfileToCloud(cleanUid: string, snapshot: PromptLimitsSnapshot): void {
  if (!auth.currentUser || !cleanUid || cleanUid.startsWith("local_")) return;
  const nowIso = new Date().toISOString();
  const payload = serializeProfilePromptPayload(snapshot);
  void setDoc(
    doc(db, "profiles", cleanUid),
    {
      prompt_usage: payload,
      promptUsage: payload,
      updated_at: nowIso,
      updatedAt: nowIso,
    },
    { merge: true },
  ).catch((err) => {
    console.warn("Prompt usage sync warning:", err);
  });
}

function writeSnapshotToStorage(
  uid: string | null | undefined,
  snapshot: PromptLimitsSnapshot,
): PromptLimitsSnapshot {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        storageKeyFor(uid),
        JSON.stringify(serializeProfilePromptPayload(snapshot)),
      );
      window.dispatchEvent(
        new CustomEvent(EVENT_NAME, {
          detail: { uid: uid || "guest", usage: snapshot.usage, resetAt: snapshot.resetAt },
        }),
      );
    } catch {
    }
  }
  return snapshot;
}

export function readPromptSnapshot(uid?: string | null): PromptLimitsSnapshot {
  if (typeof window === "undefined") {
    return { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
  }
  try {
    const raw = window.localStorage.getItem(storageKeyFor(uid));
    if (!raw) return { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
    const { snapshot, changed } = normalizePromptSnapshot(JSON.parse(raw));
    if (changed) {
      writeSnapshotToStorage(uid, snapshot);
      const cleanUid = uid && uid.trim() && uid.trim() !== "guest" ? uid.trim() : null;
      if (cleanUid) {
        syncProfileToCloud(cleanUid, snapshot);
      }
      enqueueDeviceSync(async () => {
        const fp = await getDeviceFingerprint();
        if (!fp) return;
        const localDev = readLocalDeviceSnapshot(fp);
        let devChanged = false;
        for (const s of SCOPES) {
          if (snapshot.usage[s] === 0 && snapshot.resetAt[s] === 0 && localDev.usage[s] >= PROMPT_LIMITS[s] && localDev.resetAt[s] > 0 && Date.now() >= localDev.resetAt[s]) {
            localDev.usage[s] = 0;
            localDev.resetAt[s] = 0;
            devChanged = true;
          }
        }
        if (devChanged) {
          writeLocalDeviceSnapshot(fp, localDev);
          if (auth.currentUser) {
            await writeCloudDeviceSnapshot(fp, localDev);
          }
        }
      });
    }
    return snapshot;
  } catch {
    return { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
  }
}

export function readPromptUsage(uid?: string | null): PromptUsage {
  return readPromptSnapshot(uid).usage;
}

export function writePromptUsage(uid: string | null | undefined, usage: PromptUsage, resetAt?: PromptResetAt): PromptUsage {
  const { snapshot } = normalizePromptSnapshot({
    ...usage,
    resetAt: resetAt ?? readPromptSnapshot(uid).resetAt,
  });
  writeSnapshotToStorage(uid, snapshot);
  return snapshot.usage;
}

function readLocalDeviceSnapshot(fp: string): PromptLimitsSnapshot {
  if (typeof window === "undefined" || !fp) {
    return { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
  }
  try {
    const raw = window.localStorage.getItem(deviceStorageKeyFor(fp));
    if (!raw) return { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
    const { snapshot, changed } = normalizePromptSnapshot(JSON.parse(raw));
    if (changed) {
      writeLocalDeviceSnapshot(fp, snapshot);
    }
    return snapshot;
  } catch {
    return { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
  }
}

function writeLocalDeviceSnapshot(fp: string, snapshot: PromptLimitsSnapshot): PromptLimitsSnapshot {
  if (typeof window !== "undefined" && fp) {
    try {
      window.localStorage.setItem(
        deviceStorageKeyFor(fp),
        JSON.stringify(serializeProfilePromptPayload(snapshot)),
      );
    } catch {
    }
  }
  return snapshot;
}

async function readCloudDeviceSnapshot(fp: string): Promise<PromptLimitsSnapshot> {
  if (!fp || !auth.currentUser) {
    return { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
  }
  try {
    const snap = await getDoc(doc(db, "device_limits", fp));
    if (!snap.exists()) return { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
    const { snapshot, changed } = normalizePromptSnapshot(snap.data());
    if (changed && auth.currentUser) {
      await writeCloudDeviceSnapshot(fp, snapshot).catch(() => {});
    }
    return snapshot;
  } catch {
    return { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
  }
}

async function writeCloudDeviceSnapshot(fp: string, snapshot: PromptLimitsSnapshot): Promise<void> {
  if (!fp || !auth.currentUser) return;
  const now = new Date().toISOString();
  await setDoc(
    doc(db, "device_limits", fp),
    {
      engine: snapshot.usage.engine,
      chat: snapshot.usage.chat,
      flow: snapshot.usage.flow,
      image: snapshot.usage.image,
      engineResetAt: snapshot.resetAt.engine,
      chatResetAt: snapshot.resetAt.chat,
      flowResetAt: snapshot.resetAt.flow,
      imageResetAt: snapshot.resetAt.image,
      updatedAt: now,
      updated_at: now,
    },
    { merge: true },
  );
}

function mergeResetTimestamp(
  scope: PromptScope,
  mergedCount: number,
  limit: number,
  resetA: number,
  resetB: number,
  now: number,
): number {
  if (mergedCount < limit) return 0;
  const candidates = [resetA, resetB].filter((t) => t > now);
  if (candidates.length === 0) return now + getPromptResetIntervalMs(scope);
  return Math.max(...candidates);
}

export function syncPromptUsageFromCloud(uid: string, cloudRaw: any): PromptUsage {
  const now = Date.now();
  const localSnap = readPromptSnapshot(uid);
  const { snapshot: cloudSnap, changed: cloudExpired } = normalizePromptSnapshot(cloudRaw, now);

  const mergedUsage: PromptUsage = {
    engine: Math.max(localSnap.usage.engine, cloudSnap.usage.engine),
    chat: Math.max(localSnap.usage.chat, cloudSnap.usage.chat),
    flow: Math.max(localSnap.usage.flow, cloudSnap.usage.flow),
    image: Math.max(localSnap.usage.image, cloudSnap.usage.image),
  };

  const mergedResetAt: PromptResetAt = {
    engine: mergeResetTimestamp("engine", mergedUsage.engine, PROMPT_LIMITS.engine, localSnap.resetAt.engine, cloudSnap.resetAt.engine, now),
    chat: mergeResetTimestamp("chat", mergedUsage.chat, PROMPT_LIMITS.chat, localSnap.resetAt.chat, cloudSnap.resetAt.chat, now),
    flow: mergeResetTimestamp("flow", mergedUsage.flow, PROMPT_LIMITS.flow, localSnap.resetAt.flow, cloudSnap.resetAt.flow, now),
    image: mergeResetTimestamp("image", mergedUsage.image, PROMPT_LIMITS.image, localSnap.resetAt.image, cloudSnap.resetAt.image, now),
  };

  const mergedSnapshot: PromptLimitsSnapshot = { usage: mergedUsage, resetAt: mergedResetAt };
  writeSnapshotToStorage(uid, mergedSnapshot);

  if (cloudExpired && uid && uid !== "guest") {
    syncProfileToCloud(uid, mergedSnapshot);
  }
  return mergedUsage;
}

export async function resolveRegistrationPromptUsage(
  newUid: string,
  precomputedFp?: string,
): Promise<{ usage: PromptUsage; resetAt: PromptResetAt; fp: string }> {
  await deviceSyncQueue.catch(() => {});
  const now = Date.now();
  const fp = precomputedFp || (await getDeviceFingerprint());
  const cloudDevice = fp ? await readCloudDeviceSnapshot(fp) : { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
  const localDevice = fp ? readLocalDeviceSnapshot(fp) : { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
  const guestSnap = readPromptSnapshot("guest");

  const baselineUsage: PromptUsage = {
    engine: clampCount(Math.max(cloudDevice.usage.engine, localDevice.usage.engine, guestSnap.usage.engine), PROMPT_LIMITS.engine),
    chat: clampCount(Math.max(cloudDevice.usage.chat, localDevice.usage.chat, guestSnap.usage.chat), PROMPT_LIMITS.chat),
    flow: clampCount(Math.max(cloudDevice.usage.flow, localDevice.usage.flow, guestSnap.usage.flow), PROMPT_LIMITS.flow),
    image: clampCount(Math.max(cloudDevice.usage.image, localDevice.usage.image, guestSnap.usage.image), PROMPT_LIMITS.image),
  };

  const baselineResetAt: PromptResetAt = {
    engine: baselineUsage.engine >= PROMPT_LIMITS.engine
      ? Math.max(cloudDevice.resetAt.engine, localDevice.resetAt.engine, guestSnap.resetAt.engine) || (now + getPromptResetIntervalMs("engine"))
      : 0,
    chat: baselineUsage.chat >= PROMPT_LIMITS.chat
      ? Math.max(cloudDevice.resetAt.chat, localDevice.resetAt.chat, guestSnap.resetAt.chat) || (now + getPromptResetIntervalMs("chat"))
      : 0,
    flow: baselineUsage.flow >= PROMPT_LIMITS.flow
      ? Math.max(cloudDevice.resetAt.flow, localDevice.resetAt.flow, guestSnap.resetAt.flow) || (now + getPromptResetIntervalMs("flow"))
      : 0,
    image: baselineUsage.image >= PROMPT_LIMITS.image
      ? Math.max(cloudDevice.resetAt.image, localDevice.resetAt.image, guestSnap.resetAt.image) || (now + getPromptResetIntervalMs("image"))
      : 0,
  };

  const baselineSnapshot: PromptLimitsSnapshot = { usage: baselineUsage, resetAt: baselineResetAt };
  writeSnapshotToStorage(newUid, baselineSnapshot);

  if (fp) {
    writeLocalDeviceSnapshot(fp, baselineSnapshot);
    if (auth.currentUser) {
      await writeCloudDeviceSnapshot(fp, baselineSnapshot).catch((err) => {
        console.warn("Registration device limit sync warning:", err);
      });
    }
  }

  return { usage: baselineUsage, resetAt: baselineResetAt, fp };
}

export function getPromptRemaining(scope: PromptScope, uid?: string | null): number {
  if (isScopeUnlimited(scope)) return Number.POSITIVE_INFINITY;
  const usage = readPromptUsage(uid);
  return Math.max(0, PROMPT_LIMITS[scope] - usage[scope]);
}

export function canUsePrompt(scope: PromptScope, uid?: string | null): boolean {
  if (isScopeUnlimited(scope)) return true;
  return readPromptSnapshot(uid).usage[scope] < PROMPT_LIMITS[scope];
}

export function ensureScopeResetTimestamp(scope: PromptScope, uid?: string | null): number {
  if (isScopeUnlimited(scope)) return 0;
  const keyUid = uid && uid.trim() ? uid.trim() : "guest";
  const snap = readPromptSnapshot(keyUid);
  if (snap.usage[scope] < PROMPT_LIMITS[scope]) return 0;
  if (snap.resetAt[scope] > Date.now()) return snap.resetAt[scope];
  const nextReset = Date.now() + getPromptResetIntervalMs(scope);
  const updated: PromptLimitsSnapshot = {
    usage: { ...snap.usage },
    resetAt: { ...snap.resetAt, [scope]: nextReset },
  };
  writeSnapshotToStorage(keyUid, updated);
  if (keyUid !== "guest") {
    syncProfileToCloud(keyUid, updated);
  }
  return nextReset;
}

export function markScopeExhausted(scope: PromptScope, uid?: string | null, resetAtMs?: number): number {
  if (isScopeUnlimited(scope)) return 0;
  const keyUid = uid && uid.trim() ? uid.trim() : "guest";
  const now = Date.now();
  const snap = readPromptSnapshot(keyUid);
  const targetReset = resetAtMs && resetAtMs > now
    ? Math.floor(resetAtMs)
    : snap.resetAt[scope] > now
      ? snap.resetAt[scope]
      : now + getPromptResetIntervalMs(scope);
  const updated: PromptLimitsSnapshot = {
    usage: { ...snap.usage, [scope]: PROMPT_LIMITS[scope] },
    resetAt: { ...snap.resetAt, [scope]: targetReset },
  };
  writeSnapshotToStorage(keyUid, updated);
  if (keyUid !== "guest") {
    syncProfileToCloud(keyUid, updated);
  }
  enqueueDeviceSync(async () => {
    const fp = await getDeviceFingerprint();
    if (!fp) return;
    const localDev = readLocalDeviceSnapshot(fp);
    const devUpdated: PromptLimitsSnapshot = {
      usage: { ...localDev.usage, [scope]: PROMPT_LIMITS[scope] },
      resetAt: { ...localDev.resetAt, [scope]: targetReset },
    };
    writeLocalDeviceSnapshot(fp, devUpdated);
    if (auth.currentUser) {
      await writeCloudDeviceSnapshot(fp, devUpdated);
    }
  });
  return targetReset;
}

export function consumePrompt(
  scope: PromptScope,
  uid?: string | null,
): { allowed: boolean; usage: PromptUsage; receipt: PromptReceipt | null } {
  const keyUid = uid && uid.trim() ? uid.trim() : "guest";
  const now = Date.now();
  const current = readPromptSnapshot(keyUid);
  if (isScopeUnlimited(scope)) {
    return { allowed: true, usage: current.usage, receipt: null };
  }
  if (current.usage[scope] >= PROMPT_LIMITS[scope]) {
    return { allowed: false, usage: current.usage, receipt: null };
  }

  const nextCount = Math.min(PROMPT_LIMITS[scope], current.usage[scope] + 1);
  const reachedLimit = nextCount >= PROMPT_LIMITS[scope];
  const nextResetAtValue = reachedLimit
    ? (current.resetAt[scope] > now ? current.resetAt[scope] : now + getPromptResetIntervalMs(scope))
    : 0;

  const nextSnapshot: PromptLimitsSnapshot = {
    usage: {
      ...current.usage,
      [scope]: nextCount,
    },
    resetAt: {
      ...current.resetAt,
      [scope]: nextResetAtValue,
    },
  };

  writeSnapshotToStorage(keyUid, nextSnapshot);

  const cleanUid = keyUid !== "guest" ? keyUid : null;
  if (cleanUid) {
    syncProfileToCloud(cleanUid, nextSnapshot);
  }

  const receipt: PromptReceipt = {
    scope,
    uid: keyUid,
    nextCount,
    startedAt: now,
    refunded: false,
    deviceDelta: 0,
  };

  enqueueDeviceSync(async () => {
    if (receipt.refunded) return;
    const fp = await getDeviceFingerprint();
    if (!fp || receipt.refunded) return;
    const cloudDevice = auth.currentUser ? await readCloudDeviceSnapshot(fp) : { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
    const localDevice = readLocalDeviceSnapshot(fp);
    const prevPeak = Math.max(cloudDevice.usage[scope], localDevice.usage[scope]);
    if (receipt.nextCount > prevPeak) {
      receipt.deviceDelta = receipt.nextCount - prevPeak;
      const mergedUsage: PromptUsage = {
        engine: Math.max(cloudDevice.usage.engine, localDevice.usage.engine),
        chat: Math.max(cloudDevice.usage.chat, localDevice.usage.chat),
        flow: Math.max(cloudDevice.usage.flow, localDevice.usage.flow),
        image: Math.max(cloudDevice.usage.image, localDevice.usage.image),
        [scope]: receipt.nextCount,
      };
      const mergedResetAt: PromptResetAt = {
        engine: mergeResetTimestamp("engine", mergedUsage.engine, PROMPT_LIMITS.engine, cloudDevice.resetAt.engine, localDevice.resetAt.engine, Date.now()),
        chat: mergeResetTimestamp("chat", mergedUsage.chat, PROMPT_LIMITS.chat, cloudDevice.resetAt.chat, localDevice.resetAt.chat, Date.now()),
        flow: mergeResetTimestamp("flow", mergedUsage.flow, PROMPT_LIMITS.flow, cloudDevice.resetAt.flow, localDevice.resetAt.flow, Date.now()),
        image: mergeResetTimestamp("image", mergedUsage.image, PROMPT_LIMITS.image, cloudDevice.resetAt.image, localDevice.resetAt.image, Date.now()),
      };
      if (mergedUsage[scope] >= PROMPT_LIMITS[scope]) {
        mergedResetAt[scope] = nextResetAtValue || Date.now() + getPromptResetIntervalMs(scope);
      }
      const updatedDevice: PromptLimitsSnapshot = { usage: mergedUsage, resetAt: mergedResetAt };
      writeLocalDeviceSnapshot(fp, updatedDevice);
      if (auth.currentUser) {
        await writeCloudDeviceSnapshot(fp, updatedDevice);
      }
    }
  });

  return { allowed: true, usage: nextSnapshot.usage, receipt };
}

export function refundPrompt(receipt: PromptReceipt | null | undefined): boolean {
  if (!receipt || receipt.refunded) return false;
  receipt.refunded = true;

  const current = readPromptSnapshot(receipt.uid);
  const nextCount = Math.max(0, current.usage[receipt.scope] - 1);
  const nextSnapshot: PromptLimitsSnapshot = {
    usage: {
      ...current.usage,
      [receipt.scope]: nextCount,
    },
    resetAt: {
      ...current.resetAt,
      [receipt.scope]: nextCount >= PROMPT_LIMITS[receipt.scope] ? current.resetAt[receipt.scope] : 0,
    },
  };
  writeSnapshotToStorage(receipt.uid, nextSnapshot);

  const cleanUid = receipt.uid && receipt.uid !== "guest" ? receipt.uid : null;
  if (cleanUid) {
    syncProfileToCloud(cleanUid, nextSnapshot);
  }

  enqueueDeviceSync(async () => {
    if (receipt.deviceDelta <= 0) return;
    const fp = await getDeviceFingerprint();
    if (!fp) return;
    const cloudDevice = auth.currentUser ? await readCloudDeviceSnapshot(fp) : { usage: { ...EMPTY_USAGE }, resetAt: { ...EMPTY_RESET_AT } };
    const localDevice = readLocalDeviceSnapshot(fp);
    const mergedUsage: PromptUsage = {
      engine: Math.max(cloudDevice.usage.engine, localDevice.usage.engine),
      chat: Math.max(cloudDevice.usage.chat, localDevice.usage.chat),
      flow: Math.max(cloudDevice.usage.flow, localDevice.usage.flow),
      image: Math.max(cloudDevice.usage.image, localDevice.usage.image),
    };
    const nextDevCount = Math.max(0, mergedUsage[receipt.scope] - receipt.deviceDelta);
    mergedUsage[receipt.scope] = nextDevCount;
    const mergedResetAt: PromptResetAt = {
      engine: mergeResetTimestamp("engine", mergedUsage.engine, PROMPT_LIMITS.engine, cloudDevice.resetAt.engine, localDevice.resetAt.engine, Date.now()),
      chat: mergeResetTimestamp("chat", mergedUsage.chat, PROMPT_LIMITS.chat, cloudDevice.resetAt.chat, localDevice.resetAt.chat, Date.now()),
      flow: mergeResetTimestamp("flow", mergedUsage.flow, PROMPT_LIMITS.flow, cloudDevice.resetAt.flow, localDevice.resetAt.flow, Date.now()),
      image: mergeResetTimestamp("image", mergedUsage.image, PROMPT_LIMITS.image, cloudDevice.resetAt.image, localDevice.resetAt.image, Date.now()),
    };
    if (nextDevCount < PROMPT_LIMITS[receipt.scope]) {
      mergedResetAt[receipt.scope] = 0;
    }
    const revertedDevice: PromptLimitsSnapshot = { usage: mergedUsage, resetAt: mergedResetAt };
    writeLocalDeviceSnapshot(fp, revertedDevice);
    if (auth.currentUser) {
      await writeCloudDeviceSnapshot(fp, revertedDevice);
    }
  });

  return true;
}

export function isWithinCancelRefundWindow(receipt: PromptReceipt | null | undefined): boolean {
  if (!receipt || receipt.refunded) return false;
  return Date.now() - receipt.startedAt <= CANCEL_REFUND_WINDOW_MS;
}

export function formatRemainingReset(resetAtMs: number, lang: string = "en", nowMs = Date.now()): string {
  const diffMs = Math.max(0, resetAtMs - nowMs);
  if (diffMs <= 0) {
    const map: Record<string, string> = {
      en: "less than 1m",
      ru: "менее 1 мин",
      es: "menos de 1 min",
      fr: "moins de 1 min",
      ar: "أقل من دقيقة",
    };
    return map[lang] || map.en;
  }

  const totalSec = Math.ceil(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hours > 0) {
    const hLabel: Record<string, [string, string]> = {
      en: ["h", "m"],
      ru: ["ч", "мин"],
      es: ["h", "min"],
      fr: ["h", "min"],
      ar: ["س", "د"],
    };
    const [hl, ml] = hLabel[lang] || hLabel.en;
    return mins > 0 ? `${hours} ${hl} ${mins} ${ml}` : `${hours} ${hl}`;
  }

  if (mins > 0) {
    const mLabel: Record<string, [string, string]> = {
      en: ["m", "s"],
      ru: ["мин", "сек"],
      es: ["min", "s"],
      fr: ["min", "s"],
      ar: ["د", "ث"],
    };
    const [ml, sl] = mLabel[lang] || mLabel.en;
    return secs > 0 ? `${mins} ${ml} ${String(secs).padStart(2, "0")} ${sl}` : `${mins} ${ml}`;
  }

  const sUnit: Record<string, string> = {
    en: "s",
    ru: "сек",
    es: "s",
    fr: "s",
    ar: "ث",
  };
  return `${secs} ${sUnit[lang] || sUnit.en}`;
}

export interface UsePromptLimitsResult extends PromptLimitsSnapshot {
  limits: Record<PromptScope, number>;
}

export function usePromptLimits(uid?: string | null): UsePromptLimitsResult {
  const keyUid = uid && uid.trim() ? uid.trim() : "guest";
  const [snapshot, setSnapshot] = useState<PromptLimitsSnapshot>(() => readPromptSnapshot(keyUid));

  useEffect(() => {
    const refresh = () => setSnapshot(readPromptSnapshot(keyUid));
    refresh();

    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === storageKeyFor(keyUid)) refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [keyUid]);

  useEffect(() => {
    const now = Date.now();
    const pending = SCOPES
      .map((s) => snapshot.resetAt[s])
      .filter((t) => t > now)
      .map((t) => t - now);
    if (pending.length === 0) return;

    const soonestMs = Math.min(...pending) + 250;
    const timer = window.setTimeout(() => {
      setSnapshot(readPromptSnapshot(keyUid));
    }, soonestMs);

    return () => window.clearTimeout(timer);
  }, [keyUid, snapshot.resetAt.engine, snapshot.resetAt.chat, snapshot.resetAt.flow, snapshot.resetAt.image]);

  return { ...snapshot, limits: PROMPT_LIMITS };
}

export function usePromptUsage(uid?: string | null): PromptUsage {
  return usePromptLimits(uid).usage;
}
