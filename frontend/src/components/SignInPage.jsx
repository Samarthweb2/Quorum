import React, { useState, useRef } from 'react';
import SunburstLogo from './SunburstLogo';
import { ArrowLeft, Check, Sparkles } from 'lucide-react';

export default function SignInPage({ onBackToHome, onCompleteAuth }) {
  const [step, setStep] = useState('email'); // 'email' | 'otp'
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [activeQuoteIndex, setActiveQuoteIndex] = useState(0);
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  const inputRefs = useRef([]);

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

  const handleEmailSubmit = (e) => {
    e?.preventDefault();
    if (!email.trim()) {
      setEmail('sam@mobbin.design');
    }
    setStep('otp');
    setActiveQuoteIndex(1); // Switch quote on OTP step as shown in Screenshot 3
  };

  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      value = value.slice(-1);
    }
    const newDigits = [...otpDigits];
    newDigits[index] = value;
    setOtpDigits(newDigits);

    // Auto advance to next box
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto submit if all 6 digits entered
    if (newDigits.every((d) => d !== '')) {
      setTimeout(() => {
        onCompleteAuth(email || 'sam@mobbin.design');
      }, 300);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
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

        {/* Right 50% - Clean White Canvas */}
        <div className="auth-right-side">
          {/* Top Right Back Link */}
          <button
            onClick={onBackToHome}
            style={{
              position: 'absolute',
              top: '32px',
              right: '32px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              color: '#737373',
              padding: '6px 12px',
              borderRadius: '6px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F4F4F2')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ArrowLeft size={14} />
            <span>Back to home</span>
          </button>

          {/* Form Card (Max 380px wide) */}
          <div style={{ width: '100%', maxWidth: '380px', textAlign: 'center' }}>
            <h1
              className="font-serif"
              style={{
                fontSize: '36px',
                fontWeight: 400,
                color: '#121212',
                marginBottom: '8px',
                letterSpacing: '-0.02em',
              }}
            >
              Welcome to Quorum
            </h1>
            <p style={{ fontSize: '14px', color: '#737373', marginBottom: '32px' }}>
              Sign in or create an account
            </p>

            {/* STEP 1: Email Form */}
            {step === 'email' ? (
              <form onSubmit={handleEmailSubmit}>
                <div style={{ marginBottom: '16px' }}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email address"
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '13px 16px',
                      borderRadius: '8px',
                      border: '1px solid #EAE6DF',
                      fontSize: '14px',
                      color: '#121212',
                      backgroundColor: '#FFFFFF',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#121212')}
                    onBlur={(e) => (e.target.style.borderColor = '#EAE6DF')}
                  />
                </div>

                <button
                  type="submit"
                  className="midday-btn-black"
                  style={{
                    width: '100%',
                    borderRadius: '8px',
                    padding: '13px',
                    fontSize: '14px',
                    marginBottom: '24px',
                  }}
                >
                  Continue
                </button>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    color: '#999996',
                    fontSize: '13px',
                    margin: '20px 0',
                  }}
                >
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#EAE6DF' }} />
                  <span>or</span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#EAE6DF' }} />
                </div>

                <button
                  type="button"
                  onClick={() => setShowOtherOptions(!showOtherOptions)}
                  style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: '8px',
                    backgroundColor: '#121212',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 500,
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#262626')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#121212')}
                >
                  Show other options
                </button>

                {/* Expanded options (SSO / Quick Demo Bypass) */}
                {showOtherOptions && (
                  <div
                    style={{
                      marginTop: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      animation: 'fadeIn 0.2s ease',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onCompleteAuth('sam@mobbin.design')}
                      style={{
                        padding: '11px',
                        border: '1px solid #EAE6DF',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#121212',
                        backgroundColor: '#F7F6F2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      <Sparkles size={14} color="#059669" />
                      <span>One-Click Demo Bypass (Sign in as Sam)</span>
                    </button>
                  </div>
                )}
              </form>
            ) : (
              /* STEP 2: 6-Digit OTP Verification Screen (matching Screenshot 3) */
              <div>
                <div className="otp-box-group">
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (inputRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      autoFocus={i === 0}
                      className="otp-box"
                    />
                  ))}
                </div>

                <div style={{ fontSize: '13px', color: '#737373', marginBottom: '24px' }}>
                  Didn't receive the email?{' '}
                  <span
                    onClick={() => {
                      setOtpDigits(['2', '6', '5', '7', '5', '0']);
                      setTimeout(() => onCompleteAuth(email || 'sam@mobbin.design'), 400);
                    }}
                    style={{
                      color: '#121212',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    Resend code
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    color: '#999996',
                    fontSize: '13px',
                    margin: '20px 0',
                  }}
                >
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#EAE6DF' }} />
                  <span>or</span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#EAE6DF' }} />
                </div>

                <button
                  type="button"
                  onClick={() => onCompleteAuth(email || 'sam@mobbin.design')}
                  style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: '8px',
                    backgroundColor: '#121212',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  Show other options
                </button>
              </div>
            )}

            {/* Footer Terms */}
            <div style={{ marginTop: '48px', fontSize: '12px', color: '#999996', lineHeight: 1.5 }}>
              By signing in you agree to our{' '}
              <a href="#terms" style={{ textDecoration: 'underline' }}>Terms of service</a> &amp;{' '}
              <a href="#privacy" style={{ textDecoration: 'underline' }}>Privacy policy</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
