// Função serverless da Vercel: modo "Conversa livre" dentro de uma cena.
// O aluno fala o que quiser; o personagem responde com UMA pergunta e a correção é leve.
// Separada do api/tutor.js. A chave fica SOMENTE na variável de ambiente GEMINI_API_KEY.

const MODEL = process.env.GEMINI_MODEL_CONVERSA || process.env.GEMINI_MODEL ||'gemini-3-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_AUDIO_BASE64 = 3500000; // ~2,6 MB de áudio (limite da Vercel é 4,5 MB por requisição)
const TIMEOUT_MS = 18000;     // primeira chamada ao Gemini (mesmo limite do tutor)
const TEMPO_TOTAL_MS = 27000; // somando a nova tentativa (a função tem 30 s na Vercel)
const MAX_MENSAGENS = 6;      // só as últimas mensagens vão para o Gemini
const ESPERA_429_PADRAO = 30; // segundos

const MIME_PERMITIDOS = [
  'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg',
  'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/mp3', 'audio/flac'
];

const MACETES = ['Kenai e Eva', 'E Mágico', 'Sopa sem sal', 'Som de R do português', 'Técnica do Ponto'];

const NAO_OUVI = {
  resposta: 'Sorry, could you say that again?',
  traducao: 'Desculpa, pode repetir?'
};

const SYSTEM_PROMPT = `
Você faz o papel do personagem de uma cena do app "English Voice Trainer" (barista, recepcionista, oficial de imigração, gerente...). O aluno é brasileiro, iniciante em inglês, e agora está em CONVERSA LIVRE com você: ele fala o que quiser, por áudio.
Você recebe o cenário, um resumo da cena que acabou de acontecer, as últimas mensagens da conversa e o ÁUDIO da nova fala do aluno.

A CENA
- Continue a MESMA cena e o MESMO cenário, no papel do personagem. Nunca puxe assunto fora da cena e nunca solte frase fora de contexto.
- Se o aluno sair do assunto, traga a conversa de volta com gentileza, dentro do papel.

O CAMPO "resposta" (o que o personagem diz agora)
- Em inglês, nível iniciante: palavras simples, frases curtas (até umas 15 palavras).
- UMA pergunta por vez, sempre no fim, com exatamente um ponto de interrogação.
- "traducao": a tradução natural da resposta para o português do Brasil.

O QUE O ALUNO DISSE
- "transcricao": escreva exatamente o que você ouviu do aluno, mesmo com erros. Se o áudio estiver mudo, só com ruído ou em português, deixe "transcricao" vazio.
- Só corrija quando houver erro de verdade. Se a fala do aluno estiver boa, deixe "maisNatural", "padrao", "palavrasErradas" e "macete" vazios.
- "maisNatural": a fala do aluno reescrita do jeito natural, como um chunk que ele pode reaproveitar. Só se houver erro.
- "padrao": UMA frase curta em português simples explicando a diferença, sem termos gramaticais. Só se houver "maisNatural".
- NUNCA use termos gramaticais ou técnicos (verbo, sujeito, artigo, pronome, preposição, tempo verbal, fonema, fonética, vogal átona, schwa, consoante surda etc.).

PRONÚNCIA (correção leve)
- No máximo 1 palavra por turno em "palavrasErradas", e só se o som atrapalhou o entendimento. Sotaque brasileiro que um nativo entende não é erro.
- A palavra precisa estar na "transcricao".

MACETES (use só estes, pelo nome, e só se realmente se aplicar à palavra errada)
1. "Kenai e Eva": conectar "Can I have a" soando como "Kenai" + "Eva", tudo emendado.
2. "E Mágico": o "e" único no final de palavras como have, make, cake é mudo. have = "rév", make = "meik", cake = "keik".
3. "Sopa sem sal": o som do TH é feito com a língua entre os dentes, soltando o ar.
4. "Som de R do português": quando T ou D ficam entre vogais (water, butter, get to), soam como o R do português de "caro". water = "uórer", butter = "bârer", get to = "guéru".
5. "Técnica do Ponto": em frases longas, fazer pausas imaginárias a cada 2 ou 3 palavras para falar sem travar.
NUNCA invente macete. Se nenhum se aplicar, deixe "macete" vazio. Quando usar, comece com o nome do macete e escreva 1 frase curta com a pronúncia aportuguesada entre aspas.

"chunksSugeridos"
- 2 ou 3 frases curtas em inglês, prontas para o aluno responder à SUA pergunta se travar. Sem português.

Responda SOMENTE com o JSON no formato pedido.
`.trim();

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcricao: { type: 'STRING' },
    resposta: { type: 'STRING' },
    traducao: { type: 'STRING' },
    maisNatural: { type: 'STRING' },
    padrao: { type: 'STRING' },
    chunksSugeridos: { type: 'ARRAY', items: { type: 'STRING' } },
    palavrasErradas: { type: 'ARRAY', items: { type: 'STRING' } },
    macete: { type: 'STRING' }
  },
  required: ['transcricao', 'resposta', 'traducao', 'maisNatural', 'padrao', 'chunksSugeridos', 'palavrasErradas', 'macete'],
  propertyOrdering: ['transcricao', 'resposta', 'traducao', 'maisNatural', 'padrao', 'chunksSugeridos', 'palavrasErradas', 'macete']
};

function texto(v, max = 400) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const ACENTOS_PT = /[áàâãéêíóôõúç]/i;
const PALAVRAS_PT = new Set(['você', 'não', 'que', 'de', 'um', 'uma', 'para', 'com', 'quero', 'obrigado']);

function parecePortugues(frase) {
  if (ACENTOS_PT.test(frase)) return true;
  const palavras = frase.toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
  return palavras.filter((p) => PALAVRAS_PT.has(p)).length >= 2;
}

function compactar(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, '');
}

function montarContexto(body) {
  const resumo = (Array.isArray(body.resumoCena) ? body.resumoCena : [])
    .slice(-3)
    .map((h) => `- Personagem: "${texto(h && h.personagem, 200)}" | Aluno: "${texto(h && h.frase, 200)}"`);
  const conversa = (Array.isArray(body.mensagens) ? body.mensagens : [])
    .slice(-MAX_MENSAGENS)
    .map((m) => `- ${m && m.autor === 'aluno' ? 'Aluno' : 'Personagem'}: "${texto(m && m.texto, 300)}"`)
    .filter((l) => !/: ""$/.test(l));

  return [
    `CENÁRIO: ${texto(body.cenario, 600)}`,
    `PERSONAGEM: ${texto(body.personagem, 60) || 'o personagem da cena'}`,
    'RESUMO DA CENA QUE ACABOU DE ACONTECER:',
    resumo.length ? resumo.join('\n') : '- (sem resumo)',
    '',
    `CONVERSA LIVRE ATÉ AGORA (últimas ${MAX_MENSAGENS} mensagens):`,
    conversa.length ? conversa.join('\n') : '- (começo da conversa)',
    '',
    'O áudio anexado é a nova fala do aluno. Responda no JSON.'
  ].join('\n');
}

function normalizar(r) {
  const transcricao = texto(r.transcricao, 300);
  const naoOuvi = !transcricao;

  const vistos = new Set();
  const chunksSugeridos = (Array.isArray(r.chunksSugeridos) ? r.chunksSugeridos : [])
    .map((c) => texto(c, 120))
    .filter((c) => {
      const chave = compactar(c);
      if (!c || vistos.has(chave) || parecePortugues(c)) return false;
      vistos.add(chave);
      return true;
    })
    .slice(0, 3);

  // No máximo 1 palavra, e só se ela estiver no que o aluno disse.
  const ouvidas = new Set(transcricao.toLowerCase().split(/[^a-z']+/).filter(Boolean));
  const palavrasErradas = (Array.isArray(r.palavrasErradas) ? r.palavrasErradas : [])
    .map((p) => texto(p, 40))
    .filter((p) => p && ouvidas.has(p.toLowerCase().replace(/[^a-z']/g, '')))
    .slice(0, 1);

  // Só um dos 5 macetes, pelo nome; qualquer outra coisa é descartada.
  let macete = texto(r.macete, 300);
  if (macete && !MACETES.some((m) => macete.toLowerCase().startsWith(m.toLowerCase()))) macete = '';

  let maisNatural = texto(r.maisNatural, 200);
  if (maisNatural && compactar(maisNatural) === compactar(transcricao)) maisNatural = '';
  const padrao = maisNatural ? texto(r.padrao, 250) : '';

  const resultado = {
    naoOuvi,
    transcricao,
    resposta: texto(r.resposta, 300),
    traducao: texto(r.traducao, 300),
    maisNatural,
    padrao,
    chunksSugeridos,
    palavrasErradas,
    macete
  };

  // Áudio mudo: o turno não avança e não há correção; o personagem só pede para repetir.
  if (naoOuvi) {
    Object.assign(resultado, { maisNatural: '', padrao: '', palavrasErradas: [], macete: '', chunksSugeridos: [] });
    if (!resultado.resposta || parecePortugues(resultado.resposta) || !resultado.traducao) {
      Object.assign(resultado, NAO_OUVI);
    }
  }
  return resultado;
}

// Confere se o turno veio utilizável. Devolve o problema em texto, ou '' se estiver ok.
function validar(r) {
  if (r.naoOuvi) return '';
  if (!r.resposta) return 'resposta veio vazia';
  if (parecePortugues(r.resposta)) return 'resposta não está em inglês';
  const perguntas = (r.resposta.match(/\?/g) || []).length;
  if (perguntas !== 1) return `resposta precisa ter exatamente uma pergunta (veio com ${perguntas})`;
  if (!r.traducao) return 'traducao veio vazia';
  if (r.chunksSugeridos.length < 2) return 'chunksSugeridos precisa de 2 ou 3 frases em inglês';
  return '';
}

// Ajusta o "pensamento" e a temperatura ao modelo, conforme a documentação do Gemini.
function configModelo(model, temperatura) {
  if (/^gemini-2\.5-flash/.test(model)) {
    return { temperature: temperatura, thinkingConfig: { thinkingBudget: 0 } };
  }
  if (/^gemini-([3-9]|\d{2,})/.test(model)) {
    // Gemini 3+: usa thinkingLevel (mandar thinkingBudget junto dá erro 400).
    // A temperatura fica no padrão (1.0), como a documentação recomenda para o Gemini 3.
    return { thinkingConfig: { thinkingLevel: /flash/.test(model) ? 'MINIMAL' : 'LOW' } };
  }
  return { temperature: temperatura };
}

// Extrai a mensagem de erro que o Gemini devolveu, sem nunca incluir a chave.
function mensagemErroGemini(detalhe, apiKey) {
  let msg = '';
  try {
    const j = JSON.parse(detalhe);
    msg = (j.error && (j.error.message || j.error.status)) || '';
  } catch {
    msg = detalhe;
  }
  msg = String(msg || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (apiKey) msg = msg.split(apiKey).join('***');
  return msg || 'sem mensagem';
}

// Tempo de espera sugerido pelo Gemini num 429 (RetryInfo.retryDelay, ex.: "27s"), em segundos.
function esperaSugerida(detalhe) {
  try {
    const j = JSON.parse(detalhe);
    const info = ((j.error && j.error.details) || []).find((d) => d && d.retryDelay);
    const s = info ? parseFloat(String(info.retryDelay)) : NaN;
    if (s > 0) return Math.min(120, Math.ceil(s));
  } catch { /* sem detalhe */ }
  return ESPERA_429_PADRAO;
}

// Chama o Gemini uma vez. Devolve { erroHttp, erroMsg, espera } ou { bruto, json } (json = null se veio vazio/quebrado).
async function chamarGemini(payload, apiKey, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => '');
      const erroMsg = mensagemErroGemini(detalhe, apiKey);
      console.error(`[conversa] Gemini erro ${resp.status} (modelo ${MODEL}): ${erroMsg}`);
      return { erroHttp: resp.status, erroMsg, espera: resp.status === 429 ? esperaSugerida(detalhe) : 0 };
    }

    const data = await resp.json();
    const partes = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const bruto = partes.map((p) => p.text || '').join('').trim();
    console.log('[conversa] resposta bruta do Gemini:', (bruto || JSON.stringify(data)).slice(0, 800));
    if (!bruto) return { bruto: JSON.stringify(data).slice(0, 800), json: null };

    try {
      return { bruto, json: JSON.parse(bruto.replace(/^```(?:json)?\s*|\s*```$/g, '')) };
    } catch {
      return { bruto, json: null };
    }
  } finally {
    clearTimeout(timer);
  }
}

function erroHttp(res, { erroHttp: status, erroMsg, espera }) {
  const detalhes = { geminiStatus: status, geminiMensagem: erroMsg };
  if (status === 429) {
    return res.status(429).json({ erro: 'Muitas falas seguidas. Espera um pouquinho e fala de novo.', espera, ...detalhes });
  }
  return res.status(502).json({ erro: `O Gemini respondeu com erro ${status}: ${erroMsg}`, ...detalhes });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ erro: 'GEMINI_API_KEY não configurada na Vercel.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ erro: 'Corpo da requisição inválido.' });
  }

  const audio = typeof body.audio === 'string' ? body.audio.replace(/^data:[^,]*,/, '') : '';
  const mimeType = texto(body.mimeType, 60).split(';')[0].toLowerCase() || 'audio/wav';

  if (!texto(body.cenario)) return res.status(400).json({ erro: 'Cenário não enviado.' });
  if (!audio) return res.status(400).json({ erro: 'Não chegou áudio. Toque no microfone e fale.' });
  if (audio.length > MAX_AUDIO_BASE64) return res.status(413).json({ erro: 'Áudio muito longo. Grave até 15 segundos.' });
  if (!MIME_PERMITIDOS.includes(mimeType)) return res.status(415).json({ erro: `Formato de áudio não suportado: ${mimeType}` });

  const parts = [
    { text: montarContexto(body) },
    { inlineData: { mimeType, data: audio } }
  ];
  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      ...configModelo(MODEL, 0.6)
    }
  };

  const inicio = Date.now();
  let primeira;
  try {
    primeira = await chamarGemini(payload, apiKey, TIMEOUT_MS);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return res.status(504).json({ erro: 'O Gemini demorou demais. Fala de novo.' });
    }
    console.error('[conversa] falha ao chamar o Gemini', err);
    return res.status(500).json({ erro: 'Falha ao falar com o Gemini.' });
  }
  if (primeira.erroHttp) return erroHttp(res, primeira);

  const r1 = primeira.json ? normalizar(primeira.json) : null;
  const problema = r1 ? validar(r1) : 'o JSON veio vazio ou quebrado';
  if (!problema) return res.status(200).json(r1);
  console.error('[conversa] resposta inválida (tentativa 1):', problema, '| bruto:', primeira.bruto.slice(0, 800));

  // Uma nova tentativa, avisando o que faltou, se ainda houver tempo. Nunca depois de um 429.
  const restante = TEMPO_TOTAL_MS - (Date.now() - inicio);
  if (restante > 4000) {
    const payloadNovo = {
      ...payload,
      contents: [{
        role: 'user',
        parts: [...parts, { text: `ATENÇÃO: sua resposta anterior foi rejeitada porque ${problema}. Responda de novo seguindo TODAS as regras.` }]
      }]
    };
    try {
      const segunda = await chamarGemini(payloadNovo, apiKey, restante);
      if (segunda.erroHttp) return erroHttp(res, segunda);
      const r2 = segunda.json ? normalizar(segunda.json) : null;
      const problema2 = r2 ? validar(r2) : 'o JSON veio vazio ou quebrado';
      if (!problema2) return res.status(200).json(r2);
      console.error('[conversa] resposta inválida (tentativa 2):', problema2);
    } catch (err) {
      console.error('[conversa] falha na tentativa 2', err && err.name);
    }
  }

  return res.status(502).json({ erro: 'O personagem não conseguiu responder agora. Fala de novo.' });
};
