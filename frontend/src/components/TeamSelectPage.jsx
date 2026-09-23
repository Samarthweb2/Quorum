import React from 'react';
import SunburstLogo from './SunburstLogo';
import { Sun, Moon } from 'lucide-react';

export default function TeamSelectPage({ userEmail = 'sam@mobbin.design', onLaunchTeam, onSignOut, theme = 'light', onToggleTheme }) {
  const teams = [
    {
      id: 'slmobbin',
      name: 'SLMobbin',
      avatarText: 'SLM',
      avatarBg: 'var(--btn-black)',
      avatarColor: 'var(--btn-black-text)',
      role: 'Owner · 5-Node Raft Cluster',
    },
    {
      id: 'asmobbin',
      name: 'ASMobbin',
      avatarText: 'A',
      avatarBg: 'var(--bg-subtle)',
      avatarColor: 'var(--text-primary)',
      role: 'Admin · Staging Swarm',
    },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '32px 48px',
      }}
    >
      {/* Top Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={onSignOut}>
          <SunburstLogo size={24} color="var(--text-primary)" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              aria-label="Toggle dark mode"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-card)')}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          )}

          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'var(--btn-black)',
              color: 'var(--btn-black-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            S
          </div>
        </div>
      </header>

      {/* Center Card */}
      <main style={{ maxWidth: '440px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
        <h1
          className="font-serif"
          style={{
            fontSize: '40px',
            fontWeight: 400,
            color: 'var(--text-primary)',
            marginBottom: '6px',
            letterSpacing: '-0.02em',
          }}
        >
          Welcome, Sam
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '36px' }}>
          Select a team or create a new one.
        </p>

        {/* Teams List */}
        <div style={{ textAlign: 'left', marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>
            Teams
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {teams.map((team) => (
              <div
                key={team.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-card)',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-card)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '6px',
                      backgroundColor: team.avatarBg,
                      color: team.avatarColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '12px',
                    }}
                  >
                    {team.avatarText}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{team.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{team.role}</div>
                  </div>
                </div>

                <button
                  onClick={() => onLaunchTeam(team)}
                  style={{
                    padding: '7px 16px',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--btn-black)';
                    e.currentTarget.style.color = 'var(--btn-black-text)';
                    e.currentTarget.style.borderColor = 'var(--btn-black)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }}
                >
                  Launch
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            color: 'var(--text-tertiary)',
            fontSize: '13px',
            margin: '28px 0',
          }}
        >
          <div style={{ flex: 1, borderTop: '1px dotted var(--border-subtle)' }} />
          <span>Or</span>
          <div style={{ flex: 1, borderTop: '1px dotted var(--border-subtle)' }} />
        </div>

        {/* Create Team Button */}
        <button
          onClick={() => onLaunchTeam({ id: 'new-cluster', name: 'New Quorum Cluster' })}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-card)')}
        >
          Create team
        </button>
      </main>

      {/* Footer Curated */}
      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--text-tertiary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <SunburstLogo size={14} color="var(--text-tertiary)" />
          <span>Quorum</span>
        </div>
        <div>Distributed Systems Platform</div>
      </footer>
    </div>
  );
}
