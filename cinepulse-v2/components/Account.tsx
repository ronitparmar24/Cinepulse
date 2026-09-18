"use client";
import { useState, useEffect } from "react";
import {
  ArrowRight,
  Download,
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
} from "lucide-react";
import type { User, PrivacySettings, VisibilityLevel } from "@/lib/types";
import { api } from "./client";
import { useApp } from "./Context";
import { ErrorBox, Logo, Modal } from "./UI";

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
  const [googleGuide, setGoogleGuide] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [notice, setNotice] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((s) => s - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const formName = form.get("name") as string;
    const formEmail = form.get("email") as string;
    const formPassword = form.get("password") as string;

    try {
      if (authMethod === "otp" || register) {
        // Send OTP verification email for both login and register
        const res = await api<{
          email: string;
          name: string;
          devMode?: boolean;
          notice?: string;
        }>("/auth/otp/request", "POST", {
          name: formName,
          email: formEmail,
          password: formPassword,
          register,
        });
        setPendingEmail(res.email);
        setPendingName(res.name);
        setNotice(res.notice || "");
        setStep("otp");
        setOtpInput("");
        setResendTimer(45);
        toast(`Verification code sent to ${res.email}`);
      } else {
        await api("/auth/login", "POST", {
          email: formEmail,
          password: formPassword,
        });
        const { user: u } = await api<{ user: User }>("/auth/me");
        await refresh();
        toast("Good to have you back.");
        if (u) onSuccess?.(u);
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(codeToVerify?: string) {
    const code = (codeToVerify || otpInput).trim();
    if (!/^\d{6}$/.test(code)) {
      setError("Please enter a complete 6-digit code");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api<{ user: User; welcome: boolean }>(
        "/auth/otp/verify",
        "POST",
        {
          email: pendingEmail,
          code,
        },
      );
      await refresh();
      toast(`Welcome to CinePulse, ${res.user.name || "film lover"}!`);
      if (res.user) onSuccess?.(res.user);
      onClose();
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
      await api<{ ok: boolean; notice?: string }>("/auth/otp/resend", "POST", {
        email: pendingEmail,
      });
      setResendTimer(45);
      toast("A new 6-digit code has been sent.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleAuth() {
    setBusy(true);
    setError("");
    try {
      const cfg = await api<{ googleAuth: boolean; supabaseAuth?: boolean }>(
        "/auth/config",
      );
      if (cfg.googleAuth || cfg.supabaseAuth) {
        window.location.href = "/api/auth/google";
        return;
      }
      setGoogleGuide(true);
    } catch {
      window.location.href = "/api/auth/google";
    } finally {
      setBusy(false);
    }
  }

  async function handleDemoGoogleSignIn() {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ user: User }>("/auth/google/demo", "POST", {
        email: emailInput || "ronit@gmail.com",
        name:
          nameInput || (emailInput ? emailInput.split("@")[0] : "Ronit Parmar"),
      });
      await refresh();
      toast(
        register
          ? "Welcome to CinePulse via Google."
          : "Signed in with Google.",
      );
      if (res.user) onSuccess?.(res.user);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      label={
        step === "otp"
          ? "Verify your email"
          : register
            ? "Create your account"
            : "Sign in to Cinepulse"
      }
      onClose={onClose}
    >
      <div className="auth">
        {step === "otp" ? (
          <div
            className="otp-box"
            style={{
              background: "linear-gradient(180deg, #0f172a 0%, #0b1120 100%)",
              border: "1px solid #1e293b",
              borderRadius: "20px",
              padding: "32px 24px",
              textAlign: "center",
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(56, 189, 248, 0.1)",
            }}
          >
            <div style={{ marginBottom: "20px" }}>
              <span
                style={{
                  display: "inline-block",
                  width: "38px",
                  height: "38px",
                  borderRadius: "10px",
                  background:
                    "linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)",
                  lineHeight: "38px",
                  textAlign: "center",
                  fontSize: "20px",
                  boxShadow: "0 0 15px rgba(56, 189, 248, 0.5)",
                }}
              >
                🎬
              </span>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#ffffff",
                  marginTop: "12px",
                  letterSpacing: "-0.5px",
                }}
              >
                Check your email
              </div>
            </div>

            <p
              style={{
                fontSize: "14px",
                color: "#94a3b8",
                lineHeight: 1.6,
                marginBottom: "24px",
              }}
            >
              We sent a 6-digit verification code to{" "}
              <strong style={{ color: "#f8fafc" }}>{pendingEmail}</strong>.
              Enter it below to unlock your account.
            </p>

            {notice && (
              <div
                className="otp-dev-card"
                style={{
                  borderColor: "rgba(239, 68, 68, 0.4)",
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#fca5a5",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "4px",
                  textAlign: "left",
                  marginBottom: "16px",
                }}
              >
                <div style={{ fontWeight: 700 }}>⚠️ Delivery Notice:</div>
                <div style={{ fontSize: "11px", lineHeight: 1.5 }}>
                  {notice}
                </div>
              </div>
            )}

            <div
              style={{
                background: "#070a13",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                borderRadius: "16px",
                padding: "24px 16px",
                marginBottom: "24px",
                boxShadow:
                  "inset 0 0 25px rgba(56, 189, 248, 0.08), 0 8px 20px rgba(0, 0, 0, 0.4)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                  color: "#64748b",
                  marginBottom: "16px",
                }}
              >
                One-Time Verification Code
              </div>

              <div className="otp-input-wrap">
                <input
                  className="otp-input"
                  style={{
                    background: "transparent",
                    border: "none",
                    textAlign: "center",
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                    fontSize: "32px",
                    fontWeight: 800,
                    letterSpacing: "8px",
                    color: "#38bdf8",
                    textShadow: "0 0 20px rgba(56, 189, 248, 0.5)",
                    width: "100%",
                    outline: "none",
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  placeholder="••••••"
                  value={otpInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtpInput(val);
                    if (val.length === 6) {
                      handleVerifyOtp(val);
                    }
                  }}
                  disabled={busy}
                />
              </div>
            </div>

            {error && (
              <div id="auth-form-error">
                <ErrorBox message={error} />
              </div>
            )}

            <button
              className="button primary full"
              disabled={busy || otpInput.length !== 6}
              onClick={() => handleVerifyOtp()}
            >
              {busy ? "Verifying…" : "Verify & Enter CinePulse"}{" "}
              <ArrowRight size={17} />
            </button>

            <div
              className="otp-resend-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "16px",
              }}
            >
              <button
                type="button"
                className="otp-back-btn"
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
                onClick={() => {
                  setStep("form");
                  setError("");
                }}
                disabled={busy}
              >
                ← Edit details
              </button>

              <button
                type="button"
                className="otp-resend-btn"
                style={{
                  background: "none",
                  border: "none",
                  color: "#38bdf8",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
                onClick={handleResendOtp}
                disabled={busy || resendTimer > 0}
              >
                {resendTimer > 0
                  ? `Resend code in ${resendTimer}s`
                  : "Resend code"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <Logo />
            <span className="eyebrow mint">
              YOUR OWN LITTLE CORNER OF CINEMA
            </span>
            <h2>
              {register
                ? "Good taste deserves\na home."
                : "Welcome back,\nfilm person."}
            </h2>
            <p>
              {register
                ? "Save the stories you love. Discover the ones you will."
                : "Your watchlist and your opening-night calls are waiting."}
            </p>

            <button
              type="button"
              className="button google-button full"
              disabled={busy}
              onClick={handleGoogleAuth}
              aria-label={
                register ? "Sign up with Google" : "Sign in with Google"
              }
            >
              <GoogleIcon size={18} />
              <span>
                {register ? "Sign up with Google" : "Sign in with Google"}
              </span>
            </button>

            {googleGuide && (
              <div className="google-setup-card">
                <div className="google-setup-header">
                  <GoogleIcon size={18} />
                  <strong>Google Authentication Ready</strong>
                </div>
                <p>
                  Live Google Cloud OAuth is ready. To connect live credentials,
                  set <code>GOOGLE_CLIENT_ID</code> and{" "}
                  <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code>.
                </p>
                <div className="google-setup-actions">
                  <button
                    type="button"
                    className="button primary small full"
                    onClick={handleDemoGoogleSignIn}
                    disabled={busy}
                  >
                    <GoogleIcon size={15} /> Continue as Google User{" "}
                    {emailInput ? `(${emailInput})` : "(ronit@gmail.com)"}
                  </button>
                  <button
                    type="button"
                    className="button secondary small full"
                    onClick={() => setGoogleGuide(false)}
                    disabled={busy}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div className="auth-divider">
              <span>or continue with email</span>
            </div>

            <form
              onSubmit={submit}
              aria-busy={busy}
              aria-describedby={error ? "auth-form-error" : undefined}
            >
              {register && (
                <label>
                  Your name
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
              <label>
                Email address
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
              {authMethod === "password" && (
                <label>
                  Password
                  <div className="password-field">
                    <input
                      type={visible ? "text" : "password"}
                      name="password"
                      autoComplete={
                        register ? "new-password" : "current-password"
                      }
                      required
                      minLength={register ? 10 : 1}
                      maxLength={128}
                      placeholder={
                        register ? "At least 10 characters" : "Your password"
                      }
                      disabled={busy}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setVisible(!visible)}
                      aria-label={visible ? "Hide password" : "Show password"}
                    >
                      {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
              )}
              {error && (
                <div id="auth-form-error">
                  <ErrorBox message={error} />
                </div>
              )}
              <button className="button primary full" disabled={busy}>
                {busy
                  ? "One moment…"
                  : authMethod === "otp"
                    ? register
                      ? "Send Verification Code"
                      : "Send Sign-In Code to Email"
                    : register
                      ? "Verify Email & Create Account"
                      : "Sign In with Password"}{" "}
                <ArrowRight size={17} />
              </button>

              <div style={{ textAlign: "center", marginTop: "12px" }}>
                <button
                  type="button"
                  className="otp-resend-btn"
                  onClick={() => {
                    setAuthMethod((m) => (m === "otp" ? "password" : "otp"));
                    setError("");
                  }}
                  disabled={busy}
                >
                  {authMethod === "otp"
                    ? "🔑 Sign in with password instead"
                    : "✉️ Sign in with 6-digit email code instead"}
                </button>
              </div>
            </form>

            <p className="auth-switch">
              {register ? "Already part of the club?" : "New to Cinepulse?"}{" "}
              <button
                disabled={busy}
                onClick={() => {
                  setRegister(!register);
                  setError("");
                  setGoogleGuide(false);
                }}
              >
                {register ? "Sign in" : "Create an account"}
              </button>
            </p>

            <div className="privacy-note">
              <ShieldCheck size={16} />
              <span>
                Secure account verification powered by CinePulse. Password
                recovery is protected by email verification.
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { user, library, refresh, toast } = useApp();
  const [deleting, setDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"request" | "verify">("request");
  const [deleteOtp, setDeleteOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await api("/auth/logout", "POST");
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

  return (
    <Modal label="Your profile" onClose={onClose}>
      <div className="profile">
        <div className="profile-avatar">
          {user?.name.slice(0, 1).toUpperCase()}
        </div>
        <span className="eyebrow mint">THE PERSON BEHIND THE PICKS</span>
        <h2>{user?.name}</h2>
        <p>{user?.email}</p>
        {user?.isGoogle && (
          <div>
            <span className="outline-pill google-pill">
              <GoogleIcon size={13} /> Signed in with Google
            </span>
          </div>
        )}
        <div className="profile-stats">
          <div>
            <strong>{library.length}</strong>
            <span>In your library</span>
          </div>
          <div>
            <strong>
              {library.filter((x) => x.status === "watched").length}
            </strong>
            <span>Watched</span>
          </div>
          <div>
            <strong>{library.filter((x) => x.rating !== null).length}</strong>
            <span>Rated</span>
          </div>
        </div>
        <a
          className="button secondary full"
          href="/api/export"
          download
          aria-disabled={busy ? "true" : undefined}
        >
          <Download size={17} /> Export my data
        </a>
        <button
          className="button secondary full"
          onClick={logout}
          disabled={busy}
        >
          <LogOut size={17} /> {busy ? "Signing out…" : "Sign out"}
        </button>
        <div className="privacy-note">
          <UserRound size={18} />
          <span>
            Your watchlist is private. Your display name and reviews are public
            within this installation. Forecasts contribute to anonymous
            aggregate counts.
          </span>
        </div>
        {error && (
          <div id="profile-form-error">
            <ErrorBox message={error} />
          </div>
        )}
        <button
          className="danger-link"
          disabled={busy}
          onClick={() => {
            setDeleting(!deleting);
            setDeleteStep("request");
            setDeleteOtp("");
            setError("");
          }}
        >
          <Trash2 size={15} /> Delete my account
        </button>
        {deleting && (
          <div className="delete-account">
            <p>
              This permanently deletes your library, reviews, forecasts, and
              account. This cannot be undone.
            </p>
            {deleteStep === "request" ? (
              <button
                type="button"
                className="button danger full"
                disabled={busy}
                onClick={requestDeleteOtpBtn}
              >
                {busy ? "Sending…" : "Send Deletion Code"}
              </button>
            ) : (
              <form
                onSubmit={remove}
                aria-busy={busy}
                aria-describedby={error ? "profile-form-error" : undefined}
                style={{
                  background:
                    "linear-gradient(180deg, #0f172a 0%, #0b1120 100%)",
                  border: "1px solid #1e293b",
                  borderRadius: "20px",
                  padding: "24px",
                  textAlign: "center",
                  boxShadow:
                    "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(56, 189, 248, 0.1)",
                  marginTop: "16px",
                }}
              >
                <div style={{ marginBottom: "16px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background:
                        "linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)",
                      lineHeight: "32px",
                      textAlign: "center",
                      fontSize: "16px",
                      boxShadow: "0 0 15px rgba(56, 189, 248, 0.5)",
                    }}
                  >
                    🎬
                  </span>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: "#ffffff",
                      marginTop: "8px",
                    }}
                  >
                    Confirm Deletion
                  </div>
                </div>

                <div
                  style={{
                    background: "#070a13",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "16px",
                    padding: "20px 16px",
                    marginBottom: "20px",
                    boxShadow: "inset 0 0 25px rgba(239, 68, 68, 0.08)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "2px",
                      color: "#64748b",
                      marginBottom: "12px",
                    }}
                  >
                    Deletion Code
                  </div>

                  <input
                    style={{
                      background: "transparent",
                      border: "none",
                      textAlign: "center",
                      fontFamily: "'SF Mono', 'Fira Code', monospace",
                      fontSize: "28px",
                      fontWeight: 800,
                      letterSpacing: "6px",
                      color: "#f87171",
                      textShadow: "0 0 20px rgba(239, 68, 68, 0.5)",
                      width: "100%",
                      outline: "none",
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    placeholder="••••••"
                    value={deleteOtp}
                    onChange={(e) =>
                      setDeleteOtp(e.target.value.replace(/\D/g, ""))
                    }
                    disabled={busy}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="button danger full"
                  disabled={busy || deleteOtp.length !== 6}
                >
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
