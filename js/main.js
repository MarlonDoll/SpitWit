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
}

// =====================================================
//  INIT
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
  loadCustomPrompts();
  renderCustomPrompts();
  initDoodles();
  exposeGlobals();

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
