import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle2, XCircle, Clock } from 'lucide-react';

export default function ZombieSimModal({ isOpen, onClose, simulationResult, onRunAgain, onOpenPlayground }) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  useEffect(() => {
    if (isOpen && simulationResult?.steps) {
      setActiveStepIndex(0);
      const interval = setInterval(() => {
        setActiveStepIndex((prev) => {
          if (prev < simulationResult.steps.length - 1) {
            return prev + 1;
          }
          clearInterval(interval);
          return prev;
        });
      }, 700);
      return () => clearInterval(interval);
    }
  }, [isOpen, simulationResult]);

  if (!isOpen || !simulationResult) return null;

  const steps = simulationResult.steps || [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '680px',
          width: '100%',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: '0 25px 50px -12px rgba(168, 85, 247, 0.25)',
          border: '1px solid rgba(168, 85, 247, 0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={20} color="#c084fc" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f1f5f9' }}>
                Zombie Worker & Fencing Token Proof
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Why monotonic 64-bit fencing tokens are required for safe distributed locking
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.4rem' }}
          >
            ✕
          </button>
        </div>

        {/* Stepper Visualization */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {steps.map((step, idx) => {
            const isVisible = idx <= activeStepIndex;
            const isLatest = idx === activeStepIndex;
            const isRejected = step.status === 'WRITE_REJECTED';

            return (
              <div
                key={step.step}
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: isRejected 
                    ? 'rgba(239, 68, 68, 0.15)' 
                    : isLatest 
                      ? 'rgba(168, 85, 247, 0.12)' 
                      : 'rgba(15, 23, 42, 0.6)',
                  border: `1px solid ${isRejected ? 'rgba(239, 68, 68, 0.5)' : isLatest ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.04)'}`,
                  opacity: isVisible ? 1 : 0.25,
                  transform: isVisible ? 'none' : 'translateY(6px)',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'start',
                  gap: '12px',
                }}
              >
                <div style={{ marginTop: '2px' }}>
                  {isRejected ? (
                    <XCircle size={18} color="#ef4444" />
                  ) : step.status === 'SUCCESS' || step.status === 'WRITE_ACCEPTED' ? (
                    <CheckCircle2 size={18} color="#10b981" />
                  ) : (
                    <Clock size={18} color="#f59e0b" />
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <strong style={{ fontSize: '0.85rem', color: '#f1f5f9' }}>
                      Step {step.step}: {step.worker || step.agent_name}
                    </strong>
                    <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: isRejected ? '#f87171' : '#38bdf8', fontWeight: 700 }}>
                      {step.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: isRejected ? '#fca5a5' : '#cbd5e1', lineHeight: '1.4' }}>
                    {step.description || step.thought || step.action}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Summary */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={16} />
            Data Invariant Preserved (Zero Split-Brain Corruption)
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {onOpenPlayground && (
              <button
                className="btn-quorum-outline"
                style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                onClick={onOpenPlayground}
              >
                Terminal Playground →
              </button>
            )}
            <button className="btn-secondary" onClick={onRunAgain}>
              Run Again
            </button>
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
