// =====================================================
//  SPITWIT — Main Entry Point
// =====================================================
import { state, notify } from './state.js';
import { SFX, toggleMute, populateVoicePicker } from './audio.js';
import { openHostDisplay } from './tv.js';
import { showScreen, switchTab, renderCustomPrompts, copyRoomCode,
         updateCharCounter, selectVote } from './ui.js';
import { startHosting, joinGame } from './network.js';
import { hostStartGame, hostNextRound, hostContinue, submitAnswer,
         submitVote, leaveGame, playAgain } from './game.js';
import { showRecap } from './ui.js';

// =====================================================
//  NAME MEMORY
// =====================================================
const NAME_KEY = 'spitwit-player-name';

function loadSavedName() {
  const saved = localStorage.getItem(NAME_KEY);
  if (!saved) return;
  const hostInput = document.getElementById('host-name');
  const joinInput = document.getElementById('join-name');
  if (hostInput && !hostInput.value) hostInput.value = saved;
  if (joinInput && !joinInput.value) joinInput.value = saved;
}

function initNamePersistence() {
  ['host-name', 'join-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      if (el.value.trim()) localStorage.setItem(NAME_KEY, el.value.trim());
    });
  });
}

// =====================================================
//  LIVE TIME ESTIMATE
// =====================================================
function updateTimeEstimate() {
  const rounds = parseInt(document.getElementById('num-rounds')?.value || 5);
  const answerTime = parseInt(document.getElementById('answer-time')?.value || 60);
  const voteTime = parseInt(document.getElementById('vote-time')?.value || 20);
  // Range: fast (60% of timers used + 20s overhead) to slow (full timers + 35s overhead)
  const perRoundFast = answerTime * 0.6 + voteTime * 0.6 + 20;
  const perRoundSlow = answerTime + voteTime + 35;
  const minLow = Math.round((rounds * perRoundFast) / 60);
  const minHigh = Math.round((rounds * perRoundSlow) / 60);
  const el = document.getElementById('time-estimate');
  if (el) el.textContent = `⏱ ~${minLow}–${minHigh} min · depends on player count & how fast everyone answers`;
}

function initTimeEstimate() {
  ['num-rounds', 'answer-time', 'vote-time'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateTimeEstimate);
  });
  updateTimeEstimate();
}

// =====================================================
//  CUSTOM PROMPTS
// =====================================================
function loadCustomPrompts() {
  try {
    const saved = localStorage.getItem('spitwit-custom-prompts');
    if (saved) state.customPrompts = JSON.parse(saved);
  } catch(e) {}
}

function saveCustomPrompts() {
  try {
    localStorage.setItem('spitwit-custom-prompts', JSON.stringify(state.customPrompts));
  } catch(e) {}
}

function addCustomPrompt() {
  const input = document.getElementById('custom-prompt-input');
  const text = input.value.trim();
  if (!text) return;
  state.customPrompts.push(text);
  input.value = '';
  saveCustomPrompts();
  renderCustomPrompts();
}

function removeCustomPrompt(idx) {
  state.customPrompts.splice(idx, 1);
  saveCustomPrompts();
  renderCustomPrompts();
}

function importPromptsFromFile(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split(/\r?\n/);
    let added = 0;
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed) { state.customPrompts.push(trimmed); added++; }
    });
    fileInput.value = '';
    saveCustomPrompts();
    renderCustomPrompts();
    if (added > 0) notify(`✓ Added ${added} prompt${added !== 1 ? 's' : ''} from file`);
  };
  reader.readAsText(file);
}

// =====================================================
//  QUICK JOIN FROM HOME SCREEN
// =====================================================
function quickJoinFromHome() {
  const code = document.getElementById('quick-join-code').value.trim().toUpperCase();
  const joinCodeEl = document.getElementById('join-code');
  if (joinCodeEl && code) joinCodeEl.value = code;
  showScreen('screen-join');
  const joinName = document.getElementById('join-name');
  if (joinName && !joinName.value) joinName.focus();
  else if (joinCodeEl && !code) joinCodeEl.focus();
}

// =====================================================
//  DOODLE BACKGROUND
// =====================================================
function initDoodles() {
  const doodles = ['💬','😂','✦','🎯','🔥','⚡','💥','🎉','👏','😈','🤣','💡','🎤','✌️','🃏'];
  const bg = document.getElementById('doodle-bg');
  if (!bg) return;
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('span');
    el.textContent = doodles[Math.floor(Math.random() * doodles.length)];
    el.style.left = (Math.random() * 100) + '%';
    el.style.animationDuration = (18 + Math.random() * 22) + 's';
    el.style.animationDelay = -(Math.random() * 30) + 's';
    el.style.fontSize = (20 + Math.random() * 24) + 'px';
    bg.appendChild(el);
  }
}

// =====================================================
//  EXPOSE FUNCTIONS TO WINDOW (for inline onclick attributes)
// =====================================================
function exposeGlobals() {
  window.showScreen = showScreen;
  window.switchTab = switchTab;
  window.copyRoomCode = copyRoomCode;
  window.addCustomPrompt = addCustomPrompt;
  window.removeCustomPrompt = removeCustomPrompt;
  window.importPromptsFromFile = importPromptsFromFile;
  window.startHosting = startHosting;
  window.hostStartGame = hostStartGame;
  window.hostNextRound = hostNextRound;
  window.hostContinue = hostContinue;
  window.joinGame = joinGame;
  window.submitAnswer = submitAnswer;
  window.submitVote = submitVote;
  window.selectVote = selectVote;
  window.leaveGame = leaveGame;
  window.playAgain = playAgain;
  window.showRecap = showRecap;
  window.toggleMute = toggleMute;
  window.openHostDisplay = openHostDisplay;
  window.notify = notify;
  window.quickJoinFromHome = quickJoinFromHome;
}

// =====================================================
//  INIT
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
  loadCustomPrompts();
  renderCustomPrompts();
  loadSavedName();
  initNamePersistence();
  initTimeEstimate();
  initDoodles();
  exposeGlobals();

  // Quick-join code: auto-uppercase + Enter to submit
  const quickJoinInput = document.getElementById('quick-join-code');
  if (quickJoinInput) {
    quickJoinInput.addEventListener('input', () => { quickJoinInput.value = quickJoinInput.value.toUpperCase(); });
    quickJoinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') quickJoinFromHome(); });
  }

  // Auto-uppercase join code
  const codeInput = document.getElementById('join-code');
  if (codeInput) {
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase();
    });
  }

  // Character counter for answer input
  const answerInput = document.getElementById('answer-input');
  if (answerInput) {
    answerInput.addEventListener('input', updateCharCounter);
  }

  // Enter key to submit join
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const active = document.querySelector('.screen.active');
      if (active?.id === 'screen-join') joinGame();
    }
  });

  // TTS voice picker
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = populateVoicePicker;
    populateVoicePicker();
  }
});
