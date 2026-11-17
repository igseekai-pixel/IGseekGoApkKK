import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ArrowLeft,
  Palette,
  Check,
} from "lucide-react";
import { firebaseClient, formatAuthError } from "@/lib/firebase-service";
import { readStoredLang, useLang, useT } from "@/lib/i18n";
import { ACCENT_PRESETS, applyAccent, getStoredTheme, type AccentId } from "@/lib/theme";
import { PRIVACY_POLICY_URL, USER_AGREEMENT_URL } from "@/lib/legal";

interface AuthCardProps {
  onSuccess?: () => void;
  onGuestContinue?: (name?: string, email?: string) => void;
  defaultMode?: "signin" | "signup";
  className?: string;
  isModal?: boolean;
  onClose?: () => void;
}

export function AuthCard({
  onSuccess,
  onGuestContinue,
  defaultMode = "signin",
  className = "",
  isModal = false,
  onClose,
}: AuthCardProps) {
  const t = useT();
  const lang = useLang();

  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);
  const [signupStep, setSignupStep] = useState<"credentials" | "accent">("credentials");
  const [selectedAccent, setSelectedAccent] = useState<AccentId | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState<null | "form" | "google">(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [consentAttempted, setConsentAttempted] = useState(false);

  const passwordsMatch = !confirmPassword || password === confirmPassword;
  const signupConsentsAccepted = acceptedTerms && acceptedPrivacy;

  const handleGoogleAuth = async () => {
    setError(null);
    setSuccessMessage(null);
    if (mode === "signup" && !signupConsentsAccepted) {
      setConsentAttempted(true);
      setError(t("You must accept the User Agreement and Privacy Policy to register."));
      return;
    }
    setLoading("google");
    try {
      const res = await firebaseClient.auth.signInWithGoogle();
      if (res.error) throw res.error;
      try {
        window.localStorage.removeItem("igseek:guest_account");
        window.localStorage.setItem("igseek:has_logged_in", "1");
      } catch {
        /* ignore */
      }
      onSuccess?.();
    } catch (err: any) {
      setError(formatAuthError(err, lang));
    } finally {
      setLoading(null);
    }
  };

  const handleCompleteSignup = async () => {
    if (!signupConsentsAccepted) {
      setConsentAttempted(true);
      setSignupStep("credentials");
      setError(t("You must accept the User Agreement and Privacy Policy to register."));
      return;
    }
    if (!selectedAccent) {
      setError(t("Please choose an accent color to continue."));
      return;
    }

    setError(null);
    setLoading("form");
    try {
      applyAccent(selectedAccent, getStoredTheme());
      const res = await firebaseClient.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: email.trim().split("@")[0],
            accent: selectedAccent,
            theme: getStoredTheme(),
            lang: readStoredLang(),
            needs_accent_onboarding: false,
          },
        },
      });
      if (res.error) {
        throw res.error;
      }
      try {
        window.localStorage.removeItem("igseek:guest_account");
        window.localStorage.setItem("igseek:has_logged_in", "1");
      } catch {
        /* ignore */
      }
      onSuccess?.();
    } catch (err: any) {
      setError(formatAuthError(err, lang));
    } finally {
      setLoading(null);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // 1. Password Reset Mode
    if (isForgot) {
      if (!email.trim() || !email.includes("@")) {
        setError(t("Please enter a valid email address."));
        return;
      }
      setLoading("form");
      try {
        const res = await firebaseClient.auth.resetPasswordForEmail(email.trim());
        if (res.error) throw res.error;
        setSuccessMessage(t("Password reset link sent to your email."));
      } catch (err: any) {
        setError(formatAuthError(err, lang));
      } finally {
        setLoading(null);
      }
      return;
    }

    // 2. Accent step in registration
    if (mode === "signup" && signupStep === "accent") {
      await handleCompleteSignup();
      return;
    }

    // 3. Validation
    if (!email.trim() || !email.includes("@")) {
      setError(t("Please enter a valid email address."));
      return;
    }

    if (!password) {
      setError(t("Please enter your password."));
      return;
    }

    if (password.length < 6) {
      setError(t("Password must be at least 6 characters long."));
      return;
    }

    // 4. Registration Step 1 -> Validate consents & advance to mandatory accent picker
    if (mode === "signup") {
      if (!confirmPassword) {
        setError(t("Please confirm your password."));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("Passwords do not match. Please check your input."));
        return;
      }
      if (!signupConsentsAccepted) {
        setConsentAttempted(true);
        setError(t("You must accept the User Agreement and Privacy Policy to register."));
        return;
      }

      setSignupStep("accent");
      return;
    }

    // 5. Sign In (no accent step)
    setLoading("form");
    try {
      const res = await firebaseClient.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (res.error) {
        if (onGuestContinue) {
          const name = email.trim().split("@")[0] || t("User");
          onGuestContinue(name, email.trim());
          onSuccess?.();
          return;
        }
        throw res.error;
      }
      try {
        window.localStorage.removeItem("igseek:guest_account");
        window.localStorage.setItem("igseek:has_logged_in", "1");
      } catch {
        /* ignore */
      }
      onSuccess?.();
    } catch (err: any) {
      if (onGuestContinue) {
        const name = email.trim().split("@")[0] || t("User");
        onGuestContinue(name, email.trim());
        onSuccess?.();
        return;
      }
      setError(formatAuthError(err, lang));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div
      className={`relative w-full max-w-[380px] sm:max-w-[420px] mx-auto flex flex-col items-center text-center ${className}`}
    >
      {/* Optional close button for modals */}
      {isModal && onClose && (
        <button
          onClick={onClose}
          type="button"
          aria-label={t("Close")}
          className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
        >
          ✕
        </button>
      )}

      {/* Brand Logo Header: IGseek */}
      <div className="mb-6 flex flex-col items-center">
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground select-none">
          <span className="text-[var(--brand)] font-extrabold">IG</span>
          <span>seek</span>
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm font-normal text-muted-foreground">
          {t("Find. Analyze. Create.")}
        </p>
      </div>

      {/* Tabs Switcher: [ Sign in | Register ] */}
      <div className="w-full max-w-[340px] rounded-full p-1 border border-border bg-surface/80 dark:border-white/10 dark:bg-white/[0.04] backdrop-blur-md flex items-center mb-6">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setSignupStep("credentials");
            setIsForgot(false);
            setConsentAttempted(false);
            setError(null);
            setSuccessMessage(null);
          }}
          className={`flex-1 rounded-full py-2 text-xs sm:text-sm font-medium transition-all ${
            mode === "signin"
              ? "bg-[var(--brand-active-bg)] text-white border border-[var(--brand-border)] shadow-[var(--brand-shadow)]"
              : "text-muted-foreground hover:text-foreground border-transparent"
          }`}
        >
          {t("Log in")}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setSignupStep("credentials");
            setShowEmailForm(true);
            setIsForgot(false);
            setConsentAttempted(false);
            setError(null);
            setSuccessMessage(null);
          }}
          className={`flex-1 rounded-full py-2 text-xs sm:text-sm font-medium transition-all ${
            mode === "signup"
              ? "bg-[var(--brand-active-bg)] text-white border border-[var(--brand-border)] shadow-[var(--brand-shadow)]"
              : "text-muted-foreground hover:text-foreground border-transparent"
          }`}
        >
          {t("Register")}
        </button>
      </div>

      {/* Alerts */}
      <div className="w-full">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mb-4 flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 text-left backdrop-blur-md"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <span className="flex-1 leading-relaxed">{error}</span>
            </motion.div>
          )}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mb-4 flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400 text-left backdrop-blur-md"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
              <span className="flex-1 leading-relaxed">{successMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Body */}
      {!showEmailForm && mode === "signin" && !isForgot ? (
        <div className="w-full flex flex-col gap-3">
          {/* Button 1: Google */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading !== null}
            className="w-full rounded-full border border-border bg-surface hover:bg-surface-elevated text-foreground dark:border-white/10 dark:bg-[#141416]/90 dark:hover:bg-[#1a1a1e] dark:text-white py-3 px-5 flex items-center justify-center gap-3 text-sm font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            {loading === "google" ? (
              <Loader2 className="h-5 w-5 animate-spin text-[var(--brand)]" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{t("Sign in with Google")}</span>
          </button>

          {/* Button 2: Email */}
          <button
            type="button"
            onClick={() => setShowEmailForm(true)}
            className="w-full rounded-full border border-border bg-surface hover:bg-surface-elevated text-foreground dark:border-white/10 dark:bg-[#141416]/90 dark:hover:bg-[#1a1a1e] dark:text-white py-3 px-5 flex items-center justify-center gap-3 text-sm font-medium transition-all shadow-sm active:scale-95"
          >
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{t("Sign in with email")}</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-2 w-full">
            <div className="h-px bg-border flex-1" />
            <span className="text-xs text-muted-foreground font-normal">{t("or")}</span>
            <div className="h-px bg-border flex-1" />
          </div>

          {/* Button 3: Create account */}
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setSignupStep("credentials");
              setShowEmailForm(true);
            }}
            className="w-full rounded-full border border-border bg-surface hover:bg-surface-elevated text-foreground dark:border-white/10 dark:bg-[#141416]/90 dark:hover:bg-[#1a1a1e] dark:text-white py-3 px-6 flex items-center justify-between text-sm font-medium transition-all shadow-sm active:scale-95"
          >
            <span>{t("Create account")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ) : mode === "signup" && signupStep === "accent" ? (
        /* Registration Step 2: Mandatory Accent Color Selection */
        <form onSubmit={handleFormSubmit} className="w-full flex flex-col gap-4 text-left">
          <button
            type="button"
            onClick={() => {
              setSignupStep("credentials");
              setError(null);
            }}
            className="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t("Back")}</span>
          </button>

          <div className="rounded-3xl border border-border bg-surface p-5 dark:border-white/10 dark:bg-[#141416]/90 shadow-sm">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand-border)]">
                <Palette className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  {t("Choose interface accent color")}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {t("Step 2 of 2 · Required for registration")}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              {t("Pick the highlight color you want for IGseek. You can change it anytime later in Settings.")}
            </p>

            <div className="grid grid-cols-3 gap-2.5">
              {ACCENT_PRESETS.map((preset) => {
                const isSelected = selectedAccent === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedAccent(preset.id);
                      setError(null);
                      applyAccent(preset.id, getStoredTheme());
                    }}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-2.5 text-center transition-all cursor-pointer ${
                      isSelected
                        ? "border-[var(--brand)] bg-[var(--brand-soft)] shadow-xs scale-[1.02]"
                        : "border-border bg-background/60 hover:bg-surface-elevated"
                    }`}
                  >
                    <div
                      className="relative flex h-7 w-7 items-center justify-center rounded-full shadow-xs border border-black/10 dark:border-white/20"
                      style={{ background: preset.swatch }}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                    </div>
                    <span className="text-[11px] font-medium text-foreground truncate w-full">
                      {t(preset.name)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading !== null || !selectedAccent}
            className="w-full rounded-full bg-[var(--brand)] hover:brightness-110 text-white py-3 px-5 text-sm font-semibold transition-all shadow-md shadow-[var(--brand-shadow)] active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading === "form" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("Complete registration")
            )}
          </button>
        </form>
      ) : (
        /* Form view for email input / registration step 1 / forgot password */
        <form onSubmit={handleFormSubmit} className="w-full flex flex-col gap-3 text-left">
          {/* Back button */}
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setShowEmailForm(false);
              setIsForgot(false);
              setError(null);
            }}
            className="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-1 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t("All sign-in options")}</span>
          </button>

          {mode === "signup" && !isForgot && (
            <>
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={loading !== null}
                className="w-full rounded-full border border-border bg-surface hover:bg-surface-elevated text-foreground dark:border-white/10 dark:bg-[#141416]/90 dark:hover:bg-[#1a1a1e] dark:text-white py-2.5 px-5 flex items-center justify-center gap-3 text-sm font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50"
              >
                {loading === "google" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--brand)]" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>{t("Sign in with Google")}</span>
              </button>
              <div className="flex items-center gap-3 my-0.5 w-full">
                <div className="h-px bg-border flex-1" />
                <span className="text-xs text-muted-foreground font-normal">{t("or")}</span>
                <div className="h-px bg-border flex-1" />
              </div>
            </>
          )}

          {/* Email input */}
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              autoComplete="email"
              className="w-full rounded-full border border-border bg-surface pl-11 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground dark:border-white/10 dark:bg-[#141416]/90 dark:text-white outline-none transition-all focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand-border)]"
            />
          </div>

          {/* Password input */}
          {!isForgot && (
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? t("Minimum 6 characters") : t("Password")}
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="w-full rounded-full border border-border bg-surface pl-11 pr-11 py-3 text-sm text-foreground placeholder:text-muted-foreground dark:border-white/10 dark:bg-[#141416]/90 dark:text-white outline-none transition-all focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand-border)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                aria-label={showPassword ? t("Hide password") : t("Show password")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}

          {/* Confirm Password input (signup only) */}
          {mode === "signup" && !isForgot && (
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("Confirm password")}
                required
                autoComplete="new-password"
                className={`w-full rounded-full border bg-surface pl-11 pr-11 py-3 text-sm text-foreground placeholder:text-muted-foreground dark:bg-[#141416]/90 dark:text-white outline-none transition-all ${
                  confirmPassword && !passwordsMatch
                    ? "border-red-500/80 focus:ring-1 focus:ring-red-500"
                    : "border-border dark:border-white/10 focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand-border)]"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                aria-label={showConfirmPassword ? t("Hide password") : t("Show password")}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}

          {/* Mandatory legal agreement checkboxes (signup only) */}
          {mode === "signup" && !isForgot && (
            <div className="mt-1 flex flex-col gap-2">
              <div
                className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs leading-snug transition-colors select-none ${
                  consentAttempted && !acceptedTerms
                    ? "border-red-500/60 bg-red-500/5"
                    : "border-border bg-surface/60 hover:bg-surface-elevated/70 dark:border-white/10 dark:bg-[#141416]/70"
                }`}
              >
                <input
                  id="signup-accept-terms"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => {
                    setAcceptedTerms(e.target.checked);
                    if (e.target.checked && acceptedPrivacy) setError(null);
                  }}
                  aria-required="true"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border accent-[var(--brand)] cursor-pointer"
                />
                <div className="text-foreground/90">
                  <label htmlFor="signup-accept-terms" className="cursor-pointer">
                    {t("I accept the")}{" "}
                  </label>
                  <a
                    href={USER_AGREEMENT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[var(--brand)] underline underline-offset-2 hover:brightness-110"
                  >
                    {t("User Agreement")}
                  </a>
                  <span className="text-red-500 ml-0.5">*</span>
                </div>
              </div>

              <div
                className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs leading-snug transition-colors select-none ${
                  consentAttempted && !acceptedPrivacy
                    ? "border-red-500/60 bg-red-500/5"
                    : "border-border bg-surface/60 hover:bg-surface-elevated/70 dark:border-white/10 dark:bg-[#141416]/70"
                }`}
              >
                <input
                  id="signup-accept-privacy"
                  type="checkbox"
                  checked={acceptedPrivacy}
                  onChange={(e) => {
                    setAcceptedPrivacy(e.target.checked);
                    if (e.target.checked && acceptedTerms) setError(null);
                  }}
                  aria-required="true"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border accent-[var(--brand)] cursor-pointer"
                />
                <div className="text-foreground/90">
                  <label htmlFor="signup-accept-privacy" className="cursor-pointer">
                    {t("I accept the")}{" "}
                  </label>
                  <a
                    href={PRIVACY_POLICY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[var(--brand)] underline underline-offset-2 hover:brightness-110"
                  >
                    {t("Privacy Policy (consent)")}
                  </a>
                  <span className="text-red-500 ml-0.5">*</span>
                </div>
              </div>
            </div>
          )}

          {/* Forgot password link */}
          {mode === "signin" && !isForgot && (
            <div className="flex justify-end pr-2">
              <button
                type="button"
                onClick={() => setIsForgot(true)}
                className="text-xs text-muted-foreground hover:text-[var(--brand)] transition-colors"
              >
                {t("Forgot password?")}
              </button>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading !== null || (mode === "signup" && !passwordsMatch)}
            className="mt-1 w-full rounded-full bg-[var(--brand)] hover:brightness-110 text-white py-3 px-5 text-sm font-semibold transition-all shadow-md shadow-[var(--brand-shadow)] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading === "form" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isForgot ? (
              t("Reset password")
            ) : mode === "signin" ? (
              t("Sign in to account")
            ) : (
              t("Continue")
            )}
          </button>
        </form>
      )}

      {/* Instant 1-click continue fallback */}
      {onGuestContinue && signupStep === "credentials" && mode === "signin" && (
        <div className="mt-4 w-full">
          <button
            type="button"
            onClick={() => {
              const name = email.trim() ? email.trim().split("@")[0] : t("Guest");
              const userEmail = email.trim() || "guest@igseek.ai";
              onGuestContinue(name, userEmail);
              onSuccess?.();
            }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
          >
            {t("Quick sign-in without password")}
          </button>
        </div>
      )}

      {/* Footer text with links matching brand accent */}
      <p className="mt-7 text-center text-[11px] leading-relaxed text-muted-foreground max-w-xs">
        {t("By continuing, you agree to our")}
        <br />
        <a
          href={USER_AGREEMENT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--brand)] hover:underline"
        >
          {t("Terms of Use")}
        </a>{" "}
        {t("and")}{" "}
        <a
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--brand)] hover:underline"
        >
          {t("Privacy Policy")}
        </a>
      </p>
    </div>
  );
}
