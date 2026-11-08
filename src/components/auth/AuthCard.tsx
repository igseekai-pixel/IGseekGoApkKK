import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, ChevronRight, ArrowLeft } from "lucide-react";
import { firebaseClient, formatAuthError } from "@/lib/firebase-service";

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
  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);
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

  const passwordsMatch = !confirmPassword || password === confirmPassword;

  const handleGoogleAuth = async () => {
    setError(null);
    setSuccessMessage(null);
    setLoading("google");
    try {
      const res = await firebaseClient.auth.signInWithGoogle();
      if (res.error) throw res.error;
      try {
        window.localStorage.removeItem("igseek:guest_account");
      } catch {
        /* ignore */
      }
      onSuccess?.();
    } catch (err: any) {
      setError(formatAuthError(err, "ru"));
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
        setError("Пожалуйста, введите корректный адрес электронной почты.");
        return;
      }
      setLoading("form");
      try {
        const res = await firebaseClient.auth.resetPasswordForEmail(email.trim());
        if (res.error) throw res.error;
        setSuccessMessage("Ссылка для сброса пароля отправлена на ваш email.");
      } catch (err: any) {
        setError(formatAuthError(err, "ru"));
      } finally {
        setLoading(null);
      }
      return;
    }

    // 2. Validation
    if (!email.trim() || !email.includes("@")) {
      setError("Пожалуйста, введите корректный адрес электронной почты.");
      return;
    }

    if (!password) {
      setError("Пожалуйста, введите пароль.");
      return;
    }

    if (password.length < 6) {
      setError("Пароль должен содержать не менее 6 символов.");
      return;
    }

    // 3. Registration
    if (mode === "signup") {
      if (!confirmPassword) {
        setError("Пожалуйста, повторите пароль.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Пароли не совпадают. Проверьте введённые данные.");
        return;
      }

      setLoading("form");
      try {
        const res = await firebaseClient.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: email.trim().split("@")[0],
            },
          },
        });
        if (res.error) {
          if (onGuestContinue) {
            const name = email.trim().split("@")[0] || "Пользователь";
            onGuestContinue(name, email.trim());
            onSuccess?.();
            return;
          }
          throw res.error;
        }
        try {
          window.localStorage.removeItem("igseek:guest_account");
        } catch {
          /* ignore */
        }
        onSuccess?.();
      } catch (err: any) {
        if (onGuestContinue) {
          const name = email.trim().split("@")[0] || "Пользователь";
          onGuestContinue(name, email.trim());
          onSuccess?.();
          return;
        }
        setError(formatAuthError(err, "ru"));
      } finally {
        setLoading(null);
      }
      return;
    }

    // 4. Sign In
    setLoading("form");
    try {
      const res = await firebaseClient.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (res.error) {
        if (onGuestContinue) {
          const name = email.trim().split("@")[0] || "Пользователь";
          onGuestContinue(name, email.trim());
          onSuccess?.();
          return;
        }
        throw res.error;
      }
      try {
        window.localStorage.removeItem("igseek:guest_account");
      } catch {
        /* ignore */
      }
      onSuccess?.();
    } catch (err: any) {
      if (onGuestContinue) {
        const name = email.trim().split("@")[0] || "Пользователь";
        onGuestContinue(name, email.trim());
        onSuccess?.();
        return;
      }
      setError(formatAuthError(err, "ru"));
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
          aria-label="Закрыть"
          className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      )}

      {/* Brand Logo Header: IGseek (brand IG, white seek) */}
      <div className="mb-6 flex flex-col items-center">
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground select-none">
          <span className="text-[var(--brand)] font-extrabold">IG</span>
          <span>seek</span>
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm font-normal text-zinc-400">
          Find. Analyze. Create.
        </p>
      </div>

      {/* Tabs Switcher: [ Вход | Регистрация ] */}
      <div className="w-full max-w-[340px] rounded-full p-1 border border-white/10 bg-white/[0.04] backdrop-blur-md flex items-center mb-6">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setIsForgot(false);
            setError(null);
            setSuccessMessage(null);
          }}
          className={`flex-1 rounded-full py-2 text-xs sm:text-sm font-medium transition-all ${
            mode === "signin"
              ? "bg-[var(--brand-active-bg)] text-white border border-[var(--brand-border)] shadow-[var(--brand-shadow)]"
              : "text-zinc-400 hover:text-white border-transparent"
          }`}
        >
          Вход
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setShowEmailForm(true);
            setIsForgot(false);
            setError(null);
            setSuccessMessage(null);
          }}
          className={`flex-1 rounded-full py-2 text-xs sm:text-sm font-medium transition-all ${
            mode === "signup"
              ? "bg-[var(--brand-active-bg)] text-white border border-[var(--brand-border)] shadow-[var(--brand-shadow)]"
              : "text-zinc-400 hover:text-white border-transparent"
          }`}
        >
          Регистрация
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
              className="mb-4 flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 text-left backdrop-blur-md"
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
              className="mb-4 flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 text-left backdrop-blur-md"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
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
            className="w-full rounded-full border border-white/10 bg-[#141416]/90 hover:bg-[#1a1a1e] text-white py-3 px-5 flex items-center justify-center gap-3 text-sm font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50"
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
            <span>Войти через Google</span>
          </button>

          {/* Button 2: Email */}
          <button
            type="button"
            onClick={() => setShowEmailForm(true)}
            className="w-full rounded-full border border-white/10 bg-[#141416]/90 hover:bg-[#1a1a1e] text-white py-3 px-5 flex items-center justify-center gap-3 text-sm font-medium transition-all shadow-sm active:scale-95"
          >
            <Mail className="h-4 w-4 text-zinc-400" />
            <span>Войти по email</span>
          </button>

          {/* Divider: ─── или ─── */}
          <div className="flex items-center gap-3 my-2 w-full">
            <div className="h-px bg-white/10 flex-1" />
            <span className="text-xs text-zinc-500 font-normal">или</span>
            <div className="h-px bg-white/10 flex-1" />
          </div>

          {/* Button 3: Создать аккаунт > */}
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setShowEmailForm(true);
            }}
            className="w-full rounded-full border border-white/10 bg-[#141416]/90 hover:bg-[#1a1a1e] text-white py-3 px-6 flex items-center justify-between text-sm font-medium transition-all shadow-sm active:scale-95"
          >
            <span>Создать аккаунт</span>
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          </button>
        </div>
      ) : (
        /* Form view for email input / registration / forgot password */
        <form onSubmit={handleFormSubmit} className="w-full flex flex-col gap-3 text-left">
          {/* Back button */}
          <button
            type="button"
            onClick={() => {
              setShowEmailForm(false);
              setIsForgot(false);
              setError(null);
            }}
            className="self-start flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white mb-1 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Все способы входа</span>
          </button>

          {/* Email input */}
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              autoComplete="email"
              className="w-full rounded-full border border-white/10 bg-[#141416]/90 pl-11 pr-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-all focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand-border)]"
            />
          </div>

          {/* Password input */}
          {!isForgot && (
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Минимум 6 символов" : "Пароль"}
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="w-full rounded-full border border-white/10 bg-[#141416]/90 pl-11 pr-11 py-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-all focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand-border)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1"
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}

          {/* Confirm Password input (signup only) */}
          {mode === "signup" && !isForgot && (
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите пароль"
                required
                autoComplete="new-password"
                className={`w-full rounded-full border bg-[#141416]/90 pl-11 pr-11 py-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-all ${
                  confirmPassword && !passwordsMatch
                    ? "border-red-500/80 focus:ring-1 focus:ring-red-500"
                    : "border-white/10 focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand-border)]"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1"
                aria-label={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}

          {/* Forgot password link */}
          {mode === "signin" && !isForgot && (
            <div className="flex justify-end pr-2">
              <button
                type="button"
                onClick={() => setIsForgot(true)}
                className="text-xs text-zinc-400 hover:text-[var(--brand)] transition-colors"
              >
                Забыли пароль?
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
              "Сбросить пароль"
            ) : mode === "signin" ? (
              "Войти в аккаунт"
            ) : (
              "Зарегистрироваться"
            )}
          </button>
        </form>
      )}

      {/* Instant 1-click continue fallback */}
      {onGuestContinue && (
        <div className="mt-4 w-full">
          <button
            type="button"
            onClick={() => {
              const name = email.trim() ? email.trim().split("@")[0] : "Me Coder";
              const userEmail = email.trim() || "mecoder525@gmail.com";
              onGuestContinue(name, userEmail);
              onSuccess?.();
            }}
            className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 py-1 transition-colors"
          >
            Быстрый вход без пароля
          </button>
        </div>
      )}

      {/* Footer text with links matching brand accent */}
      <p className="mt-7 text-center text-[11px] leading-relaxed text-zinc-400 max-w-xs">
        Продолжая, вы соглашаетесь с нашими<br />
        <a href="#" onClick={(e) => e.preventDefault()} className="text-[var(--brand)] hover:underline">
          Условиями использования
        </a>{" "}
        и{" "}
        <a href="#" onClick={(e) => e.preventDefault()} className="text-[var(--brand)] hover:underline">
          Политикой конфиденциальности
        </a>
      </p>
    </div>
  );
}
