'use client';
import {useState, useEffect} from 'react';
import {ArrowRight,Download,Eye,EyeOff,LogOut,ShieldCheck,Trash2,UserRound,Mail,RotateCcw,Check} from 'lucide-react';
import type {User} from '@/lib/types';
import {api} from './client';
import {useApp} from './Context';
import {ErrorBox,Logo,Modal} from './UI';

function GoogleIcon({size = 18}: {size?: number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
  );
}

export function AuthDialog({
  onClose,
  onSuccess
}:{
  onClose:()=>void;
  onSuccess?:(user:User)=>void;
}){
  const {refresh,toast}=useApp();
  const [register,setRegister]=useState(false);
  const [step,setStep]=useState<'form'|'otp'>('form');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [visible,setVisible]=useState(false);
  const [googleGuide,setGoogleGuide]=useState(false);
  const [emailInput,setEmailInput]=useState('');
  const [nameInput,setNameInput]=useState('');
  const [pendingEmail,setPendingEmail]=useState('');
  const [pendingName,setPendingName]=useState('');
  const [otpInput,setOtpInput]=useState('');
  const [devCode,setDevCode]=useState('');
  const [resendTimer,setResendTimer]=useState(0);

  useEffect(()=>{
    if(resendTimer<=0)return;
    const interval=setInterval(()=>setResendTimer(s=>s-1),1000);
    return()=>clearInterval(interval);
  },[resendTimer]);

  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);
    setError('');
    const form=new FormData(e.currentTarget);
    const formName=form.get('name') as string;
    const formEmail=form.get('email') as string;
    const formPassword=form.get('password') as string;

    try {
      if (register) {
        // Send OTP verification email
        const res = await api<{ email: string; name: string; devCode?: string; devMode?: boolean }>(
          '/auth/otp/request',
          'POST',
          { name: formName, email: formEmail, password: formPassword }
        );
        setPendingEmail(res.email);
        setPendingName(res.name);
        setDevCode(res.devCode || '');
        setStep('otp');
        setOtpInput('');
        setResendTimer(45);
        toast(`Verification code sent to ${res.email}`);
      } else {
        await api('/auth/login', 'POST', { email: formEmail, password: formPassword });
        const { user: u } = await api<{ user: User }>('/auth/me');
        await refresh();
        toast('Good to have you back.');
        if (u) onSuccess?.(u);
        onClose();
      }
    } catch(e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(codeToVerify?: string){
    const code = (codeToVerify || otpInput).trim();
    if (!/^\d{6}$/.test(code)) {
      setError('Please enter a complete 6-digit code');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api<{ user: User; welcome: boolean }>('/auth/otp/verify', 'POST', {
        email: pendingEmail,
        code,
      });
      await refresh();
      toast(`Welcome to CinePulse, ${res.user.name || 'film lover'}!`);
      if (res.user) onSuccess?.(res.user);
      onClose();
    } catch(e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResendOtp(){
    if (resendTimer > 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<{ ok: boolean; devCode?: string }>('/auth/otp/resend', 'POST', {
        email: pendingEmail,
      });
      if (res.devCode) setDevCode(res.devCode);
      setResendTimer(45);
      toast('A new 6-digit code has been sent.');
    } catch(e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleAuth() {
    setBusy(true);
    setError('');
    try {
      const cfg = await api<{googleAuth: boolean; supabaseAuth?: boolean}>('/auth/config');
      if (cfg.googleAuth || cfg.supabaseAuth) {
        window.location.href = '/api/auth/google';
        return;
      }
      setGoogleGuide(true);
    } catch {
      window.location.href = '/api/auth/google';
    } finally {
      setBusy(false);
    }
  }

  async function handleDemoGoogleSignIn() {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ user: User }>('/auth/google/demo', 'POST', {
        email: emailInput || 'ronit@gmail.com',
        name: nameInput || (emailInput ? emailInput.split('@')[0] : 'Ronit Parmar')
      });
      await refresh();
      toast(register ? 'Welcome to CinePulse via Google.' : 'Signed in with Google.');
      if (res.user) onSuccess?.(res.user);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label={step==='otp'?'Verify your email':register?'Create your account':'Sign in to Cinepulse'} onClose={onClose}>
      <div className="auth">
        {step === 'otp' ? (
          <div className="otp-box">
            <div className="otp-header-icon">
              <Mail size={26}/>
            </div>
            <h2 className="otp-title">Check your email</h2>
            <p className="otp-desc">
              We sent a 6-digit verification code to <span className="otp-email-highlight">{pendingEmail}</span>. Enter it below to unlock your account.
            </p>

            {devCode && (
              <div className="otp-dev-card">
                <div>Dev Mode Code: <code>{devCode}</code></div>
                <button
                  type="button"
                  className="otp-quick-fill-btn"
                  onClick={() => {
                    setOtpInput(devCode);
                    handleVerifyOtp(devCode);
                  }}
                >
                  Quick Fill
                </button>
              </div>
            )}

            <div className="otp-input-wrap">
              <input
                className="otp-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                placeholder="••••••"
                value={otpInput}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtpInput(val);
                  if (val.length === 6) {
                    handleVerifyOtp(val);
                  }
                }}
                disabled={busy}
              />
            </div>

            {error && <div id="auth-form-error"><ErrorBox message={error}/></div>}

            <button
              className="button primary full"
              disabled={busy || otpInput.length !== 6}
              onClick={() => handleVerifyOtp()}
            >
              {busy ? 'Verifying…' : 'Verify & Enter CinePulse'} <ArrowRight size={17}/>
            </button>

            <div className="otp-resend-row">
              <button
                type="button"
                className="otp-back-btn"
                onClick={() => { setStep('form'); setError(''); }}
                disabled={busy}
              >
                ← Edit details
              </button>

              <button
                type="button"
                className="otp-resend-btn"
                onClick={handleResendOtp}
                disabled={busy || resendTimer > 0}
              >
                {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <Logo/>
            <span className="eyebrow mint">YOUR OWN LITTLE CORNER OF CINEMA</span>
            <h2>{register?'Good taste deserves\na home.':'Welcome back,\nfilm person.'}</h2>
            <p>{register?'Save the stories you love. Discover the ones you will.':'Your watchlist and your opening-night calls are waiting.'}</p>

        <button
          type="button"
          className="button google-button full"
          disabled={busy}
          onClick={handleGoogleAuth}
          aria-label={register ? 'Sign up with Google' : 'Sign in with Google'}
        >
          <GoogleIcon size={18}/>
          <span>{register ? 'Sign up with Google' : 'Sign in with Google'}</span>
        </button>

        {googleGuide && (
          <div className="google-setup-card">
            <div className="google-setup-header">
              <GoogleIcon size={18}/>
              <strong>Google Authentication Ready</strong>
            </div>
            <p>
              Live Google Cloud OAuth is ready. To connect live credentials, set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code>.
            </p>
            <div className="google-setup-actions">
              <button
                type="button"
                className="button primary small full"
                onClick={handleDemoGoogleSignIn}
                disabled={busy}
              >
                <GoogleIcon size={15}/> Continue as Google User {emailInput ? `(${emailInput})` : '(ronit@gmail.com)'}
              </button>
              <button
                type="button"
                className="button secondary small full"
                onClick={()=>setGoogleGuide(false)}
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

        <form onSubmit={submit} aria-busy={busy} aria-describedby={error?'auth-form-error':undefined}>
          {register && (
            <label>Your name
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={60}
                placeholder="What should we call you?"
                disabled={busy}
                value={nameInput}
                onChange={e=>setNameInput(e.target.value)}
              />
            </label>
          )}
          <label>Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
              disabled={busy}
              value={emailInput}
              onChange={e=>setEmailInput(e.target.value)}
            />
          </label>
          <label>Password
            <div className="password-field">
              <input
                type={visible?'text':'password'}
                name="password"
                autoComplete={register?'new-password':'current-password'}
                required
                minLength={register?10:1}
                maxLength={128}
                placeholder={register?'At least 10 characters':'Your password'}
                disabled={busy}
              />
              <button
                type="button"
                disabled={busy}
                onClick={()=>setVisible(!visible)}
                aria-label={visible?'Hide password':'Show password'}
              >
                {visible?<EyeOff size={17}/>:<Eye size={17}/>}
              </button>
            </div>
          </label>
          {error && <div id="auth-form-error"><ErrorBox message={error}/></div>}
          <button className="button primary full" disabled={busy}>
            {busy?'One moment…':register?'Create account':'Sign in'} <ArrowRight size={17}/>
          </button>
        </form>

        <p className="auth-switch">
          {register?'Already part of the club?':'New to Cinepulse?'} {' '}
          <button disabled={busy} onClick={()=>{setRegister(!register);setError('');setGoogleGuide(false);}}>
            {register?'Sign in':'Create an account'}
          </button>
        </p>

        <div className="privacy-note">
          <ShieldCheck size={16}/>
          <span>Stored in this local installation. No email is sent. Password recovery is not available in this local version—use a password manager.</span>
        </div>
      </div>
    </Modal>
  );
}

export function ProfileDialog({onClose}:{onClose:()=>void}){
  const {user,library,refresh,toast}=useApp();
  const [deleting,setDeleting]=useState(false);
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  async function logout(){
    setBusy(true);
    try {
      await api('/auth/logout','POST');
      await refresh();
      onClose();
      toast('You are signed out.');
    } catch(e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(e:React.FormEvent){
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/account','DELETE',{password: user?.isGoogle ? 'google' : password});
      await refresh();
      onClose();
      toast('Your account and its data have been deleted.');
    } catch(e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Your profile" onClose={onClose}>
      <div className="profile">
        <div className="profile-avatar">{user?.name.slice(0,1).toUpperCase()}</div>
        <span className="eyebrow mint">THE PERSON BEHIND THE PICKS</span>
        <h2>{user?.name}</h2>
        <p>{user?.email}</p>
        {user?.isGoogle && (
          <div>
            <span className="outline-pill google-pill"><GoogleIcon size={13}/> Signed in with Google</span>
          </div>
        )}
        <div className="profile-stats">
          <div><strong>{library.length}</strong><span>In your library</span></div>
          <div><strong>{library.filter(x=>x.status==='watched').length}</strong><span>Watched</span></div>
          <div><strong>{library.filter(x=>x.rating!==null).length}</strong><span>Rated</span></div>
        </div>
        <a className="button secondary full" href="/api/export" download aria-disabled={busy?'true':undefined}>
          <Download size={17}/> Export my data
        </a>
        <button className="button secondary full" onClick={logout} disabled={busy}>
          <LogOut size={17}/> {busy?'Signing out…':'Sign out'}
        </button>
        <div className="privacy-note">
          <UserRound size={18}/>
          <span>Your watchlist is private. Your display name and reviews are public within this installation. Forecasts contribute to anonymous aggregate counts.</span>
        </div>
        {error && <div id="profile-form-error"><ErrorBox message={error}/></div>}
        <button className="danger-link" disabled={busy} onClick={()=>setDeleting(!deleting)}>
          <Trash2 size={15}/> Delete my account
        </button>
        {deleting && (
          <form onSubmit={remove} className="delete-account" aria-busy={busy} aria-describedby={error?'profile-form-error':undefined}>
            <p>This permanently deletes your library, reviews, forecasts, and account. This cannot be undone.</p>
            {!user?.isGoogle && (
              <label>Confirm your password
                <input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} required/>
              </label>
            )}
            <button className="button danger full" disabled={busy}>{busy?'Deleting…':'Permanently delete account'}</button>
          </form>
        )}
      </div>
    </Modal>
  );
}
