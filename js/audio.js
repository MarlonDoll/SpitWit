// =====================================================
//  SPITWIT — Audio: Sound Effects + Text-to-Speech
// =====================================================

// ===== SOUND EFFECTS =====
export const SFX = (() => {
  let ctx = null;
  let muted = false;
  let tickInterval = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, type, startTime, duration, gainVal, endFreq) {
    if (muted) return;
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
      gain.gain.setValueAtTime(gainVal || 0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch(e) {}
  }

  function noise(startTime, duration, gainVal) {
    if (muted) return;
    try {
      const c = getCtx();
      const bufSize = c.sampleRate * duration;
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const gain = c.createGain();
      src.connect(gain);
      gain.connect(c.destination);
      gain.gain.setValueAtTime(gainVal || 0.1, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      src.start(startTime);
      src.stop(startTime + duration);
    } catch(e) {}
  }

  return {
    isMuted: () => muted,
    toggleMute: () => { muted = !muted; return muted; },

    gameStart() {
      if (muted) return;
      const c = getCtx(); const now = c.currentTime;
      const melody = [523, 659, 784, 1047];
      melody.forEach((f, i) => tone(f, 'square', now + i * 0.12, 0.18, 0.15));
      tone(1047, 'square', now + 0.48, 0.35, 0.2);
    },

    drumroll(duration = 2.5) {
      if (muted) return;
      const c = getCtx(); const now = c.currentTime;
      let t = 0; let interval = 0.25;
      while (t < duration) {
        noise(now + t, 0.06, 0.12);
        tone(80, 'sine', now + t, 0.06, 0.15);
        interval = Math.max(0.04, interval * 0.93);
        t += interval;
      }
    },

    answerSubmit() {
      if (muted) return;
      const c = getCtx(); const now = c.currentTime;
      tone(880, 'sine', now, 0.1, 0.25);
      tone(1320, 'sine', now + 0.08, 0.18, 0.2);
    },

    voteSelect() {
      if (muted) return;
      const c = getCtx(); const now = c.currentTime;
      tone(440, 'triangle', now, 0.06, 0.2);
      tone(660, 'triangle', now + 0.05, 0.08, 0.15);
    },

    voteSubmit() {
      if (muted) return;
      const c = getCtx(); const now = c.currentTime;
      tone(660, 'sine', now, 0.08, 0.2);
      tone(880, 'sine', now + 0.07, 0.08, 0.2);
      tone(1100, 'sine', now + 0.14, 0.15, 0.2);
    },

    winnerFanfare() {
      if (muted) return;
      const c = getCtx(); const now = c.currentTime;
      [523, 659, 784].forEach(f => tone(f, 'square', now, 0.15, 0.12));
      [523, 659, 784].forEach(f => tone(f, 'square', now + 0.2, 0.15, 0.12));
      [659, 784, 988].forEach(f => tone(f, 'square', now + 0.4, 0.2, 0.14));
      [784, 988, 1175].forEach(f => tone(f, 'square', now + 0.65, 0.5, 0.16));
      tone(200, 'sawtooth', now + 0.6, 0.6, 0.08, 1200);
      tone(65, 'sine', now, 0.4, 0.25);
      tone(65, 'sine', now + 0.2, 0.3, 0.2);
    },

    scoreboard() {
      if (muted) return;
      const c = getCtx(); const now = c.currentTime;
      tone(300, 'sawtooth', now, 0.4, 0.1, 150);
      tone(800, 'sine', now + 0.1, 0.2, 0.12);
      tone(1000, 'sine', now + 0.25, 0.3, 0.15);
    },

    startTick() {
      if (muted) return;
      this.stopTick();
      tickInterval = setInterval(() => {
        const c = getCtx(); const now = c.currentTime;
        tone(1200, 'square', now, 0.05, 0.18);
        noise(now, 0.03, 0.05);
      }, 500);
    },

    stopTick() {
      if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
    },

    timesUp() {
      if (muted) return;
      this.stopTick();
      const c = getCtx(); const now = c.currentTime;
      tone(200, 'sawtooth', now, 0.15, 0.3, 100);
      tone(150, 'sawtooth', now + 0.18, 0.15, 0.3, 80);
      tone(120, 'sawtooth', now + 0.36, 0.3, 0.3, 60);
      noise(now, 0.1, 0.15);
    },

    playerJoined() {
      if (muted) return;
      const c = getCtx(); const now = c.currentTime;
      tone(523, 'sine', now, 0.08, 0.2);
      tone(784, 'sine', now + 0.1, 0.12, 0.2);
    },

    roundWin() {
      if (muted) return;
      const c = getCtx(); const now = c.currentTime;
      tone(523, 'triangle', now, 0.1, 0.2);
      tone(659, 'triangle', now + 0.1, 0.1, 0.2);
      tone(784, 'triangle', now + 0.2, 0.2, 0.25);
    },

    sadTrombone() {
      if (muted) return;
      const c = getCtx(); const now = c.currentTime;
      tone(350, 'sawtooth', now, 0.2, 0.2, 280);
      tone(280, 'sawtooth', now + 0.22, 0.2, 0.2, 220);
      tone(220, 'sawtooth', now + 0.44, 0.35, 0.2, 180);
    },

    promptReveal() {
      if (muted) return;
      const c = getCtx(); const now = c.currentTime;
      tone(440, 'sine', now, 0.05, 0.15);
      tone(554, 'sine', now + 0.06, 0.05, 0.12);
      tone(659, 'sine', now + 0.12, 0.15, 0.18);
    },
  };
})();

export function toggleMute() {
  const muted = SFX.toggleMute();
  const btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = muted ? '🔇' : '🔊';
  if (muted) {
    SFX.stopTick();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const ttsBar = document.getElementById('tts-indicator');
    if (ttsBar) ttsBar.style.display = 'none';
  }
}

// ===== TEXT-TO-SPEECH =====
export function populateVoicePicker() {
  const sel = document.getElementById('tts-voice-select');
  if (!sel) return;
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter(v => v.lang.startsWith('en'));
  sel.innerHTML = '<option value="">🎲 Auto-pick best voice</option>' +
    en.map(v => `<option value="${v.name}">${v.name} (${v.lang})</option>`).join('');
}

export function getSelectedVoice() {
  const sel = document.getElementById('tts-voice-select');
  const chosen = sel?.value;
  const voices = window.speechSynthesis.getVoices();
  if (chosen) return voices.find(v => v.name === chosen) || null;
  const preferred = ['Samantha','Karen','Moira','Fiona','Victoria','Allison','Ava','Susan','Alex'];
  for (const name of preferred) {
    const v = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'));
    if (v) return v;
  }
  return voices.find(v => v.lang === 'en-US' && v.localService) ||
         voices.find(v => v.lang.startsWith('en') && v.localService) ||
         voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

export function readAnswersAloud(prompt, answers) {
  if (!('speechSynthesis' in window)) return;
  if (SFX.isMuted()) return;
  window.speechSynthesis.cancel();

  const ttsBar = document.getElementById('tts-indicator');
  const ttsText = document.getElementById('tts-reading-text');
  if (ttsBar) ttsBar.style.display = 'block';

  const speakSequence = (items, idx) => {
    if (idx >= items.length) {
      if (ttsBar) ttsBar.style.display = 'none';
      return;
    }
    const { text, label, rate, pitch } = items[idx];
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = rate ?? 1.25;
    utt.pitch = pitch ?? 1.1;
    const v = getSelectedVoice();
    if (v) utt.voice = v;
    if (ttsText) ttsText.textContent = label;
    utt.onend = () => setTimeout(() => speakSequence(items, idx + 1), 250);
    utt.onerror = () => speakSequence(items, idx + 1);
    window.speechSynthesis.speak(utt);
  };

  const items = [
    { text: prompt, label: '🎤 Reading prompt...', rate: 1.1, pitch: 1.2 },
    ...answers.map((a, i) => ({
      text: a.answer,
      label: `🎤 Answer ${i + 1} of ${answers.length}`,
      rate: 1.3,
      pitch: 1.0 + (i % 3) * 0.15,
    }))
  ];

  setTimeout(() => {
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => { populateVoicePicker(); speakSequence(items, 0); };
    } else {
      speakSequence(items, 0);
    }
  }, 500);
}
