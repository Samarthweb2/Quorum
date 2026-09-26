import React, { useState, useEffect } from 'react';
import SunburstLogo from './SunburstLogo';
import { ArrowLeft, Sparkles } from 'lucide-react';

function readAuthError(data, fallback = 'Authentication failed.') {
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (data.detail && typeof data.detail === 'object' && data.detail.detail) return data.detail.detail;
  return data.message || fallback;
}

export default function SignInPage({ onBackToHome, onCompleteAuth, initialMode = 'signin' }) {
  const [mode, setMode] = useState(initialMode === 'signup' ? 'signup' : 'signin');
  const [step, setStep] = useState('form'); // form | otp | forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [otpPurpose, setOtpPurpose] = useState('signup');
  const [devOtp, setDevOtp] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeQuoteIndex, setActiveQuoteIndex] = useState(0);
  const [showOtherOptions, setShowOtherOptions] = useState(false);

  useEffect(() => {
    setMode(initialMode === 'signup' ? 'signup' : 'signin');
    setStep('form');
    setError('');
    setInfo('');
  }, [initialMode]);

  const quotes = [
    {
      text: (
        <>
          Due to Quorum's mathematical fencing tokens and gRPC streams, we eliminated split-brain data corruption entirely,{' '}
          <strong style={{ color: '#FFFFFF', fontWeight: 600 }}>
            and our engineers now have crystal-clear visibility into Raft consensus thanks to real-time cluster telemetry.
          </strong>
        </>
      ),
      author: 'Pawel Michalski, Lead Architect · Cloud Scale',
    },
    {
      text: (
        <>
          <strong style={{ color: '#FFFFFF', fontWeight: 600 }}>
            I prefer to have one unified control plane for distributed consensus, similar to what Kubernetes is for containers.
          </strong>{' '}
          Quorum eliminated our lock contention bottlenecks and solved Martin Kleppmann's famous storage race out of the box.
          That's a huge breakthrough!
        </>
      ),
      author: 'Richard Poelderl, Distributed Systems Lead · Germany',
    },
  ];

  const finishAuth = (payload) => {
    const user = payload?.user || {};
    onCompleteAuth({
      email: user.email || email,
      name: user.name || name || (email || '').split('@')[0],
      token: payload?.token,
    });
  };

  const enterOtpStep = (data, purpose) => {
    setOtpPurpose(purpose);
    setOtp('');
    setDevOtp(data.dev_otp || '');
    setInfo(data.message || `We sent a 6-digit code to ${email.trim()}.`);
    setStep('otp');
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (step === 'forgot') {
      setBusy(true);
      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readAuthError(data));
          return;
        }
        enterOtpStep(data, 'reset');
      } catch (err) {
        setError('Cannot reach the Quorum API. Start the backend on port 8000.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 'otp') {
      if (!/^\d{6}$/.test(otp.trim())) {
        setError('Enter the 6-digit code from your email.');
        return;
      }
      if (otpPurpose === 'reset' && password.length < 8) {
        setError('Choose a new password of at least 8 characters.');
        return;
      }
      setBusy(true);
      try {
        const path = otpPurpose === 'reset' ? '/api/auth/reset-password' : '/api/auth/verify';
        const body =
          otpPurpose === 'reset'
            ? { email: email.trim(), code: otp.trim(), password }
            : { email: email.trim(), code: otp.trim() };
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(readAuthError(data, 'Verification failed.'));
          return;
        }
        finishAuth(data);
      } catch (err) {
        setError('Cannot reach the Quorum API. Start the backend on port 8000.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (mode === 'signup') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }
    setBusy(true);
    try {
      const path = mode === 'signup' ? '/api/auth/signup' : '/api/auth/signin';
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.needs_verification || res.status === 403) {
        enterOtpStep(data, mode === 'signup' ? 'signup' : 'signin');
        if (!res.ok && res.status !== 403) {
          setError(readAuthError(data));
        }
        return;
      }
      if (!res.ok) {
        setError(readAuthError(data));
        return;
      }
      finishAuth(data);
    } catch (err) {
      setError('Cannot reach the Quorum API. Start the backend on port 8000.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), purpose: otpPurpose === 'reset' ? 'reset' : 'signup' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(readAuthError(data, 'Could not resend code.'));
        return;
      }
      setDevOtp(data.dev_otp || '');
      setInfo(data.message || 'A new code is on its way.');
    } catch (err) {
      setError('Cannot reach the Quorum API. Start the backend on port 8000.');
    } finally {
      setBusy(false);
    }
  };

  const handleDemoSignIn = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sam@mobbin.design', password: 'quorum123' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(readAuthError(data, 'Demo sign-in failed.'));
        return;
      }
      finishAuth(data);
    } catch (err) {
      setError('Cannot reach the Quorum API. Start the backend on port 8000.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Announcement Bar */}
      <div className="midday-announcement-bar">
        <span>Quorum v2.4: High-throughput Raft consensus over gRPC streaming.</span>
        <a href="#announcement">Read the announcement →</a>
      </div>

      {/* 50/50 Split Container */}
      <div className="auth-split-container" style={{ flex: 1 }}>
        {/* Left 50% - Atmospheric Dark Sphere Backdrop */}
        <div className="auth-left-side">
          {/* Subtle Grain & Radial Glow Sphere */}
          <div className="auth-dark-sphere" />

          {/* Top Left White Sunburst Logo */}
          <div
            onClick={onBackToHome}
            style={{
              position: 'relative',
              zIndex: 10,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <SunburstLogo size={24} color="#FFFFFF" />
          </div>

          {/* Center Testimonial Quote */}
          <div
            style={{
              position: 'relative',
              zIndex: 10,
              maxWidth: '460px',
              margin: 'auto 0',
            }}
          >
            <p
              style={{
                fontSize: '20px',
                lineHeight: 1.6,
                color: '#A0A0A0',
                marginBottom: '28px',
                fontWeight: 400,
              }}
            >
              "{quotes[activeQuoteIndex].text}"
            </p>
            <div style={{ fontSize: '13px', color: '#666666', letterSpacing: '0.01em' }}>
              {quotes[activeQuoteIndex].author}
            </div>

            {/* Quote Selector Dots */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '32px' }}>
              {quotes.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveQuoteIndex(i)}
                  style={{
                    width: activeQuoteIndex === i ? '20px' : '6px',
                    height: '6px',
                    borderRadius: '3px',
                    backgroundColor: activeQuoteIndex === i ? '#FFFFFF' : '#333333',
                    transition: 'all 0.25s ease',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Bottom Space / Curated Indicator */}
          <div style={{ position: 'relative', zIndex: 10, fontSize: '12px', color: '#555555' }}>
            Quorum Distributed Systems · Raft &amp; gRPC
          </div>
        </div>

        {/* Right 50% - Theme Canvas */}
        <div className="auth-right-side">
          {/* Top Right Controls (Back Link & Theme Toggle) */}
          <div
            style={{
              position: 'absolute',
              top: '32px',
              right: '32px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >


            <button
              onClick={onBackToHome}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                padding: '6px 12px',
                borderRadius: '6px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <ArrowLeft size={14} />
              <span>Back to home</span>
            </button>
          </div>

          {/* Form Card (Max 380px wide) */}
          <div style={{ width: '100%', maxWidth: '380px', textAlign: 'center' }}>
            <h1
              className="font-serif"
              style={{
                fontSize: '36px',
                fontWeight: 400,
                color: 'var(--text-primary)',
                marginBottom: '8px',
                letterSpacing: '-0.02em',
              }}
            >
              Welcome to Quorum
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              {step === 'otp'
                ? `Enter the code sent to ${email || 'your email'}`
                : step === 'forgot'
                  ? 'We will email a reset code to your address'
                  : mode === 'signup'
                    ? 'Create an account to launch your cluster'
                    : 'Sign in to your control plane'}
            </p>

            {step === 'form' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px',
                padding: '4px',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-subtle)',
                marginBottom: '20px',
              }}
            >
              {['signin', 'signup'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError('');
                    setInfo('');
                    setActiveQuoteIndex(m === 'signup' ? 1 : 0);
                  }}
                  style={{
                    padding: '9px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    backgroundColor: mode === m ? 'var(--bg-card)' : 'transparent',
                    color: 'var(--text-primary)',
                    boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {m === 'signin' ? 'Sign in' : 'Sign up'}
                </button>
              ))}
            </div>
            )}

            <form onSubmit={handleSubmit}>
              {step === 'otp' && (
                <>
                  {info && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', textAlign: 'left' }}>
                      {info}
                    </p>
                  )}
                  {devOtp && (
                    <div
                      style={{
                        marginBottom: '12px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(5, 150, 105, 0.08)',
                        color: '#059669',
                        fontSize: '13px',
                        textAlign: 'left',
                      }}
                    >
                      Local mode (SMTP not set). Code: <strong style={{ letterSpacing: '0.2em' }}>{devOtp}</strong>
                    </div>
                  )}
                  <div style={{ marginBottom: '12px' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit code"
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '13px 16px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '18px',
                        letterSpacing: '0.28em',
                        textAlign: 'center',
                        color: 'var(--text-primary)',
                        backgroundColor: 'var(--bg-input)',
                      }}
                    />
                  </div>
                  {otpPurpose === 'reset' && (
                    <div style={{ marginBottom: '12px' }}>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="New password (min 8 chars)"
                        autoComplete="new-password"
                        style={{
                          width: '100%',
                          padding: '13px 16px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '14px',
                          color: 'var(--text-primary)',
                          backgroundColor: 'var(--bg-input)',
                        }}
                      />
                    </div>
                  )}
                </>
              )}

              {(step === 'form' || step === 'forgot') && mode === 'signup' && step === 'form' && (
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    autoComplete="name"
                    style={{
                      width: '100%',
                      padding: '13px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '14px',
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--bg-input)',
                    }}
                  />
                </div>
              )}
              {step !== 'otp' && (
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  autoComplete="email"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    backgroundColor: 'var(--bg-input)',
                  }}
                />
              </div>
              )}
              {step === 'form' && (
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Create a password (min 8 chars)' : 'Password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    backgroundColor: 'var(--bg-input)',
                  }}
                />
              </div>
              )}
              {step === 'form' && mode === 'signup' && (
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    style={{
                      width: '100%',
                      padding: '13px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '14px',
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--bg-input)',
                    }}
                  />
                </div>
              )}

              {error && (
                <div
                  style={{
                    marginBottom: '12px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(220, 38, 38, 0.08)',
                    color: '#dc2626',
                    fontSize: '13px',
                    textAlign: 'left',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="midday-btn-black"
                disabled={busy}
                style={{
                  width: '100%',
                  borderRadius: '8px',
                  padding: '13px',
                  fontSize: '14px',
                  marginBottom: '16px',
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy
                  ? 'Working…'
                  : step === 'otp' && otpPurpose === 'reset'
                    ? 'Update password'
                    : step === 'otp'
                      ? 'Verify email'
                      : step === 'forgot'
                        ? 'Send reset code'
                        : mode === 'signup'
                          ? 'Create account'
                          : 'Sign in'}
              </button>

              {step === 'otp' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('form');
                      setOtp('');
                      setError('');
                      setDevOtp('');
                    }}
                    style={{ fontSize: '13px', color: 'var(--text-secondary)' }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={busy}
                    style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}
                  >
                    Resend code
                  </button>
                </div>
              )}

              {step === 'form' && mode === 'signin' && (
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                  Demo account: sam@mobbin.design / quorum123
                  {' · '}
                  <button
                    type="button"
                    onClick={() => {
                      setStep('forgot');
                      setError('');
                      setInfo('');
                    }}
                    style={{ textDecoration: 'underline', color: 'var(--text-secondary)' }}
                  >
                    Forgot password
                  </button>
                </p>
              )}

              {step === 'forgot' && (
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}
                >
                  Back to sign in
                </button>
              )}

              {step === 'form' && (
              <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  color: 'var(--text-tertiary)',
                  fontSize: '13px',
                  margin: '12px 0',
                }}
              >
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
                <span>or</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
              </div>

              <button
                type="button"
                onClick={() => setShowOtherOptions(!showOtherOptions)}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--btn-black)',
                  color: 'var(--btn-black-text)',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Show other options
              </button>

              {showOtherOptions && (
                <div style={{ marginTop: '16px', animation: 'fadeIn 0.2s ease' }}>
                  <button
                    type="button"
                    onClick={handleDemoSignIn}
                    disabled={busy}
                    style={{
                      width: '100%',
                      padding: '11px',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--bg-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <Sparkles size={14} color="#059669" />
                    <span>One-Click Demo (Sam / quorum123)</span>
                  </button>
                </div>
              )}
              </>
              )}
            </form>

            {/* Footer Terms */}
            <div style={{ marginTop: '48px', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
              By signing in you agree to our{' '}
              <a href="#terms" style={{ textDecoration: 'underline', color: 'var(--text-secondary)' }}>Terms of service</a> &amp;{' '}
              <a href="#privacy" style={{ textDecoration: 'underline', color: 'var(--text-secondary)' }}>Privacy policy</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
