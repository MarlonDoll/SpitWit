// =====================================================
//  SPITWIT — Networking (PeerJS)
// =====================================================
import { state, notify, generateRoomCode, generateMsgId, clearTimer } from './state.js';
import { SFX } from './audio.js';
import { renderLobbyPlayers, renderWaitPlayers, showScreen,
         startAnsweringPhase, startVotingPhase, showResultsPhase,
         showScoreboardPhase, showWinnerPhase } from './ui.js';
import { trackAnswerForTV } from './tv.js';
// checkAllAnswered, checkAllVoted, leaveGame imported from game.js below (circular ok in ES6 modules)
import { checkAllAnswered, checkAllVoted, leaveGame } from './game.js';

// ===== BROADCAST HELPERS =====
export function broadcastToAll(msg) {
  state.connections.forEach(c => { try { c.send(msg); } catch(e) {} });
}

export function sendToHost(msg) {
  if (state.hostConn) { try { state.hostConn.send(msg); } catch(e) {} }
}

// ===== RELIABLE MESSAGING (ACK + retry for answer/vote) =====
const ACK_TIMEOUT_MS = 3000;
const MAX_RETRIES = 3;

export function sendReliable(msg) {
  const msgId = generateMsgId();
  const msgWithId = { ...msg, msgId };
  attemptSend(msgWithId, msgId, 0);
}

function attemptSend(msgWithId, msgId, retryCount) {
  sendToHost(msgWithId);
  const timerId = setTimeout(() => {
    if (!state.pendingMessages[msgId]) return; // already acked
    if (retryCount < MAX_RETRIES) {
      attemptSend(msgWithId, msgId, retryCount + 1);
    } else {
      delete state.pendingMessages[msgId];
      notify('⚠️ Message may not have reached the host. Try resubmitting.');
    }
  }, ACK_TIMEOUT_MS);
  state.pendingMessages[msgId] = { timerId };
}

function handleAck(msgId) {
  const pending = state.pendingMessages[msgId];
  if (pending) {
    clearTimeout(pending.timerId);
    delete state.pendingMessages[msgId];
  }
}

// ===== HOST SETUP =====
export function startHosting() {
  const name = document.getElementById('host-name').value.trim();
  if (!name) { alert('Enter your name first!'); return; }

  state.isHost = true;
  state.myName = name;
  state.gameSettings = {
    rounds: parseInt(document.getElementById('num-rounds').value),
    answerTime: parseInt(document.getElementById('answer-time').value),
    voteTime: parseInt(document.getElementById('vote-time').value),
    promptPack: document.getElementById('prompt-pack').value,
    includeCustom: document.getElementById('include-custom').checked,
    customPrompts: [...state.customPrompts],
    blindVoting: document.getElementById('blind-voting').checked,
    readAloud: document.getElementById('read-aloud').checked,
    hostDisplay: document.getElementById('host-display-mode').checked,
    personalPrompts: document.getElementById('personal-prompts').checked,
  };

  const roomCode = generateRoomCode();
  const peerId = 'spitwit-' + roomCode;

  showScreen('screen-host-lobby');
  document.getElementById('room-code-display').textContent = roomCode;
  document.getElementById('host-connection-status').textContent = 'Connecting...';
  document.getElementById('host-connection-status').className = 'status-badge status-waiting';

  const peer = new Peer(peerId, { debug: 0 });
  state.peer = peer;
  state.myId = peerId;
  state.players = [{ id: peerId, name, score: 0, prevScore: 0, disconnected: false }];

  peer.on('open', () => {
    document.getElementById('host-connection-status').textContent = '✓ Ready to accept players';
    document.getElementById('host-connection-status').className = 'status-badge status-connected';
    renderLobbyPlayers();
  });

  peer.on('connection', (conn) => {
    conn.on('open', () => {
      state.connections.push(conn);
      conn.on('data', (data) => handleClientMessage(conn, data));
      conn.on('close', () => handlePlayerDisconnect(conn));
      conn.on('error', () => handlePlayerDisconnect(conn));
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      startHosting();
    } else {
      document.getElementById('host-connection-status').textContent = 'Connection error: ' + err.message;
      document.getElementById('host-connection-status').className = 'status-badge status-error';
    }
  });
}

// ===== DISCONNECT HANDLING =====
export function handlePlayerDisconnect(conn) {
  state.connections = state.connections.filter(c => c !== conn);
  const player = state.players.find(p => p.id === conn.peer);

  if (state.phase === 'lobby') {
    state.players = state.players.filter(p => p.id !== conn.peer);
    broadcastToAll({ type: 'player-list', players: state.players });
    renderLobbyPlayers();
    notify(`A player left the lobby`);
    return;
  }

  // Mid-game: keep player but mark disconnected so game isn't stuck
  if (player) {
    player.disconnected = true;
    notify(`${player.name} disconnected 📡`);
    broadcastToAll({ type: 'player-list', players: state.players });
    renderLobbyPlayers();

    // Fill answer/vote so game doesn't stall
    if (state.phase === 'answering' && state.answers[conn.peer] === undefined) {
      state.answers[conn.peer] = '(disconnected)';
      checkAllAnswered();
    }
    if (state.phase === 'voting' && state.votes[conn.peer] === undefined) {
      state.votes[conn.peer] = null; // abstain
      checkAllVoted();
    }
  }
}

// ===== CLIENT MESSAGE HANDLER (host receives) =====
export function handleClientMessage(conn, data) {
  // Always ACK messages with an ID
  if (data.msgId) {
    try { conn.send({ type: 'ack', msgId: data.msgId }); } catch(e) {}
  }

  if (data.type === 'join') {
    // Check for reconnection
    const existingPlayer = state.players.find(
      p => p.name === data.name && p.disconnected && state.phase !== 'lobby'
    );

    if (existingPlayer) {
      existingPlayer.id = conn.peer;
      existingPlayer.disconnected = false;
      notify(`${data.name} reconnected! 🔄`);
      broadcastToAll({ type: 'player-list', players: state.players });
      renderLobbyPlayers();
      sendReconnectState(conn, existingPlayer);
      return;
    }

    if (state.phase !== 'lobby') {
      try { conn.send({ type: 'error', message: 'Game already in progress — cannot join mid-game.' }); } catch(e) {}
      return;
    }

    const player = { id: conn.peer, name: data.name, score: 0, prevScore: 0, disconnected: false };
    state.players.push(player);
    broadcastToAll({ type: 'player-list', players: state.players });
    renderLobbyPlayers();
    notify(`${data.name} joined!`);
    SFX.playerJoined();
  }

  if (data.type === 'answer') {
    state.answers[conn.peer] = data.answer;
    trackAnswerForTV(conn.peer);
    checkAllAnswered();
  }

  if (data.type === 'vote') {
    state.votes[conn.peer] = data.vote;
    checkAllVoted();
  }
}

function sendReconnectState(conn, player) {
  const promptsPerRound = Math.min(3, Math.ceil(state.players.length / 2));
  const elapsed = (Date.now() - state.phaseStartTime) / 1000;
  const base = {
    type: 'reconnect',
    phase: state.phase,
    settings: state.gameSettings,
    players: state.players,
    round: state.currentRound,
    totalRounds: state.totalRounds,
    promptsPerRound,
    promptIdx: (state.currentPromptIdx % promptsPerRound) + 1,
    recap: state.recap,
  };

  try {
    if (state.phase === 'answering') {
      conn.send({ ...base, prompt: state.prompts[state.currentPromptIdx],
        timeRemaining: Math.max(5, state.gameSettings.answerTime - elapsed) });
    } else if (state.phase === 'voting') {
      const answersArr = state.players.map(p => ({ playerId: p.id, answer: state.answers[p.id] || '(no answer)' }));
      conn.send({ ...base, prompt: state.prompts[state.currentPromptIdx], answers: answersArr,
        timeRemaining: Math.max(5, state.gameSettings.voteTime - elapsed) });
    } else {
      conn.send({ ...base });
    }
  } catch(e) {}
}

// ===== JOIN GAME =====
export function joinGame() {
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!name) { alert('Enter your name!'); return; }
  if (!code) { alert('Enter a room code!'); return; }

  state.myName = name;
  state.isHost = false;

  const statusEl = document.getElementById('join-status');
  statusEl.style.display = 'inline-block';
  statusEl.textContent = 'Connecting...';
  statusEl.className = 'status-badge status-waiting';

  const peer = new Peer(undefined, { debug: 0 });
  state.peer = peer;

  peer.on('open', (id) => {
    state.myId = id;
    const hostId = 'spitwit-' + code;
    const conn = peer.connect(hostId);
    state.hostConn = conn;

    conn.on('open', () => {
      conn.send({ type: 'join', name });
      statusEl.textContent = '✓ Connected!';
      statusEl.className = 'status-badge status-connected';
      document.getElementById('player-wait-name').textContent = `You're in as "${name}"`;
      showScreen('screen-player-wait');
    });

    conn.on('data', (data) => handleHostMessage(data));

    conn.on('error', () => {
      statusEl.textContent = 'Connection failed. Check the room code.';
      statusEl.className = 'status-badge status-error';
    });

    conn.on('close', () => {
      if (state.phase !== 'lobby' && state.phase !== 'winner') {
        attemptClientReconnect(name, code, 0);
      } else {
        notify('Disconnected from host');
        leaveGame();
      }
    });
  });

  peer.on('error', (err) => {
    statusEl.textContent = 'Failed: ' + err.message;
    statusEl.className = 'status-badge status-error';
  });
}

function attemptClientReconnect(name, code, attempt) {
  if (attempt === 0) notify('Connection lost — reconnecting...', 5000);
  if (attempt >= 5) {
    notify('Could not reconnect. Returning to home screen.');
    leaveGame();
    return;
  }

  const delay = Math.min(2000 * (attempt + 1), 10000);
  setTimeout(() => {
    if (state.peer) { try { state.peer.destroy(); } catch(e) {} }

    const peer = new Peer(undefined, { debug: 0 });
    state.peer = peer;

    peer.on('open', (id) => {
      state.myId = id;
      const conn = peer.connect('spitwit-' + code);
      state.hostConn = conn;

      conn.on('open', () => {
        conn.send({ type: 'join', name });
        notify('Reconnected! 🔄');
      });
      conn.on('data', (data) => handleHostMessage(data));
      conn.on('close', () => attemptClientReconnect(name, code, attempt + 1));
      conn.on('error', () => attemptClientReconnect(name, code, attempt + 1));
    });
    peer.on('error', () => attemptClientReconnect(name, code, attempt + 1));
  }, delay);
}

// ===== HOST MESSAGE HANDLER (client receives) =====
export function handleHostMessage(data) {
  if (data.type === 'ack') { handleAck(data.msgId); return; }
  if (data.type === 'error') { notify('⚠️ ' + data.message); return; }

  switch(data.type) {
    case 'player-list':
      state.players = data.players;
      renderWaitPlayers();
      break;
    case 'game-start':
      state.gameSettings = data.settings;
      state.totalRounds = data.settings.rounds;
      state.players = data.players;
      state.recap = [];
      break;
    case 'prompt':
      startAnsweringPhase(data.prompt, data.round, data.promptIdx, data.totalPrompts);
      break;
    case 'voting':
      startVotingPhase(data.prompt, data.answers, data.round, data.promptIdx, data.totalPrompts);
      break;
    case 'results':
      if (data.recapEntry) state.recap.push(data.recapEntry);
      SFX.stopTick();
      SFX.drumroll(1.8);
      setTimeout(() => showResultsPhase(data.prompt, data.answers, data.votes, data.scores), 1900);
      break;
    case 'scoreboard':
      showScoreboardPhase(data.players, false);
      break;
    case 'winner':
      showWinnerPhase(data.players);
      break;
    case 'reconnect':
      handleReconnectState(data);
      break;
  }
}

function handleReconnectState(data) {
  state.gameSettings = data.settings;
  state.totalRounds = data.totalRounds;
  state.players = data.players;
  state.currentRound = data.round;
  if (data.recap) state.recap = data.recap;

  if (data.phase === 'answering' && data.prompt) {
    const saved = state.gameSettings.answerTime;
    state.gameSettings = { ...state.gameSettings, answerTime: Math.ceil(data.timeRemaining || 30) };
    startAnsweringPhase(data.prompt, data.round, data.promptIdx, data.promptsPerRound);
    state.gameSettings = { ...state.gameSettings, answerTime: saved };
  } else if (data.phase === 'voting' && data.prompt) {
    const saved = state.gameSettings.voteTime;
    state.gameSettings = { ...state.gameSettings, voteTime: Math.ceil(data.timeRemaining || 15) };
    startVotingPhase(data.prompt, data.answers, data.round, data.promptIdx, data.promptsPerRound);
    state.gameSettings = { ...state.gameSettings, voteTime: saved };
  } else {
    showScreen('screen-player-wait');
    notify('Reconnected! Waiting for next phase...');
  }
}
