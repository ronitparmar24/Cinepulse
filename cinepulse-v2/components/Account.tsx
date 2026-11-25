"use client";
import { YourTastePanel } from './YourTastePanel';
import { openWrapped, wrappedYear } from '@/lib/wrappedClient';
import { ReminderSettings } from './ReminderSettings';
import { ServicesPicker } from './ServicesPicker';
import { syncLocalFeedbackToAccount } from '@/lib/clientLocalFeedback';
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  Download,
  Upload,
  Eye,
  EyeOff,
  LogOut,
  ShieldCheck,
  Trash2,
  UserRound,
  Mail,
  RotateCcw,
  Lock,
  Settings,
  Shield,
  Globe,
  ExternalLink,
  Check,
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  KeyRound,
  LoaderCircle,
  Sparkles,
  Copy,
  Star,
  Users,
  Tv,
} from "lucide-react";
import type { User, PrivacySettings, VisibilityLevel } from "@/lib/types";
import { TurnstileWidget, TURNSTILE_SITE_KEY } from "./TurnstileWidget";
import { api } from "./client";
import { useApp } from "./Context";
import { ErrorBox, Logo, Modal, Loading } from "./UI";
import { useSlidingIndicator } from "./hooks/useSlidingIndicator";
import { forgetLastAccount, readLastAccount, saveLastAccount, type LastAccount, type SignInMethod } from "@/lib/lastAccount";

// The import screen (and its ZIP reader) loads only when the tab is opened.
const LetterboxdImport = dynamic(() => import("./LetterboxdImport").then((m) => m.LetterboxdImport), { loading: Loading });

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
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
  );
}

function GoogleSpinner({ size = 18 }: { size?: number }) {
  return (
    <svg className="google-spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="rgba(66, 133, 244, 0.25)" strokeWidth="2.5" />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke="#4285F4"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Password Strength Calculator ──
function calculatePasswordStrength(pwd: string) {
  if (!pwd) return { score: 0, label: "Enter password", color: "#64748b" };
  let s = 0;
  if (pwd.length >= 8) s++;
  if (pwd.length >= 10) s++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) s++;

  const levels = [
    { label: "Too short", color: "#ef4444" },
    { label: "Weak", color: "#f97316" },
    { label: "Fair", color: "#eab308" },
    { label: "Good", color: "#10b981" },
    { label: "Strong & Secure", color: "#34d399" },
  ];
  return { score: s, ...levels[s] };
}

// ── Reusable Segmented 6-Box OTP Input ──
export function OtpInput6({
  value,
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
  theme = "emerald",
  prefix,
  autoFocus = true,
}: {
  value: string;
  onChange: (val: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  theme?: "emerald" | "google";
  prefix?: string;
  autoFocus?: boolean;
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");

  useEffect(() => {
    if (autoFocus && inputsRef.current[0]) {
      const firstEmpty = digits.findIndex((d) => !d);
      const target = firstEmpty === -1 ? 0 : firstEmpty;
      inputsRef.current[target]?.focus();
    }
  }, []);

  const handleDigitChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, "");
    if (!rawVal) {
      const chars = Array.from({ length: 6 }, (_, i) => value[i] || "");
      chars[index] = "";
      const nextVal = chars.join("").trimEnd();
      onChange(nextVal);
      return;
    }

    if (rawVal.length > 1) {
      const chars = Array.from({ length: 6 }, (_, i) => value[i] || "");
      for (let i = 0; i < rawVal.length && index + i < 6; i++) {
        chars[index + i] = rawVal[i];
      }
      const nextVal = chars.join("").slice(0, 6);
      onChange(nextVal);
      const nextFocus = Math.min(index + rawVal.length, 5);
      inputsRef.current[nextFocus]?.focus();
      if (nextVal.length === 6 && onComplete) {
        onComplete(nextVal);
      }
      return;
    }

    const singleDigit = rawVal.slice(-1);
    const chars = Array.from({ length: 6 }, (_, i) => value[i] || "");
    chars[index] = singleDigit;
    const nextVal = chars.join("").slice(0, 6);
    onChange(nextVal);

    if (index < 5 && singleDigit) {
      inputsRef.current[index + 1]?.focus();
      inputsRef.current[index + 1]?.select();
    }
    if (nextVal.length === 6 && onComplete) {
      onComplete(nextVal);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        e.preventDefault();
        const chars = Array.from({ length: 6 }, (_, i) => value[i] || "");
        chars[index - 1] = "";
        onChange(chars.join("").trimEnd());
        inputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    onChange(pasted);
    const focusTarget = Math.min(pasted.length, 5);
    inputsRef.current[focusTarget]?.focus();
    if (pasted.length === 6 && onComplete) {
      onComplete(pasted);
    }
  };

  return (
    <div
      className={`otp-digit-wrapper ${theme === "google" ? "theme-google" : "theme-emerald"} ${
        hasError ? "is-shaking" : ""
      }`}
    >
      <div className="otp-digit-center-row">
        {prefix && <span className="otp-digit-prefix">{prefix}</span>}
        <div className="otp-digit-row">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputsRef.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              disabled={disabled}
              value={digit}
              onChange={(e) => handleDigitChange(i, e)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              className={`otp-digit-cell ${digit ? "has-value" : ""} ${
                hasError ? "has-error" : ""
              }`}
              aria-label={`Digit ${i + 1} of 6`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuthDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: (user: User) => void;
}) {
  const { refresh, toast } = useApp();
  const [register, setRegister] = useState(false);
  const [authMethod, setAuthMethod] = useState<"otp" | "password">("otp");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  // Google OAuth: the button works when the server has Google credentials. In local development
  // without them, the button explains the one-time setup instead of faking an account.
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [googleSetupNeeded, setGoogleSetupNeeded] = useState(false);
  const [showGoogleSetup, setShowGoogleSetup] = useState(false);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  // Cloudflare Turnstile token (single-use); empty when the widget is not configured.
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);

  // "Keep me signed in on this device" (90-day sliding session) — on by default.
  const [remember, setRemember] = useState(true);
  // The account last used on this device, for one-tap "Continue as".
  const [lastAccount, setLastAccount] = useState<LastAccount | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  // Standard Email Flow
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [otpDevCode, setOtpDevCode] = useState("");
  const [notice, setNotice] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((s) => s - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  useEffect(() => {
    let cancelled = false;
    setLastAccount(readLastAccount());
    api<{ googleAuth: boolean; googleSetupNeeded?: boolean }>("/auth/config")
      .then((cfg) => {
        if (cancelled) return;
        setGoogleAvailable(Boolean(cfg.googleAuth));
        setGoogleSetupNeeded(Boolean(cfg.googleSetupNeeded));
      })
      .catch(() => { if (!cancelled) setGoogleAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  function finishSignIn(user: User, method: SignInMethod, greeting: string) {
    try { localStorage.setItem('cinepulse_user', JSON.stringify(user)); } catch {}
    saveLastAccount(user, method);
    toast(greeting);
    void syncLocalFeedbackToAccount().then(cnt => { if (cnt > 0) toast(`Synced ${cnt} guest taste choices to your account!`); });
    onSuccess?.(user);
    onClose();
  }

  async function requestCode(formName: string, formEmail: string, formPassword: string) {
    const res = await api<{
      email: string;
      name: string;
      devMode?: boolean;
      code?: string;
      notice?: string;
    }>("/auth/otp/request", "POST", {
      name: formName,
      email: formEmail,
      password: formPassword,
      register,
      turnstileToken,
    });
    setPendingEmail(res.email);
    setOtpDevCode(res.code || "");
    setNotice(res.notice || "");
    setStep("otp");
    setOtpInput("");
    setResendTimer(45);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const formName = ((form.get("name") as string) || nameInput).trim();
    const formEmail = ((form.get("email") as string) || emailInput).trim();
    const formPassword = (form.get("password") as string) || passwordInput;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail)) {
      setError("Please enter a valid email address");
      setBusy(false);
      return;
    }

    try {
      if (authMethod === "otp" || register) {
        await requestCode(formName, formEmail, formPassword);
      } else {
        const loginRes = await api<{ user: User; token?: string }>("/auth/login", "POST", {
          email: formEmail,
          password: formPassword,
          turnstileToken,
          remember,
        });
        await refresh();
        if (loginRes.user) finishSignIn(loginRes.user, "password", `Welcome back, ${firstName(loginRes.user)}.`);
        else onClose();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (TURNSTILE_SITE_KEY) setTurnstileReset((n) => n + 1);
    }
  }

  async function handleVerifyOtp(codeToVerify?: string) {
    const code = (codeToVerify || otpInput).trim().replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) {
      setError("Please enter a complete 6-digit code");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api<{ user: User; token?: string; welcome: boolean }>(
        "/auth/otp/verify",
        "POST",
        { email: pendingEmail, code, remember },
      );
      await refresh();
      finishSignIn(
        res.user,
        "email",
        register ? `Welcome to CinePulse, ${firstName(res.user)}!` : `Welcome back, ${firstName(res.user)}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResendOtp() {
    if (resendTimer > 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ ok: boolean; devMode?: boolean; code?: string; notice?: string }>("/auth/otp/resend", "POST", {
        email: pendingEmail,
      });
      if (res.code) setOtpDevCode(res.code);
      setResendTimer(45);
      toast("A new 6-digit code has been sent.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function returnPath() {
    const url = new URL(window.location.href);
    url.searchParams.delete("auth_success");
    url.searchParams.delete("auth_error");
    return url.pathname + url.search;
  }

  function handleGoogleAuth(loginHint?: string) {
    setError("");
    if (!googleAvailable) {
      if (googleSetupNeeded) setShowGoogleSetup(true);
      else setError("Google sign-in is not available right now. Use your email instead.");
      return;
    }
    setGoogleConnecting(true);
    const params = new URLSearchParams({ returnTo: returnPath() });
    if (!remember) params.set("remember", "0");
    if (loginHint) params.set("login_hint", loginHint);
    window.location.href = `/api/auth/google?${params.toString()}`;
  }

  async function continueAsLast() {
    if (!lastAccount) return;
    setError("");
    if (lastAccount.method === "google") {
      handleGoogleAuth(lastAccount.email);
      return;
    }
    setRegister(false);
    setEmailInput(lastAccount.email);
    if (lastAccount.method === "password") {
      setAuthMethod("password");
      setLastAccount(null);
      setTimeout(() => passwordRef.current?.focus(), 60);
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      // The human check has to finish first; show the form with the email filled in.
      setAuthMethod("otp");
      setLastAccount(null);
      return;
    }
    setBusy(true);
    try {
      await requestCode("", lastAccount.email, "");
    } catch (e) {
      setLastAccount(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (TURNSTILE_SITE_KEY) setTurnstileReset((n) => n + 1);
    }
  }

  const showGoogle = googleAvailable || googleSetupNeeded;
  const modalLabel = step === "otp" ? "Verify your email" : register ? "Create your account" : "Sign in to Cinepulse";

  return (
    <Modal label={modalLabel} onClose={onClose} wide>
      <div className="auth auth2">
        <aside className="auth2-art" aria-hidden="true">
          <div className="auth2-art-glow" />
          <div className="auth2-reel">
            {AUTH_REEL.map((tone, i) => (
              <span key={i} style={{ "--i": i, "--tone": tone } as React.CSSProperties} />
            ))}
          </div>
          <div className="auth2-art-copy">
            <Logo />
            <h3>Your own little corner of cinema.</h3>
            <ul>
              <li><Bookmark size={15} /> A watchlist that follows you to every device</li>
              <li><Activity size={15} /> Opening-night calls, timestamped and scored</li>
              <li><Sparkles size={15} /> Picks that learn your taste, not the algorithm&apos;s</li>
            </ul>
          </div>
        </aside>

        <div className="auth2-main">
          {step === "otp" ? (
            <div className="standard-otp-panel auth2-step" role="region" aria-label="Email Verification Code">
              <div className="standard-otp-brand">
                <div className="standard-otp-icon-wrap auth2-mail">
                  <Mail size={22} />
                </div>
                <h3>Check your inbox</h3>
                <p>Enter the 6-digit code we sent to</p>
                <div className="standard-otp-email-chip">
                  <span className="email-text">{pendingEmail}</span>
                  <button
                    type="button"
                    className="edit-email-btn"
                    onClick={() => { setStep("form"); setError(""); }}
                    disabled={busy}
                  >
                    Change
                  </button>
                </div>
              </div>

              {otpDevCode && (
                <button
                  type="button"
                  className="otp-dev-badge"
                  onClick={() => { setOtpInput(otpDevCode); void handleVerifyOtp(otpDevCode); }}
                  title="Shown only in local development"
                >
                  <span className="otp-dev-badge-left">
                    <Shield size={13} />
                    <span>Dev code: <strong>{otpDevCode}</strong></span>
                  </span>
                  <span className="otp-dev-badge-action">Fill &amp; verify</span>
                </button>
              )}

              {notice && (
                <div className="otp-delivery-notice">
                  <AlertTriangle size={14} className="notice-icon" />
                  <span className="notice-text">{notice}</span>
                </div>
              )}

              <OtpInput6
                theme="emerald"
                value={otpInput}
                onChange={setOtpInput}
                onComplete={(val) => handleVerifyOtp(val)}
                disabled={busy}
                hasError={Boolean(error)}
                autoFocus
              />

              {error && (
                <div id="auth-form-error" style={{ marginBottom: "12px" }}>
                  <ErrorBox message={error} />
                </div>
              )}

              <button
                className={`button primary full auth2-submit ${busy ? "is-busy" : ""}`}
                disabled={busy || otpInput.length !== 6}
                onClick={() => handleVerifyOtp()}
              >
                {busy ? <><LoaderCircle size={16} className="spin" /> Verifying…</> : <>Verify &amp; continue <ArrowRight size={16} /></>}
              </button>

              <div className="standard-otp-nav-row">
                <button type="button" className="standard-nav-btn" onClick={() => { setStep("form"); setError(""); }} disabled={busy}>
                  <ArrowLeft size={13} /> Back
                </button>
                <button type="button" className="standard-resend-btn" onClick={handleResendOtp} disabled={busy || resendTimer > 0}>
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend code"}
                </button>
              </div>

              <p className="auth2-fineprint">
                <ShieldCheck size={13} /> Codes work once and expire in 10 minutes.
                {remember ? " You'll stay signed in on this device." : ""}
              </p>
            </div>
          ) : (
            <div className="auth-form-container auth2-step">
              <div className="auth2-tabs" role="tablist" aria-label="Account" data-mode={register ? "register" : "signin"}>
                <span className="auth2-tabs-pill" aria-hidden="true" />
                <button type="button" role="tab" aria-selected={!register} onClick={() => { setRegister(false); setError(""); }} disabled={busy}>
                  Sign in
                </button>
                <button type="button" role="tab" aria-selected={register} onClick={() => { setRegister(true); setError(""); }} disabled={busy}>
                  Create account
                </button>
              </div>

              <h2 className="auth2-title">{register ? "Good taste deserves a home." : "Welcome back, film person."}</h2>
              <p className="auth2-sub">
                {register ? "Save the stories you love. Discover the ones you will." : "Your watchlist and your opening-night calls are waiting."}
              </p>

              {lastAccount && !register && (
                <div className="auth2-continue">
                  <button type="button" className="auth2-continue-btn" onClick={() => void continueAsLast()} disabled={busy || googleConnecting}>
                    <span className="auth2-avatar">
                      {lastAccount.avatarUrl ? (
                        <img src={lastAccount.avatarUrl} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        lastAccount.name.slice(0, 1).toUpperCase()
                      )}
                      {lastAccount.method === "google" && <i><GoogleIcon size={11} /></i>}
                    </span>
                    <span className="auth2-continue-text">
                      <b>Continue as {lastAccount.name.split(" ")[0]}</b>
                      <small>{lastAccount.email}</small>
                    </span>
                    {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}
                  </button>
                  <button
                    type="button"
                    className="auth2-notyou"
                    onClick={() => { forgetLastAccount(); setLastAccount(null); }}
                    disabled={busy}
                  >
                    Not you?
                  </button>
                </div>
              )}

              {showGoogle && (
                <button
                  type="button"
                  className={`auth2-google ${googleConnecting ? "is-loading" : ""}`}
                  disabled={busy || googleConnecting}
                  onClick={() => handleGoogleAuth()}
                >
                  {googleConnecting ? <GoogleSpinner size={18} /> : <GoogleIcon size={18} />}
                  <span>{googleConnecting ? "Opening Google…" : register ? "Sign up with Google" : "Continue with Google"}</span>
                </button>
              )}

              {showGoogleSetup && (
                <div className="auth2-setup" role="note">
                  <b><Settings size={13} /> Connect Google sign-in (one-time setup)</b>
                  <ol>
                    <li>Google Cloud Console → APIs &amp; Services → Credentials → <em>Create OAuth client ID</em> (Web application).</li>
                    <li>Authorized redirect URI: <code>{typeof window !== "undefined" ? window.location.origin : ""}/api/auth/google/callback</code></li>
                    <li>Put <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code>, then restart the dev server.</li>
                  </ol>
                  <small>Only you see this note — it appears in local development while Google is not configured.</small>
                </div>
              )}

              {showGoogle && (
                <div className="auth-divider auth2-divider">
                  <span>or with email</span>
                </div>
              )}

              <form onSubmit={submit} aria-busy={busy} aria-describedby={error ? "auth-form-error" : undefined} className="auth2-form">
                {!register && (
                  <div className="auth2-method" role="radiogroup" aria-label="Sign-in method" data-method={authMethod}>
                    <span className="auth2-method-pill" aria-hidden="true" />
                    <button type="button" role="radio" aria-checked={authMethod === "otp"} onClick={() => { setAuthMethod("otp"); setError(""); }} disabled={busy}>
                      <Mail size={13} /> Email code
                    </button>
                    <button type="button" role="radio" aria-checked={authMethod === "password"} onClick={() => { setAuthMethod("password"); setError(""); }} disabled={busy}>
                      <KeyRound size={13} /> Password
                    </button>
                  </div>
                )}
                {register && (
                  <label className="auth2-field">
                    <span>Your name</span>
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={60}
                      placeholder="What should we call you?"
                      disabled={busy}
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                    />
                  </label>
                )}
                <label className="auth2-field">
                  <span>Email address</span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    placeholder="you@example.com"
                    disabled={busy}
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                  />
                </label>
                {(authMethod === "password" || register) && (
                  <label className="auth2-field">
                    <span>{register ? "Password (optional — you can always use email codes)" : "Password"}</span>
                    <div className="password-field">
                      <input
                        ref={passwordRef}
                        type={visible ? "text" : "password"}
                        name="password"
                        autoComplete={register ? "new-password" : "current-password"}
                        required={!register}
                        minLength={register ? 8 : 1}
                        maxLength={128}
                        placeholder={register ? "At least 8 characters" : "Your password"}
                        disabled={busy}
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                      />
                      <button type="button" disabled={busy} onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>
                        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {register && passwordInput && (
                      <div className="password-strength-container">
                        <div className="password-strength-bars">
                          {[1, 2, 3, 4].map((bar) => {
                            const strength = calculatePasswordStrength(passwordInput);
                            return (
                              <div
                                key={bar}
                                className="strength-bar"
                                style={{ background: bar <= strength.score ? strength.color : "rgba(255, 255, 255, 0.08)" }}
                              />
                            );
                          })}
                        </div>
                        <div className="password-strength-label">
                          <span>Strength</span>
                          <span style={{ color: calculatePasswordStrength(passwordInput).color }}>
                            {calculatePasswordStrength(passwordInput).label}
                          </span>
                        </div>
                      </div>
                    )}
                  </label>
                )}

                <label className="auth2-remember">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={busy} />
                  <span className="auth2-switch" aria-hidden="true"><i /></span>
                  <span className="auth2-remember-text">
                    <b>Keep me signed in on this device</b>
                    <small>{remember ? "For 90 days, renewed each time you visit." : "You'll be signed out when you close the browser."}</small>
                  </span>
                </label>

                {error && (
                  <div id="auth-form-error" className="auth2-error">
                    <ErrorBox message={error} />
                  </div>
                )}
                <TurnstileWidget action={register ? "signup" : "login"} onToken={setTurnstileToken} resetKey={turnstileReset} />
                <button
                  className={`button primary full auth2-submit ${busy ? "is-busy" : ""}`}
                  disabled={busy || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)}
                >
                  {busy ? (
                    <><LoaderCircle size={16} className="spin" /> One moment…</>
                  ) : (
                    <>
                      {authMethod === "otp" || register ? (register ? "Create account" : "Email me a sign-in code") : "Sign in"}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>

              <p className="auth2-fineprint">
                <ShieldCheck size={13} /> Passwords are stored only as salted scrypt hashes. Google sign-in shares just your name, email and photo.
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

const AUTH_REEL = ["#7dd3fc", "#b3f3d5", "#fca5a5", "#fcd34d", "#c4b5fd", "#86efac", "#f9a8d4", "#93c5fd"];

function firstName(user: User): string {
  return (user.displayName || user.name || "film lover").split(" ")[0];
}

// ── Profile dashboard pieces ───────────────────────────────────────────────

function useCountUpInt(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

function StatCard({ icon: Icon, value, label, decimals = 0, suffix = "", index }: {
  icon: typeof Bookmark;
  value: number;
  label: string;
  decimals?: number;
  suffix?: string;
  index: number;
}) {
  const shown = useCountUpInt(value);
  return (
    <div className="pf-stat" style={{ "--i": index } as React.CSSProperties}>
      <span className="pf-stat-icon"><Icon size={15} /></span>
      <strong>{value === 0 && decimals > 0 ? "—" : `${shown.toFixed(decimals)}${suffix}`}</strong>
      <span>{label}</span>
    </div>
  );
}

const PRIVACY_LEVELS: Array<{ value: VisibilityLevel; label: string; icon: typeof Globe }> = [
  { value: "public", label: "Public", icon: Globe },
  { value: "followers_only", label: "Followers", icon: Users },
  { value: "private", label: "Only me", icon: Lock },
];

function VisibilityPicker({ value, onChange, label }: { value: VisibilityLevel; onChange: (v: VisibilityLevel) => void; label: string }) {
  const index = Math.max(0, PRIVACY_LEVELS.findIndex((l) => l.value === value));
  return (
    <div className="pf-vis" role="radiogroup" aria-label={label} style={{ "--idx": index } as React.CSSProperties}>
      <span className="pf-vis-pill" aria-hidden="true" />
      {PRIVACY_LEVELS.map((l) => (
        <button key={l.value} type="button" role="radio" aria-checked={value === l.value} onClick={() => onChange(l.value)}>
          <l.icon size={12} /> {l.label}
        </button>
      ))}
    </div>
  );
}

function memberSince(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { user, library, refresh, toast, openTitle } = useApp();
  const [activeTab, setActiveTab] = useState<"overview" | "edit" | "privacy" | "services" | "taste" | "import">("overview");
  const [deleting, setDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"request" | "verify">("request");
  const [deleteOtp, setDeleteOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Edit profile state
  const [username, setUsername] = useState(user?.username || "");
  const [displayName, setDisplayName] = useState(user?.displayName || user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [profileVis, setProfileVis] = useState<VisibilityLevel>(user?.profileVisibility || "public");
  const [userRegion, setUserRegion] = useState(user?.region || "IN");

  // Privacy settings state
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const tabsNav = useSlidingIndicator<HTMLDivElement>(activeTab);

  useEffect(() => {
    if (activeTab === "privacy") {
      setPrivacyLoading(true);
      api<{ settings: PrivacySettings }>("/privacy/settings")
        .then((res) => setPrivacy(res.settings))
        .catch(() => {})
        .finally(() => setPrivacyLoading(false));
    }
  }, [activeTab]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ ok: boolean; error?: string }>("/profile", "POST", {
        username: username.trim(),
        displayName: displayName.trim(),
        bio: bio.trim(),
        profileVisibility: profileVis,
        region: userRegion,
      });
      if (res.ok) {
        await refresh();
        toast("Public profile updated successfully!");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdatePrivacy(updates: Partial<PrivacySettings>) {
    if (!privacy) return;
    const next = { ...privacy, ...updates };
    setPrivacy(next);
    try {
      await api("/privacy/settings", "PUT", updates);
      toast("Privacy settings updated.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api("/auth/logout", "POST");
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('cinepulse_user');
          localStorage.removeItem('cinepulse_token');
        } catch {}
      }
      await refresh();
      onClose();
      toast("You are signed out.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function requestDeleteOtpBtn() {
    setBusy(true);
    setError("");
    try {
      await api("/account/delete/otp", "POST");
      setDeleteStep("verify");
      toast("Deletion code sent to your email.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/account", "DELETE", { otp: deleteOtp });
      await refresh();
      onClose();
      toast("Your account and its data have been deleted.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const watched = library.filter((x) => x.status === "watched").length;
  const watching = library.filter((x) => x.status === "watching").length;
  const saved = library.filter((x) => x.status === "watchlist").length;
  const ratedEntries = library.filter((x) => x.rating !== null && x.rating > 0);
  const avgRating = ratedEntries.length ? ratedEntries.reduce((s, x) => s + (x.rating || 0), 0) / ratedEntries.length : 0;
  const recent = [...library].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 6);
  const total = Math.max(1, library.length);
  const profileUrl = `/u/${user?.username || user?.id || ""}`;
  const avatar = user?.avatarUrl && user.avatarUrl.startsWith("https://") ? user.avatarUrl : null;
  const since = memberSince(user?.createdAt);
  const checklist = [
    { done: Boolean(user?.username), label: "Pick a username", tab: "edit" as const },
    { done: Boolean(user?.bio && user.bio.trim()), label: "Write a short bio", tab: "edit" as const },
    { done: Boolean(avatar), label: "Add a profile photo (sign in with Google)", tab: "edit" as const },
    { done: library.length > 0, label: "Save your first title", tab: null },
    { done: ratedEntries.length > 0, label: "Rate a film you've seen", tab: null },
  ];
  const completeness = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);
  const nextStep = checklist.find((c) => !c.done);
  const ringC = 2 * Math.PI * 22;

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${profileUrl}`);
      toast("Profile link copied.");
    } catch {
      toast("Could not copy the link — select it from the address bar instead.");
    }
  }

  const TABS: Array<{ id: typeof activeTab; label: string; icon: typeof Bookmark }> = [
    { id: "overview", label: "Overview", icon: UserRound },
    { id: "taste", label: "Taste", icon: Sparkles },
    { id: "edit", label: "Profile", icon: Settings },
    { id: "privacy", label: "Privacy", icon: Shield },
    { id: "services", label: "Services", icon: Tv },
    { id: "import", label: "Import", icon: Upload },
  ];

  return (
    <Modal label="Your CinePulse account" onClose={onClose}>
      <div className="profile pf">
        <div className="pf-tabs" role="tablist" aria-label="Account sections" ref={tabsNav.ref} style={tabsNav.style}>
          <span className={`pf-tabs-pill ${tabsNav.ready ? "is-ready" : ""}`} aria-hidden="true" />
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-label={t.label}
              aria-selected={activeTab === t.id}
              className={activeTab === t.id ? "active" : ""}
              onClick={() => { setActiveTab(t.id); setError(""); }}
            >
              <t.icon size={13} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="pf-panel" key={activeTab}>
          {activeTab === "overview" && (
            <>
              <section className="pf-hero">
                <div className="pf-cover" aria-hidden="true"><i /><i /><i /></div>
                <div className="pf-avatar-wrap">
                  <span className="pf-avatar-ring" aria-hidden="true" />
                  <span className="pf-avatar">
                    {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : (user?.displayName || user?.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="pf-online" title="Signed in on this device" />
                </div>
                <span className="eyebrow mint pf-eyebrow">CINEPULSE MEMBER{since ? ` · SINCE ${since.toUpperCase()}` : ""}</span>
                <h2 className="pf-name">{user?.displayName || user?.name}</h2>
                <div className="pf-handle">
                  {user?.username && <span>@{user.username}</span>}
                  <span className="pf-dot" />
                  <span>{user?.email}</span>
                </div>
                <div className="pf-badges">
                  {user?.isGoogle && <span className="pf-badge"><GoogleIcon size={12} /> Google account</span>}
                  <span className="pf-badge"><Globe size={12} /> {user?.region === "US" ? "United States" : "India"}</span>
                  <span className="pf-badge">
                    {user?.profileVisibility === "private" ? <Lock size={12} /> : user?.profileVisibility === "followers_only" ? <Users size={12} /> : <Eye size={12} />}
                    {user?.profileVisibility === "private" ? "Private profile" : user?.profileVisibility === "followers_only" ? "Followers only" : "Public profile"}
                  </span>
                </div>
                {user?.bio && <p className="pf-bio">{user.bio}</p>}
              </section>

              <button
                type="button"
                className="wrapped-entry"
                onClick={() => { onClose(); setTimeout(openWrapped, 80); }}
              >
                <span className="wrapped-entry-icon"><Sparkles size={18} /></span>
                <span className="wrapped-entry-text">
                  <b>Your {wrappedYear()} Wrapped</b>
                  <small>Films, hours, top genres and your calls, ready to share</small>
                </span>
                <ArrowRight size={16} />
              </button>

              <div className="pf-stats">
                <StatCard icon={Bookmark} value={library.length} label="In library" index={0} />
                <StatCard icon={Check} value={watched} label="Watched" index={1} />
                <StatCard icon={Star} value={ratedEntries.length} label="Rated" index={2} />
                <StatCard icon={Sparkles} value={avgRating} decimals={1} suffix="★" label="Avg rating" index={3} />
              </div>

              <section className="pf-card pf-mix">
                <div className="pf-card-head">
                  <b>Library mix</b>
                  <small>{library.length} {library.length === 1 ? "title" : "titles"}</small>
                </div>
                <div className="pf-mix-bar" aria-hidden="true">
                  <span className="is-saved" style={{ "--w": `${(saved / total) * 100}%` } as React.CSSProperties} />
                  <span className="is-watching" style={{ "--w": `${(watching / total) * 100}%` } as React.CSSProperties} />
                  <span className="is-watched" style={{ "--w": `${(watched / total) * 100}%` } as React.CSSProperties} />
                </div>
                <div className="pf-mix-legend">
                  <span><i className="is-saved" /> Watchlist {saved}</span>
                  <span><i className="is-watching" /> Watching {watching}</span>
                  <span><i className="is-watched" /> Watched {watched}</span>
                </div>
              </section>

              <section className="pf-card">
                <div className="pf-card-head">
                  <b>Recently in your library</b>
                  {recent.length > 0 && <small>Tap to open</small>}
                </div>
                {recent.length > 0 ? (
                  <div className="pf-recent">
                    {recent.map((e, i) => (
                      <button
                        key={e.title.id}
                        type="button"
                        className="pf-recent-item"
                        style={{ "--i": i } as React.CSSProperties}
                        onClick={() => { onClose(); setTimeout(() => openTitle(e.title.id), 60); }}
                        title={e.title.title}
                      >
                        {e.title.poster ? <img src={e.title.poster.replace("/w500/", "/w185/")} alt="" loading="lazy" /> : <span>{e.title.title.slice(0, 1)}</span>}
                        <em className={`is-${e.status}`}>{e.status === "watchlist" ? "Saved" : e.status === "watching" ? "Watching" : e.rating ? `★ ${e.rating}` : "Watched"}</em>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="pf-empty">
                    <Bookmark size={18} />
                    <span>Nothing saved yet. Tap <b>+</b> on any poster to start your library.</span>
                  </div>
                )}
              </section>

              {completeness < 100 && (
                <section className="pf-card pf-complete">
                  <svg viewBox="0 0 52 52" className="pf-ring" aria-hidden="true">
                    <circle cx="26" cy="26" r="22" className="pf-ring-track" />
                    <circle cx="26" cy="26" r="22" className="pf-ring-value" style={{ strokeDasharray: ringC, strokeDashoffset: ringC * (1 - completeness / 100) }} />
                  </svg>
                  <span className="pf-ring-num">{completeness}%</span>
                  <div className="pf-complete-text">
                    <b>Profile {completeness}% complete</b>
                    <small>Next: {nextStep?.label}</small>
                  </div>
                  {nextStep?.tab && (
                    <button type="button" className="pf-chip" onClick={() => setActiveTab(nextStep.tab!)}>
                      Do it <ArrowRight size={13} />
                    </button>
                  )}
                </section>
              )}

              <div className="pf-actions">
                <a className="pf-action is-primary" href={profileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} />
                  <span><b>Public profile</b><small>{profileUrl}</small></span>
                </a>
                <button type="button" className="pf-action" onClick={() => void copyProfileLink()}>
                  <Copy size={16} />
                  <span><b>Copy link</b><small>Share your profile</small></span>
                </button>
                <a className="pf-action" href="/api/export" download aria-disabled={busy ? "true" : undefined}>
                  <Download size={16} />
                  <span><b>Export data</b><small>JSON download</small></span>
                </a>
                <button type="button" className="pf-action" onClick={() => setActiveTab("import")}>
                  <Upload size={16} />
                  <span><b>Letterboxd</b><small>Import your diary</small></span>
                </button>
              </div>

              <div className="pf-session">
                <span className="pf-session-icon"><ShieldCheck size={15} /></span>
                <span className="pf-session-text">
                  <b>Signed in on this device</b>
                  <small>{user?.isGoogle ? "With Google · stays" : "Stays"} signed in for 90 days, renewed each visit</small>
                </span>
                <button type="button" className="pf-signout" onClick={logout} disabled={busy}>
                  {busy ? <LoaderCircle size={14} className="spin" /> : <LogOut size={14} />} {busy ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </>
          )}

          {activeTab === "edit" && (
            <form onSubmit={handleSaveProfile} className="pf-form">
              <div className="pf-form-head">
                <h3>Public profile</h3>
                <p>This is what other cinephiles see at <code>/u/{username || "username"}</code>.</p>
              </div>
              <label className="pf-field">
                <span>Username</span>
                <div className="pf-input-prefix">
                  <i>/u/</i>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    placeholder="filmgeek"
                    minLength={3}
                    maxLength={24}
                    required
                  />
                  {username.length >= 3 && <Check size={15} className="pf-valid" />}
                </div>
                <small>3–24 characters: letters, numbers, hyphens, underscores.</small>
              </label>
              <label className="pf-field">
                <span>Display name</span>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" maxLength={60} />
              </label>
              <label className="pf-field">
                <span>Bio</span>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell cinephiles about your taste in films…" rows={3} maxLength={300} />
                <small className="pf-count">
                  <span className="pf-count-bar"><i style={{ width: `${(bio.length / 300) * 100}%` }} /></span>
                  {bio.length}/300
                </small>
              </label>
              <div className="pf-field">
                <span>Who can see your profile</span>
                <VisibilityPicker value={profileVis} onChange={setProfileVis} label="Profile visibility" />
              </div>
              <div className="pf-field">
                <span>Catalog &amp; release region</span>
                <div className="pf-region" role="radiogroup" aria-label="Region">
                  {[
                    { v: "IN", t: "India", s: "INR box office, regional cinema" },
                    { v: "US", t: "United States", s: "US dates & streaming" },
                  ].map((r) => (
                    <button key={r.v} type="button" role="radio" aria-checked={userRegion === r.v} className={userRegion === r.v ? "active" : ""} onClick={() => setUserRegion(r.v)}>
                      <b>{r.t}</b>
                      <small>{r.s}</small>
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" className="button primary full pf-save" disabled={busy}>
                {busy ? <><LoaderCircle size={15} className="spin" /> Saving…</> : <>Save changes <Check size={15} /></>}
              </button>
            </form>
          )}

          {activeTab === "taste" && <YourTastePanel />}

          {activeTab === "import" && <LetterboxdImport />}
          {activeTab === "services" && <ServicesPicker />}

          {activeTab === "privacy" && (
            <div className="pf-form">
              <div className="pf-form-head">
                <h3>Privacy</h3>
                <p>Choose who can see each part of your profile. Changes save instantly.</p>
              </div>
              {privacyLoading || !privacy ? (
                <div className="pf-skeletons">
                  {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton pf-skel" />)}
                </div>
              ) : (
                <div className="pf-privacy">
                  {[
                    { key: "watchlistVisibility", label: "Watchlist", desc: "Films you plan to watch" },
                    { key: "diaryVisibility", label: "Diary", desc: "Watch dates and notes (affects future activity)" },
                    { key: "ratingsVisibility", label: "Ratings", desc: "Your star ratings and taste match" },
                    { key: "reviewsVisibility", label: "Reviews", desc: "Your written reviews" },
                    { key: "predictionsVisibility", label: "Predictions", desc: "Opening calls and Brier score" },
                    { key: "activityVisibility", label: "Activity feed", desc: "What appears in others' feeds" },
                  ].map(({ key, label, desc }, i) => (
                    <div key={key} className="pf-privacy-row" style={{ "--i": i } as React.CSSProperties}>
                      <div>
                        <b>{label}</b>
                        <small>{desc}</small>
                      </div>
                      <VisibilityPicker
                        value={(privacy as unknown as Record<string, VisibilityLevel>)[key]}
                        onChange={(v) => handleUpdatePrivacy({ [key]: v } as Partial<PrivacySettings>)}
                        label={`${label} visibility`}
                      />
                    </div>
                  ))}
                  <label className="pf-privacy-row pf-toggle-row">
                    <div>
                      <b>Show in community search</b>
                      <small>Let other cinephiles find you by username</small>
                    </div>
                    <input type="checkbox" checked={privacy.showInSearch} onChange={(e) => handleUpdatePrivacy({ showInSearch: e.target.checked })} />
                    <span className="auth2-switch" aria-hidden="true"><i /></span>
                  </label>
                </div>
              )}
              <ReminderSettings />
            </div>
          )}
        </div>

        {error && (
          <div id="profile-form-error" className="pf-error">
            <ErrorBox message={error} />
          </div>
        )}

        <div className="pf-footer">
          <span><Shield size={13} /> Your interest feedback is always private and only shapes your recommendations.</span>
          <button
            type="button"
            className="pf-danger-link"
            disabled={busy}
            onClick={() => { setDeleting(!deleting); setDeleteStep("request"); setDeleteOtp(""); setError(""); }}
          >
            <Trash2 size={13} /> Delete account
          </button>
        </div>

        {deleting && (
          <div className="pf-delete">
            <div className="pf-delete-head">
              <span><AlertTriangle size={16} /></span>
              <div>
                <b>Delete your account?</b>
                <small>This permanently deletes your library, reviews, forecasts and account. It cannot be undone.</small>
              </div>
            </div>
            {deleteStep === "request" ? (
              <button type="button" className="button danger full" disabled={busy} onClick={requestDeleteOtpBtn}>
                {busy ? "Sending…" : "Email me a deletion code"}
              </button>
            ) : (
              <form onSubmit={remove} aria-busy={busy} aria-describedby={error ? "profile-form-error" : undefined} className="pf-delete-form">
                <small>Enter the 6-digit code we emailed you.</small>
                <OtpInput6 value={deleteOtp} onChange={setDeleteOtp} disabled={busy} hasError={Boolean(error)} autoFocus />
                <button type="submit" className="button danger full" disabled={busy || deleteOtp.length !== 6}>
                  {busy ? "Deleting…" : "Permanently delete account"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
