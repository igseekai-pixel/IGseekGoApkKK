import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export type AccentId = "default" | "red" | "orange" | "black" | "emerald" | "blue" | "purple" | "pink" | "amber";

export type AccentPreset = {
  id: AccentId;
  name: string;
  swatch: string;
  darkVal: string;
  lightVal: string;
  darkSoft: string;
  darkBorder: string;
  darkActiveBg: string;
  darkBubbleBg: string;
  darkShadow: string;
  darkGlowShadow: string;
  lightSoft: string;
  lightBorder: string;
  lightShadow: string;
  lightGlowShadow: string;
  logoFilter: string;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: "default",
    name: "Default",
    swatch: "linear-gradient(135deg, #ef4444 50%, #18181b 50%)",
    darkVal: "#ef4444",
    lightVal: "#18181b",
    darkSoft: "rgba(239, 68, 68, 0.15)",
    darkBorder: "rgba(239, 68, 68, 0.35)",
    darkActiveBg: "#381016",
    darkBubbleBg: "#3a131a",
    darkShadow: "0 0 16px rgba(239, 68, 68, 0.28)",
    darkGlowShadow: "rgba(239, 68, 68, 0.45)",
    lightSoft: "rgba(24, 24, 27, 0.08)",
    lightBorder: "rgba(24, 24, 27, 0.18)",
    lightShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
    lightGlowShadow: "rgba(0, 0, 0, 0.15)",
    logoFilter: "none",
  },
  {
    id: "red",
    name: "Red",
    swatch: "#ef4444",
    darkVal: "#ef4444",
    lightVal: "#dc2626",
    darkSoft: "rgba(239, 68, 68, 0.15)",
    darkBorder: "rgba(239, 68, 68, 0.35)",
    darkActiveBg: "#381016",
    darkBubbleBg: "#3a131a",
    darkShadow: "0 0 16px rgba(239, 68, 68, 0.28)",
    darkGlowShadow: "rgba(239, 68, 68, 0.45)",
    lightSoft: "rgba(220, 38, 38, 0.10)",
    lightBorder: "rgba(220, 38, 38, 0.28)",
    lightShadow: "0 4px 14px rgba(220, 38, 38, 0.20)",
    lightGlowShadow: "rgba(220, 38, 38, 0.30)",
    logoFilter: "none",
  },
  {
    id: "orange",
    name: "Orange",
    swatch: "#f97316",
    darkVal: "#f97316",
    lightVal: "#ea580c",
    darkSoft: "rgba(249, 115, 22, 0.16)",
    darkBorder: "rgba(249, 115, 22, 0.38)",
    darkActiveBg: "#3a1c0d",
    darkBubbleBg: "#3d2011",
    darkShadow: "0 0 16px rgba(249, 115, 22, 0.32)",
    darkGlowShadow: "rgba(249, 115, 22, 0.48)",
    lightSoft: "rgba(234, 88, 12, 0.10)",
    lightBorder: "rgba(234, 88, 12, 0.28)",
    lightShadow: "0 4px 14px rgba(234, 88, 12, 0.20)",
    lightGlowShadow: "rgba(234, 88, 12, 0.30)",
    logoFilter: "hue-rotate(28deg) saturate(1.35) brightness(1.05)",
  },
  {
    id: "black",
    name: "Black",
    swatch: "#18181b",
    darkVal: "#71717a",
    lightVal: "#18181b",
    darkSoft: "rgba(113, 113, 122, 0.15)",
    darkBorder: "rgba(113, 113, 122, 0.35)",
    darkActiveBg: "#27272a",
    darkBubbleBg: "#27272a",
    darkShadow: "0 0 16px rgba(113, 113, 122, 0.28)",
    darkGlowShadow: "rgba(113, 113, 122, 0.45)",
    lightSoft: "rgba(24, 24, 27, 0.08)",
    lightBorder: "rgba(24, 24, 27, 0.18)",
    lightShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
    lightGlowShadow: "rgba(0, 0, 0, 0.15)",
    logoFilter: "grayscale(1) brightness(0.75)",
  },
  {
    id: "emerald",
    name: "Emerald",
    swatch: "#10b981",
    darkVal: "#10b981",
    lightVal: "#059669",
    darkSoft: "rgba(16, 185, 129, 0.15)",
    darkBorder: "rgba(16, 185, 129, 0.35)",
    darkActiveBg: "#0b2e20",
    darkBubbleBg: "#0d3424",
    darkShadow: "0 0 16px rgba(16, 185, 129, 0.28)",
    darkGlowShadow: "rgba(16, 185, 129, 0.45)",
    lightSoft: "rgba(5, 150, 105, 0.10)",
    lightBorder: "rgba(5, 150, 105, 0.28)",
    lightShadow: "0 4px 14px rgba(5, 150, 105, 0.20)",
    lightGlowShadow: "rgba(5, 150, 105, 0.30)",
    logoFilter: "hue-rotate(130deg) saturate(1.2) brightness(0.95)",
  },
  {
    id: "blue",
    name: "Blue",
    swatch: "#3b82f6",
    darkVal: "#3b82f6",
    lightVal: "#2563eb",
    darkSoft: "rgba(59, 130, 246, 0.15)",
    darkBorder: "rgba(59, 130, 246, 0.35)",
    darkActiveBg: "#0f2240",
    darkBubbleBg: "#112749",
    darkShadow: "0 0 16px rgba(59, 130, 246, 0.28)",
    darkGlowShadow: "rgba(59, 130, 246, 0.45)",
    lightSoft: "rgba(37, 99, 235, 0.10)",
    lightBorder: "rgba(37, 99, 235, 0.28)",
    lightShadow: "0 4px 14px rgba(37, 99, 235, 0.20)",
    lightGlowShadow: "rgba(37, 99, 235, 0.30)",
    logoFilter: "hue-rotate(215deg) saturate(1.3) brightness(1.05)",
  },
  {
    id: "purple",
    name: "Purple",
    swatch: "#8b5cf6",
    darkVal: "#8b5cf6",
    lightVal: "#7c3aed",
    darkSoft: "rgba(139, 92, 246, 0.15)",
    darkBorder: "rgba(139, 92, 246, 0.35)",
    darkActiveBg: "#231238",
    darkBubbleBg: "#291642",
    darkShadow: "0 0 16px rgba(139, 92, 246, 0.28)",
    darkGlowShadow: "rgba(139, 92, 246, 0.45)",
    lightSoft: "rgba(124, 58, 237, 0.10)",
    lightBorder: "rgba(124, 58, 237, 0.28)",
    lightShadow: "0 4px 14px rgba(124, 58, 237, 0.20)",
    lightGlowShadow: "rgba(124, 58, 237, 0.30)",
    logoFilter: "hue-rotate(260deg) saturate(1.4) brightness(1.1)",
  },
  {
    id: "pink",
    name: "Pink",
    swatch: "#ec4899",
    darkVal: "#ec4899",
    lightVal: "#db2777",
    darkSoft: "rgba(236, 72, 153, 0.15)",
    darkBorder: "rgba(236, 72, 153, 0.35)",
    darkActiveBg: "#390f23",
    darkBubbleBg: "#421229",
    darkShadow: "0 0 16px rgba(236, 72, 153, 0.28)",
    darkGlowShadow: "rgba(236, 72, 153, 0.45)",
    lightSoft: "rgba(219, 39, 119, 0.10)",
    lightBorder: "rgba(219, 39, 119, 0.28)",
    lightShadow: "0 4px 14px rgba(219, 39, 119, 0.20)",
    lightGlowShadow: "rgba(219, 39, 119, 0.30)",
    logoFilter: "hue-rotate(320deg) saturate(1.3) brightness(1.05)",
  },
  {
    id: "amber",
    name: "Amber",
    swatch: "#f59e0b",
    darkVal: "#f59e0b",
    lightVal: "#d97706",
    darkSoft: "rgba(245, 158, 11, 0.15)",
    darkBorder: "rgba(245, 158, 11, 0.35)",
    darkActiveBg: "#362106",
    darkBubbleBg: "#3d2608",
    darkShadow: "0 0 16px rgba(245, 158, 11, 0.28)",
    darkGlowShadow: "rgba(245, 158, 11, 0.45)",
    lightSoft: "rgba(217, 119, 6, 0.10)",
    lightBorder: "rgba(217, 119, 6, 0.28)",
    lightShadow: "0 4px 14px rgba(217, 119, 6, 0.20)",
    lightGlowShadow: "rgba(217, 119, 6, 0.30)",
    logoFilter: "hue-rotate(42deg) saturate(1.5) brightness(1.1)",
  },
];

const STORAGE_KEY = "igseek:theme";
const ACCENT_STORAGE_KEY = "igseek:accent";
const DEFAULT_THEME: Theme = "light";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

export function getStoredAccent(): AccentId {
  if (typeof window === "undefined") return "default";
  try {
    const saved = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    if (saved && ACCENT_PRESETS.some((p) => p.id === saved)) return saved as AccentId;
  } catch {
    /* ignore */
  }
  return "default";
}

export function applyAccent(accentId: AccentId, theme: Theme = getStoredTheme()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const preset = ACCENT_PRESETS.find((p) => p.id === accentId) ?? ACCENT_PRESETS[0];

  const isLight = theme === "light";
  const color = isLight ? preset.lightVal : preset.darkVal;
  const soft = isLight ? preset.lightSoft : preset.darkSoft;
  const border = isLight ? preset.lightBorder : preset.darkBorder;
  const activeBg = isLight ? preset.lightVal : preset.darkActiveBg;
  const bubbleBg = isLight ? preset.lightVal : preset.darkBubbleBg;
  const shadow = isLight ? preset.lightShadow : preset.darkShadow;
  const glowShadow = isLight ? preset.lightGlowShadow : preset.darkGlowShadow;
  // Logo filter is black silhouette for default/black in light theme, otherwise follows accent preset filter
  const logoFilter = isLight && (accentId === "default" || accentId === "black") ? "brightness(0)" : preset.logoFilter;

  root.style.setProperty("--brand", color);
  root.style.setProperty("--brand-glow", color);
  root.style.setProperty("--brand-soft", soft);
  root.style.setProperty("--brand-border", border);
  root.style.setProperty("--brand-active-bg", activeBg);
  root.style.setProperty("--brand-bubble-bg", bubbleBg);
  root.style.setProperty("--brand-shadow", shadow);
  root.style.setProperty("--brand-glow-shadow", glowShadow);
  root.style.setProperty("--logo-filter", logoFilter);

  root.style.setProperty("--primary", color);
  root.style.setProperty("--ring", color);
  root.style.setProperty("--gradient-brand", `linear-gradient(135deg, ${color}, ${color})`);

  try {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, accentId);
  } catch {
    /* ignore */
  }

  window.dispatchEvent(new CustomEvent("igseek:accent-change", { detail: accentId }));
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  
  if (theme === "light") {
    root.classList.add("light");
    root.classList.remove("dark");
  } else {
    root.classList.add("dark");
    root.classList.remove("light");
  }
  
  root.style.colorScheme = theme;
  
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }

  // Re-apply accent when theme changes
  applyAccent(getStoredAccent(), theme);

  window.dispatchEvent(new CustomEvent("igseek:theme-change", { detail: theme }));
}

export function useTheme(): [Theme, (next: Theme | ((prev: Theme) => Theme)) => void] {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    // Sync initial theme class on mount
    applyTheme(theme);

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<Theme>;
      if (customEvent.detail && (customEvent.detail === "light" || customEvent.detail === "dark")) {
        setThemeState(customEvent.detail);
      } else {
        setThemeState(getStoredTheme());
      }
    };

    window.addEventListener("igseek:theme-change", handleThemeChange);
    window.addEventListener("storage", handleThemeChange);

    return () => {
      window.removeEventListener("igseek:theme-change", handleThemeChange);
      window.removeEventListener("storage", handleThemeChange);
    };
  }, [theme]);

  const setTheme = (next: Theme | ((prev: Theme) => Theme)) => {
    const nextTheme = typeof next === "function" ? next(theme) : next;
    setThemeState(nextTheme);
    applyTheme(nextTheme);
  };

  return [theme, setTheme];
}

export function useAccent(): [AccentId, (next: AccentId) => void] {
  const [accent, setAccentState] = useState<AccentId>(() => getStoredAccent());

  useEffect(() => {
    applyAccent(accent);

    const handleAccentChange = (e: Event) => {
      const customEvent = e as CustomEvent<AccentId>;
      if (customEvent.detail) {
        setAccentState(customEvent.detail);
      } else {
        setAccentState(getStoredAccent());
      }
    };

    window.addEventListener("igseek:accent-change", handleAccentChange);
    window.addEventListener("storage", handleAccentChange);

    return () => {
      window.removeEventListener("igseek:accent-change", handleAccentChange);
      window.removeEventListener("storage", handleAccentChange);
    };
  }, [accent]);

  const setAccent = (next: AccentId) => {
    setAccentState(next);
    applyAccent(next);
  };

  return [accent, setAccent];
}

