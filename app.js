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
      blocosPersonagem: [
        { en: 'Hi!', pt: 'Oi!' },
        { en: 'What can I get for you?', pt: 'O que vai querer?' }
      ],
      frase: 'Can I have a latte, please?',
      traducao: 'Pode me ver um latte, por favor?',
      chunk: 'Can I have a + [item], please?'
    },
    aberturaLivre: {
      falaPersonagem: "Here's your latte! Is this your first time in New York?",
      traducao: 'Aqui está seu latte! É sua primeira vez em Nova York?',
      chunks: ["Yes, it's my first time.", "No, I've been here before.", "Yes, I'm here on vacation."]
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
      blocosPersonagem: [
        { en: 'Good evening!', pt: 'Boa noite!' },
        { en: 'Welcome.', pt: 'Seja bem-vindo.' },
        { en: 'How can I help you?', pt: 'Como posso te ajudar?' }
      ],
      frase: 'Hi, I have a reservation for tonight.',
      traducao: 'Oi, eu tenho uma reserva para hoje à noite.',
      chunk: 'I have a reservation for + [quando]'
    },
    aberturaLivre: {
      falaPersonagem: "Here's your room key. Is this your first time in Miami?",
      traducao: 'Aqui está a chave do seu quarto. É sua primeira vez em Miami?',
      chunks: ["Yes, it's my first time.", 'No, I came here last year.', "Yes, and I'm very excited!"]
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
      blocosPersonagem: [
        { en: "What's the purpose of your visit?", pt: 'Qual é o motivo da sua visita?' }
      ],
      frase: "I'm here on vacation.",
      traducao: 'Estou aqui de férias.',
      chunk: "I'm here on + [motivo]"
    },
    aberturaLivre: {
      falaPersonagem: "Okay, you're all set. Is this your first trip to the United States?",
      traducao: 'Certo, está tudo pronto. É sua primeira viagem aos Estados Unidos?',
      chunks: ["Yes, it's my first trip.", 'No, I came here a few years ago.', "Yes, and I'm very excited."]
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
      blocosPersonagem: [
        { en: 'Hi everyone!', pt: 'Oi, pessoal!' },
        { en: "Let's start with quick introductions.", pt: 'Vamos começar com apresentações rápidas.' }
      ],
      frase: 'Hi everyone, nice to meet you all.',
      traducao: 'Oi pessoal, prazer conhecer vocês.',
      chunk: 'Nice to meet + [quem]'
    },
    aberturaLivre: {
      falaPersonagem: 'Great to have you on the team! What do you like to do on weekends?',
      traducao: 'Que bom ter você no time! O que você gosta de fazer nos fins de semana?',
      chunks: ['I like to play soccer.', 'I like to watch movies.', 'I spend time with my family.']
    }
  }
];

const STORAGE_KEY = 'evt_historico_v1';
const MAX_REC_MS = 15000;
const MIN_REC_MS = 600;
const SLOW_RATE = 0.55; // velocidade de todos os botões 🐢
const MAX_LIVRE_TURNOS = 10; // teto de falas do aluno por conversa livre
const MAX_LIVRE_MSGS = 6;    // mensagens da conversa livre enviadas ao Gemini

/* ================= Estado ================= */
const state = {
  scenario: null,
  turn: null,          // { frase, traducao, chunk, falaPersonagem }
  ultimoTurnoValido: null,
  targetEl: null,
  historico: [],       // [{ personagem, frase }] enviado ao Gemini como contexto
  turno: 1,
  tentativasFrase: 0,
  session: null,
  rec: null,
  busy: false,
  ultimaFala: false,   // o Gemini avisou que esta é a fala de despedida
  ended: false,
  praticando: null,    // treino de balão aguardando o Gemini: { frase, balao, btn }
  modo: 'guiado',      // 'guiado' (a cena normal) | 'livre' (conversa livre depois da cena)
  livre: null,         // estado da conversa livre (ver startFreeTalk)
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
  if (state.turn === t) await speak(t.frase, { rate: slow ? SLOW_RATE : 0.9 });
}

/* ================= Conversa ================= */
function startScenario(sc) {
  cleanupRecording();
  stopSpeaking();
  resetFreeTalk();
  state.scenario = sc;
  state.turn = null;
  state.ultimoTurnoValido = null;
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
  resetTeacherChat();
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
  if (!t.frase) return showMissingNext();
  if (t.cena) addBubble('scene', esc(t.cena));
  if (t.falaPersonagem) {
    const { blocos, traducao } = characterBlocks(t.falaPersonagem, t.blocosPersonagem, t.traducaoPersonagem);
    addBubble('character', `
      <div class="speaker">${esc(state.scenario.personagem)}</div>
      ${traducao ? `<div class="pt">${esc(traducao)}</div>` : ''}
      ${blocksHtml(blocos)}`);
  }
  state.turn = {
    frase: t.frase,
    traducao: t.traducao,
    chunk: t.chunk,
    falaPersonagem: t.falaPersonagem || ''
  };
  state.ultimoTurnoValido = state.turn;
  state.tentativasFrase = 0;
  state.targetEl = null;
  renderTarget([]);
  speakTurn();
}

/* ================= Blocos com tradução ================= */
const MAX_BLOCOS = 3; // falas longas não esticam a tela

function compactText(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, '');
}

// Junta blocos vizinhos (o par mais curto primeiro) até sobrarem no máximo MAX_BLOCOS.
function limitBlocks(blocos) {
  const b = blocos.slice();
  while (b.length > MAX_BLOCOS) {
    let i = 0;
    for (let k = 1; k < b.length - 1; k++) {
      if (b[k].en.length + b[k + 1].en.length < b[i].en.length + b[i + 1].en.length) i = k;
    }
    b.splice(i, 2, { en: `${b[i].en} ${b[i + 1].en}`, pt: [b[i].pt, b[i + 1].pt].filter(Boolean).join(' ') });
  }
  return b;
}

// Blocos da fala do personagem: usa os que vieram se juntos formam a fala (ignorando espaços e pontuação)
// e todos têm tradução; se não, divide em cada . ! ? e a tradução inteira vai em cima do balão.
function characterBlocks(fala, blocos, traducaoInteira) {
  const lista = (Array.isArray(blocos) ? blocos : [])
    .map((b) => ({ en: String((b && b.en) || '').trim(), pt: String((b && b.pt) || '').trim() }));
  const validos = lista.length
    && lista.every((b) => b.en && b.pt)
    && compactText(lista.map((b) => b.en).join(' ')) === compactText(fala);
  if (validos) return { blocos: limitBlocks(lista), traducao: '' };
  const frases = String(fala).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return { blocos: limitBlocks(frases.map((en) => ({ en, pt: '' }))), traducao: traducaoInteira || '' };
}

// Componente dos blocos, o mesmo para os balões do aluno e do personagem:
// tradução em cima, inglês no meio, 🔊 🐢 🎤 embaixo (o 🎤 treina só o bloco).
function blocksHtml(blocos) {
  return `<div class="blocks">${blocos.map((b) => `
    <div class="block">
      ${b.pt ? `<div class="block-pt">${esc(b.pt)}</div>` : ''}
      <div class="block-en">${esc(b.en)}</div>
      ${practiceBar(b.en)}
    </div>`).join('')}</div>`;
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
  let t = state.turn;
  let fallback = false;
  // Nunca deixa o cartão sem frase: volta para a última frase válida.
  if (!t || !t.frase) {
    t = state.ultimoTurnoValido;
    if (!t) return;
    state.turn = t;
    fallback = true;
  }
  const el = state.targetEl || document.createElement('div');
  el.className = 'target';
  el.innerHTML = `
    ${fallback ? '<div class="target-warn">⚠️ Mostrando a última frase válida.</div>' : ''}
    <div class="target-label">Sua vez de falar</div>
    <div class="target-en">${highlightPhrase(t.frase, t.chunk, badWords)}</div>
    <div class="target-pt">${esc(t.traducao)}</div>
    ${t.chunk ? `<div class="chunk">🧩 ${renderChunk(t.chunk)}</div>` : ''}
    ${practiceBar(t.frase)}`;
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
  // Treino de balão: o microfone grande fica desativado, sem aparência de gravando.
  const treino = !!((state.rec && state.rec.alvo.modo === 'treino') || state.praticando);
  // Conversa livre: o fim da cena guiada não trava os botões; o que trava é o teto ou a espera do 429.
  const livre = state.modo === 'livre';
  const travado = livre ? freeTalkLocked() : state.ended;
  const btn = $('btnMic');
  btn.classList.toggle('recording', mode === 'recording' && !treino);
  btn.classList.toggle('busy', mode === 'busy' && !treino);
  btn.disabled = mode === 'busy' || travado || treino;
  btn.setAttribute('aria-label', mode === 'recording' && !treino ? 'Parar gravação' : 'Gravar');
  ['btnListen', 'btnSlow', 'btnSkip', 'btnTeacher'].forEach((id) => { $(id).disabled = mode !== 'idle' || (livre ? false : state.ended); });
  syncBubbleButtons(mode);
}

// Só uma gravação por vez: enquanto grava ou espera o Gemini, só o botão ativo fica disponível (para parar).
function syncBubbleButtons(mode) {
  const ativo = (state.rec && state.rec.alvo.btn) || (state.praticando && state.praticando.btn) || null;
  document.querySelectorAll('#thread .act-btn').forEach((b) => {
    const isAtivo = b === ativo;
    b.classList.toggle('recording', isAtivo && mode === 'recording');
    b.classList.toggle('busy', isAtivo && mode === 'busy');
    b.disabled = mode !== 'idle' && !(isAtivo && mode === 'recording');
  });
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

  rememberForTeacher(r);

  if (r.acertou) {
    if (!pulou) {
      s.acertos++;
      addBubble('feedback-ok', `✅ ${esc(r.feedback || 'Mandou bem!')}${r.macete ? `<div class="trick">${formatMacete(r.macete)}</div>` : ''}`);
    }
    // A cena só termina quando o Gemini já avisou que esta era a despedida.
    if (state.ultimaFala) {
      registerSpokenLine();
      endScene();
    } else if (r.semProximaFala || !r.proximaFala) {
      showMissingNext();
    } else {
      registerSpokenLine();
      state.ultimaFala = r.fimDaCena === true;
      presentTurn({
        cena: r.cena,
        falaPersonagem: r.falaPersonagem,
        blocosPersonagem: r.blocosPersonagem,
        traducaoPersonagem: r.traducaoPersonagem,
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

function registerSpokenLine() {
  state.session.falas++;
  state.historico.push({ personagem: state.turn.falaPersonagem, frase: state.turn.frase });
  state.turno++;
  if (state.targetEl) state.targetEl.classList.add('done');
  state.targetEl = null;
}

// Acertou, mas a próxima fala não veio: mantém a frase atual na tela e oferece o Pular.
function showMissingNext() {
  addBubble('error', '⚠️ Não consegui puxar a próxima fala. Toque em ⏭ Pular para seguir.');
  if (state.targetEl) $('thread').appendChild(state.targetEl);
  renderTarget([]);
  setHint('Toque em ⏭ Pular para seguir');
}

function endScene() {
  state.ended = true;
  state.turn = null;
  state.session.concluida = true;
  saveSession();
  stopSpeaking();

  appendEndCard();
  setMicState('idle');
  setHint('Cena concluída');
  scrollToBottom();
  speak('Great job!');
}

// Cartão de fim da cena guiada (também volta a aparecer quando a conversa livre é encerrada).
function appendEndCard() {
  const s = state.session;
  const card = document.createElement('div');
  card.className = 'end-card';
  card.innerHTML = `
    <h2>🎉 Cena concluída!</h2>
    <div>Você acertou ${s.acertos} de ${s.tentativas} tentativas.</div>
    <div class="end-actions">
      <button class="btn primary" type="button" data-act="free">💬 Continuar conversando</button>
      <button class="btn" type="button" data-act="again">Repetir cena</button>
      <button class="btn" type="button" data-act="home">Outras cenas</button>
    </div>`;
  card.querySelector('[data-act="free"]').addEventListener('click', startFreeTalk);
  card.querySelector('[data-act="again"]').addEventListener('click', () => startScenario(state.scenario));
  card.querySelector('[data-act="home"]').addEventListener('click', goHome);
  $('thread').appendChild(card);
}

function goHome() {
  cleanupRecording();
  stopSpeaking();
  resetFreeTalk();
  state.turn = null;
  show('home');
}

/* ================= Gravação (MediaRecorder) ================= */
function pickMime() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  return options.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

// Fluxo normal da cena. btn = o 🎤 do cartão "Sua vez de falar", quando veio de lá (só para destacar).
async function toggleMic(btn) {
  if (state.modo === 'livre') return toggleFreeMic();
  if (state.busy || state.ended) return;
  if (state.rec) return stopRecording();
  return startRecording({ modo: 'cena', btn: btn || null });
}

// Treino de um balão: avalia só a pronúncia daquela frase, sem mexer na cena.
function togglePractice(frase, balao, btn) {
  if (state.rec) {
    if (state.rec.alvo.btn === btn) stopRecording();
    return;
  }
  if (state.busy) return;
  startRecording({ modo: 'treino', frase, balao, btn });
}

async function startRecording(alvo = { modo: 'cena', btn: null }) {
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
  const rec = { recorder, stream, chunks: [], start: Date.now(), mime, timer: null, ticker: null, alvo };

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
    setHint(alvo.modo === 'treino'
      ? `Treinando o balão… ${secs}s · toque no 🎤 para parar`
      : `Gravando… ${secs}s · toque para parar`);
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
    setHint(state.ended && state.modo !== 'livre' ? 'Cena concluída' : 'Muito curto. Segure a frase inteira e toque para parar.');
    if (rec.alvo.modo === 'treino') showPracticeResult(rec.alvo.balao, 'erro', '⚠️ Muito curto. Fala a frase inteira e toca no 🎤 para parar.');
    return;
  }
  setMyAudio(blob);
  if (rec.alvo.modo === 'treino') return sendPractice(blob, rec.alvo);
  if (rec.alvo.modo === 'livre') return sendFreeTurn(blob);
  await sendToTutor(blob);
}

function showPracticeResult(balao, tipo, html) {
  const box = balao && balao.querySelector('.practice-result');
  if (!box) return;
  box.className = 'practice-result ' + tipo;
  box.innerHTML = html;
  box.hidden = false;
}

// Envia o treino de um balão para /api/praticar. Nunca toca na cena, no placar ou no histórico.
async function sendPractice(blob, alvo) {
  state.busy = true;
  state.praticando = alvo;
  setMicState('busy');
  setHint('Avaliando sua pronúncia do balão…');
  showPracticeResult(alvo.balao, 'wait', 'Avaliando…');
  try {
    const { data, mimeType } = await prepareAudio(blob);
    let resp;
    try {
      resp = await fetch('/api/praticar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frase: alvo.frase, audio: data, mimeType })
      });
    } catch {
      throw new Error('Sem internet. Conecte e tente de novo.');
    }
    const r = await resp.json().catch(() => null);
    console.log('[praticar] resposta bruta', resp.status, r);
    if (!resp.ok || !r) throw new Error((r && r.erro) || `Erro no servidor (${resp.status}).`);

    if (r.acertou) {
      showPracticeResult(alvo.balao, 'ok', `✅ ${esc(r.feedback || 'Boa!')}`);
    } else {
      const palavras = r.palavrasErradas || [];
      showPracticeResult(alvo.balao, 'err', `
        <div>🔁 ${esc(r.feedback || 'Quase! Tenta de novo.')}</div>
        ${palavras.length ? `<div class="wrong-words">${palavras.map((p) => `<span class="wrong-word">${esc(p)}</span>`).join('')}</div>` : ''}
        ${r.macete ? `<div class="trick">💡 ${formatMacete(r.macete)}</div>` : ''}
        ${r.transcricao ? `<div class="practice-heard">Ouvi: “${esc(r.transcricao)}”</div>` : ''}`);
    }
  } catch (err) {
    showPracticeResult(alvo.balao, 'erro', '⚠️ ' + esc(err.message || 'Não consegui avaliar agora. Tenta de novo.'));
  } finally {
    state.busy = false;
    state.praticando = null;
    setMicState('idle');
    if (!freeTalkWaiting()) setHint(idleHint());
  }
}

let speakSeq = 0;
function speakFromBubble(frase, rate, btn) {
  stopSpeaking();
  const id = ++speakSeq;
  btn.dataset.speakId = id;
  btn.classList.add('speaking');
  speak(frase, { rate }).then(() => {
    if (btn.dataset.speakId === String(id)) btn.classList.remove('speaking');
  });
}

// Fileira de botões de treino embaixo da frase em inglês de um balão.
function practiceBar(frase) {
  return `
    <div class="bubble-actions" data-frase="${esc(frase)}">
      <button type="button" class="act-btn" data-act="ouvir" aria-label="Ouvir a frase">🔊 Ouvir</button>
      <button type="button" class="act-btn" data-act="devagar" aria-label="Ouvir devagar">🐢 Devagar</button>
      <button type="button" class="act-btn" data-act="falar" aria-label="Gravar e treinar esta frase">🎤 Falar</button>
    </div>
    <div class="practice-result" hidden></div>`;
}

// Um único listener para os botões de todos os balões, inclusive os antigos.
function onThreadClick(e) {
  const btn = e.target.closest('.act-btn');
  if (!btn || btn.disabled) return;
  const frase = btn.closest('.bubble-actions').dataset.frase;
  // Num bloco, o resultado do treino aparece no próprio bloco.
  const balao = btn.closest('.block, .bubble, .target');
  const act = btn.dataset.act;

  if (act === 'ouvir') return speakFromBubble(frase, 0.9, btn);
  if (act === 'devagar') return speakFromBubble(frase, SLOW_RATE, btn);
  if (act === 'falar') {
    // O cartão "Sua vez de falar" atual segue o fluxo normal da cena, igual ao microfone grande.
    const atual = balao === state.targetEl && !balao.classList.contains('done');
    if (atual) return toggleMic(btn);
    return togglePractice(frase, balao, btn);
  }
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
      if (/Avançando/.test($('micHint').textContent)) setHint('Toque para gravar');
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
        ultimaFala: state.ultimaFala,
        ...extra
      })
    });
  } catch {
    throw new Error('Sem internet. Conecte e tente de novo.');
  }
  const json = await resp.json().catch(() => null);
  console.log('[tutor] resposta bruta', resp.status, json);
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
      <div class="history-meta">${s.acertos || 0} acertos em ${s.tentativas || 0} tentativas · ${s.falas || 0} falas${s.livreTurnos ? ` · 💬 ${s.livreTurnos} na conversa livre` : ''}</div>
      ${palavras.length ? `<div class="history-words">${palavras.map((p) => `<span>${esc(p)}</span>`).join('')}</div>` : ''}`;
    ul.appendChild(li);
  });
}

/* ================= Conversa livre ================= */
// Depois da cena guiada, o aluno conversa à vontade com o personagem do mesmo cenário (/api/conversa).

function resetFreeTalk() {
  if (state.livre) clearInterval(state.livre.timer);
  state.modo = 'guiado';
  state.livre = null;
  setFreeDock(false);
}

// Microfone grande travado no modo livre: depois do teto/encerramento ou durante a espera do 429.
function freeTalkLocked() {
  const L = state.livre;
  return !L || L.encerrada || freeTalkWaiting();
}

function freeTalkWaiting() {
  const L = state.livre;
  return !!(state.modo === 'livre' && L && L.esperaAte > Date.now());
}

function idleHint() {
  if (state.modo === 'livre') return state.livre && state.livre.encerrada ? 'Conversa encerrada' : 'Toque no microfone e fale o que quiser';
  return state.ended ? 'Cena concluída' : 'Toque para gravar';
}

// No modo livre o Pular some e aparece "Encerrar conversa"; ao sair, tudo volta como era.
function setFreeDock(on) {
  $('btnSkip').hidden = on;
  let end = $('btnEndFree');
  if (on && !end) {
    end = document.createElement('button');
    end.id = 'btnEndFree';
    end.type = 'button';
    end.className = 'pill-btn';
    end.textContent = '🏁 Encerrar conversa';
    end.addEventListener('click', finishFreeTalk);
    $('btnSkip').after(end);
  } else if (!on && end) {
    end.remove();
  }
}

function startFreeTalk() {
  if (state.rec || state.busy || state.modo === 'livre' || !state.scenario) return;
  const ab = state.scenario.aberturaLivre;
  if (!ab) return;
  stopSpeaking();
  state.modo = 'livre';
  state.livre = {
    mensagens: [],        // [{ autor: 'personagem' | 'aluno', texto }]
    turnos: 0,
    ultimaFala: null,     // { texto, traducao } — o que o 🔊 de baixo repete e o professor recebe
    correcoes: [],        // [{ de, para }] para o resumo
    chunksEl: null,
    esperaAte: 0,
    timer: null,
    encerrada: false,
    resumoMostrado: false
  };
  state.session.livreTurnos = 0;
  setFreeDock(true);
  addBubble('scene', `💬 Conversa livre com ${esc(state.scenario.personagem.toLowerCase())}: fale o que quiser, eu respondo e corrijo de leve. Até ${MAX_LIVRE_TURNOS} falas.`);
  presentFreeTurn({ resposta: ab.falaPersonagem, traducao: ab.traducao, chunksSugeridos: ab.chunks });
  setMicState('idle');
  setHint(idleHint());
}

// Balão do personagem + sugestões para se travar. As sugestões antigas ficam recolhidas.
function presentFreeTurn(r) {
  const L = state.livre;
  addBubble('character free', `
    <div class="speaker">${esc(state.scenario.personagem)}</div>
    <div class="en">${esc(r.resposta)}</div>
    <div class="pt">${esc(r.traducao)}</div>
    ${practiceBar(r.resposta)}`);
  L.ultimaFala = { texto: r.resposta, traducao: r.traducao };
  L.mensagens.push({ autor: 'personagem', texto: r.resposta });

  const chunks = r.chunksSugeridos || [];
  if (chunks.length) {
    if (L.chunksEl) L.chunksEl.open = false;
    const box = document.createElement('details');
    box.className = 'free-chunks';
    box.open = true;
    box.innerHTML = `
      <summary>💡 Se travar: ${chunks.length} sugestões</summary>
      ${chunks.map((c) => `<div class="bubble free-chunk"><div class="en">${esc(c)}</div>${practiceBar(c)}</div>`).join('')}`;
    $('thread').appendChild(box);
    L.chunksEl = box;
  }
  scrollToBottom();
  speakFreeLast(0.95);
}

function speakFreeLast(rate) {
  const f = state.livre && state.livre.ultimaFala;
  if (!f) return;
  stopSpeaking();
  speak(f.texto, { rate, pitch: 1.15 });
}

function toggleFreeMic() {
  if (state.rec) return state.rec.alvo.modo === 'livre' ? stopRecording() : undefined;
  if (state.busy || freeTalkLocked()) return;
  return startRecording({ modo: 'livre', btn: null });
}

async function sendFreeTurn(blob) {
  state.busy = true;
  setMicState('busy');
  setHint(`${state.scenario.personagem} está ouvindo…`);
  try {
    const { data, mimeType } = await prepareAudio(blob);
    let resp;
    try {
      resp = await fetch('/api/conversa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cenario: state.scenario.contexto,
          personagem: state.scenario.personagem,
          resumoCena: state.historico.slice(-3),
          mensagens: state.livre.mensagens.slice(-MAX_LIVRE_MSGS),
          audio: data,
          mimeType
        })
      });
    } catch {
      throw new Error('Sem internet. Conecte e tente de novo.');
    }
    const r = await resp.json().catch(() => null);
    console.log('[conversa] resposta bruta', resp.status, r);
    if (resp.status === 429) return startFreeCooldown(r && r.espera, r && r.erro);
    if (!resp.ok || !r) throw new Error((r && r.erro) || `Erro no servidor (${resp.status}).`);
    handleFreeResult(r);
  } catch (err) {
    addBubble('error', '⚠️ ' + esc(err.message || 'Algo deu errado. Fala de novo.'));
  } finally {
    state.busy = false;
    setMicState('idle');
    if (!freeTalkWaiting()) setHint(idleHint());
  }
}

function handleFreeResult(r) {
  const L = state.livre;
  if (!L) return;

  // Áudio mudo: o personagem pede para repetir e o turno não avança.
  if (r.naoOuvi) {
    addBubble('me', '🗣️ Ouvi: <em>(nada)</em>');
    addBubble('character free', `<div class="speaker">${esc(state.scenario.personagem)}</div><div class="en">${esc(r.resposta)}</div><div class="pt">${esc(r.traducao)}</div>`);
    stopSpeaking();
    speak(r.resposta, { rate: 0.95, pitch: 1.15 });
    return;
  }

  const palavras = r.palavrasErradas || [];
  const feedback = [];
  if (r.maisNatural) {
    feedback.push(`<div>✏️ Mais natural: <strong>“${esc(r.maisNatural)}”</strong></div>`);
    if (r.padrao) feedback.push(`<div class="free-padrao">${esc(r.padrao)}</div>`);
    L.correcoes.push({ de: r.transcricao, para: r.maisNatural });
  }
  if (palavras.length) feedback.push(`<div>🔴 Pronúncia: <span class="wrong-word">${esc(palavras[0])}</span></div>`);
  if (r.macete) feedback.push(`<div>💡 ${formatMacete(r.macete)}</div>`);
  addBubble('me free-me', `
    <div>🗣️ Ouvi: “${esc(r.transcricao)}”</div>
    ${feedback.length ? `<div class="free-feedback">${feedback.join('')}</div>` : ''}
    ${r.maisNatural ? practiceBar(r.maisNatural) : ''}`);

  L.mensagens.push({ autor: 'aluno', texto: r.transcricao });
  L.turnos++;
  state.session.livreTurnos = L.turnos;
  saveSession();

  presentFreeTurn(r);
  // O professor recebe a palavra e o macete ligados à fala atual do personagem.
  if (palavras.length) teacher.ultimoErro = { palavra: palavras[0], frase: L.ultimaFala.texto };
  if (r.macete) teacher.ultimoMacete = { texto: r.macete, frase: L.ultimaFala.texto };

  if (L.turnos >= MAX_LIVRE_TURNOS) showFreeLimit();
}

// 429: o turno não avança e o microfone grande fica parado com contagem regressiva.
function startFreeCooldown(segundos, msg) {
  const L = state.livre;
  if (!L) return;
  const s = Math.max(5, Math.min(120, Math.round(Number(segundos)) || 30));
  addBubble('error', `⏳ ${esc(msg || 'Muitas falas seguidas. Espera um pouquinho e fala de novo.')}`);
  L.esperaAte = Date.now() + s * 1000;
  clearInterval(L.timer);
  const tick = () => {
    if (state.livre !== L) return clearInterval(L.timer);
    const resta = Math.ceil((L.esperaAte - Date.now()) / 1000);
    if (resta <= 0) {
      clearInterval(L.timer);
      L.esperaAte = 0;
      if (!state.busy && !state.rec) {
        setMicState('idle');
        setHint(idleHint());
      }
      return;
    }
    if (!state.rec) setHint(`⏳ Espera ${resta}s para falar de novo`);
  };
  tick();
  L.timer = setInterval(tick, 500);
}

function freeSummaryHtml() {
  const L = state.livre;
  const lista = L.correcoes.length
    ? `<div class="free-review"><div>Para revisar:</div>${L.correcoes.map((c) => `
        <div class="bubble free-chunk">
          <div class="free-de">“${esc(c.de)}”</div>
          <div class="en">→ ${esc(c.para)}</div>
          ${practiceBar(c.para)}
        </div>`).join('')}</div>`
    : '<div>Nenhuma correção: mandou bem! 🎯</div>';
  return `<div>Você falou ${L.turnos} ${L.turnos === 1 ? 'vez' : 'vezes'} nesta conversa.</div>${lista}`;
}

// Teto de falas: mostra o resumo e o botão para encerrar.
function showFreeLimit() {
  const L = state.livre;
  L.encerrada = true;
  L.resumoMostrado = true;
  clearInterval(L.timer);
  L.esperaAte = 0;
  const card = document.createElement('div');
  card.className = 'end-card free-summary';
  card.innerHTML = `
    <h2>💬 Você chegou a ${MAX_LIVRE_TURNOS} falas!</h2>
    ${freeSummaryHtml()}
    <div class="end-actions"><button class="btn primary" type="button" data-act="end-free">🏁 Encerrar conversa</button></div>`;
  card.querySelector('[data-act="end-free"]').addEventListener('click', finishFreeTalk);
  $('thread').appendChild(card);
  setMicState('idle');
  setHint(idleHint());
  scrollToBottom();
}

// Encerra a conversa livre e volta ao modo guiado, com o cartão de fim da cena.
function finishFreeTalk() {
  const L = state.livre;
  if (!L || state.rec || state.busy) return;
  stopSpeaking();
  if (!L.resumoMostrado) {
    const card = document.createElement('div');
    card.className = 'end-card free-summary';
    card.innerHTML = `<h2>💬 Conversa encerrada</h2>${freeSummaryHtml()}`;
    $('thread').appendChild(card);
  }
  saveSession();
  resetFreeTalk();
  appendEndCard();
  setMicState('idle');
  setHint(idleHint());
  scrollToBottom();
}

/* ================= Chat com o professor ================= */
const MAX_CHAT_MSGS = 6;
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;

const teacher = {
  mensagens: [],          // [{ autor: 'aluno' | 'professor', texto }]
  ultimoErro: null,       // { palavra, frase }
  ultimoMacete: null,     // { texto, frase }
  enviando: false,
  recog: null
};

function resetTeacherChat() {
  stopTeacherMic(true);
  teacher.mensagens = [];
  teacher.ultimoErro = null;
  teacher.ultimoMacete = null;
  teacher.enviando = false;
  $('teacherMessages').innerHTML = '';
  closeTeacher();
}

// Chamado pelo handleResult: guarda o que o professor precisa saber da última tentativa.
function rememberForTeacher(r) {
  const frase = state.turn ? state.turn.frase : '';
  if (r.palavrasErradas && r.palavrasErradas.length) teacher.ultimoErro = { palavra: r.palavrasErradas[0], frase };
  if (r.macete) teacher.ultimoMacete = { texto: r.macete, frase };
}

// Frase que o professor usa como contexto: a frase atual da cena ou, na conversa livre, a última fala do personagem.
function teacherTurn() {
  if (state.modo === 'livre') {
    const f = state.livre && state.livre.ultimaFala;
    return f ? { frase: f.texto, traducao: f.traducao, chunk: '' } : null;
  }
  return state.turn;
}

function openTeacher() {
  if (!teacherTurn() || state.rec || state.busy) return;
  stopSpeaking();
  const t = teacherTurn();
  $('teacherContext').innerHTML = `Frase atual: <strong>${esc(t.frase)}</strong>`;
  if (!$('teacherMessages').children.length) {
    addTeacherBubble('professor', `Oi! Me pergunta qualquer coisa sobre a frase “${t.frase}”. Pode digitar${SpeechRec ? ', falar no microfone' : ''} ou tocar num atalho.`);
  }
  $('teacherPanel').hidden = false;
  document.body.classList.add('modal-open');
  scrollTeacherToBottom();
}

function closeTeacher() {
  const panel = $('teacherPanel');
  if (panel.hidden) return;
  stopTeacherMic(true);
  stopSpeaking();
  panel.hidden = true;
  document.body.classList.remove('modal-open');
  // Volta para a mesma frase da cena.
  if (state.targetEl) state.targetEl.scrollIntoView({ block: 'center' });
}

function scrollTeacherToBottom() {
  const box = $('teacherMessages');
  requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}

function addTeacherBubble(autor, texto, falar) {
  const el = document.createElement('div');
  el.className = 'tbubble ' + (autor === 'aluno' ? 'from-me' : autor === 'erro' ? 'from-error' : 'from-teacher');
  const p = document.createElement('div');
  p.className = 'tbubble-text';
  p.textContent = texto;
  el.appendChild(p);

  if (falar && falar.length) {
    const row = document.createElement('div');
    row.className = 'say-row';
    falar.forEach((frase) => row.appendChild(makeSayButton(frase)));
    el.appendChild(row);
  }
  $('teacherMessages').appendChild(el);
  scrollTeacherToBottom();
  return el;
}

// Botão 🔊: 1º toque fala devagar (0.5x), o próximo em velocidade normal, e assim por diante.
function makeSayButton(frase) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'say-btn';
  btn.dataset.lento = '1';
  const label = document.createElement('span');
  label.textContent = '🔊 ' + frase;
  const speed = document.createElement('span');
  speed.className = 'say-speed';
  speed.textContent = '0.5x';
  btn.append(label, speed);
  btn.setAttribute('aria-label', `Ouvir "${frase}" devagar`);
  btn.addEventListener('click', () => {
    const lento = btn.dataset.lento === '1';
    stopTeacherMic(true);
    stopSpeaking();
    speak(frase, { rate: lento ? 0.5 : 1 });
    btn.dataset.lento = lento ? '0' : '1';
    speed.textContent = lento ? '1x' : '0.5x';
    btn.setAttribute('aria-label', `Ouvir "${frase}" ${lento ? 'em velocidade normal' : 'devagar'}`);
  });
  return btn;
}

function setTeacherSending(on) {
  teacher.enviando = on;
  $('btnTeacherSend').disabled = on;
  document.querySelectorAll('#teacherPanel .chip').forEach((c) => { c.disabled = on; });
}

async function sendTeacher(textoAluno) {
  const pergunta = String(textoAluno || '').trim();
  if (!pergunta || teacher.enviando || !teacherTurn()) return;

  stopSpeaking();
  $('teacherInput').value = '';
  teacher.mensagens.push({ autor: 'aluno', texto: pergunta });
  addTeacherBubble('aluno', pergunta);
  const digitando = addTeacherBubble('professor', '…');
  digitando.classList.add('typing');
  setTeacherSending(true);

  const t = teacherTurn();
  const erro = teacher.ultimoErro && teacher.ultimoErro.frase === t.frase ? teacher.ultimoErro.palavra : '';
  const macete = teacher.ultimoMacete && teacher.ultimoMacete.frase === t.frase ? teacher.ultimoMacete.texto : '';

  try {
    let resp;
    try {
      resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frase: t.frase,
          traducao: t.traducao,
          chunk: t.chunk,
          ultimaPalavraErrada: erro,
          macete,
          mensagens: teacher.mensagens.slice(-MAX_CHAT_MSGS)
        })
      });
    } catch {
      throw new Error('Sem internet. Conecte e tente de novo.');
    }
    const json = await resp.json().catch(() => null);
    console.log('[chat] resposta bruta', resp.status, json);
    if (!resp.ok || !json || !json.resposta) {
      throw new Error((json && json.erro) || `Erro no servidor (${resp.status}).`);
    }

    digitando.remove();
    teacher.mensagens.push({ autor: 'professor', texto: json.resposta });
    addTeacherBubble('professor', json.resposta, Array.isArray(json.falar) ? json.falar : []);
  } catch (err) {
    digitando.remove();
    // Tira a pergunta do histórico enviado; ela continua visível e pode ser mandada de novo.
    teacher.mensagens.pop();
    addTeacherBubble('erro', '⚠️ ' + (err.message || 'O professor não conseguiu responder agora.'));
  } finally {
    setTeacherSending(false);
  }
}

// Microfone do chat: reconhecimento de fala do navegador, em português.
function toggleTeacherMic() {
  if (teacher.recog) return stopTeacherMic(false);
  if (!SpeechRec || teacher.enviando) return;
  stopSpeaking();

  const rec = new SpeechRec();
  rec.lang = 'pt-BR';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let final = '';

  rec.onresult = (e) => {
    let parcial = '';
    for (let i = 0; i < e.results.length; i++) {
      parcial += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = parcial;
    }
    $('teacherInput').value = parcial;
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      addTeacherBubble('erro', '⚠️ Permissão do microfone negada. Libere nas configurações do navegador ou digite a pergunta.');
    } else if (e.error === 'no-speech') {
      addTeacherBubble('erro', '⚠️ Não ouvi nada. Toque no microfone e fale de novo.');
    }
  };
  rec.onend = () => {
    const cancelado = rec.cancelado;
    teacher.recog = null;
    $('btnTeacherMic').classList.remove('listening');
    if (!cancelado && final.trim()) sendTeacher(final);
  };

  try {
    rec.start();
    teacher.recog = rec;
    $('btnTeacherMic').classList.add('listening');
  } catch {
    teacher.recog = null;
  }
}

// cancelar = true descarta o que foi ouvido (ao fechar o painel, por exemplo).
function stopTeacherMic(cancelar) {
  const rec = teacher.recog;
  if (!rec) return;
  rec.cancelado = cancelar;
  try { cancelar ? rec.abort() : rec.stop(); } catch { /* já parado */ }
}

/* ================= Eventos ================= */
$('btnMic').addEventListener('click', () => toggleMic());
$('thread').addEventListener('click', onThreadClick);
$('btnListen').addEventListener('click', () => (state.modo === 'livre' ? speakFreeLast(0.95) : speakTurn()));
$('btnSlow').addEventListener('click', () => (state.modo === 'livre' ? speakFreeLast(SLOW_RATE) : speakTurn({ withCharacter: false, slow: true })));
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

$('btnTeacher').addEventListener('click', openTeacher);
$('btnTeacherClose').addEventListener('click', closeTeacher);
$('teacherPanel').addEventListener('click', (e) => { if (e.target === $('teacherPanel')) closeTeacher(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTeacher(); });
$('teacherForm').addEventListener('submit', (e) => {
  e.preventDefault();
  stopTeacherMic(true);
  sendTeacher($('teacherInput').value);
});
document.querySelectorAll('#teacherPanel .chip').forEach((chip) => {
  chip.addEventListener('click', () => sendTeacher(chip.dataset.msg));
});
if (SpeechRec) {
  $('btnTeacherMic').hidden = false;
  $('btnTeacherMic').addEventListener('click', toggleTeacherMic);
}

renderHome();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
