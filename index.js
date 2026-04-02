const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_IMAGE_DAILY_LIMIT = 100;
const DEFAULT_SOURCE_DAILY_LIMIT = 50;
const PROVIDER_RESET_TIME_ZONE = "America/Los_Angeles";

const IMAGE_SCHEMA = {
  type: "OBJECT",
  properties: {
    verdict: {
      type: "STRING",
      enum: ["feita_por_ia", "parece_real", "inconclusiva"]
    },
    confidence: {
      type: "INTEGER"
    },
    summary: {
      type: "STRING"
    },
    signals: {
      type: "ARRAY",
      items: {
        type: "STRING"
      }
    }
  },
  required: ["verdict", "confidence", "summary", "signals"]
};

const SOURCE_SCHEMA = {
  type: "OBJECT",
  properties: {
    verdict: {
      type: "STRING",
      enum: ["verdadeira", "falsa", "inconclusiva"]
    },
    confidence: {
      type: "INTEGER"
    },
    summary: {
      type: "STRING"
    },
    reasons: {
      type: "ARRAY",
      items: {
        type: "STRING"
      }
    }
  },
  required: ["verdict", "confidence", "summary", "reasons"]
};

const IMAGE_SYSTEM_PROMPT = [
  "Voce e um analista de autenticidade visual.",
  "Decida se a imagem parece feita por IA, parece real ou se e inconclusiva.",
  "Observe detalhes como maos, dedos, olhos, texto na imagem, reflexos, sombras, perspectiva, repeticao de textura, objetos deformados e incoerencias de contorno.",
  "O campo confidence deve ser um numero inteiro de 0 a 100.",
  "Use 0 a 30 para evidencia fraca, 31 a 69 para caso misto e 70 a 100 para evidencia forte.",
  "Se a evidencia nao bastar, use inconclusiva.",
  "Retorne apenas o JSON pedido."
].join(" ");

const SOURCE_GROUNDED_PROMPT = [
  "Voce e um verificador de noticias.",
  "Recebera um link, titulo, descricao e trecho da pagina.",
  "Use Google Search grounding para comparar a principal afirmacao da pagina com outras referencias confiaveis.",
  "Resuma qual parece ser a afirmacao central, quais evidencias apoiam ou contradizem e se o caso parece verdadeiro, falso ou inconclusivo.",
  "Seja cauteloso."
].join(" ");

const SOURCE_CLASSIFIER_PROMPT = [
  "Voce recebe um dossie de verificacao de noticia com evidencias ja coletadas.",
  "Classifique em verdadeira, falsa ou inconclusiva.",
  "Use verdadeira so quando a afirmacao principal estiver bem sustentada.",
  "Use falsa quando a afirmacao principal for contradita por evidencias fortes.",
  "Use inconclusiva quando a prova nao bastar, o caso for misto ou houver contexto insuficiente.",
  "O campo confidence deve ser um numero inteiro de 0 a 100.",
  "Use 0 a 30 para evidencia fraca, 31 a 69 para caso misto e 70 a 100 para evidencia forte.",
  "Retorne apenas o JSON pedido."
].join(" ");

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse({ ok: true, service: "origem-api", provider: "gemini" });
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ error: "GEMINI_API_KEY nao configurada no backend." }, 500);
    }

    try {
      if (request.method === "POST" && url.pathname === "/api/analyze-image") {
        const rateLimitResponse = await enforceRateLimit(
          request,
          env,
          "image",
          getDailyLimit(env.IMAGE_DAILY_LIMIT, DEFAULT_IMAGE_DAILY_LIMIT)
        );

        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        return await handleImageAnalysis(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/analyze-source") {
        const rateLimitResponse = await enforceRateLimit(
          request,
          env,
          "source",
          getDailyLimit(env.SOURCE_DAILY_LIMIT, DEFAULT_SOURCE_DAILY_LIMIT)
        );

        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        return await handleSourceAnalysis(request, env);
      }

      return jsonResponse({ error: "Rota nao encontrada." }, 404);
    } catch (error) {
      return jsonResponse({ error: error.message || "Erro interno do servidor." }, 500);
    }
  }
};

async function handleImageAnalysis(request, env) {
  const formData = await request.formData();
  const file = formData.get("image");

  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonResponse({ error: "Envie uma imagem valida." }, 400);
  }

  if (!String(file.type || "").startsWith("image/")) {
    return jsonResponse({ error: "O arquivo precisa ser uma imagem." }, 400);
  }

  if (file.size > 8 * 1024 * 1024) {
    return jsonResponse({ error: "A imagem deve ter no maximo 8 MB." }, 400);
  }

  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  const response = await callGemini(env.GEMINI_API_KEY, env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL, {
    systemInstruction: {
      parts: [{ text: IMAGE_SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: file.type || "image/jpeg",
              data: base64
            }
          },
          {
            text: "Analise esta imagem e devolva apenas o JSON solicitado."
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: IMAGE_SCHEMA,
      temperature: 0.2
    }
  });

  const analysis = parseGeminiJson(response);
  const verdictMap = mapImageVerdict(analysis.verdict);

  return jsonResponse({
    status: verdictMap.status,
    badgeClass: verdictMap.badgeClass,
    label: `${file.name} - ${formatBytes(file.size)}`,
    confidence: normalizeConfidence(analysis.confidence),
    text: analysis.summary,
    points: normalizeList(analysis.signals)
  });
}

async function handleSourceAnalysis(request, env) {
  const body = await request.json().catch(() => null);
  const link = body?.link?.trim();

  if (!link) {
    return jsonResponse({ error: "Envie um link valido para verificar a fonte." }, 400);
  }

  const normalizedUrl = normalizeUrl(link);
  const pageData = await fetchPageSnapshot(normalizedUrl);
  const model = env.GEMINI_SOURCE_MODEL || DEFAULT_MODEL;

  const groundedResponse = await callGemini(env.GEMINI_API_KEY, model, {
    systemInstruction: {
      parts: [{ text: SOURCE_GROUNDED_PROMPT }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildSourceEvidencePrompt(normalizedUrl, pageData) }]
      }
    ],
    tools: [
      {
        google_search: {}
      }
    ],
    generationConfig: {
      temperature: 0.2
    }
  });

  const groundedText = getGeminiText(groundedResponse);
  const groundingMeta = getGroundingMetadata(groundedResponse);

  const classifierResponse = await callGemini(env.GEMINI_API_KEY, model, {
    systemInstruction: {
      parts: [{ text: SOURCE_CLASSIFIER_PROMPT }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildClassifierPrompt(normalizedUrl, pageData, groundedText, groundingMeta) }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: SOURCE_SCHEMA,
      temperature: 0.1
    }
  });

  const analysis = parseGeminiJson(classifierResponse);
  const verdictMap = mapSourceVerdict(analysis.verdict);

  return jsonResponse({
    status: verdictMap.status,
    badgeClass: verdictMap.badgeClass,
    label: `Dominio: ${pageData.domain}`,
    confidence: normalizeConfidence(analysis.confidence),
    text: analysis.summary,
    points: mergeReasonsWithSources(analysis.reasons, groundingMeta)
  });
}

async function enforceRateLimit(request, env, scope, limit) {
  if (!env.IP_RATE_LIMITER) {
    return null;
  }

  const ip = readClientIp(request);
  const stub = env.IP_RATE_LIMITER.get(env.IP_RATE_LIMITER.idFromName(ip));
  const response = await stub.fetch("https://rate-limit/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      scope,
      limit,
      windowKey: getProviderWindowKey()
    })
  });

  const data = await response.json().catch(() => null);

  if (data?.allowed) {
    return null;
  }

  const remaining = Number.isFinite(Number(data?.remaining)) ? Number(data.remaining) : 0;
  const resetLabel = "04:00 no horario de Brasilia";
  const scopeLabel = scope === "source" ? "fonte" : "imagem";

  return jsonResponse({
    error: `Limite diario por IP atingido para analise de ${scopeLabel}. Tente novamente apos ${resetLabel}.`,
    limit,
    remaining
  }, 429);
}

async function callGemini(apiKey, model, payload) {
  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractGeminiError(data));
  }

  return data;
}

function extractGeminiError(data) {
  const message = data?.error?.message || "Falha ao consultar a API Gemini.";

  if (message.includes("API key not valid")) {
    return "A chave do Gemini e invalida. Gere uma nova chave no Google AI Studio.";
  }

  if (message.includes("quota") || message.includes("Quota") || message.includes("RESOURCE_EXHAUSTED")) {
    return "A cota gratuita do Gemini foi excedida. Espere o reset da cota ou use outra chave/projeto.";
  }

  return message;
}

function parseGeminiJson(response) {
  const rawText = getGeminiText(response);

  if (!rawText) {
    throw new Error("O Gemini nao retornou conteudo parseavel.");
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error("Nao foi possivel interpretar a resposta JSON do Gemini.");
  }
}

function getGeminiText(response) {
  const parts = response?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => part?.text || "")
    .join("\n")
    .trim();
}

function getGroundingMetadata(response) {
  const candidate = response?.candidates?.[0] || {};
  const metadata = candidate.groundingMetadata || {};
  const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];

  return chunks
    .map((chunk) => chunk?.web)
    .filter(Boolean)
    .map((web) => ({
      title: web.title || "Fonte",
      uri: web.uri || ""
    }))
    .filter((item) => item.uri)
    .slice(0, 3);
}

function normalizeConfidence(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (numeric >= 0 && numeric <= 1) {
    return Math.max(0, Math.min(100, Math.round(numeric * 100)));
  }

  if (numeric > 1 && numeric <= 10) {
    return Math.max(0, Math.min(100, Math.round(numeric * 10)));
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function getDailyLimit(rawValue, fallback) {
  const numeric = Number(rawValue);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Math.round(numeric);
}

function normalizeList(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return ["Nenhum detalhe adicional retornado."];
  }

  return value.map((item) => String(item)).slice(0, 5);
}

function mergeReasonsWithSources(reasons, sources) {
  const normalizedReasons = normalizeList(reasons);

  if (!sources.length) {
    return normalizedReasons;
  }

  const sourceLines = sources.map((source) => `Referencia: ${source.title} - ${source.uri}`);
  return [...normalizedReasons, ...sourceLines].slice(0, 5);
}

function mapImageVerdict(verdict) {
  if (verdict === "feita_por_ia") {
    return {
      status: "Feita por IA",
      badgeClass: "is-warn"
    };
  }

  if (verdict === "parece_real") {
    return {
      status: "Parece real",
      badgeClass: "is-ok"
    };
  }

  return {
    status: "Inconclusiva",
    badgeClass: "is-demo"
  };
}

function mapSourceVerdict(verdict) {
  if (verdict === "verdadeira") {
    return {
      status: "Verdadeira",
      badgeClass: "is-ok"
    };
  }

  if (verdict === "falsa") {
    return {
      status: "Falsa",
      badgeClass: "is-warn"
    };
  }

  return {
    status: "Inconclusiva",
    badgeClass: "is-demo"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}

function readClientIp(request) {
  const directIp = request.headers.get("CF-Connecting-IP");

  if (directIp) {
    return directIp.trim();
  }

  const forwarded = request.headers.get("X-Forwarded-For");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return "local-dev";
}

function getProviderWindowKey() {
  return formatDateInTimeZone(new Date(), PROVIDER_RESET_TIME_ZONE);
}

function formatDateInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

function normalizeUrl(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error("O link informado nao e uma URL valida.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Use um link http ou https.");
  }

  return parsed.toString();
}

async function fetchPageSnapshot(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "OrigemVerifier/1.0 (+HackaNav)",
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel abrir o link informado para analisar a noticia.");
  }

  const html = await response.text();
  const parsedUrl = new URL(url);

  return {
    url,
    domain: parsedUrl.hostname.replace(/^www\./, ""),
    title: readTitle(html),
    description: readMetaDescription(html),
    excerpt: extractReadableText(html)
  };
}

function readTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return collapseWhitespace(decodeHtml(match?.[1] || "Sem titulo detectado"));
}

function readMetaDescription(html) {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i)
    || html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i);
  return collapseWhitespace(decodeHtml(match?.[1] || "Sem descricao detectada"));
}

function extractReadableText(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  return collapseWhitespace(decodeHtml(cleaned)).slice(0, 7000);
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#8217;/gi, "'")
    .replace(/&#8220;/gi, '"')
    .replace(/&#8221;/gi, '"');
}

function buildSourceEvidencePrompt(url, pageData) {
  return [
    `Link analisado: ${url}`,
    `Dominio: ${pageData.domain}`,
    `Titulo extraido: ${pageData.title}`,
    `Descricao extraida: ${pageData.description}`,
    `Trecho extraido: ${pageData.excerpt}`,
    "Explique qual e a afirmacao principal e resuma as evidencias encontradas dentro e fora da pagina."
  ].join("\n\n");
}

function buildClassifierPrompt(url, pageData, groundedText, sources) {
  const sourcesText = sources.length
    ? sources.map((source) => `- ${source.title}: ${source.uri}`).join("\n")
    : "- Nenhuma referencia externa retornada pelo grounding.";

  return [
    `Link analisado: ${url}`,
    `Dominio: ${pageData.domain}`,
    `Titulo: ${pageData.title}`,
    `Descricao: ${pageData.description}`,
    `Trecho da pagina: ${pageData.excerpt}`,
    `Resumo grounded: ${groundedText || "Sem resumo grounded."}`,
    `Referencias grounded:\n${sourcesText}`,
    "Agora classifique em verdadeira, falsa ou inconclusiva e retorne apenas o JSON pedido."
  ].join("\n\n");
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export class IpRateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await request.json().catch(() => null);
    const scope = String(body?.scope || "").trim();
    const windowKey = String(body?.windowKey || "").trim();
    const limit = Number(body?.limit);

    if (!scope || !windowKey || !Number.isFinite(limit) || limit <= 0) {
      return jsonDurableResponse({ allowed: false, error: "Invalid rate limit payload." }, 400);
    }

    const storageKey = `${scope}:${windowKey}`;
    const record = await this.state.storage.get(storageKey);
    const currentCount = Number(record?.count) || 0;

    if (currentCount >= limit) {
      return jsonDurableResponse({
        allowed: false,
        limit,
        remaining: 0,
        count: currentCount
      });
    }

    const nextCount = currentCount + 1;
    await this.state.storage.put(storageKey, {
      count: nextCount,
      updatedAt: Date.now()
    });

    return jsonDurableResponse({
      allowed: true,
      limit,
      remaining: Math.max(0, limit - nextCount),
      count: nextCount
    });
  }
}

function jsonDurableResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

