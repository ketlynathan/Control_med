const { getAuthBusinessId } = require('./_lib/auth');

// Groq exposes an OpenAI-compatible Chat Completions API.
const TEXT_MODEL = 'llama-3.3-70b-versatile';
const VISION_MODEL = 'qwen/qwen3.6-27b';

const ENTRY_CATEGORIES = ['Vendas', 'Serviços', 'Recebimento de cliente', 'Aporte', 'Outras entradas'];
const EXIT_CATEGORIES = ['Mercadoria', 'Fornecedores', 'Aluguel', 'Folha e pró-labore', 'Impostos', 'Marketing', 'Taxas bancárias', 'Contas e serviços', 'Manutenção', 'Outras saídas'];
const ALLOWED_TYPES = ['entrada', 'saida'];
const ALLOWED_METHODS = ['dinheiro', 'pix', 'cartao', 'transferencia', 'outro'];
const ALLOWED_CONFIDENCE = ['alta', 'media', 'baixa'];

function buildSystemPrompt(hasImage) {
  return `Você extrai dados estruturados de notas fiscais, recibos ou comprovantes ${hasImage ? 'a partir da imagem enviada' : '(texto transcrito por OCR/IA a partir de uma foto)'} para um sistema de controle de caixa de um pequeno negócio.

Responda APENAS com um objeto JSON válido, sem markdown, sem crases, sem nenhum texto fora do JSON, exatamente neste formato:
{"type":"entrada"|"saida","description":"string curta, até 60 caracteres","amount":numero,"date":"YYYY-MM-DD"|null,"category":"uma das opções abaixo","paymentMethod":"dinheiro"|"pix"|"cartao"|"transferencia"|"outro","confidence":"alta"|"media"|"baixa","notes":"string curta, ou vazio"}

Regras:
- Use "type":"saida" para compras/pagamentos feitos pelo negócio (é o caso mais comum quando alguém cola uma nota de compra). Use "entrada" apenas se o texto claramente descrever uma venda/recebimento feito pelo próprio negócio.
- "category" deve ser exatamente um destes valores, escolhendo o mais adequado ao "type":
  Se type="entrada": ${ENTRY_CATEGORIES.join(', ')}
  Se type="saida": ${EXIT_CATEGORIES.join(', ')}
- "amount" é o valor total do documento, como número (ponto decimal, sem símbolo de moeda, sem separador de milhar).
- Se não houver data explícita no texto, retorne "date": null.
- "description" deve citar o estabelecimento e/ou os itens principais, nunca fica vazia.
- Se o texto não parecer claramente um comprovante financeiro, ainda assim faça o melhor palpite possível, marque "confidence":"baixa" e explique brevemente em "notes" o que ficou incerto.`;
}

function safeParseJSON(raw) {
  const cleaned = String(raw || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const businessId = getAuthBusinessId(req);
  if (!businessId) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }

  const { text, imageData } = req.body || {};
  const cleanText = String(text || '').trim();
  const cleanImage = typeof imageData === 'string' && imageData.startsWith('data:image/') ? imageData : '';
  if (!cleanText && !cleanImage) {
    return res.status(400).json({ error: 'Envie uma foto ou cole o texto da nota antes de interpretar.' });
  }
  if (cleanText.length > 6000) {
    return res.status(400).json({ error: 'Texto muito longo. Cole apenas o conteúdo da nota/recibo.' });
  }
  if (cleanImage.length > 8 * 1024 * 1024) {
    return res.status(400).json({ error: 'A imagem é muito grande. Envie uma foto de até 6 MB.' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY não está configurada nas variáveis de ambiente da Vercel.' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: cleanImage ? VISION_MODEL : TEXT_MODEL,
        max_completion_tokens: cleanImage ? 800 : 400,
        temperature: cleanImage ? 0.7 : 0,
        reasoning_effort: cleanImage ? 'none' : undefined,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(Boolean(cleanImage)) },
          { role: 'user', content: cleanImage ? [
            { type: 'text', text: cleanText || 'Leia esta nota fiscal e extraia o lançamento financeiro.' },
            { type: 'image_url', image_url: { url: cleanImage } },
          ] : cleanText },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Groq API error:', response.status, errBody);
      return res.status(502).json({ error: 'Não foi possível interpretar a nota agora. Tente novamente em instantes.' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'A IA não retornou uma resposta interpretável.' });
    }

    let parsed;
    try {
      parsed = safeParseJSON(content);
    } catch (e) {
      console.error('JSON parse failed for:', content);
      return res.status(502).json({ error: 'A IA respondeu em um formato inesperado. Tente novamente.' });
    }

    const type = ALLOWED_TYPES.includes(parsed.type) ? parsed.type : 'saida';
    const categoryList = type === 'entrada' ? ENTRY_CATEGORIES : EXIT_CATEGORIES;
    const category = categoryList.includes(parsed.category) ? parsed.category : categoryList[categoryList.length - 1];
    const paymentMethod = ALLOWED_METHODS.includes(parsed.paymentMethod) ? parsed.paymentMethod : 'outro';
    const amount = Number(parsed.amount);

    return res.status(200).json({
      suggestion: {
        type,
        description: String(parsed.description || '').trim().slice(0, 120) || 'Lançamento via nota',
        amount: Number.isFinite(amount) && amount > 0 ? amount : null,
        date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
        category,
        paymentMethod,
        confidence: ALLOWED_CONFIDENCE.includes(parsed.confidence) ? parsed.confidence : 'media',
        notes: String(parsed.notes || '').trim().slice(0, 200),
      },
    });
  } catch (err) {
    console.error('extract-entry error:', err);
    return res.status(500).json({ error: 'Erro interno ao interpretar a nota.' });
  }
};
