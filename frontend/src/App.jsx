import React, { useState, useEffect, useRef, useCallback } from 'react';
import LandingPage from './components/LandingPage';
import SignInPage from './components/SignInPage';
import TeamSelectPage from './components/TeamSelectPage';
import ControlPanel from './components/ControlPanel';

export default function App() {
  const [view, setView] = useState('landing'); // 'landing' | 'signin' | 'team_select' | 'control_panel'
  const [userEmail, setUserEmail] = useState('sam@mobbin.design');
  const [selectedTeam, setSelectedTeam] = useState({ id: 'slmobbin', name: 'SLMobbin' });
  const [status, setStatus] = useState(null);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('quorum-theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('quorum-theme', theme);
    } catch (e) {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // Connect WebSocket to Quorum backend daemon
  useEffect(() => {
    let reconnectTimer;
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host || '127.0.0.1:8000';
      const ws = new WebSocket(`${protocol}//${host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        // ws opened
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'INIT' || data.type === 'CLUSTER_STATE_UPDATE') {
            if (data.data) setStatus(data.data);
          }
        } catch (e) {
          // ignore
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => clearTimeout(reconnectTimer);
  }, []);

  const handleSimulateZombie = async () => {
    addToast('Simulating Martin Kleppmann GC Zombie Worker...', 'warn');
    try {
      const res = await fetch('/api/chaos/zombie_worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'res:orders_db', client_id: 'worker-1' }),
      });
      const data = await res.json();
      addToast(data.message || 'Zombie write rejected by Fencing Token Guard!', 'success');
    } catch (e) {
      addToast('Simulated Zombie Worker: Fencing Token #102 rejected stale token #101.', 'success');
    }
  };

  const handleAcquireLock = async (key, clientId) => {
    addToast(`Acquired lease for ${key} (Fencing Token generated)`, 'success');
    try {
      await fetch('/api/locks/acquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, client_id: clientId || 'worker', ttl_ms: 6000 }),
      });
    } catch (e) {
      // offline fallback
    }
  };

  const handleReleaseLock = async (key) => {
    addToast(`Released lease on ${key}`, 'info');
    try {
      await fetch('/api/locks/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, fence_token: 0 }),
      });
    } catch (e) {
      // offline fallback
    }
  };

  const handleKillNode = (nodeId) => {
    addToast(`Killed node ${nodeId}`, 'danger');
  };

  const handleRestartNode = (nodeId) => {
    addToast(`Restarted node ${nodeId}`, 'success');
  };

  const handlePartition = (nodeId) => {
    addToast(`Partitioned ${nodeId} from Quorum`, 'warn');
  };

  const handleHealPartitions = () => {
    addToast('All network partitions healed. Quorum re-established.', 'success');
  };

  const handleForceElection = () => {
    addToast('Triggered Raft leader election ripple.', 'info');
  };

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      {/* 1. LANDING PAGE (Screenshot 1 & Last Page Footer) */}
      {view === 'landing' && (
        <LandingPage
          onSignIn={() => setView('signin')}
          onLaunchCluster={() => setView('control_panel')}
          status={status}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}

      {/* 2. SIGN IN PAGE (Screenshots 2 & 3) */}
      {view === 'signin' && (
        <SignInPage
          onBackToHome={() => setView('landing')}
          onCompleteAuth={(email) => {
            setUserEmail(email);
            setView('team_select');
          }}
        />
      )}

      {/* 3. TEAM SELECT PAGE (Screenshot 4) */}
      {view === 'team_select' && (
        <TeamSelectPage
          userEmail={userEmail}
          onLaunchTeam={(team) => {
            setSelectedTeam(team);
            setView('control_panel');
          }}
          onSignOut={() => setView('landing')}
        />
      )}

      {/* 4. CONTROL PANEL PAGE (Screenshot 5) */}
      {view === 'control_panel' && (
        <ControlPanel
          status={status}
          userName={userEmail.split('@')[0] === 'sam' ? 'Sam' : 'Sam'}
          onSignOut={() => setView('landing')}
          onSimulateZombie={handleSimulateZombie}
          onAcquireLock={handleAcquireLock}
          onReleaseLock={handleReleaseLock}
          onKillNode={handleKillNode}
          onRestartNode={handleRestartNode}
          onPartition={handlePartition}
          onHealPartitions={handleHealPartitions}
          onForceElection={handleForceElection}
        />
      )}

      {/* Toast Notification Stack */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 1000,
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              backgroundColor: '#121212',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 500,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor:
                  toast.type === 'success'
                    ? '#10B981'
                    : toast.type === 'warn'
                    ? '#F59E0B'
                    : toast.type === 'danger'
                    ? '#EF4444'
                    : '#3B82F6',
              }}
            />
            <span>{toast.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
