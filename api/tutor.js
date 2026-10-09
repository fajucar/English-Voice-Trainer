// Função serverless da Vercel: recebe o áudio do aluno e pede ao Gemini
// para avaliar a pronúncia e continuar a conversa do cenário.
// A chave fica SOMENTE na variável de ambiente GEMINI_API_KEY.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_AUDIO_BASE64 = 3500000; // ~2,6 MB de áudio (limite da Vercel é 4,5 MB por requisição)
const TIMEOUT_MS = 18000;     // primeira chamada ao Gemini
const TEMPO_TOTAL_MS = 27000; // somando a nova tentativa (a função tem 30 s na Vercel)

const MIME_PERMITIDOS = [
  'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg',
  'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/mp3', 'audio/flac'
];

const SYSTEM_PROMPT = `
Você é o tutor do app "English Voice Trainer". O aluno é brasileiro, iniciante em inglês, e pratica FALANDO.
Você conduz uma conversa dentro de um cenário real (cafeteria, hotel, imigração, reunião...) como se fosse uma historinha.
A cada turno você recebe: o cenário, a história até agora, a frase em inglês que o aluno deveria dizer e um ÁUDIO do aluno tentando dizer essa frase.

COMO AVALIAR
- Avalie o SOM do áudio, não só se as palavras estão lá. Ouça vogais, finais de palavra, o H, as ligações entre palavras.
- Seja justo com iniciante: sotaque brasileiro é aceitável se um nativo entenderia sem esforço. Não reprove por detalhe pequeno.
- Reprove (acertou = false) quando: faltar palavra importante, trocar palavra, ou um som estiver claramente "aportuguesado" a ponto de atrapalhar (ex.: TH saindo como T, D, F ou S em "think" e "the"; T ou D duro entre vogais em "water", "butter", "get to"; "Can I have a" falado separado em vez de emendado; o "e" final pronunciado em "have", "make", "cake"; sílaba a mais, frase toda picada palavra por palavra).
- Se o áudio estiver mudo, só com ruído ou em português: acertou = false, palavrasErradas = [], transcricao = "", feedback = "Não consegui te ouvir direito. Fala mais perto do microfone.", macete = "".
- "transcricao": escreva o que você realmente ouviu.
- "palavrasErradas": no máximo 3 palavras DA FRASE ESPERADA que saíram com som errado ou faltaram, escritas exatamente como aparecem na frase. Lista vazia se acertou.

MACETES (use só estes, pelo nome, aplicados à palavra específica do aluno)
1. "Kenai e Eva": conectar "Can I have a" soando como "Kenai" + "Eva", tudo emendado. Use quando o aluno falou "Can I have a" (ou um trecho parecido) picado, palavra por palavra.
2. "E Mágico": o "e" único no final de palavras como have, make, cake é mudo. have = "rév", make = "meik", cake = "keik". Use quando o aluno pronunciou esse "e" final (ex.: "révi", "meiki").
3. "Sopa sem sal": o som do TH é feito com a língua entre os dentes, soltando o ar. Use quando o TH saiu como T, D, F ou S (ex.: "think" virou "tink" ou "fink", "the" virou "dâ").
4. "Som de R do português": quando T ou D ficam entre vogais (water, butter, get to), soam como o R do português de "caro". water = "uórer", butter = "bârer", get to = "guéru". Use quando o aluno fez um T ou D duro nesses casos.
5. "Técnica do Ponto": em frases longas, fazer pausas imaginárias a cada 2 ou 3 palavras para falar sem travar. Ex.: "I have a reservation / for tonight." Use quando o aluno travou, hesitou ou se perdeu numa frase longa.
Escreva o macete em 1 ou 2 frases curtas, com a pronúncia aportuguesada entre aspas. Comece com o nome do macete. Ex.: "Kenai e Eva: emenda tudo, 'Kenai-Eva latte', sem parar entre as palavras."
Se o erro do aluno não se encaixar em nenhum dos 5 macetes, NÃO invente macete e não use nenhum desses nomes. No campo "macete", dê uma dica curta e prática, em português, sobre aquele som específico (com a pronúncia aportuguesada entre aspas) e peça para repetir. Ex.: "No 'please', estica o 'i': 'pliiz', e repete."

TOM
- Encorajador, direto e prático, como um amigo que manja de inglês. Frases curtas.
- NUNCA use termos gramaticais ou técnicos (verbo, sujeito, artigo, pronome, preposição, tempo verbal, fonema, fonética, vogal átona, schwa, consoante surda etc.).
- "feedback": se acertou, parabéns curto (até 8 palavras, ex.: "Mandou bem! Soou natural."). Se errou, uma frase curta de incentivo pedindo para repetir (ex.: "Quase! Bora de novo.").

COMO CONTINUAR A HISTÓRIA
- Nunca ensine frase solta: tudo acontece dentro do cenário, como uma cena que avança.
- Se acertou = true: avance a cena.
  - "cena": 1 ou 2 frases em português contando o que acontece agora (ex.: "O barista anota seu pedido e pergunta o tamanho:").
  - "falaPersonagem": o que o outro personagem diz agora, em inglês simples e curto.
  - "traducaoPersonagem": tradução natural da falaPersonagem inteira para o português do Brasil.
  - "blocosPersonagem": a falaPersonagem dividida em blocos curtos, na ordem, cada um { "en": trecho em inglês, "pt": tradução daquele trecho }. Divida em cada frase (ponto final, exclamação ou interrogação). No máximo 3 blocos: se a fala tiver mais frases, junte as curtas no mesmo bloco. Juntando todos os "en" tem que dar exatamente a falaPersonagem, com as mesmas palavras na mesma ordem. "pt" nunca pode ficar vazio.
    Ex.: falaPersonagem "Good evening! Welcome. How can I help you?" → [{"en":"Good evening!","pt":"Boa noite!"},{"en":"Welcome.","pt":"Seja bem-vindo."},{"en":"How can I help you?","pt":"Como posso te ajudar?"}]
  - "proximaFala": a próxima frase que o ALUNO deve dizer, em inglês, natural e curta (3 a 10 palavras), útil na vida real, respondendo ao personagem.
  - "traducao": tradução natural da proximaFala para o português do Brasil.
  - "chunk": o pedaço reaproveitável da proximaFala. SEMPRE no formato "bloco fixo + [parte variável]", com o sinal de + antes de cada parte variável entre colchetes. O bloco fixo é o começo do chunk, ANTES do primeiro + ou [, e precisa ter pelo menos 2 palavras. A parte fixa deve aparecer igualzinha dentro da proximaFala.
    Certo: "Can I have a + [item], please?" | "A medium + [item], please?" | "I'd like to + [ação]"
    Errado: "A [tamanho] [item], please." (sem o +)
    Errado: "A + [tamanho] + [item], please?" (o bloco fixo antes do primeiro + tem só 1 palavra; precisa de pelo menos 2)
  - Reaproveite chunks que já apareceram quando fizer sentido, para fixar.
- Se acertou = false: NÃO avance. proximaFala = exatamente a frase esperada, traducao e chunk = os mesmos de antes, cena = "", falaPersonagem = "", traducaoPersonagem = "", blocosPersonagem = [].
- "fimDaCena": true somente quando a história chegar a um final natural (normalmente depois de 6 a 8 falas do aluno). Nesse caso, falaPersonagem é a despedida do personagem, cena fecha a história em português, e proximaFala é uma despedida curta do aluno (ex.: "Thank you, have a nice day!").
- REGRA FIRME: proximaFala é obrigatória em todo turno em que acertou:true, exceto quando ultimaFala for true (o contexto avisa com "ÚLTIMA FALA DA CENA: sim"). Nunca devolva proximaFala vazia, nunca repita a fala do personagem nela, e ela deve sempre estar em inglês, com a tradução em português no campo traducao.

Responda SOMENTE com o JSON no formato pedido.
`.trim();

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    acertou: { type: 'BOOLEAN' },
    transcricao: { type: 'STRING' },
    palavrasErradas: { type: 'ARRAY', items: { type: 'STRING' } },
    macete: { type: 'STRING' },
    feedback: { type: 'STRING' },
    cena: { type: 'STRING' },
    falaPersonagem: { type: 'STRING' },
    traducaoPersonagem: { type: 'STRING' },
    blocosPersonagem: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { en: { type: 'STRING' }, pt: { type: 'STRING' } },
        required: ['en', 'pt'],
        propertyOrdering: ['en', 'pt']
      }
    },
    proximaFala: { type: 'STRING' },
    traducao: { type: 'STRING' },
    chunk: { type: 'STRING' },
    fimDaCena: { type: 'BOOLEAN' }
  },
  required: [
    'acertou', 'transcricao', 'palavrasErradas', 'macete', 'feedback',
    'cena', 'falaPersonagem', 'traducaoPersonagem', 'blocosPersonagem',
    'proximaFala', 'traducao', 'chunk', 'fimDaCena'
  ],
  propertyOrdering: [
    'transcricao', 'acertou', 'palavrasErradas', 'macete', 'feedback',
    'cena', 'falaPersonagem', 'traducaoPersonagem', 'blocosPersonagem',
    'proximaFala', 'traducao', 'chunk', 'fimDaCena'
  ]
};

function texto(v, max = 400) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function montarContexto({ cenario, fraseEsperada, traducao, chunk, historico, turno, pular, ultimaFala }) {
  const linhas = (Array.isArray(historico) ? historico : [])
    .slice(-8)
    .map((h) => {
      const personagem = texto(h && h.personagem, 200);
      const frase = texto(h && h.frase, 200);
      return `- Personagem: "${personagem}" | Aluno disse: "${frase}"`;
    });

  return [
    `CENÁRIO: ${texto(cenario, 600)}`,
    `TURNO DO ALUNO: ${Number(turno) || 1}`,
    'HISTÓRIA ATÉ AGORA:',
    linhas.length ? linhas.join('\n') : '- (início da cena)',
    '',
    `FRASE QUE O ALUNO DEVERIA DIZER AGORA: "${texto(fraseEsperada, 300)}"`,
    `TRADUÇÃO: "${texto(traducao, 300)}"`,
    `CHUNK: ${texto(chunk, 200)}`,
    `ÚLTIMA FALA DA CENA: ${ultimaFala ? 'sim (a cena termina depois desta frase; se acertou, proximaFala pode ficar vazia)' : 'não'}`,
    '',
    pular
      ? 'NÃO há áudio: o aluno pulou esta frase. Avance a cena como se ele tivesse dito a frase esperada. Use acertou = true, transcricao = "", palavrasErradas = [], macete = "", feedback = "".'
      : 'O áudio anexado é o aluno tentando dizer essa frase. Avalie o som e responda no JSON.'
  ].join('\n');
}

function normalizar(r, entrada) {
  const acertou = entrada.pular || r.acertou === true;
  const resultado = {
    acertou,
    transcricao: texto(r.transcricao, 300),
    palavrasErradas: Array.isArray(r.palavrasErradas)
      ? r.palavrasErradas.map((p) => texto(p, 40)).filter(Boolean).slice(0, 3)
      : [],
    macete: texto(r.macete, 400),
    feedback: texto(r.feedback, 200),
    cena: texto(r.cena, 400),
    falaPersonagem: texto(r.falaPersonagem, 300),
    traducaoPersonagem: texto(r.traducaoPersonagem, 300),
    blocosPersonagem: limitarBlocos(Array.isArray(r.blocosPersonagem)
      ? r.blocosPersonagem.map((b) => ({ en: texto(b && b.en, 300), pt: texto(b && b.pt, 300) }))
      : []),
    proximaFala: texto(r.proximaFala, 300),
    traducao: texto(r.traducao, 300),
    chunk: texto(r.chunk, 200),
    fimDaCena: r.fimDaCena === true
  };

  // Se errou, garante que a frase não muda: o aluno precisa repetir antes de avançar.
  if (!acertou) {
    resultado.proximaFala = texto(entrada.fraseEsperada, 300);
    resultado.traducao = texto(entrada.traducao, 300);
    resultado.chunk = texto(entrada.chunk, 200);
    resultado.cena = '';
    resultado.falaPersonagem = '';
    resultado.traducaoPersonagem = '';
    resultado.blocosPersonagem = [];
    resultado.fimDaCena = false;
  }
  return resultado;
}

// No máximo 3 blocos: junta os vizinhos mais curtos (a união dos "en" continua igual à fala).
function limitarBlocos(blocos) {
  const b = blocos.slice();
  while (b.length > 3) {
    let i = 0;
    for (let k = 1; k < b.length - 1; k++) {
      if (b[k].en.length + b[k + 1].en.length < b[i].en.length + b[i + 1].en.length) i = k;
    }
    b.splice(i, 2, { en: `${b[i].en} ${b[i + 1].en}`.trim(), pt: `${b[i].pt} ${b[i + 1].pt}`.trim() });
  }
  return b;
}

// Os blocos precisam formar a fala inteira (ignorando espaços e pontuação) e ter tradução em todos.
function validarBlocos(r) {
  if (!r.falaPersonagem) return '';
  const blocos = r.blocosPersonagem;
  if (!blocos.length) return 'blocosPersonagem veio vazio';
  if (blocos.some((b) => !b.en || !b.pt)) return 'algum bloco de blocosPersonagem veio com "en" ou "pt" vazio';
  if (compactar(blocos.map((b) => b.en).join(' ')) !== compactar(r.falaPersonagem)) {
    return 'juntando os "en" de blocosPersonagem não dá exatamente a falaPersonagem';
  }
  return '';
}

// Blocos inválidos nas tentativas: o app divide a fala sozinho e mostra traducaoPersonagem em cima.
function semBlocos(r) {
  return { ...r, blocosPersonagem: [] };
}

const ACENTOS_PT = /[áàâãéêíóôõúç]/i;
const PALAVRAS_PT = new Set(['você', 'não', 'que', 'de', 'um', 'uma', 'para', 'com', 'quero', 'obrigado']);

function compactar(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, '');
}

function parecePortugues(frase) {
  if (ACENTOS_PT.test(frase)) return true;
  const palavras = frase.toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
  return palavras.filter((p) => PALAVRAS_PT.has(p)).length >= 2;
}

// Confere se o turno seguinte veio utilizável. Devolve o problema em texto, ou '' se estiver ok.
function validar(r, entrada) {
  if (!r.acertou || entrada.ultimaFala) return '';
  const p = r.proximaFala;
  if (!p) return 'proximaFala veio vazia';
  if (compactar(p) === compactar(r.falaPersonagem)) return 'proximaFala repetiu a fala do personagem';
  if (compactar(p) === compactar(r.traducao)) return 'proximaFala veio igual à traducao';
  if (parecePortugues(p)) return 'proximaFala não está em inglês';
  if (!r.traducao) return 'traducao veio vazia';
  const problemaChunk = validarChunk(r.chunk);
  if (problemaChunk) return problemaChunk;
  return '';
}

// O chunk precisa do "+" e de um bloco fixo, antes do primeiro "+" ou "[", com pelo menos 2 palavras.
function validarChunk(chunk) {
  if (!chunk || !chunk.includes('+')) return 'o chunk veio sem o sinal de + (formato: "bloco fixo + [parte variável]")';
  const bloco = chunk.split(/[+[]/)[0];
  const palavras = bloco.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (palavras.length < 2) return 'o bloco fixo do chunk (antes do primeiro + ou [) tem menos de 2 palavras';
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
      console.error(`[tutor] Gemini erro ${resp.status} (modelo ${MODEL}): ${erroMsg}`);
      return { erroHttp: resp.status, erroMsg };
    }

    const data = await resp.json();
    const partes = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const bruto = partes.map((p) => p.text || '').join('').trim();
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

  const pular = body.pular === true;
  const audio = typeof body.audio === 'string' ? body.audio.replace(/^data:[^,]*,/, '') : '';
  const mimeType = texto(body.mimeType, 60).split(';')[0].toLowerCase() || 'audio/wav';
  const fraseEsperada = texto(body.fraseEsperada, 300);

  if (!fraseEsperada) return res.status(400).json({ erro: 'Frase esperada não enviada.' });
  if (!pular) {
    if (!audio) return res.status(400).json({ erro: 'Áudio não enviado.' });
    if (audio.length > MAX_AUDIO_BASE64) return res.status(413).json({ erro: 'Áudio muito longo. Grave até 15 segundos.' });
    if (!MIME_PERMITIDOS.includes(mimeType)) return res.status(415).json({ erro: `Formato de áudio não suportado: ${mimeType}` });
  }

  const entrada = {
    cenario: body.cenario,
    fraseEsperada,
    traducao: body.traducao,
    chunk: body.chunk,
    historico: body.historico,
    turno: body.turno,
    pular,
    ultimaFala: body.ultimaFala === true
  };

  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
    ...configModelo(MODEL, 0.4)
  };

  const parts = [{ text: montarContexto(entrada) }];
  if (!pular) parts.push({ inlineData: { mimeType, data: audio } });

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig
  };

  const inicio = Date.now();
  let primeira;
  try {
    primeira = await chamarGemini(payload, apiKey, TIMEOUT_MS);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return res.status(504).json({ erro: 'O Gemini demorou demais. Tente de novo.' });
    }
    console.error('Falha ao chamar o Gemini', err);
    return res.status(500).json({ erro: 'Falha ao falar com o Gemini.' });
  }

  if (primeira.erroHttp) {
    const { erroHttp, erroMsg } = primeira;
    const detalhes = { geminiStatus: erroHttp, geminiMensagem: erroMsg };
    if (erroHttp === 429) {
      return res.status(429).json({ erro: `Limite gratuito do Gemini atingido. Espere um minuto e tente de novo. (429: ${erroMsg})`, ...detalhes });
    }
    return res.status(502).json({ erro: `O Gemini respondeu com erro ${erroHttp}: ${erroMsg}`, ...detalhes });
  }

  let resultado = primeira.json ? normalizar(primeira.json, entrada) : null;
  const problema = resultado ? validar(resultado, entrada) : 'o JSON veio vazio ou quebrado';
  const problemaBlocos = resultado && !problema ? validarBlocos(resultado) : '';
  if (!problema && !problemaBlocos) return res.status(200).json(resultado);

  console.error('[tutor] resposta inválida (tentativa 1):', problema || problemaBlocos, '| bruto:', primeira.bruto.slice(0, 800));

  // Uma nova tentativa, avisando o Gemini do que faltou, se ainda houver tempo.
  const restante = TEMPO_TOTAL_MS - (Date.now() - inicio);
  if (restante > 4000) {
    const aviso = problema
      ? `ATENÇÃO: sua resposta anterior foi rejeitada porque ${problema}. Responda de novo seguindo TODAS as regras, principalmente a REGRA FIRME sobre proximaFala.`
      : `ATENÇÃO: sua resposta anterior foi rejeitada porque ${problemaBlocos}. Responda de novo seguindo TODAS as regras, principalmente a de blocosPersonagem.`;
    const payloadNovo = {
      ...payload,
      contents: [{
        role: 'user',
        parts: [...parts, { text: aviso }]
      }]
    };
    try {
      const segunda = await chamarGemini(payloadNovo, apiKey, restante);
      if (segunda.json) {
        const r2 = normalizar(segunda.json, entrada);
        const problema2 = validar(r2, entrada);
        if (!problema2) {
          const problemaBlocos2 = validarBlocos(r2);
          if (!problemaBlocos2) return res.status(200).json(r2);
          console.error('[tutor] blocos inválidos (tentativa 2):', problemaBlocos2, '| bruto:', segunda.bruto.slice(0, 800));
          return res.status(200).json(semBlocos(r2));
        }
        console.error('[tutor] resposta inválida (tentativa 2):', problema2, '| bruto:', segunda.bruto.slice(0, 800));
        if (!resultado) resultado = r2;
      } else if (!segunda.erroHttp) {
        console.error('[tutor] resposta inválida (tentativa 2): o JSON veio vazio ou quebrado | bruto:', segunda.bruto.slice(0, 800));
      }
    } catch (err) {
      console.error('[tutor] falha na tentativa 2', err && err.name);
    }
  }

  // Sem JSON utilizável nas duas tentativas: não dá para saber se acertou.
  if (!resultado) {
    return res.status(502).json({ erro: 'Resposta inesperada do Gemini. Tente de novo.' });
  }

  // A primeira resposta só falhou nos blocos: segue com ela e o app divide a fala.
  if (!problema) return res.status(200).json(semBlocos(resultado));

  // Acertou, mas sem próxima fala válida: mantém a frase atual e avisa o app.
  return res.status(200).json({
    ...resultado,
    semProximaFala: true,
    cena: '',
    falaPersonagem: '',
    traducaoPersonagem: '',
    blocosPersonagem: [],
    proximaFala: texto(entrada.fraseEsperada, 300),
    traducao: texto(entrada.traducao, 300),
    chunk: texto(entrada.chunk, 200),
    fimDaCena: false
  });
};
