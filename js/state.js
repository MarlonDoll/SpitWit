// =====================================================
//  SPITWIT — Shared State + Core Utilities
// =====================================================

export const state = {
  isHost: false,
  peer: null,
  connections: [],
  players: [],        // [{id, name, score, prevScore, disconnected}]
  myId: null,
  myName: '',
  hostConn: null,     // client's connection to host
  gameSettings: {},
  currentRound: 0,
  totalRounds: 5,
  prompts: [],
  currentPromptIdx: 0,
  answers: {},        // {playerId: answer}
  votes: {},          // {voterId: answererPlayerId}
  timerInterval: null,
  visualTimer: null,    // visual countdown interval (separate from game-logic timer)
  phase: 'lobby',     // lobby | answering | voting | results | scoreboard | winner
  customPrompts: [],
  myVote: null,
  myAnswer: '',
  answerSubmitted: false,
  voteSubmitted: false,
  recap: [],          // [{prompt, winner, allAnswers}]
  phaseStartTime: 0,  // timestamp when current timed phase began (for reconnect sync)
  // Message ACK tracking
  pendingMessages: {},  // {msgId: {msg, retryCount, timerId}}
};

export function clearTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function notify(msg, duration = 2500) {
  const el = document.createElement('div');
  el.className = 'notification';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

export function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

export function generateMsgId() {
  return Math.random().toString(36).substring(2, 10);
}
