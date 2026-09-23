import React from 'react';
import SunburstLogo from './SunburstLogo';

export default function TeamSelectPage({ userEmail = 'sam@mobbin.design', onLaunchTeam, onSignOut }) {
  const teams = [
    {
      id: 'slmobbin',
      name: 'SLMobbin',
      avatarText: 'SLM',
      avatarBg: '#121212',
      avatarColor: '#FFFFFF',
      role: 'Owner · 5-Node Raft Cluster',
    },
    {
      id: 'asmobbin',
      name: 'ASMobbin',
      avatarText: 'A',
      avatarBg: '#EAE6DF',
      avatarColor: '#121212',
      role: 'Admin · Staging Swarm',
    },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '32px 48px',
      }}
    >
      {/* Top Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={onSignOut}>
          <SunburstLogo size={24} color="#121212" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: '#121212',
              color: '#FFFFFF',
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
            color: '#121212',
            marginBottom: '6px',
            letterSpacing: '-0.02em',
          }}
        >
          Welcome, Sam
        </h1>
        <p style={{ fontSize: '14px', color: '#737373', marginBottom: '36px' }}>
          Select a team or create a new one.
        </p>

        {/* Teams List */}
        <div style={{ textAlign: 'left', marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', color: '#737373', marginBottom: '12px', fontWeight: 500 }}>
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
                  border: '1px solid #EAE6DF',
                  backgroundColor: '#FFFFFF',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FBFBFA')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
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
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#121212' }}>{team.name}</div>
                    <div style={{ fontSize: '12px', color: '#999996' }}>{team.role}</div>
                  </div>
                </div>

                <button
                  onClick={() => onLaunchTeam(team)}
                  style={{
                    padding: '7px 16px',
                    border: '1px solid #EAE6DF',
                    borderRadius: '6px',
                    backgroundColor: '#FFFFFF',
                    color: '#121212',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#121212';
                    e.currentTarget.style.color = '#FFFFFF';
                    e.currentTarget.style.borderColor = '#121212';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                    e.currentTarget.style.color = '#121212';
                    e.currentTarget.style.borderColor = '#EAE6DF';
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
            color: '#A0A09C',
            fontSize: '13px',
            margin: '28px 0',
          }}
        >
          <div style={{ flex: 1, borderTop: '1px dotted #D6D1C7' }} />
          <span>Or</span>
          <div style={{ flex: 1, borderTop: '1px dotted #D6D1C7' }} />
        </div>

        {/* Create Team Button */}
        <button
          onClick={() => onLaunchTeam({ id: 'new-cluster', name: 'New Quorum Cluster' })}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #EAE6DF',
            backgroundColor: '#FFFFFF',
            color: '#121212',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F4F4F2')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
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
          color: '#8C8C88',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <SunburstLogo size={14} color="#8C8C88" />
          <span>Quorum</span>
        </div>
        <div>Distributed Systems Platform</div>
      </footer>
    </div>
  );
}
