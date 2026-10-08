// Função serverless da Vercel: modo treino de um balão da conversa.
// Avalia SÓ a pronúncia de uma frase: não avança a cena, não gera próxima fala.
// Separada do api/tutor.js. A chave fica SOMENTE na variável de ambiente GEMINI_API_KEY.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_AUDIO_BASE64 = 3500000; // ~2,6 MB de áudio (limite da Vercel é 4,5 MB por requisição)
const TIMEOUT_MS = 18000;     // primeira chamada ao Gemini (mesmo limite do tutor)
const TEMPO_TOTAL_MS = 27000; // somando a nova tentativa (a função tem 30 s na Vercel)

const MIME_PERMITIDOS = [
  'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg',
  'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/mp3', 'audio/flac'
];

const SYSTEM_PROMPT = `
Você é o tutor de pronúncia do app "English Voice Trainer". O aluno é brasileiro, iniciante em inglês, e está treinando UMA frase de uma cena (cafeteria, hotel, imigração, reunião...).
Você recebe a frase em inglês e um ÁUDIO do aluno tentando dizer essa frase. Avalie só a pronúncia dessa frase. Não continue a história e não proponha outra frase.

COMO AVALIAR
- Avalie o SOM do áudio, não só se as palavras estão lá. Ouça vogais, finais de palavra, o H, as ligações entre palavras.
- Seja justo com iniciante: sotaque brasileiro é aceitável se um nativo entenderia sem esforço. Não reprove por detalhe pequeno.
- Reprove (acertou = false) quando: faltar palavra importante, trocar palavra, ou um som estiver claramente "aportuguesado" a ponto de atrapalhar (ex.: TH saindo como T, D, F ou S em "think" e "the"; T ou D duro entre vogais em "water", "butter", "get to"; "Can I have a" falado separado em vez de emendado; o "e" final pronunciado em "have", "make", "cake"; sílaba a mais, frase toda picada palavra por palavra).
- Se o áudio estiver mudo, só com ruído ou em português: acertou = false, palavrasErradas = [], transcricao = "", feedback = "Não consegui te ouvir direito. Fala mais perto do microfone.", macete = "".
- "transcricao": escreva o que você realmente ouviu.
- "palavrasErradas": no máximo 3 palavras DA FRASE que saíram com som errado ou faltaram, escritas exatamente como aparecem na frase. Lista vazia se acertou.

MACETES (use só estes, pelo nome, aplicados à palavra específica do aluno)
1. "Kenai e Eva": conectar "Can I have a" soando como "Kenai" + "Eva", tudo emendado. Use quando o aluno falou "Can I have a" (ou um trecho parecido) picado, palavra por palavra.
2. "E Mágico": o "e" único no final de palavras como have, make, cake é mudo. have = "rév", make = "meik", cake = "keik". Use quando o aluno pronunciou esse "e" final (ex.: "révi", "meiki").
3. "Sopa sem sal": o som do TH é feito com a língua entre os dentes, soltando o ar. Use quando o TH saiu como T, D, F ou S (ex.: "think" virou "tink" ou "fink", "the" virou "dâ").
4. "Som de R do português": quando T ou D ficam entre vogais (water, butter, get to), soam como o R do português de "caro". water = "uórer", butter = "bârer", get to = "guéru". Use quando o aluno fez um T ou D duro nesses casos.
5. "Técnica do Ponto": em frases longas, fazer pausas imaginárias a cada 2 ou 3 palavras para falar sem travar. Ex.: "I have a reservation / for tonight." Use quando o aluno travou, hesitou ou se perdeu numa frase longa.
Escreva o macete em 1 ou 2 frases curtas, com a pronúncia aportuguesada entre aspas. Comece com o nome do macete. Ex.: "Kenai e Eva: emenda tudo, 'Kenai-Eva latte', sem parar entre as palavras."
Se o erro do aluno não se encaixar em nenhum dos 5 macetes, NÃO invente macete e não use nenhum desses nomes. No campo "macete", dê uma dica curta e prática, em português, sobre aquele som específico (com a pronúncia aportuguesada entre aspas) e peça para repetir. Ex.: "No 'please', estica o 'i': 'pliiz', e repete."
Se acertou, "macete" fica vazio.

TOM
- Encorajador, direto e prático, como um amigo que manja de inglês. Frases curtas.
- NUNCA use termos gramaticais ou técnicos (verbo, sujeito, artigo, pronome, preposição, tempo verbal, fonema, fonética, vogal átona, schwa, consoante surda etc.).
- "feedback": se acertou, parabéns curto (até 6 palavras, ex.: "Boa! Soou natural."). Se errou, uma dica curta de incentivo pedindo para repetir (ex.: "Quase! Tenta de novo.").

Responda SOMENTE com o JSON no formato pedido.
`.trim();

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    acertou: { type: 'BOOLEAN' },
    transcricao: { type: 'STRING' },
    palavrasErradas: { type: 'ARRAY', items: { type: 'STRING' } },
    macete: { type: 'STRING' },
    feedback: { type: 'STRING' }
  },
  required: ['acertou', 'transcricao', 'palavrasErradas', 'macete', 'feedback'],
  propertyOrdering: ['transcricao', 'acertou', 'palavrasErradas', 'macete', 'feedback']
};

function texto(v, max = 400) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function normalizar(r) {
  const acertou = r.acertou === true;
  return {
    acertou,
    transcricao: texto(r.transcricao, 300),
    palavrasErradas: acertou || !Array.isArray(r.palavrasErradas)
      ? []
      : r.palavrasErradas.map((p) => texto(p, 40)).filter(Boolean).slice(0, 3),
    macete: acertou ? '' : texto(r.macete, 400),
    feedback: texto(r.feedback, 200)
  };
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

// Chama o Gemini uma vez. Devolve { erroHttp, erroMsg } ou { bruto, json } (json = null se veio vazio/quebrado).
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
      console.error(`[praticar] Gemini erro ${resp.status} (modelo ${MODEL}): ${erroMsg}`);
      return { erroHttp: resp.status, erroMsg };
    }

    const data = await resp.json();
    const partes = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const bruto = partes.map((p) => p.text || '').join('').trim();
    console.log('[praticar] resposta bruta do Gemini:', (bruto || JSON.stringify(data)).slice(0, 800));
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

function erroHttp(res, { erroHttp: status, erroMsg }) {
  const detalhes = { geminiStatus: status, geminiMensagem: erroMsg };
  if (status === 429) {
    return res.status(429).json({ erro: 'Muitas tentativas seguidas, espera um minutinho e tenta de novo.', ...detalhes });
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

  const frase = texto(body.frase, 300);
  const audio = typeof body.audio === 'string' ? body.audio.replace(/^data:[^,]*,/, '') : '';
  const mimeType = texto(body.mimeType, 60).split(';')[0].toLowerCase() || 'audio/wav';

  if (!frase) return res.status(400).json({ erro: 'Frase do balão não enviada.' });
  if (!audio) return res.status(400).json({ erro: 'Não chegou áudio. Toque em 🎤 e fale a frase.' });
  if (audio.length > MAX_AUDIO_BASE64) return res.status(413).json({ erro: 'Áudio muito longo. Grave até 15 segundos.' });
  if (!MIME_PERMITIDOS.includes(mimeType)) return res.status(415).json({ erro: `Formato de áudio não suportado: ${mimeType}` });

  const parts = [
    { text: `FRASE QUE O ALUNO ESTÁ TREINANDO: "${frase}"\n\nO áudio anexado é o aluno tentando dizer essa frase. Avalie só a pronúncia e responda no JSON.` },
    { inlineData: { mimeType, data: audio } }
  ];
  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      ...configModelo(MODEL, 0.4)
    }
  };

  const inicio = Date.now();
  let primeira;
  try {
    primeira = await chamarGemini(payload, apiKey, TIMEOUT_MS);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return res.status(504).json({ erro: 'O Gemini demorou demais. Tenta de novo.' });
    }
    console.error('[praticar] falha ao chamar o Gemini', err);
    return res.status(500).json({ erro: 'Falha ao falar com o Gemini.' });
  }
  if (primeira.erroHttp) return erroHttp(res, primeira);

  const r1 = primeira.json ? normalizar(primeira.json) : null;
  if (r1 && r1.feedback) return res.status(200).json(r1);

  const problema = r1 ? 'o campo feedback veio vazio' : 'o JSON veio vazio ou quebrado';
  console.error('[praticar] resposta inválida (tentativa 1):', problema, '| bruto:', primeira.bruto.slice(0, 800));

  // Uma nova tentativa, avisando o que faltou, se ainda houver tempo. Nunca depois de um 429.
  const restante = TEMPO_TOTAL_MS - (Date.now() - inicio);
  if (restante > 4000) {
    const payloadNovo = {
      ...payload,
      contents: [{
        role: 'user',
        parts: [...parts, { text: `ATENÇÃO: sua resposta anterior foi rejeitada porque ${problema}. Responda de novo com o JSON completo.` }]
      }]
    };
    try {
      const segunda = await chamarGemini(payloadNovo, apiKey, restante);
      if (segunda.erroHttp) return erroHttp(res, segunda);
      const r2 = segunda.json ? normalizar(segunda.json) : null;
      if (r2 && r2.feedback) return res.status(200).json(r2);
      console.error('[praticar] resposta inválida (tentativa 2):', r2 ? 'o campo feedback veio vazio' : 'o JSON veio vazio ou quebrado');
    } catch (err) {
      console.error('[praticar] falha na tentativa 2', err && err.name);
    }
  }

  return res.status(502).json({ erro: 'Não consegui avaliar agora. Tenta de novo.' });
};
