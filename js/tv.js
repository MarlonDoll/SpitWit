// =====================================================
//  SPITWIT — TV Host Display (popup window)
// =====================================================
import { state } from './state.js';
import { notify } from './state.js';

let tvWindow = null;

export function openHostDisplay() {
  tvWindow = window.open('', 'SpitWitTV', 'width=1280,height=720,menubar=no,toolbar=no,location=no');
  if (!tvWindow) { notify('Allow popups to use TV mode!'); return; }

  tvWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>SPITWIT — TV Display</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Boogaloo&family=Nunito:wght@400;700;800&display=swap');
  :root{--bg:#0e0b1a;--surface:#17132a;--surface2:#1f1a35;--accent:#ff4757;--accent2:#ffd32a;--accent3:#a8ff3e;--accent4:#ff6b9d;--text:#f5f0ff;--muted:#7a6fa0;--border:#3d3570;--ink:#1a0a3e;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--bg);color:var(--text);font-family:'Nunito',sans-serif;min-height:100vh;overflow:hidden;position:relative;}
  body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 70% 50% at 15% 15%,rgba(255,71,87,0.07) 0%,transparent 60%),radial-gradient(ellipse 60% 50% at 85% 75%,rgba(168,255,62,0.05) 0%,transparent 60%);pointer-events:none;z-index:0;}
  .doodle{position:fixed;pointer-events:none;z-index:0;inset:0;overflow:hidden;}
  .doodle span{position:absolute;opacity:0.05;animation:fdoodle linear infinite;font-size:36px;}
  @keyframes fdoodle{0%{transform:translateY(110vh) rotate(0deg);opacity:0}10%{opacity:0.05}90%{opacity:0.05}100%{transform:translateY(-10vh) rotate(360deg);opacity:0}}
  .wrap{position:relative;z-index:1;max-width:1400px;margin:0 auto;padding:40px;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .logo{font-family:'Boogaloo',cursive;font-size:64px;color:var(--accent2);text-align:center;text-shadow:4px 4px 0 var(--ink),-2px -2px 0 var(--ink),2px -2px 0 var(--ink),-2px 2px 0 var(--ink),0 8px 0 rgba(255,71,87,0.5);transform:rotate(-1deg);display:inline-block;letter-spacing:2px;}
  .phase{font-family:'Boogaloo',cursive;font-size:24px;letter-spacing:3px;color:var(--muted);margin:8px 0 20px;text-align:center;text-transform:uppercase;}
  .prompt-box{background:var(--surface);border:3px solid var(--accent);border-radius:20px;padding:30px 40px;text-align:center;margin-bottom:24px;width:100%;max-width:1000px;font-size:clamp(22px,3vw,40px);font-weight:800;line-height:1.4;position:relative;box-shadow:6px 6px 0 rgba(255,71,87,0.35);}
  .prompt-box::before{content:'💬';position:absolute;top:-18px;left:18px;font-size:38px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));}
  .answers{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;width:100%;max-width:1200px;}
  .answer-card{background:var(--surface);border:3px solid var(--border);border-radius:16px;padding:28px 22px;font-size:clamp(16px,2vw,26px);font-weight:700;line-height:1.4;text-align:center;min-height:100px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;transition:all 0.5s ease;box-shadow:4px 4px 0 var(--border);}
  .answer-card.revealed{border-color:var(--accent3);background:rgba(168,255,62,0.06);box-shadow:4px 4px 0 var(--accent3);}
  .answer-card.winner{border-color:var(--accent2);background:rgba(255,211,42,0.1);box-shadow:6px 6px 0 var(--accent2);}
  .answer-card .pname{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);display:none;font-weight:800;}
  .answer-card.revealed .pname,.answer-card.winner .pname{display:block;color:var(--accent3);}
  .answer-card.winner .pname{color:var(--accent2);}
  .vcount{font-family:'Boogaloo',cursive;font-size:58px;color:var(--accent2);display:none;text-shadow:3px 3px 0 rgba(0,0,0,0.4);}
  .answer-card.revealed .vcount,.answer-card.winner .vcount{display:block;}
  .timer{font-family:'Boogaloo',cursive;font-size:100px;color:var(--accent2);line-height:1;margin:10px 0;text-shadow:5px 5px 0 var(--ink),0 8px 0 rgba(255,71,87,0.4);}
  .room-code{font-family:'Boogaloo',cursive;font-size:90px;letter-spacing:14px;color:var(--accent2);margin:16px 0 6px;text-shadow:5px 5px 0 var(--ink),0 8px 0 rgba(255,71,87,0.4);}
  .chips{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:20px;}
  .chip{background:var(--surface2);border:2.5px solid var(--border);border-radius:100px;padding:10px 24px;font-size:18px;font-weight:700;box-shadow:3px 3px 0 var(--border);}
  .chip.done{border-color:var(--accent3);color:var(--accent3);box-shadow:3px 3px 0 var(--accent3);}
  .score-list{width:100%;max-width:700px;list-style:none;}
  .score-item{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:2px dashed var(--border);font-size:22px;}
  .score-rank{font-family:'Boogaloo',cursive;font-size:40px;width:54px;color:var(--muted);text-shadow:2px 2px 0 rgba(0,0,0,0.3);}
  .score-rank.gold{color:var(--accent2)}.score-rank.silver{color:#c8c8d4}.score-rank.bronze{color:#cd7f32}
  .score-pts{font-family:'Boogaloo',cursive;font-size:40px;color:var(--accent3);margin-left:auto;text-shadow:2px 2px 0 rgba(0,0,0,0.4);}
  .winner-banner{font-family:'Boogaloo',cursive;font-size:90px;color:var(--accent2);text-align:center;text-shadow:5px 5px 0 var(--ink),-2px -2px 0 var(--ink),0 8px 0 rgba(255,71,87,0.5),0 16px 30px rgba(255,211,42,0.3);animation:wpop 0.6s cubic-bezier(0.34,1.56,0.64,1);}
  @keyframes wpop{from{transform:scale(0.5) rotate(-5deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}
  .blind-badge{background:rgba(255,71,87,0.15);border:2px solid rgba(255,71,87,0.4);color:var(--accent);padding:5px 18px;border-radius:100px;font-size:14px;letter-spacing:1px;text-transform:uppercase;font-weight:800;margin-bottom:14px;display:inline-block;}
  .disconnected-chip{opacity:0.4;border-style:dashed!important;}
</style>
</head>
<body>
<div class="doodle" id="doodles"></div>
<div class="wrap"><div id="tv" style="width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;">
  <div class="logo">SPITWIT</div>
  <div class="phase">LOADING...</div>
</div></div>
<script>
  (function(){
    const emojis=['💬','😂','✦','🎯','🔥','⚡','💥','🎉','👏','😈','🤣','💡','🎤','✌️','🃏'];
    const bg=document.getElementById('doodles');
    for(let i=0;i<14;i++){
      const el=document.createElement('span');
      el.textContent=emojis[Math.floor(Math.random()*emojis.length)];
      el.style.left=(Math.random()*100)+'%';
      el.style.animationDuration=(20+Math.random()*20)+'s';
      el.style.animationDelay=-(Math.random()*30)+'s';
      el.style.fontSize=(24+Math.random()*20)+'px';
      bg.appendChild(el);
    }
  })();
  window.addEventListener('message', (e) => {
    if (e.data && e.data.spitwitTV) render(e.data);
  });
  let timerInterval = null;
  function render(data) {
    const tv = document.getElementById('tv');
    const { phase } = data;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (phase === 'lobby') {
      tv.innerHTML = \`
        <div class="logo">SPITWIT</div>
        <div class="phase">Waiting for players</div>
        <div style="color:var(--muted);font-size:16px;font-weight:800;letter-spacing:3px;text-transform:uppercase;margin-bottom:6px;">Room Code</div>
        <div class="room-code">\${data.roomCode}</div>
        <div style="color:var(--muted);font-size:16px;font-weight:700;letter-spacing:1px;margin-bottom:20px;">\${data.players.length} player\${data.players.length!==1?'s':''} joined</div>
        <div class="chips">\${data.players.map(p=>\`<div class="chip">\${p.name}</div>\`).join('')}</div>
      \`;
    } else if (phase === 'answering') {
      let t = data.timerTotal || 60;
      tv.innerHTML = \`
        <div class="logo" style="font-size:40px;">SPITWIT</div>
        <div class="phase">Round \${data.round} · Answer Time</div>
        <div class="prompt-box">\${data.prompt}</div>
        <div class="timer" id="tv-timer">\${t}</div>
        <div style="color:var(--muted);font-size:15px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Who's answered?</div>
        <div class="chips" id="tv-chips">\${data.players.map(p=>\`<div class="chip\${p.disconnected?' disconnected-chip':''}" id="tv-chip-\${p.id}">\${p.name}\${p.disconnected?' 📡':''}</div>\`).join('')}</div>
      \`;
      timerInterval = setInterval(() => {
        t--; const el = document.getElementById('tv-timer');
        if (el) { el.textContent = Math.max(0, t); if(t<=10) el.style.color='var(--accent)'; }
        if (t <= 0) clearInterval(timerInterval);
      }, 1000);
    } else if (phase === 'chip-update') {
      const chip = document.getElementById('tv-chip-' + data.playerId);
      if (chip) chip.classList.add('done');
    } else if (phase === 'voting') {
      let t = data.timerTotal || 30;
      tv.innerHTML = \`
        <div class="logo" style="font-size:40px;">SPITWIT</div>
        <div class="phase">Vote Now!</div>
        \${data.isBlind ? '<div class="blind-badge">🕵️ Blind Voting</div>' : ''}
        <div class="prompt-box" style="margin-bottom:16px;">\${data.prompt}</div>
        <div class="timer" id="tv-timer">\${t}</div>
        <div class="answers">\${data.answers.map(a => \`
          <div class="answer-card">
            <div>\${a.answer}</div>
            \${!data.isBlind ? \`<div class="pname">\${data.players.find(p=>p.id===a.playerId)?.name||''}</div>\` : ''}
          </div>
        \`).join('')}</div>
      \`;
      timerInterval = setInterval(() => {
        t--; const el = document.getElementById('tv-timer');
        if (el) { el.textContent = Math.max(0, t); if(t<=10) el.style.color='var(--accent)'; }
        if (t <= 0) clearInterval(timerInterval);
      }, 1000);
    } else if (phase === 'results') {
      tv.innerHTML = \`
        <div class="logo" style="font-size:40px;">SPITWIT</div>
        <div class="phase">Results</div>
        <div class="prompt-box" style="margin-bottom:16px;">\${data.prompt}</div>
        <div class="answers">\${data.answers.map(a => {
          const vc = data.votes[a.playerId] || 0;
          const isW = vc === data.maxVotes && vc > 0;
          const pname = data.players.find(p=>p.id===a.playerId)?.name || '';
          return \`<div class="answer-card \${isW?'winner':'revealed'}">
            <div>\${a.answer}</div>
            <div class="pname">\${pname}</div>
            <div class="vcount">\${vc}</div>
            <div style="font-size:14px;color:var(--muted);font-weight:800;">\${vc===1?'vote':'votes'}</div>
          </div>\`;
        }).join('')}</div>
      \`;
    } else if (phase === 'scoreboard') {
      const ranks = ['gold','silver','bronze'];
      tv.innerHTML = \`
        <div class="logo" style="font-size:48px;">SPITWIT</div>
        <div class="phase">Leaderboard · After Round \${data.round}</div>
        <ul class="score-list">\${data.players.map((p,i)=>\`
          <li class="score-item">
            <div class="score-rank \${ranks[i]||''}">\${i+1}</div>
            <div style="flex:1;font-weight:800;font-size:22px;">\${p.name}\${p.disconnected?' 📡':''}</div>
            <div class="score-pts">\${p.score}</div>
          </li>
        \`).join('')}</ul>
      \`;
    } else if (phase === 'winner') {
      const w = data.players[0];
      const ranks = ['gold','silver','bronze'];
      tv.innerHTML = \`
        <div class="logo">SPITWIT</div>
        <div style="font-size:52px;margin:10px 0;animation:wpop 0.5s cubic-bezier(0.34,1.56,0.64,1);">🎉🏆🎉</div>
        <div class="winner-banner">🏆 \${w.name} Wins!</div>
        <div style="color:var(--muted);font-size:24px;font-weight:700;margin:8px 0 28px;">\${w.score} points</div>
        <ul class="score-list">\${data.players.map((p,i)=>\`
          <li class="score-item">
            <div class="score-rank \${ranks[i]||''}">\${i+1}</div>
            <div style="flex:1;font-weight:800;font-size:22px;">\${p.name}</div>
            <div class="score-pts">\${p.score}</div>
          </li>
        \`).join('')}</ul>
      \`;
    }
  }
<\/script>
</body>
</html>`);
  tvWindow.document.close();
  notify('📺 TV Display opened!');
}

export function tvUpdate(phase, data) {
  if (!tvWindow || tvWindow.closed) return;
  tvWindow.postMessage({ spitwitTV: true, phase, ...data }, '*');
}

export function trackAnswerForTV(playerId) {
  tvUpdate('chip-update', { playerId });
}

export function closeTvWindow() {
  if (tvWindow && !tvWindow.closed) tvWindow.close();
  tvWindow = null;
}
