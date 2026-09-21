import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import ClusterTopology from './components/ClusterTopology';
import LockStudio from './components/LockStudio';
import ZombieSimModal from './components/ZombieSimModal';
import AiAgentStudio from './components/AiAgentStudio';
import KleppmannTerminalPlayground from './components/KleppmannTerminalPlayground';


// Toast Notification Component
function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          <div className="toast__content">
            <span className="toast__icon">
              {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
            </span>
            <span className="toast__message">{toast.message}</span>
          </div>
          <button className="toast__close" onClick={() => onDismiss(toast.id)}>×</button>
        </div>
      ))}
    </div>
  );
}


export default function App() {
  const [view, setView] = useState('landing'); // 'landing' | 'dashboard'
  const [activeTab, setActiveTab] = useState('cluster');
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState({});
  const [rpcPulses, setRpcPulses] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [zombieModalOpen, setZombieModalOpen] = useState(false);
  const [zombieSimResult, setZombieSimResult] = useState(null);

  // Toast notification system
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const wsRef = useRef(null);

  // WebSocket connection & event loop
  useEffect(() => {
    let reconnectTimer;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host || '127.0.0.1:8000';
      const wsUrl = `${protocol}//${host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'INIT' || msg.type === 'CLUSTER_STATE_UPDATE') {
            if (msg.data) setStatus(msg.data);
            if (msg.logs) setLogs(msg.logs);
          } else if (msg.type === 'RPC_PULSE') {
            const pulseId = `${Date.now()}-${Math.random()}`;
            setRpcPulses((prev) => [...prev.slice(-15), { ...msg, id: pulseId }]);
            // Auto clean pulse after 1.2s
            setTimeout(() => {
              setRpcPulses((prev) => prev.filter((p) => p.id !== pulseId));
            }, 1200);
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWs, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    // Periodic fallback REST poll for logs
    const pollLogsInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/logs');
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch {}
    }, 1500);

    return () => {
      clearTimeout(reconnectTimer);
      clearInterval(pollLogsInterval);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // REST API Methods — with toast feedback
  const handleAcquireLock = async (key, client_id, ttl_ms) => {
    try {
      const res = await fetch('/api/locks/acquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, client_id, ttl_ms }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Lock acquired on "${key}" — Token #${data.fence_token || data.fencing_token || '?'}`, 'success');
      } else {
        addToast(data.message || `Failed to acquire lock on "${key}"`, 'error');
      }
      return data;
    } catch (err) {
      addToast(`Lock acquire failed: ${err.message}`, 'error');
      return { success: false, message: err.message };
    }
  };

  const handleRenewLock = async (key, client_id, fence_token, ttl_ms) => {
    try {
      const res = await fetch('/api/locks/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, client_id, fence_token, ttl_ms }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Lock renewed on "${key}"`, 'success');
      } else {
        addToast(data.message || `Failed to renew lock on "${key}"`, 'error');
      }
      return data;
    } catch (err) {
      addToast(`Lock renew failed: ${err.message}`, 'error');
      return { success: false, message: err.message };
    }
  };

  const handleReleaseLock = async (key, client_id, fence_token) => {
    try {
      const res = await fetch('/api/locks/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, client_id, fence_token }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Lock released on "${key}"`, 'success');
      } else {
        addToast(data.message || `Failed to release lock on "${key}"`, 'error');
      }
      return data;
    } catch (err) {
      addToast(`Lock release failed: ${err.message}`, 'error');
      return { success: false, message: err.message };
    }
  };

  const handleCreatePartition = async (partitions) => {
    try {
      const res = await fetch('/api/chaos/partition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partitions }),
      });
      const data = await res.json();
      addToast('Network partition created', 'success');
      return data;
    } catch (err) {
      addToast(`Partition failed: ${err.message}`, 'error');
      return { success: false, message: err.message };
    }
  };

  const handleHealPartitions = async () => {
    try {
      const res = await fetch('/api/chaos/heal', { method: 'POST' });
      const data = await res.json();
      addToast('Network healed — all nodes reconnected', 'success');
      return data;
    } catch (err) {
      addToast(`Heal failed: ${err.message}`, 'error');
      return { success: false, message: err.message };
    }
  };

  const handleKillNode = async (node_id) => {
    try {
      const res = await fetch('/api/chaos/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id }),
      });
      const data = await res.json();
      addToast(`Node "${node_id}" killed`, 'error');
      return data;
    } catch (err) {
      addToast(`Kill failed: ${err.message}`, 'error');
      return { success: false, message: err.message };
    }
  };

  const handleRestartNode = async (node_id) => {
    try {
      const res = await fetch('/api/chaos/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id }),
      });
      const data = await res.json();
      addToast(`Node "${node_id}" restarted`, 'success');
      return data;
    } catch (err) {
      addToast(`Restart failed: ${err.message}`, 'error');
      return { success: false, message: err.message };
    }
  };

  const handleSetNetworkConditions = async (latency_ms, packet_loss_rate) => {
    try {
      const res = await fetch('/api/chaos/network-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latency_ms, packet_loss_rate }),
      });
      const data = await res.json();
      addToast(`Network: ${latency_ms}ms latency, ${(packet_loss_rate * 100).toFixed(0)}% loss`, 'info');
      return data;
    } catch (err) {
      addToast(`Network conditions failed: ${err.message}`, 'error');
      return { success: false, message: err.message };
    }
  };

  const handleSimulateZombie = async () => {
    try {
      const res = await fetch('/api/chaos/simulate-zombie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_name: 'production-orders-db' }),
      });
      const data = await res.json();
      setZombieSimResult(data);
      setZombieModalOpen(true);
      addToast('Zombie worker simulation complete — fencing token enforced!', 'success');
    } catch (err) {
      addToast(`Zombie simulation failed: ${err.message}`, 'error');
    }
  };

  const handleTriggerSnapshot = async (node_id) => {
    try {
      const body = node_id ? { node_id } : {};
      const res = await fetch('/api/chaos/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      addToast('WAL snapshot triggered', 'success');
      return data;
    } catch (err) {
      addToast(`Snapshot failed: ${err.message}`, 'error');
      return { success: false, message: err.message };
    }
  };

  // Normalize legacy tab names to the 3 core views + AI agents
  const currentTab =
    activeTab === 'topology' || activeTab === 'wal' || activeTab === 'chaos'
      ? 'cluster'
      : activeTab === 'leases'
      ? 'locks'
      : activeTab === 'recovery' || activeTab === 'fencing-terminal'
      ? 'zombie'
      : activeTab;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {view === 'landing' ? (
        <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
          <LandingPage
            status={status}
            onLaunchDashboard={(tab = 'cluster') => {
              setView('dashboard');
              if (tab) setActiveTab(tab);
            }}
            onAcquireLock={handleAcquireLock}
            onSimulateZombie={handleSimulateZombie}
            onCreatePartition={handleCreatePartition}
            onHealPartitions={handleHealPartitions}
          />
        </div>
      ) : (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.3s ease-in-out' }}>
          <Header
            status={status}
            wsConnected={wsConnected}
            activeTab={currentTab}
            setActiveTab={setActiveTab}
            onSimulateZombie={handleSimulateZombie}
            onBackToLanding={() => setView('landing')}
          />

          <main style={{ flex: 1, maxWidth: '1440px', width: '100%', margin: '0 auto', padding: '24px' }}>
            {currentTab === 'cluster' && (
              <ClusterTopology
                status={status}
                logs={logs}
                rpcPulses={rpcPulses}
                onKillNode={handleKillNode}
                onRestartNode={handleRestartNode}
                onCreatePartition={handleCreatePartition}
                onHealPartitions={handleHealPartitions}
                onSetNetworkConditions={handleSetNetworkConditions}
                onTriggerSnapshot={handleTriggerSnapshot}
                onSimulateZombie={handleSimulateZombie}
              />
            )}

            {currentTab === 'locks' && (
              <LockStudio
                status={status}
                onAcquireLock={handleAcquireLock}
                onRenewLock={handleRenewLock}
                onReleaseLock={handleReleaseLock}
              />
            )}

            {currentTab === 'zombie' && (
              <KleppmannTerminalPlayground status={status} />
            )}

            {currentTab === 'ai-agents' && (
              <AiAgentStudio />
            )}
          </main>

        </div>
      )}

      {/* Zombie Worker Fencing Token Modal */}
      <ZombieSimModal
        isOpen={zombieModalOpen}
        onClose={() => setZombieModalOpen(false)}
        simulationResult={zombieSimResult}
        onRunAgain={handleSimulateZombie}
        onOpenPlayground={() => {
          setZombieModalOpen(false);
          setView('dashboard');
          setActiveTab('zombie');
        }}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
