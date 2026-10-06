/**
 * English Voice Trainer
 * Tutor de inglês por voz: o tutor fala, você grava, o Gemini avalia o som.
 */
'use strict';

/* ================= Cenários ================= */
const SCENARIOS = [
  {
    id: 'starbucks',
    emoji: '☕',
    nome: 'Starbucks',
    descricao: 'Pedir seu café do seu jeito',
    personagem: 'Barista',
    contexto: 'Starbucks em Nova York, de manhã. O aluno é o cliente pedindo café e algo para comer; o personagem é um barista simpático e rápido. Etapas típicas: pedir a bebida, tamanho, leite/extras, nome para o copo, algo para comer, pagar, agradecer.',
    abertura: {
      cena: 'Você entra no Starbucks numa manhã fria em Nova York. A fila anda e chega a sua vez. O barista sorri:',
      falaPersonagem: 'Hi! What can I get for you?',
      frase: 'Can I have a latte, please?',
      traducao: 'Pode me ver um latte, por favor?',
      chunk: 'Can I have a + [item], please?'
    }
  },
  {
    id: 'hotel',
    emoji: '🏨',
    nome: 'Hotel',
    descricao: 'Fazer check-in e pedir o que precisa',
    personagem: 'Recepcionista',
    contexto: 'Recepção de um hotel em Miami, à noite. O aluno acabou de chegar de viagem e faz o check-in; o personagem é a recepcionista. Etapas típicas: dizer que tem reserva, mostrar documento, perguntar sobre café da manhã, wi-fi, horário de check-out, pedir ajuda com a mala, agradecer.',
    abertura: {
      cena: 'Você chega no hotel em Miami depois de um voo longo, puxando a mala até a recepção. A recepcionista diz:',
      falaPersonagem: 'Good evening! Welcome. How can I help you?',
      frase: 'Hi, I have a reservation for tonight.',
      traducao: 'Oi, eu tenho uma reserva para hoje à noite.',
      chunk: 'I have a reservation for + [quando]'
    }
  },
  {
    id: 'imigracao',
    emoji: '🛂',
    nome: 'Imigração',
    descricao: 'Passar pelo oficial no aeroporto',
    personagem: 'Oficial',
    contexto: 'Fila da imigração no aeroporto de Orlando. O aluno é um turista brasileiro; o personagem é um oficial sério mas educado. Etapas típicas: motivo da viagem, quanto tempo vai ficar, onde vai se hospedar, com quem está viajando, profissão, passagem de volta, despedida.',
    abertura: {
      cena: 'Você desce do avião em Orlando e chega na fila da imigração. O oficial pega seu passaporte e pergunta:',
      falaPersonagem: "What's the purpose of your visit?",
      frase: "I'm here on vacation.",
      traducao: 'Estou aqui de férias.',
      chunk: "I'm here on + [motivo]"
    }
  },
  {
    id: 'reuniao',
    emoji: '💼',
    nome: 'Reunião',
    descricao: 'Se apresentar e participar de uma call',
    personagem: 'Gerente',
    contexto: 'Primeira reunião online com o time dos EUA. O aluno é o novo membro do time; o personagem é a gerente, simpática. Etapas típicas: se apresentar, dizer o que faz, pedir para repetir, concordar, dar uma atualização curta, combinar o próximo passo, se despedir.',
    abertura: {
      cena: 'Primeira reunião online com o time dos EUA. Todo mundo liga a câmera e a gerente diz:',
      falaPersonagem: "Hi everyone! Let's start with quick introductions.",
      frase: 'Hi everyone, nice to meet you all.',
      traducao: 'Oi pessoal, prazer conhecer vocês.',
      chunk: 'Nice to meet + [quem]'
    }
  }
];

const STORAGE_KEY = 'evt_historico_v1';
const MAX_REC_MS = 15000;
const MIN_REC_MS = 600;

/* ================= Estado ================= */
const state = {
  scenario: null,
  turn: null,          // { frase, traducao, chunk, falaPersonagem }
  targetEl: null,
  historico: [],       // [{ personagem, frase }] enviado ao Gemini como contexto
  turno: 1,
  tentativasFrase: 0,
  session: null,
  rec: null,
  busy: false,
  ultimaFala: false,   // o Gemini avisou que esta é a fala de despedida
  ended: false,
  myAudioUrl: null
};

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= Navegação ================= */
function show(name) {
  ['home', 'chat', 'history'].forEach((s) => { $('screen-' + s).hidden = s !== name; });
  window.scrollTo(0, 0);
}

function renderHome() {
  const list = $('scenarioList');
  list.innerHTML = '';
  SCENARIOS.forEach((sc) => {
    const btn = document.createElement('button');
    btn.className = 'scenario-card';
    btn.type = 'button';
    btn.innerHTML = `
      <span class="scenario-emoji">${sc.emoji}</span>
      <span>
        <div class="scenario-name">${esc(sc.nome)}</div>
        <div class="scenario-desc">${esc(sc.descricao)}</div>
      </span>`;
    btn.addEventListener('click', () => startScenario(sc));
    list.appendChild(btn);
  });

  const avisos = [];
  if (!window.isSecureContext) avisos.push('O microfone só funciona em HTTPS. Abra pelo link da Vercel (https://…).');
  if (!navigator.mediaDevices || !window.MediaRecorder) avisos.push('Este navegador não grava áudio. Use o Chrome (Android) ou Safari atualizado (iPhone).');
  if (!('speechSynthesis' in window)) avisos.push('Este navegador não tem voz em inglês. Você vai ver as frases, mas não vai ouvir.');
  $('envWarning').hidden = !avisos.length;
  $('envWarning').innerHTML = avisos.map(esc).join('<br>');
}

/* ================= Voz do tutor (speechSynthesis) ================= */
let voices = [];
function loadVoices() {
  if ('speechSynthesis' in window) voices = speechSynthesis.getVoices();
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice() {
  const us = voices.filter((v) => /^en[-_]US/i.test(v.lang));
  return us.find((v) => /Google|Samantha|Aria|Jenny|Ava|Allison/i.test(v.name))
    || us[0]
    || voices.find((v) => /^en/i.test(v.lang))
    || null;
}

function speak(text, { rate = 0.9, pitch = 1 } = {}) {
  return new Promise((resolve) => {
    if (!text || !('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = rate;
    u.pitch = pitch;
    // Alguns Androids não disparam onend: garante que a Promise termina.
    const safety = setTimeout(resolve, 1500 + text.length * 150 / rate);
    u.onend = u.onerror = () => { clearTimeout(safety); resolve(); };
    speechSynthesis.speak(u);
  });
}

function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

async function speakTurn({ withCharacter = true, slow = false } = {}) {
  stopSpeaking();
  const t = state.turn;
  if (!t) return;
  if (withCharacter && t.falaPersonagem) {
    await speak(t.falaPersonagem, { rate: 0.95, pitch: 1.15 });
    await wait(350);
  }
  if (state.turn === t) await speak(t.frase, { rate: slow ? 0.65 : 0.9 });
}

/* ================= Conversa ================= */
function startScenario(sc) {
  cleanupRecording();
  stopSpeaking();
  state.scenario = sc;
  state.turn = null;
  state.targetEl = null;
  state.historico = [];
  state.turno = 1;
  state.tentativasFrase = 0;
  state.ultimaFala = false;
  state.ended = false;
  state.session = {
    id: Date.now().toString(36),
    cenario: sc.id,
    inicio: Date.now(),
    tentativas: 0,
    acertos: 0,
    falas: 0,
    palavras: [],
    concluida: false
  };
  setMyAudio(null);
  $('thread').innerHTML = '';
  $('chatEmoji').textContent = sc.emoji;
  $('chatName').textContent = sc.nome;
  updateScore();
  setHint('Ouça e toque no microfone para repetir');
  setMicState('idle');
  show('chat');
  presentTurn(sc.abertura);
}

function addBubble(cls, html) {
  const el = document.createElement('div');
  el.className = 'bubble ' + cls;
  el.innerHTML = html;
  $('thread').appendChild(el);
  scrollToBottom();
  return el;
}

function scrollToBottom() {
  requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
}

function presentTurn(t) {
  if (t.cena) addBubble('scene', esc(t.cena));
  if (t.falaPersonagem) {
    addBubble('character', `<div class="speaker">${esc(state.scenario.personagem)}</div><div class="en">${esc(t.falaPersonagem)}</div>`);
  }
  state.turn = {
    frase: t.frase,
    traducao: t.traducao,
    chunk: t.chunk,
    falaPersonagem: t.falaPersonagem || ''
  };
  state.tentativasFrase = 0;
  state.targetEl = null;
  renderTarget([]);
  speakTurn();
}

function normalizeWord(w) {
  return String(w).toLowerCase().replace(/[^a-z0-9']/g, '');
}

// Destaca o chunk (parte fixa) e sublinha as palavras erradas dentro da frase.
function highlightPhrase(frase, chunk, badWords) {
  const fixed = String(chunk || '').split(/[+[]/)[0].trim().replace(/[.,!?]+$/, '');
  const start = fixed.length > 1 ? frase.toLowerCase().indexOf(fixed.toLowerCase()) : -1;
  const end = start >= 0 ? start + fixed.length : -1;

  const bad = new Set();
  (badWords || []).forEach((b) => String(b).split(/\s+/).forEach((w) => { const n = normalizeWord(w); if (n) bad.add(n); }));

  let html = '';
  let pos = 0;
  let inMark = false;
  frase.split(/(\s+)/).forEach((tok) => {
    const tokStart = pos;
    pos += tok.length;
    const isSpace = /^\s+$/.test(tok);
    const insideChunk = start >= 0 && tokStart >= start && pos <= end;

    if (insideChunk && !inMark && !isSpace) { html += '<mark>'; inMark = true; }
    if (!insideChunk && inMark) { html += '</mark>'; inMark = false; }

    if (!isSpace && bad.has(normalizeWord(tok))) {
      html += `<span class="bad">${esc(tok)}</span>`;
    } else {
      html += esc(tok);
    }
  });
  if (inMark) html += '</mark>';
  return html;
}

function renderChunk(chunk) {
  return esc(chunk).replace(/\[([^\]]+)\]/g, '<span class="slot">[$1]</span>');
}

function renderTarget(badWords) {
  const t = state.turn;
  const el = state.targetEl || document.createElement('div');
  el.className = 'target';
  el.innerHTML = `
    <div class="target-label">Sua vez de falar</div>
    <div class="target-en">${highlightPhrase(t.frase, t.chunk, badWords)}</div>
    <div class="target-pt">${esc(t.traducao)}</div>
    ${t.chunk ? `<div class="chunk">🧩 ${renderChunk(t.chunk)}</div>` : ''}`;
  if (!state.targetEl) {
    $('thread').appendChild(el);
    state.targetEl = el;
  }
  scrollToBottom();
}

function updateScore() {
  const s = state.session;
  $('scoreOk').textContent = s ? s.acertos : 0;
  $('scoreTotal').textContent = s ? s.tentativas : 0;
}

function setHint(text) {
  $('micHint').textContent = text;
}

function setMicState(mode) {
  const btn = $('btnMic');
  btn.classList.toggle('recording', mode === 'recording');
  btn.classList.toggle('busy', mode === 'busy');
  btn.disabled = mode === 'busy' || state.ended;
  btn.setAttribute('aria-label', mode === 'recording' ? 'Parar gravação' : 'Gravar');
  ['btnListen', 'btnSlow', 'btnSkip'].forEach((id) => { $(id).disabled = mode !== 'idle' || state.ended; });
}

function formatMacete(m) {
  return esc(m).replace(/^([^:]{2,40}):/, '<strong>$1:</strong>');
}

function handleResult(r, { pulou = false } = {}) {
  const s = state.session;

  if (!pulou) {
    s.tentativas++;
    state.tentativasFrase++;
    if (r.transcricao) addBubble('me', `🗣️ “${esc(r.transcricao)}”`);
  }

  if (r.acertou) {
    if (!pulou) {
      s.acertos++;
      addBubble('feedback-ok', `✅ ${esc(r.feedback || 'Mandou bem!')}${r.macete ? `<div class="trick">${formatMacete(r.macete)}</div>` : ''}`);
    }
    s.falas++;
    state.historico.push({ personagem: state.turn.falaPersonagem, frase: state.turn.frase });
    state.turno++;
    if (state.targetEl) state.targetEl.classList.add('done');
    state.targetEl = null;

    if (state.ultimaFala || !r.proximaFala) {
      if (!state.ultimaFala && r.cena) addBubble('scene', esc(r.cena));
      endScene();
    } else {
      state.ultimaFala = r.fimDaCena === true;
      presentTurn({
        cena: r.cena,
        falaPersonagem: r.falaPersonagem,
        frase: r.proximaFala,
        traducao: r.traducao,
        chunk: r.chunk
      });
    }
  } else {
    const palavras = r.palavrasErradas || [];
    s.palavras.push(...palavras);
    const chips = palavras.length
      ? `<div class="wrong-words">${palavras.map((p) => `<span class="wrong-word">${esc(p)}</span>`).join('')}</div>`
      : '';
    addBubble('feedback-err', `
      <div>🔁 ${esc(r.feedback || 'Quase! Bora de novo.')}</div>
      ${chips}
      ${r.macete ? `<div class="trick">💡 ${formatMacete(r.macete)}</div>` : ''}
      <div class="repeat-hint">Repita a frase 👇</div>`);

    // Move o cartão da frase para baixo do feedback, com as palavras marcadas.
    if (state.targetEl) $('thread').appendChild(state.targetEl);
    renderTarget(palavras);
    setHint(state.tentativasFrase >= 3 ? 'Travou? Tudo bem, pode pular ⏭' : 'Ouça de novo e repita');
    wait(600).then(() => { if (!state.rec) speakTurn({ withCharacter: false, slow: true }); });
  }

  updateScore();
  saveSession();
}

function endScene() {
  state.ended = true;
  state.turn = null;
  state.session.concluida = true;
  saveSession();
  stopSpeaking();

  const s = state.session;
  const card = document.createElement('div');
  card.className = 'end-card';
  card.innerHTML = `
    <h2>🎉 Cena concluída!</h2>
    <div>Você acertou ${s.acertos} de ${s.tentativas} tentativas.</div>
    <div class="end-actions">
      <button class="btn primary" type="button" data-act="again">Repetir cena</button>
      <button class="btn" type="button" data-act="home">Outras cenas</button>
    </div>`;
  card.querySelector('[data-act="again"]').addEventListener('click', () => startScenario(state.scenario));
  card.querySelector('[data-act="home"]').addEventListener('click', goHome);
  $('thread').appendChild(card);
  setMicState('idle');
  setHint('Cena concluída');
  scrollToBottom();
  speak('Great job!');
}

function goHome() {
  cleanupRecording();
  stopSpeaking();
  state.turn = null;
  show('home');
}

/* ================= Gravação (MediaRecorder) ================= */
function pickMime() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  return options.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

async function toggleMic() {
  if (state.busy || state.ended) return;
  if (state.rec) return stopRecording();
  return startRecording();
}

async function startRecording() {
  stopSpeaking();
  if (!window.isSecureContext) return addBubble('error', '⚠️ O microfone só funciona em HTTPS.');
  if (!navigator.mediaDevices || !window.MediaRecorder) return addBubble('error', '⚠️ Este navegador não consegue gravar áudio.');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (err) {
    const negado = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    addBubble('error', negado
      ? '⚠️ Permissão do microfone negada. Libere nas configurações do navegador para este site.'
      : '⚠️ Não consegui acessar o microfone.');
    return;
  }

  const mime = pickMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const rec = { recorder, stream, chunks: [], start: Date.now(), mime, timer: null, ticker: null };

  recorder.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach((tr) => tr.stop());
    if (!rec.cancelled) processRecording(rec);
  };

  recorder.start();
  state.rec = rec;
  setMicState('recording');
  const tick = () => {
    const secs = Math.floor((Date.now() - rec.start) / 1000);
    setHint(`Gravando… ${secs}s · toque para parar`);
  };
  tick();
  rec.ticker = setInterval(tick, 500);
  rec.timer = setTimeout(stopRecording, MAX_REC_MS);
}

function stopRecording() {
  const rec = state.rec;
  if (!rec) return;
  state.rec = null;
  clearInterval(rec.ticker);
  clearTimeout(rec.timer);
  rec.duration = Date.now() - rec.start;
  if (rec.recorder.state !== 'inactive') rec.recorder.stop();
}

function cleanupRecording() {
  const rec = state.rec;
  if (!rec) return;
  rec.cancelled = true;
  stopRecording();
  rec.stream.getTracks().forEach((tr) => tr.stop());
  setMicState('idle');
}

function setMyAudio(blob) {
  if (state.myAudioUrl) URL.revokeObjectURL(state.myAudioUrl);
  state.myAudioUrl = blob ? URL.createObjectURL(blob) : null;
  $('btnMine').disabled = !blob;
}

async function processRecording(rec) {
  const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || rec.mime || 'audio/webm' });
  if (rec.duration < MIN_REC_MS || !blob.size) {
    setMicState('idle');
    setHint('Muito curto. Segure a frase inteira e toque para parar.');
    return;
  }
  setMyAudio(blob);
  await sendToTutor(blob);
}

async function sendToTutor(blob) {
  state.busy = true;
  setMicState('busy');
  setHint('Ouvindo sua pronúncia…');
  try {
    const { data, mimeType } = await prepareAudio(blob);
    const r = await callTutor({ audio: data, mimeType });
    handleResult(r);
  } catch (err) {
    addBubble('error', '⚠️ ' + esc(err.message || 'Algo deu errado. Tente de novo.'));
    setHint('Toque para tentar de novo');
  } finally {
    state.busy = false;
    if (!state.ended) setMicState('idle');
    if (!state.ended && /Ouvindo/.test($('micHint').textContent)) setHint('Toque para gravar');
  }
}

async function skipPhrase() {
  if (state.busy || state.rec || state.ended || !state.turn) return;
  stopSpeaking();
  state.busy = true;
  setMicState('busy');
  setHint('Avançando a cena…');
  try {
    const r = await callTutor({ pular: true });
    addBubble('me', '⏭ Frase pulada');
    handleResult(r, { pulou: true });
  } catch (err) {
    addBubble('error', '⚠️ ' + esc(err.message || 'Não consegui pular agora.'));
  } finally {
    state.busy = false;
    if (!state.ended) {
      setMicState('idle');
      setHint('Toque para gravar');
    }
  }
}

async function callTutor(extra) {
  const t = state.turn;
  let resp;
  try {
    resp = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cenario: state.scenario.contexto,
        fraseEsperada: t.frase,
        traducao: t.traducao,
        chunk: t.chunk,
        historico: state.historico.slice(-8),
        turno: state.turno,
        ...extra
      })
    });
  } catch {
    throw new Error('Sem internet. Conecte e tente de novo.');
  }
  const json = await resp.json().catch(() => null);
  if (!resp.ok || !json) throw new Error((json && json.erro) || `Erro no servidor (${resp.status}).`);
  return json;
}

/* ===== Conversão para WAV 16 kHz mono (formato que o Gemini aceita em qualquer celular) ===== */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function prepareAudio(blob) {
  let samples;
  const rate = 16000;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const arr = await blob.arrayBuffer();
    const decoded = await new Promise((res, rej) => ctx.decodeAudioData(arr, res, rej));
    ctx.close && ctx.close();

    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new OAC(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start(0);
    const rendered = await off.startRendering();
    samples = rendered.getChannelData(0);
  } catch {
    // Se o navegador não conseguir converter, manda o áudio original.
    return { data: await blobToBase64(blob), mimeType: (blob.type || 'audio/webm').split(';')[0] };
  }

  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak < 0.01) throw new Error('Não ouvi nada. Confira se o microfone está liberado e fale mais perto.');

  // Normaliza o volume para o Gemini ouvir melhor vozes baixas.
  const gain = Math.min(4, 0.9 / peak);
  if (gain > 1.05) for (let i = 0; i < samples.length; i++) samples[i] *= gain;

  return { data: await blobToBase64(encodeWav(samples, rate)), mimeType: 'audio/wav' };
}

/* ================= Histórico (localStorage) ================= */
function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveSession() {
  const s = state.session;
  if (!s || (!s.tentativas && !s.falas)) return;
  s.fim = Date.now();
  const list = loadHistory().filter((x) => x.id !== s.id);
  list.unshift({ ...s });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 60)));
  } catch { /* armazenamento cheio ou bloqueado: segue sem salvar */ }
}

function renderHistory() {
  const list = loadHistory();
  const ul = $('historyList');
  const summary = $('historySummary');
  ul.innerHTML = '';

  const tentativas = list.reduce((n, s) => n + (s.tentativas || 0), 0);
  const acertos = list.reduce((n, s) => n + (s.acertos || 0), 0);
  const taxa = tentativas ? Math.round((acertos / tentativas) * 100) : 0;
  summary.innerHTML = `
    <div class="stat"><b>${list.length}</b><span>cenas</span></div>
    <div class="stat"><b>${acertos}</b><span>frases certas</span></div>
    <div class="stat"><b>${taxa}%</b><span>de acerto</span></div>`;

  if (!list.length) {
    ul.innerHTML = '<li class="empty">Nenhum treino ainda. Bora para a primeira cena!</li>';
    return;
  }

  // Palavras que mais travaram, somando todos os treinos.
  const freq = {};
  list.forEach((s) => (s.palavras || []).forEach((p) => {
    const k = String(p).toLowerCase();
    freq[k] = (freq[k] || 0) + 1;
  }));
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length) {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `
      <div class="history-head">🎯 Palavras para treinar</div>
      <div class="history-words">${top.map(([w, n]) => `<span>${esc(w)} ×${n}</span>`).join('')}</div>`;
    ul.appendChild(li);
  }

  list.forEach((s) => {
    const sc = SCENARIOS.find((x) => x.id === s.cenario) || { emoji: '🗣️', nome: s.cenario };
    const data = new Date(s.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const palavras = [...new Set((s.palavras || []).map((p) => String(p).toLowerCase()))].slice(0, 8);
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `
      <div class="history-head">
        <span>${sc.emoji} ${esc(sc.nome)} ${s.concluida ? '✅' : ''}</span>
        <span class="history-date">${esc(data)}</span>
      </div>
      <div class="history-meta">${s.acertos || 0} acertos em ${s.tentativas || 0} tentativas · ${s.falas || 0} falas</div>
      ${palavras.length ? `<div class="history-words">${palavras.map((p) => `<span>${esc(p)}</span>`).join('')}</div>` : ''}`;
    ul.appendChild(li);
  });
}

/* ================= Eventos ================= */
$('btnMic').addEventListener('click', toggleMic);
$('btnListen').addEventListener('click', () => speakTurn());
$('btnSlow').addEventListener('click', () => speakTurn({ withCharacter: false, slow: true }));
$('btnSkip').addEventListener('click', skipPhrase);
$('btnMine').addEventListener('click', () => {
  if (!state.myAudioUrl) return;
  stopSpeaking();
  new Audio(state.myAudioUrl).play().catch(() => {});
});
$('btnBack').addEventListener('click', goHome);
$('btnHistory').addEventListener('click', () => { renderHistory(); show('history'); });
$('btnHistoryBack').addEventListener('click', () => show('home'));
$('btnClearHistory').addEventListener('click', () => {
  if (!loadHistory().length) return;
  if (confirm('Apagar todo o histórico?')) {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignora */ }
    renderHistory();
  }
});

renderHome();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
