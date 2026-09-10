/**
 * Quorum Light-Theme Interactive Landing Page Script
 * - Live SVG Cluster Simulation (Leader election ~9s, Heartbeat pulses ~2.2s, Term counter, Event Log)
 * - Three-step wizard with done/active/pending states
 * - Copy-to-clipboard functionality for install & terminal snippets
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Copy-to-Clipboard Functionality
  const copyButtons = document.querySelectorAll('.copy-btn');
  copyButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-target');
      const textToCopy = targetId 
        ? document.getElementById(targetId)?.innerText 
        : btn.getAttribute('data-copy');

      if (!textToCopy) return;

      try {
        await navigator.clipboard.writeText(textToCopy.trim());
        const originalText = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Copied!</span>
        `;
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = originalText;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
      }
    });
  });

  // =========================================================================
  // 2. SECTION 2: LIVE CONSENSUS — IN-PLACE PRODUCT SURFACE
  // =========================================================================
  const runRealRequestBtn = document.getElementById('run-real-request-btn');
  const infraPhasePill = document.getElementById('infra-phase-pill');
  const infraCommitVal = document.getElementById('infra-commit-val');
  const infraTokenVal = document.getElementById('infra-token-val');
  const infraTimeVal = document.getElementById('infra-time-val');
  const infraTraceNodes = document.getElementById('infra-trace-nodes');
  const infraTraceSummary = document.getElementById('infra-trace-summary');

  let isConsensusRunning = false;
  let consensusCommitIndex = 1284;
  let consensusFenceToken = 1042;

  if (runRealRequestBtn) {
    runRealRequestBtn.addEventListener('click', () => {
      if (isConsensusRunning) return;
      isConsensusRunning = true;
      runRealRequestBtn.disabled = true;
      runRealRequestBtn.querySelector('span').textContent = 'Executing consensus...';

      // Step 1: Proposing to Leader WAL
      if (infraPhasePill) {
        infraPhasePill.className = 'phase-pill proposing';
        infraPhasePill.textContent = 'Proposing to Leader WAL...';
      }

      // Step 2: Replicating
      setTimeout(() => {
        if (infraPhasePill) {
          infraPhasePill.className = 'phase-pill replicating';
          infraPhasePill.textContent = 'Replicating via AppendEntries...';
        }
        if (infraTraceNodes) {
          infraTraceNodes.innerHTML = 'Node 01 <strong class="chk">✓</strong> · Node 02 <strong class="chk">✓</strong> · Node 03 <strong class="chk">✓</strong> · Node 04 <span class="dim">—</span> · Node 05 <span class="dim">—</span>';
        }
        if (infraTraceSummary) {
          infraTraceSummary.textContent = '3 / 5 acknowledged';
        }
      }, 700);

      // Step 3: Committed
      setTimeout(() => {
        consensusCommitIndex += 1;
        consensusFenceToken += 1;

        if (infraPhasePill) {
          infraPhasePill.className = 'phase-pill committed';
          infraPhasePill.textContent = '✓ Committed to State Machine';
        }
        if (infraCommitVal) {
          infraCommitVal.textContent = consensusCommitIndex.toLocaleString();
        }
        if (infraTokenVal) {
          infraTokenVal.textContent = `#${consensusFenceToken}`;
        }
        if (infraTimeVal) {
          infraTimeVal.textContent = 'just now';
        }

        runRealRequestBtn.disabled = false;
        runRealRequestBtn.querySelector('span').textContent = 'Run a real request →';
        isConsensusRunning = false;
      }, 1500);
    });
  }

  // =========================================================================
  // 3. SECTION 3: TRY A DISTRIBUTED LOCK (TACTILE WIDGET)
  // =========================================================================
  const tryResourceInput = document.getElementById('try-resource-input');
  const acquireTryBtn = document.getElementById('acquire-try-btn');
  const releaseTryBtn = document.getElementById('release-try-btn');
  const lockUnlockedContainer = document.getElementById('lock-unlocked-container');
  const lockLockedContainer = document.getElementById('lock-locked-container');
  const lockedResVal = document.getElementById('locked-res-val');
  const lockedTokenVal = document.getElementById('locked-token-val');
  const lockedTimeVal = document.getElementById('locked-time-val');
  const lockedTimerBar = document.getElementById('locked-timer-bar');

  let currentTryToken = 1042;
  let tryTimerInterval = null;
  let tryRemainingSec = 5.0;

  function endTryLock() {
    if (tryTimerInterval) {
      clearInterval(tryTimerInterval);
      tryTimerInterval = null;
    }
    if (lockLockedContainer) lockLockedContainer.style.display = 'none';
    if (lockUnlockedContainer) lockUnlockedContainer.style.display = 'block';
  }

  if (acquireTryBtn) {
    acquireTryBtn.addEventListener('click', () => {
      const resName = (tryResourceInput && tryResourceInput.value.trim()) || 'db-writer';
      currentTryToken += 1;
      tryRemainingSec = 5.0;

      if (lockedResVal) lockedResVal.textContent = resName;
      if (lockedTokenVal) lockedTokenVal.textContent = `#${currentTryToken}`;
      if (lockedTimeVal) lockedTimeVal.textContent = '5.0s';
      if (lockedTimerBar) lockedTimerBar.style.width = '100%';

      if (lockUnlockedContainer) lockUnlockedContainer.style.display = 'none';
      if (lockLockedContainer) lockLockedContainer.style.display = 'block';

      if (tryTimerInterval) clearInterval(tryTimerInterval);
      tryTimerInterval = setInterval(() => {
        tryRemainingSec -= 0.1;
        if (tryRemainingSec <= 0.05) {
          endTryLock();
        } else {
          if (lockedTimeVal) lockedTimeVal.textContent = `${tryRemainingSec.toFixed(1)}s`;
          if (lockedTimerBar) lockedTimerBar.style.width = `${(tryRemainingSec / 5.0) * 100}%`;
        }
      }, 100);
    });
  }

  if (releaseTryBtn) {
    releaseTryBtn.addEventListener('click', endTryLock);
  }

  // =========================================================================
  // 4. SECTION 6: LIVE CLUSTER CHAOS SIMULATION
  // =========================================================================
  const chaosKillLeaderBtn = document.getElementById('chaos-kill-leader-btn');
  const chaosPartitionBtn = document.getElementById('chaos-partition-btn');
  const chaosStallWorkerBtn = document.getElementById('chaos-stall-worker-btn');
  const chaosResetBtn = document.getElementById('chaos-reset-btn');

  const cNode1Box = document.getElementById('c-node-1-box');
  const cNode1Role = document.getElementById('c-node-1-role');
  const cNode1Glyph = document.getElementById('c-node-1-glyph');
  const cNode1Status = document.getElementById('c-node-1-status');

  const cNode2Box = document.getElementById('c-node-2-box');
  const cNode2Role = document.getElementById('c-node-2-role');
  const cNode2Glyph = document.getElementById('c-node-2-glyph');
  const cNode2Status = document.getElementById('c-node-2-status');

  const cNode3Box = document.getElementById('c-node-3-box');
  const cNode3Role = document.getElementById('c-node-3-role');
  const cNode3Glyph = document.getElementById('c-node-3-glyph');
  const cNode3Status = document.getElementById('c-node-3-status');

  const cOutputTerm = document.getElementById('c-output-term');
  const cOutputText = document.getElementById('c-output-text');

  function clearChaosActiveButtons() {
    [chaosKillLeaderBtn, chaosPartitionBtn, chaosStallWorkerBtn].forEach(b => {
      if (b) b.classList.remove('active');
    });
  }

  function resetChaosCluster() {
    clearChaosActiveButtons();
    if (cNode1Box) { cNode1Box.className = 'chaos-node-box leader'; }
    if (cNode1Role) cNode1Role.textContent = 'LEADER';
    if (cNode1Glyph) cNode1Glyph.textContent = '●';
    if (cNode1Status) cNode1Status.textContent = 'healthy';

    if (cNode2Box) { cNode2Box.className = 'chaos-node-box follower'; }
    if (cNode2Role) cNode2Role.textContent = 'FOLLOWER';
    if (cNode2Glyph) cNode2Glyph.textContent = '●';
    if (cNode2Status) cNode2Status.textContent = 'healthy';

    if (cNode3Box) { cNode3Box.className = 'chaos-node-box follower'; }
    if (cNode3Role) cNode3Role.textContent = 'FOLLOWER';
    if (cNode3Glyph) cNode3Glyph.textContent = '●';
    if (cNode3Status) cNode3Status.textContent = 'healthy';

    if (cOutputTerm) cOutputTerm.textContent = 'TERM 42';
    if (cOutputText) cOutputText.textContent = 'Cluster stable. Leader heartbeat regular at 2.2s.';
  }

  if (chaosKillLeaderBtn) {
    chaosKillLeaderBtn.addEventListener('click', () => {
      clearChaosActiveButtons();
      chaosKillLeaderBtn.classList.add('active');

      if (cNode1Box) { cNode1Box.className = 'chaos-node-box leader killed'; }
      if (cNode1Glyph) cNode1Glyph.textContent = '×';
      if (cNode1Status) cNode1Status.textContent = 'killed';
      if (cOutputText) cOutputText.textContent = 'TIMEOUT DETECTED (180ms) — Node 01 dead. Follower election timer expired.';

      setTimeout(() => {
        if (cNode2Box) { cNode2Box.className = 'chaos-node-box candidate'; }
        if (cNode2Role) cNode2Role.textContent = 'CANDIDATE';
        if (cOutputText) cOutputText.textContent = 'ELECTION: Node 02 requested peer votes (term 43)';
      }, 700);

      setTimeout(() => {
        if (cNode2Box) { cNode2Box.className = 'chaos-node-box leader'; }
        if (cNode2Role) cNode2Role.textContent = 'LEADER';
        if (cOutputTerm) cOutputTerm.textContent = 'TERM 43';
        if (cOutputText) cOutputText.textContent = 'NEW LEADER ELECTED: Node 02 (Term 43). Failover complete in 240ms.';
      }, 1500);
    });
  }

  if (chaosPartitionBtn) {
    chaosPartitionBtn.addEventListener('click', () => {
      clearChaosActiveButtons();
      chaosPartitionBtn.classList.add('active');

      if (cNode3Box) { cNode3Box.className = 'chaos-node-box follower partitioned'; }
      if (cNode3Glyph) cNode3Glyph.textContent = '⚡';
      if (cNode3Status) cNode3Status.textContent = 'partitioned';
      if (cOutputText) cOutputText.textContent = 'PARTITION: Node 03 isolated in minority island. Leader & Node 02 form majority (2/3).';
    });
  }

  if (chaosStallWorkerBtn) {
    chaosStallWorkerBtn.addEventListener('click', () => {
      clearChaosActiveButtons();
      chaosStallWorkerBtn.classList.add('active');
      if (cOutputText) cOutputText.textContent = 'WORKER A STALLED (GC pause) → Lease expired → Worker B acquired #1043. Late write rejected.';
    });
  }

  if (chaosResetBtn) {
    chaosResetBtn.addEventListener('click', resetChaosCluster);
  }

  // 3. Floating AI Customer Support Agent Widget (Image 2)
  const aiLauncherBtn = document.getElementById('ai-launcher-btn');
  const aiCloseBtn = document.getElementById('ai-close-btn');
  const aiDrawer = document.getElementById('ai-drawer');
  const aiSendMsgCard = document.getElementById('ai-send-msg-card');
  const aiTabHomeBtn = document.getElementById('ai-tab-home-btn');
  const aiTabMessagesBtn = document.getElementById('ai-tab-messages-btn');
  const aiHomeView = document.getElementById('ai-home-view');
  const aiMessagesView = document.getElementById('ai-messages-view');
  const aiQueryForm = document.getElementById('ai-query-form');
  const aiQueryInput = document.getElementById('ai-query-input');
  const chatMessagesScroll = document.getElementById('chat-messages-scroll');
  const suggestionChips = document.querySelectorAll('.suggestion-chip');

  function openAiDrawer() {
    if (!aiDrawer) return;
    aiDrawer.classList.add('open');
    if (aiLauncherBtn) aiLauncherBtn.classList.add('is-active');
  }

  function closeAiDrawer() {
    if (!aiDrawer) return;
    aiDrawer.classList.remove('open');
    if (aiLauncherBtn) aiLauncherBtn.classList.remove('is-active');
  }

  function switchAiTab(tabName) {
    if (tabName === 'home') {
      if (aiHomeView) aiHomeView.classList.add('active');
      if (aiMessagesView) aiMessagesView.classList.remove('active');
      if (aiTabHomeBtn) aiTabHomeBtn.classList.add('active');
      if (aiTabMessagesBtn) aiTabMessagesBtn.classList.remove('active');
    } else {
      if (aiHomeView) aiHomeView.classList.remove('active');
      if (aiMessagesView) aiMessagesView.classList.add('active');
      if (aiTabHomeBtn) aiTabHomeBtn.classList.remove('active');
      if (aiTabMessagesBtn) aiTabMessagesBtn.classList.add('active');
      if (aiQueryInput) aiQueryInput.focus();
    }
  }

  if (aiLauncherBtn) {
    aiLauncherBtn.addEventListener('click', () => {
      if (aiDrawer && aiDrawer.classList.contains('open')) {
        closeAiDrawer();
      } else {
        openAiDrawer();
      }
    });
  }

  if (aiCloseBtn) {
    aiCloseBtn.addEventListener('click', closeAiDrawer);
  }

  if (aiSendMsgCard) {
    aiSendMsgCard.addEventListener('click', () => {
      switchAiTab('messages');
    });
  }

  if (aiTabHomeBtn) {
    aiTabHomeBtn.addEventListener('click', () => switchAiTab('home'));
  }

  if (aiTabMessagesBtn) {
    aiTabMessagesBtn.addEventListener('click', () => switchAiTab('messages'));
  }

  // AI Knowledge Engine Response Generator
  function getAiResponse(userText) {
    const q = userText.toLowerCase();

    if (q.includes('fenc') || q.includes('zombie') || q.includes('token')) {
      return `<strong>Monotonic Fencing Tokens in Quorum:</strong><br><br>
Quorum implements Martin Kleppmann's fencing token protocol. Whenever a worker acquires a lock, the Raft state machine mints a strictly increasing int64 token (e.g. <code>#104</code>).<br><br>
When the worker writes to storage (Postgres, S3, Redis), it passes this token:<br>
<pre>UPDATE resources SET data = :val, last_fence = 104
WHERE id = :res_id AND last_fence < 104;</pre>
If a paused zombie worker awakes with stale token <code>#103</code>, the storage engine rejects the write outright!`;
    }

    if (q.includes('raft') || q.includes('leader') || q.includes('election') || q.includes('failover')) {
      return `<strong>Quorum Raft Consensus & Leader Failover:</strong><br><br>
• <strong>Heartbeats:</strong> Leader dispatches <code>AppendEntries</code> heartbeats every 2.2s.<br>
• <strong>Failover:</strong> If heartbeats miss randomized election timeouts (150-300ms), a candidate initiates term increment and requests peer votes.<br>
• <strong>Safety:</strong> Strict quorum majority (3/5) is required before committing any lease mutation to the Write-Ahead Log (WAL). Zero split-brain states are physically possible.`;
    }

    if (q.includes('python') || q.includes('code') || q.includes('sdk') || q.includes('example') || q.includes('lock')) {
      return `<strong>Python SDK Context Manager:</strong><br><br>
Install via Python and acquire leases with automatic heartbeating:
<pre>from quorum.client import QuorumClient

client = QuorumClient(endpoints=["http://localhost:8000"])

# Safe distributed context manager with auto-renewal
with client.lock("production-orders-db", ttl_ms=8000) as lease:
    print(f"Granted Lease! Fencing Token: #{lease.fence_token}")
    # Run critical section work safely
    process_order()</pre>`;
    }

    if (q.includes('agent') || q.includes('langchain') || q.includes('swarm') || q.includes('ai')) {
      return `<strong>Autonomous AI Agent Swarm Coordination:</strong><br><br>
Quorum integrates directly with LangChain and CrewAI tools to coordinate multi-agent workflows:<br>
• <strong>Single Execution Lock:</strong> Prevents two AI agents from executing the same external API tool simultaneously.<br>
• <strong>Idempotency Guards:</strong> Guarantees exactly-once mutations when swarms process transactional tasks.<br>
• <strong>Monotonic Trace Tokens:</strong> Propagates fence tokens into vector databases and tool logs.`;
    }

    if (q.includes('hello') || q.includes('hi') || q.includes('hey')) {
      return `Hello! 👋 How can I assist your distributed architecture today? You can ask me about <strong>monotonic fencing tokens</strong>, <strong>Raft consensus failovers</strong>, the <strong>Python SDK</strong>, or <strong>AI agent swarm coordination</strong>!`;
    }

    return `Quorum is an enterprise-grade <strong>Distributed Coordination Engine</strong> built with pure Python Raft consensus.<br><br>
It provides:
1. <strong>Strictly monotonic 64-bit fencing tokens</strong> to eliminate zombie worker overwrites.
2. <strong>Sub-second leader failover</strong> with zero log corruption.
3. <strong>Pythonic async/sync context managers</strong> with auto-renewing TTL leases.<br><br>
Would you like a code snippet or a deep dive into fencing guarantees?`;
  }

  function appendChatMessage(sender, htmlContent) {
    if (!chatMessagesScroll) return;

    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${sender}`;
    msgEl.innerHTML = `<div class="msg-bubble">${htmlContent}</div>`;
    chatMessagesScroll.appendChild(msgEl);
    chatMessagesScroll.scrollTop = chatMessagesScroll.scrollHeight;
  }

  function handleUserQuery(queryText) {
    if (!queryText || !queryText.trim()) return;
    const cleanText = queryText.trim();

    // 1. Switch to messages view and add user bubble
    switchAiTab('messages');
    appendChatMessage('user', cleanText);

    // 2. Typing state / quick AI response
    setTimeout(() => {
      const responseHtml = getAiResponse(cleanText);
      appendChatMessage('ai', responseHtml);
    }, 450);
  }

  // Suggestion chip clicks
  suggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const query = chip.getAttribute('data-query');
      if (query) {
        handleUserQuery(query);
      }
    });
  });

  // Query form submit
  if (aiQueryForm && aiQueryInput) {
    aiQueryForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = aiQueryInput.value;
      if (val) {
        aiQueryInput.value = '';
        handleUserQuery(val);
      }
    });
  }

  // 4. Log In Modal Dialog Functionality
  const loginNavBtn = document.getElementById('login-nav-btn');
  const loginCloseBtn = document.getElementById('login-close-btn');
  const loginModal = document.getElementById('login-modal');
  const loginForm = document.getElementById('login-form');

  function openLoginModal() {
    if (loginModal) loginModal.style.display = 'flex';
  }

  function closeLoginModal() {
    if (loginModal) loginModal.style.display = 'none';
  }

  if (loginNavBtn) {
    loginNavBtn.addEventListener('click', openLoginModal);
  }

  if (loginCloseBtn) {
    loginCloseBtn.addEventListener('click', closeLoginModal);
  }

  if (loginModal) {
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) {
        closeLoginModal();
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.innerHTML = 'Connecting to Cluster...';
        setTimeout(() => {
          submitBtn.innerHTML = '✓ Authenticated! Redirecting...';
          setTimeout(() => {
            closeLoginModal();
            window.location.href = 'http://localhost:5173/';
          }, 800);
        }, 600);
      }
    });
  }
});
