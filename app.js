/**
 * English Voice Trainer
 * PWA Vanilla JS - Treino de fala inteligente
 */

// Estado da Aplicação
const state = {
  allPhrases: [],
  filteredPhrases: [],
  currentIndex: 0,
  currentCategory: 'all',
  currentPhraseAttempts: 0,
  isListening: false,
  isSpeaking: false,
  recognition: null,
  speechTimeout: null,
  voices: {
    pt: null,
    en: null
  }
};

// Mapeamentos para Normalização Inteligente
const CONTRACTIONS_MAP = {
  "i'm": "i am",
  "im": "i am",
  "you're": "you are",
  "youre": "you are",
  "he's": "he is",
  "hes": "he is",
  "she's": "she is",
  "shes": "she is",
  "it's": "it is",
  "its": "it is",
  "we're": "we are",
  "were": "we are",
  "they're": "they are",
  "theyre": "they are",
  "i've": "i have",
  "ive": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "ill": "i will",
  "you'll": "you will",
  "he'll": "he will",
  "she'll": "she will",
  "we'll": "we will",
  "they'll": "they will",
  "i'd": "i would",
  "you'd": "you would",
  "he'd": "he would",
  "she'd": "she would",
  "we'd": "we would",
  "they'd": "they would",
  "can't": "cannot",
  "cant": "cannot",
  "don't": "do not",
  "dont": "do not",
  "doesn't": "does not",
  "doesnt": "does not",
  "didn't": "did not",
  "didnt": "did not",
  "won't": "will not",
  "wont": "will not",
  "isn't": "is not",
  "isnt": "is not",
  "aren't": "are not",
  "arent": "are not",
  "wasn't": "was not",
  "wasnt": "was not",
  "weren't": "were not",
  "werent": "were not",
  "haven't": "have not",
  "havent": "have not",
  "hasn't": "has not",
  "hasnt": "has not",
  "hadn't": "had not",
  "hadnt": "had not",
  "wouldn't": "would not",
  "couldn't": "could not",
  "shouldn't": "should not",
  "let's": "let us",
  "lets": "let us",
  "that's": "that is",
  "thats": "that is",
  "what's": "what is",
  "whats": "what is",
  "where's": "where is",
  "wheres": "where is",
  "how's": "how is",
  "hows": "how is",
  "there's": "there is",
  "theres": "there is"
};

const NUMBERS_MAP = {
  "0": "zero",
  "1": "one",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
  "11": "eleven",
  "12": "twelve",
  "13": "thirteen",
  "14": "fourteen",
  "15": "fifteen",
  "16": "sixteen",
  "17": "seventeen",
  "18": "eighteen",
  "19": "nineteen",
  "20": "twenty",
  "30": "thirty",
  "40": "forty",
  "50": "fifty"
};

// Elementos do DOM
const dom = {
  streakCount: document.getElementById('streakCount'),
  todayCount: document.getElementById('todayCount'),
  categoriesBar: document.getElementById('categoriesBar'),
  phraseCounter: document.getElementById('phraseCounter'),
  phraseAttemptIndicator: document.getElementById('phraseAttemptIndicator'),
  progressBarFill: document.getElementById('progressBarFill'),
  statusAlert: document.getElementById('statusAlert'),
  badgeCategory: document.getElementById('badgeCategory'),
  srsIntervalText: document.getElementById('srsIntervalText'),
  phrasePt: document.getElementById('phrasePt'),
  btnSpeakPt: document.getElementById('btnSpeakPt'),
  btnListenExample: document.getElementById('btnListenExample'),
  btnListenSlow: document.getElementById('btnListenSlow'),
  resultBox: document.getElementById('resultBox'),
  resultIcon: document.getElementById('resultIcon'),
  resultTitle: document.getElementById('resultTitle'),
  resultScore: document.getElementById('resultScore'),
  userTranscript: document.getElementById('userTranscript'),
  diffCorrection: document.getElementById('diffCorrection'),
  antiFrustrationBox: document.getElementById('antiFrustrationBox'),
  btnForcePass: document.getElementById('btnForcePass'),
  btnPrevPhrase: document.getElementById('btnPrevPhrase'),
  btnNextPhrase: document.getElementById('btnNextPhrase'),
  btnMic: document.getElementById('btnMic'),
  micWrapper: document.getElementById('micWrapper'),
  micStatusLabel: document.getElementById('micStatusLabel'),
  reviewModal: document.getElementById('reviewModal'),
  reviewListContent: document.getElementById('reviewListContent'),
  btnOpenReview: document.getElementById('btnOpenReview'),
  btnCloseReview: document.getElementById('btnCloseReview'),
  settingsModal: document.getElementById('settingsModal'),
  btnOpenSettings: document.getElementById('btnOpenSettings'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  btnResetProgress: document.getElementById('btnResetProgress')
};

// Inicialização Principal
document.addEventListener('DOMContentLoaded', async () => {
  initServiceWorker();
  initSpeechSynthesis();
  initSpeechRecognition();
  loadStreakAndStats();
  await loadPhrases();
  bindEvents();
});

// PWA Service Worker
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .catch((err) => console.log('Service Worker não registrado:', err));
  }
}

// Carregamento de Frases
async function loadPhrases() {
  try {
    const res = await fetch('./phrases.json');
    state.allPhrases = await res.json();
    applyCategoryFilter(state.currentCategory);
    restoreSavedProgress();
  } catch (err) {
    showAlert('Erro ao carregar lista de frases locais.', 'danger');
  }
}

// Configuração de Vozes (SpeechSynthesis)
function initSpeechSynthesis() {
  if (!('speechSynthesis' in window)) return;

  const updateVoices = () => {
    const available = window.speechSynthesis.getVoices();
    state.voices.pt = available.find(v => v.lang === 'pt-BR') || available.find(v => v.lang.startsWith('pt'));
    state.voices.en = available.find(v => v.lang === 'en-US') || available.find(v => v.lang.startsWith('en'));
  };

  updateVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }
}

// Falar texto via TTS
function speakText(text, lang = 'en-US', rate = 1.0, onEndCallback = null) {
  if (!('speechSynthesis' in window)) {
    if (onEndCallback) onEndCallback();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;

  if (lang.startsWith('pt') && state.voices.pt) {
    utterance.voice = state.voices.pt;
  } else if (lang.startsWith('en') && state.voices.en) {
    utterance.voice = state.voices.en;
  }

  state.isSpeaking = true;
  dom.micWrapper.classList.add('speaking');
  dom.micStatusLabel.textContent = lang.startsWith('pt') ? 'Ouvindo exemplo em português...' : 'Pronunciando em inglês...';

  utterance.onend = () => {
    state.isSpeaking = false;
    dom.micWrapper.classList.remove('speaking');
    if (onEndCallback) {
      onEndCallback();
    }
  };

  utterance.onerror = () => {
    state.isSpeaking = false;
    dom.micWrapper.classList.remove('speaking');
    if (onEndCallback) {
      onEndCallback();
    }
  };

  window.speechSynthesis.speak(utterance);
}

// Configuração de Reconhecimento de Voz (STT)
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showAlert('Reconhecimento de voz não suportado neste navegador. Use o Google Chrome no celular ou computador.', 'warning');
    dom.micStatusLabel.textContent = 'Navegador sem suporte a voz';
    return;
  }

  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = 'en-US';
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    state.isListening = true;
    dom.micWrapper.classList.add('listening');
    dom.micStatusLabel.textContent = 'Pode falar em inglês agora...';
    
    // Timeout de 6 segundos sem captura
    clearTimeout(state.speechTimeout);
    state.speechTimeout = setTimeout(() => {
      if (state.isListening) {
        rec.stop();
        handleNoSpeechDetected();
      }
    }, 6000);
  };

  rec.onresult = (event) => {
    clearTimeout(state.speechTimeout);
    const spokenText = event.results[0][0].transcript;
    handleRecognitionResult(spokenText);
  };

  rec.onerror = (event) => {
    clearTimeout(state.speechTimeout);
    state.isListening = false;
    dom.micWrapper.classList.remove('listening');

    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      showAlert('Permissão do microfone negada. Toque no ícone de cadeado do navegador e permita o uso do microfone.', 'danger');
      dom.micStatusLabel.textContent = 'Microfone bloqueado';
    } else if (event.error === 'no-speech') {
      handleNoSpeechDetected();
    } else {
      dom.micStatusLabel.textContent = 'Toque no microfone para tentar de novo';
    }
  };

  rec.onend = () => {
    clearTimeout(state.speechTimeout);
    state.isListening = false;
    dom.micWrapper.classList.remove('listening');
  };

  state.recognition = rec;
}

// Iniciar Captura de Áudio
function startListening() {
  if (state.isSpeaking) {
    window.speechSynthesis.cancel();
    state.isSpeaking = false;
    dom.micWrapper.classList.remove('speaking');
  }

  if (!state.recognition) {
    showAlert('Reconhecimento de voz indisponível no navegador atual.', 'warning');
    return;
  }

  try {
    state.recognition.start();
  } catch (e) {
    // Se já estiver ativo, reinicia
    state.recognition.stop();
  }
}

// Tratar quando não captar nada em 6 segundos
function handleNoSpeechDetected() {
  const current = getCurrentPhrase();
  if (!current) return;

  state.currentPhraseAttempts++;
  dom.phraseAttemptIndicator.textContent = `Tentativa: ${state.currentPhraseAttempts}`;

  dom.micStatusLabel.textContent = 'Nenhuma voz detectada. Ouça o exemplo:';
  
  // Mostra caixa de resultado indicando silêncio
  dom.resultBox.className = 'result-box error';
  dom.resultIcon.textContent = '⏱️';
  dom.resultTitle.textContent = 'Não conseguimos te ouvir';
  dom.resultScore.textContent = 'Precisão do reconhecimento: 0%';
  dom.userTranscript.textContent = '(nenhum som captado em 6 segundos)';
  
  renderDiffHighlights(current.english, '');
  checkAntiFrustration(current.id);

  // Toca pronúncia correta para ajudar o usuário
  speakText(current.english, 'en-US', 1.0, () => {
    dom.micStatusLabel.textContent = 'Toque no microfone para tentar de novo';
  });
}

// Normalização de Texto
function normalizePhrase(text) {
  if (!text) return '';
  
  let cleaned = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, ' ')
    .trim();

  // Substituir números por extenso
  const words = cleaned.split(/\s+/).map(w => {
    if (NUMBERS_MAP[w]) return NUMBERS_MAP[w];
    if (CONTRACTIONS_MAP[w]) return CONTRACTIONS_MAP[w];
    return w;
  });

  // Re-expande se contrações geraram múltiplas palavras
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

// Cálculo de Precisão (Distância de Levenshtein Normalizada + Match de Palavras)
function calculateAccuracy(target, spoken) {
  const normTarget = normalizePhrase(target);
  const normSpoken = normalizePhrase(spoken);

  if (normTarget === normSpoken) return 100;
  if (!normSpoken) return 0;

  const targetWords = normTarget.split(' ');
  const spokenWords = normSpoken.split(' ');

  // Similaridade de palavras
  let matchedWords = 0;
  targetWords.forEach(tw => {
    if (spokenWords.includes(tw)) matchedWords++;
  });
  const wordScore = (matchedWords / Math.max(targetWords.length, spokenWords.length)) * 100;

  // Levenshtein character distance
  const matrix = [];
  const n = normTarget.length;
  const m = normSpoken.length;

  for (let i = 0; i <= n; i++) matrix[i] = [i];
  for (let j = 0; j <= m; j++) matrix[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = normTarget[i - 1] === normSpoken[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const levDistance = matrix[n][m];
  const maxLen = Math.max(n, m);
  const levScore = Math.max(0, (1 - levDistance / maxLen) * 100);

  // Média ponderada (60% palavras, 40% caracteres)
  const finalScore = Math.round(wordScore * 0.6 + levScore * 0.4);
  return Math.min(100, Math.max(0, finalScore));
}

// Processar Resultado do Reconhecimento
function handleRecognitionResult(spokenText) {
  const current = getCurrentPhrase();
  if (!current) return;

  const score = calculateAccuracy(current.english, spokenText);
  dom.userTranscript.textContent = spokenText;
  dom.resultScore.textContent = `Precisão do reconhecimento: ${score}%`;

  if (score >= 85) {
    // ACERTO
    handleSuccess(current, score, spokenText);
  } else {
    // ERRO
    handleFailure(current, score, spokenText);
  }
}

// Fluxo de Sucesso
function handleSuccess(current, score, spokenText) {
  dom.resultBox.className = 'result-box success';
  dom.resultIcon.textContent = '🎉';
  dom.resultTitle.textContent = 'Muito bem!';
  renderDiffHighlights(current.english, spokenText);
  dom.antiFrustrationBox.classList.add('hidden');

  updateSrsOnSuccess(current.id);
  incrementTodayStats();

  dom.micStatusLabel.textContent = 'Excelente! Ouvindo pronúncia correta...';

  // Fala pronúncia correta em inglês e avança após 1.5s
  speakText(current.english, 'en-US', 1.0, () => {
    dom.micStatusLabel.textContent = 'Avançando para a próxima frase...';
    setTimeout(() => {
      goToNextPhrase();
    }, 1500);
  });
}

// Fluxo de Erro
function handleFailure(current, score, spokenText) {
  state.currentPhraseAttempts++;
  dom.phraseAttemptIndicator.textContent = `Tentativa: ${state.currentPhraseAttempts}`;

  dom.resultBox.className = 'result-box error';
  dom.resultIcon.textContent = '❌';
  dom.resultTitle.textContent = 'Tente novamente';
  renderDiffHighlights(current.english, spokenText);

  updateSrsOnFailure(current.id);
  checkAntiFrustration(current.id);

  dom.micStatusLabel.textContent = 'Ouça a pronúncia correta:';

  // Fala pronúncia correta em inglês, não avança
  speakText(current.english, 'en-US', 1.0, () => {
    dom.micStatusLabel.textContent = 'Toque no microfone para tentar de novo';
  });
}

// Destaque Palavra por Palavra
function renderDiffHighlights(targetPhrase, spokenText) {
  const normSpokenWords = normalizePhrase(spokenText).split(' ');
  const targetTokens = targetPhrase.split(' ');

  const html = targetTokens.map(token => {
    const cleanToken = normalizePhrase(token);
    const matched = normSpokenWords.includes(cleanToken);
    if (matched) {
      return `<span class="word-diff-ok">${escapeHtml(token)}</span>`;
    } else {
      return `<span class="word-diff-bad">${escapeHtml(token)}</span>`;
    }
  }).join(' ');

  dom.diffCorrection.innerHTML = html;
}

// Verificar Trava Anti-Frustração (3 erros na mesma frase)
function checkAntiFrustration(phraseId) {
  if (state.currentPhraseAttempts >= 3) {
    dom.antiFrustrationBox.classList.remove('hidden');
  }
}

// Pulo com a trava anti-frustração
function handleForcePass() {
  const current = getCurrentPhrase();
  if (!current) return;

  const srsData = getSrsData();
  const phraseInfo = srsData[current.id] || { interval: 1, wrongCount: 0, priorityReview: true };
  phraseInfo.priorityReview = true;
  phraseInfo.wrongCount = (phraseInfo.wrongCount || 0) + 1;
  phraseInfo.lastTrained = getTodayDate();
  srsData[current.id] = phraseInfo;
  saveSrsData(srsData);

  dom.antiFrustrationBox.classList.add('hidden');
  showAlert('Frase adicionada à sua revisão prioritária.', 'info');
  goToNextPhrase();
}

// Repetição Espaçada Simples (SRS)
function getSrsData() {
  const raw = localStorage.getItem('vt_srs_data');
  return raw ? JSON.parse(raw) : {};
}

function saveSrsData(data) {
  localStorage.setItem('vt_srs_data', JSON.stringify(data));
}

function updateSrsOnSuccess(phraseId) {
  const srs = getSrsData();
  const info = srs[phraseId] || { interval: 0, wrongCount: 0 };
  
  // Progressão de dias: 3 -> 7 -> 15 -> 30
  if (!info.interval || info.interval < 3) {
    info.interval = 3;
  } else if (info.interval === 3) {
    info.interval = 7;
  } else if (info.interval === 7) {
    info.interval = 15;
  } else {
    info.interval = 30;
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + info.interval);
  info.nextReview = nextDate.toISOString().split('T')[0];
  info.lastTrained = getTodayDate();

  srs[phraseId] = info;
  saveSrsData(srs);
}

function updateSrsOnFailure(phraseId) {
  const srs = getSrsData();
  const info = srs[phraseId] || { interval: 1, wrongCount: 0 };
  
  info.interval = 1; // Volta amanhã
  info.wrongCount = (info.wrongCount || 0) + 1;
  if (info.wrongCount >= 3) {
    info.priorityReview = true;
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 1);
  info.nextReview = nextDate.toISOString().split('T')[0];
  info.lastTrained = getTodayDate();

  srs[phraseId] = info;
  saveSrsData(srs);
}

// Renderizar Frase Atual
function renderCurrentPhrase() {
  const current = getCurrentPhrase();
  if (!current) {
    dom.phrasePt.textContent = 'Nenhuma frase encontrada para este filtro.';
    dom.badgeCategory.textContent = 'Concluído';
    dom.phraseCounter.textContent = '0 de 0';
    dom.progressBarFill.style.width = '100%';
    dom.resultBox.classList.add('hidden');
    dom.antiFrustrationBox.classList.add('hidden');
    return;
  }

  state.currentPhraseAttempts = 0;
  dom.phraseAttemptIndicator.textContent = 'Tentativa: 1';
  dom.phrasePt.textContent = current.portuguese;
  dom.badgeCategory.textContent = current.category;
  
  const total = state.filteredPhrases.length;
  const currentNum = state.currentIndex + 1;
  dom.phraseCounter.textContent = `Frase ${currentNum} de ${total}`;
  dom.progressBarFill.style.width = `${(currentNum / total) * 100}%`;

  // Informação SRS da frase
  const srs = getSrsData();
  const info = srs[current.id];
  if (!info) {
    dom.srsIntervalText.textContent = 'Nova';
  } else if (info.interval) {
    dom.srsIntervalText.textContent = `${info.interval}d`;
  } else {
    dom.srsIntervalText.textContent = 'Treino';
  }

  // Reset de feedbacks
  dom.resultBox.classList.add('hidden');
  dom.antiFrustrationBox.classList.add('hidden');
  dom.micStatusLabel.textContent = 'Toque no microfone ou ouça em português';

  saveCurrentPhraseId(current.id);

  // Iniciar fluxo automático de fala em português
  startPhraseFlow(current);
}

// Fluxo: Fala em PT -> Espera fim -> Abre mic
function startPhraseFlow(phrase) {
  speakText(phrase.portuguese, 'pt-BR', 1.0, () => {
    // Só abre o microfone se reconhecimento estiver suportado
    if (state.recognition) {
      startListening();
    }
  });
}

function getCurrentPhrase() {
  return state.filteredPhrases[state.currentIndex] || null;
}

function goToNextPhrase() {
  if (state.currentIndex < state.filteredPhrases.length - 1) {
    state.currentIndex++;
  } else {
    state.currentIndex = 0;
  }
  renderCurrentPhrase();
}

function goToPrevPhrase() {
  if (state.currentIndex > 0) {
    state.currentIndex--;
  } else {
    state.currentIndex = Math.max(0, state.filteredPhrases.length - 1);
  }
  renderCurrentPhrase();
}

// Filtro por Categoria
function applyCategoryFilter(cat) {
  state.currentCategory = cat;
  
  if (cat === 'all') {
    state.filteredPhrases = [...state.allPhrases];
  } else if (cat === 'srs') {
    const srs = getSrsData();
    const today = getTodayDate();
    state.filteredPhrases = state.allPhrases.filter(p => {
      const info = srs[p.id];
      return !info || !info.nextReview || info.nextReview <= today;
    });
    if (state.filteredPhrases.length === 0) {
      showAlert('Todas as frases do dia foram concluídas! Exibindo todas para prática livre.', 'info');
      state.filteredPhrases = [...state.allPhrases];
    }
  } else {
    state.filteredPhrases = state.allPhrases.filter(p => p.category.toLowerCase() === cat.toLowerCase());
  }

  state.currentIndex = 0;
  renderCurrentPhrase();
}

// Salvar / Restaurar Progresso
function saveCurrentPhraseId(id) {
  localStorage.setItem('vt_current_phrase_id', id.toString());
}

function restoreSavedProgress() {
  const savedId = parseInt(localStorage.getItem('vt_current_phrase_id') || '1', 10);
  const foundIndex = state.filteredPhrases.findIndex(p => p.id === savedId);
  if (foundIndex !== -1) {
    state.currentIndex = foundIndex;
  }
  renderCurrentPhrase();
}

// Estatísticas e Streak Diário
function getTodayDate() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function loadStreakAndStats() {
  const today = getTodayDate();
  const lastActive = localStorage.getItem('vt_last_active_date');
  let streak = parseInt(localStorage.getItem('vt_streak') || '0', 10);
  let todayCount = 0;

  if (lastActive === today) {
    todayCount = parseInt(localStorage.getItem('vt_today_correct') || '0', 10);
  } else {
    // Novo dia
    localStorage.setItem('vt_today_correct', '0');
    if (lastActive) {
      const lastDate = new Date(lastActive);
      const currentDate = new Date(today);
      const diffDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
      if (diffDays > 1) {
        streak = 0; // Perdeu a sequência de dias seguidos
      }
    }
  }

  dom.streakCount.textContent = streak;
  dom.todayCount.textContent = todayCount;
}

function incrementTodayStats() {
  const today = getTodayDate();
  const lastActive = localStorage.getItem('vt_last_active_date');
  let streak = parseInt(localStorage.getItem('vt_streak') || '0', 10);
  let todayCount = parseInt(localStorage.getItem('vt_today_correct') || '0', 10);

  todayCount++;
  localStorage.setItem('vt_today_correct', todayCount.toString());
  dom.todayCount.textContent = todayCount;

  if (lastActive !== today) {
    streak++;
    localStorage.setItem('vt_streak', streak.toString());
    localStorage.setItem('vt_last_active_date', today);
    dom.streakCount.textContent = streak;
  }
}

// Lista de Revisão Prioritária
function renderPriorityReviewModal() {
  const srs = getSrsData();
  const priorityPhrases = state.allPhrases.filter(p => {
    const info = srs[p.id];
    return info && (info.priorityReview || (info.wrongCount && info.wrongCount >= 3));
  });

  if (priorityPhrases.length === 0) {
    dom.reviewListContent.innerHTML = `
      <div class="empty-state">
        <p>🎉 Nenhuma frase na revisão prioritária no momento!</p>
        <p style="margin-top: 6px; font-size: 0.8rem; color: var(--text-dim);">Frases com mais de 3 erros aparecerão aqui.</p>
      </div>
    `;
    return;
  }

  dom.reviewListContent.innerHTML = priorityPhrases.map(p => {
    const info = srs[p.id] || {};
    const erros = info.wrongCount || 0;
    return `
      <div class="review-item" onclick="selectPhraseForReview(${p.id})">
        <div class="review-item-pt">${escapeHtml(p.portuguese)}</div>
        <div class="review-item-en">${escapeHtml(p.english)}</div>
        <div class="review-item-meta">Erros registrados: ${erros} | Categoria: ${escapeHtml(p.category)}</div>
      </div>
    `;
  }).join('');
}

window.selectPhraseForReview = function(id) {
  dom.reviewModal.classList.remove('open');
  const index = state.allPhrases.findIndex(p => p.id === id);
  if (index !== -1) {
    state.filteredPhrases = [...state.allPhrases];
    state.currentIndex = index;
    // Atualiza chips
    document.querySelectorAll('.category-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.cat === 'all');
    });
    renderCurrentPhrase();
  }
};

// Alerta do Sistema
function showAlert(message, type = 'info') {
  dom.statusAlert.className = `status-msg ${type}`;
  dom.statusAlert.textContent = message;
  dom.statusAlert.classList.remove('hidden');

  setTimeout(() => {
    dom.statusAlert.classList.add('hidden');
  }, 4500);
}

// Sanitização HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Bind de Eventos
function bindEvents() {
  // Clique no microfone
  dom.btnMic.addEventListener('click', () => {
    if (state.isListening) {
      if (state.recognition) state.recognition.stop();
    } else {
      startListening();
    }
  });

  // Botões de áudio
  dom.btnSpeakPt.addEventListener('click', () => {
    const current = getCurrentPhrase();
    if (current) startPhraseFlow(current);
  });

  dom.btnListenExample.addEventListener('click', () => {
    const current = getCurrentPhrase();
    if (current) speakText(current.english, 'en-US', 1.0);
  });

  dom.btnListenSlow.addEventListener('click', () => {
    const current = getCurrentPhrase();
    if (current) speakText(current.english, 'en-US', 0.7);
  });

  // Trava anti-frustração
  dom.btnForcePass.addEventListener('click', handleForcePass);

  // Navegação manual
  dom.btnNextPhrase.addEventListener('click', goToNextPhrase);
  dom.btnPrevPhrase.addEventListener('click', goToPrevPhrase);

  // Filtros de Categoria
  dom.categoriesBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.category-chip');
    if (!chip) return;
    document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    applyCategoryFilter(chip.dataset.cat);
  });

  // Modais
  dom.btnOpenReview.addEventListener('click', () => {
    renderPriorityReviewModal();
    dom.reviewModal.classList.add('open');
  });

  dom.btnCloseReview.addEventListener('click', () => {
    dom.reviewModal.classList.remove('open');
  });

  dom.btnOpenSettings.addEventListener('click', () => {
    dom.settingsModal.classList.add('open');
  });

  dom.btnCloseSettings.addEventListener('click', () => {
    dom.settingsModal.classList.remove('open');
  });

  // Fechar modais ao clicar no fundo
  [dom.reviewModal, dom.settingsModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  });

  // Zerar progresso
  dom.btnResetProgress.addEventListener('click', () => {
    if (confirm('Tem certeza de que deseja zerar seu progresso e histórico de repetições?')) {
      localStorage.clear();
      location.reload();
    }
  });
}
