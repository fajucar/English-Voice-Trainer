// Função serverless da Vercel: chat com o professor, dentro da cena.
// Separada do api/tutor.js. A chave fica SOMENTE na variável de ambiente GEMINI_API_KEY.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 18000;     // primeira chamada ao Gemini (mesmo limite do tutor)
const TEMPO_TOTAL_MS = 27000; // somando a nova tentativa (a função tem 30 s na Vercel)
const MAX_MENSAGENS = 6;      // só as últimas mensagens vão para o Gemini
const MAX_FALAR = 4;

const SYSTEM_PROMPT = `
Você é o professor de inglês do app "English Voice Trainer". O aluno é brasileiro, iniciante, e está no meio de uma cena (cafeteria, hotel, imigração, reunião...) treinando uma frase em voz alta.
Você recebe o contexto da cena (frase atual, tradução, chunk, última palavra que ele errou e o macete que já foi mostrado) e as últimas mensagens do chat.

COMO RESPONDER
- Sempre em português do Brasil. Tom encorajador, direto e prático, como um amigo que manja de inglês.
- Respostas CURTAS: no máximo 3 frases curtas (umas 60 palavras). Nada de listas longas.
- NUNCA use termos gramaticais ou técnicos (verbo, sujeito, artigo, pronome, preposição, tempo verbal, fonema, fonética, vogal átona, schwa, consoante surda etc.).
- Mostre a pronúncia aportuguesada entre aspas (ex.: water = "uórer").
- Fique na frase atual da cena, a não ser que o aluno pergunte outra coisa de inglês.
- Se a pergunta não tiver nada a ver com inglês, responda em uma frase gentil trazendo ele de volta para a cena.

QUANDO O ALUNO DISSER QUE NÃO CONSEGUE FALAR UMA PALAVRA
- Se ele não disser qual, use a "última palavra que errou"; se não houver, escolha a palavra mais difícil da frase atual.
- Explique a pronúncia aportuguesada, quebrando em pedacinhos se ajudar.
- Use um dos macetes abaixo SOMENTE se ele realmente se aplicar àquela palavra, pelo nome.
- Termine pedindo para ele tentar (ex.: "Tenta agora: 'uórer'.").

MACETES (use só estes, pelo nome)
1. "Kenai e Eva": conectar "Can I have a" soando como "Kenai" + "Eva", tudo emendado.
2. "E Mágico": o "e" único no final de palavras como have, make, cake é mudo. have = "rév", make = "meik", cake = "keik".
3. "Sopa sem sal": o som do TH é feito com a língua entre os dentes, soltando o ar.
4. "Som de R do português": quando T ou D ficam entre vogais (water, butter, get to), soam como o R do português de "caro". water = "uórer", butter = "bârer", get to = "guéru".
5. "Técnica do Ponto": em frases longas, fazer pausas imaginárias a cada 2 ou 3 palavras para falar sem travar.
NUNCA invente macete e não use esses nomes fora do caso certo. Se nenhum se aplicar, dê uma dica curta e prática sobre aquele som, sem nome de macete.

ATALHOS QUE O ALUNO PODE MANDAR
- "Repete mais devagar": quebre a frase (ou a palavra) em pedaços com a pronúncia aportuguesada e coloque em "falar" a frase inteira e os pedaços.
- "O que significa?": explique o sentido em português simples e quando usar na cena.
- "Me dá outro exemplo": dê 1 ou 2 frases novas em inglês usando o mesmo chunk, na mesma situação, com a tradução.

CAMPO "falar"
- Lista de 0 a ${MAX_FALAR} palavras ou frases EM INGLÊS que aparecem na sua resposta e valem ter botão de áudio.
- Escreva a grafia real em inglês (ex.: "water"), nunca a pronúncia aportuguesada e nunca português.
- Sem repetir itens.

Responda SOMENTE com o JSON no formato pedido.
`.trim();

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    resposta: { type: 'STRING' },
    falar: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['resposta', 'falar'],
  propertyOrdering: ['resposta', 'falar']
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

function montarContexto(entrada) {
  return [
    'CONTEXTO DA CENA',
    `Frase atual: "${texto(entrada.frase, 300)}"`,
    `Tradução: "${texto(entrada.traducao, 300)}"`,
    `Chunk: ${texto(entrada.chunk, 200) || '(nenhum)'}`,
    `Última palavra que o aluno errou: ${texto(entrada.ultimaPalavraErrada, 60) || '(nenhuma)'}`,
    `Macete que já foi mostrado: ${texto(entrada.macete, 400) || '(nenhum)'}`
  ].join('\n');
}

// Converte o histórico do app para o formato do Gemini (user/model), só as últimas mensagens.
function montarMensagens(lista) {
  const msgs = (Array.isArray(lista) ? lista : [])
    .slice(-MAX_MENSAGENS)
    .map((m) => ({
      role: m && m.autor === 'professor' ? 'model' : 'user',
      parts: [{ text: texto(m && m.texto, 500) }]
    }))
    .filter((m) => m.parts[0].text);
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

function normalizar(r) {
  const vistos = new Set();
  const falar = (Array.isArray(r.falar) ? r.falar : [])
    .map((f) => texto(f, 80))
    .filter((f) => {
      const chave = f.toLowerCase();
      if (!f || vistos.has(chave) || parecePortugues(f)) return false;
      vistos.add(chave);
      return true;
    })
    .slice(0, MAX_FALAR);
  return { resposta: texto(r.resposta, 1200), falar };
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
      console.error(`[chat] Gemini erro ${resp.status} (modelo ${MODEL}): ${erroMsg}`);
      return { erroHttp: resp.status, erroMsg };
    }

    const data = await resp.json();
    const partes = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const bruto = partes.map((p) => p.text || '').join('').trim();
    console.log('[chat] resposta bruta do Gemini:', (bruto || JSON.stringify(data)).slice(0, 800));
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
    return res.status(429).json({ erro: `O professor atingiu o limite gratuito por agora. Espera um minutinho e pergunta de novo. (429: ${erroMsg})`, ...detalhes });
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

  const contents = montarMensagens(body.mensagens);
  if (!contents.length || contents[contents.length - 1].role !== 'user') {
    return res.status(400).json({ erro: 'Mande uma pergunta para o professor.' });
  }

  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
    ...configModelo(MODEL, 0.5)
  };

  const payload = {
    systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\n${montarContexto(body)}` }] },
    contents,
    generationConfig
  };

  const inicio = Date.now();
  let primeira;
  try {
    primeira = await chamarGemini(payload, apiKey, TIMEOUT_MS);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return res.status(504).json({ erro: 'O professor demorou demais. Tenta de novo.' });
    }
    console.error('[chat] falha ao chamar o Gemini', err);
    return res.status(500).json({ erro: 'Falha ao falar com o professor.' });
  }
  if (primeira.erroHttp) return erroHttp(res, primeira);

  const r1 = primeira.json ? normalizar(primeira.json) : null;
  if (r1 && r1.resposta) return res.status(200).json(r1);

  const problema = r1 ? 'o campo resposta veio vazio' : 'o JSON veio vazio ou quebrado';
  console.error('[chat] resposta inválida (tentativa 1):', problema);

  // Uma nova tentativa, avisando o que faltou, se ainda houver tempo. Nunca depois de um 429.
  const restante = TEMPO_TOTAL_MS - (Date.now() - inicio);
  if (restante > 4000) {
    const payloadNovo = {
      ...payload,
      contents: [
        ...contents.slice(0, -1),
        {
          role: 'user',
          parts: [
            ...contents[contents.length - 1].parts,
            { text: `ATENÇÃO: sua resposta anterior foi rejeitada porque ${problema}. Responda de novo com o JSON completo.` }
          ]
        }
      ]
    };
    try {
      const segunda = await chamarGemini(payloadNovo, apiKey, restante);
      if (segunda.erroHttp) return erroHttp(res, segunda);
      const r2 = segunda.json ? normalizar(segunda.json) : null;
      if (r2 && r2.resposta) return res.status(200).json(r2);
      console.error('[chat] resposta inválida (tentativa 2):', r2 ? 'o campo resposta veio vazio' : 'o JSON veio vazio ou quebrado');
    } catch (err) {
      console.error('[chat] falha na tentativa 2', err && err.name);
    }
  }

  return res.status(502).json({ erro: 'O professor não conseguiu responder agora. Tenta de novo.' });
};
