const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_MEDIA_MODELS = [
  DEFAULT_MODEL,
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];
const DEFAULT_SOURCE_MODELS = [
  DEFAULT_MODEL,
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash"
];
const DEFAULT_IMAGE_DAILY_LIMIT = 100;
const DEFAULT_SOURCE_DAILY_LIMIT = 50;
const DEFAULT_BOT_DAILY_LIMIT = 80;
const DEFAULT_AUDIO_DAILY_LIMIT = 60;
const DEFAULT_VIDEO_DAILY_LIMIT = 40;
const PROVIDER_RESET_TIME_ZONE = "America/Los_Angeles";
const GEMINI_QUOTA_COOLDOWN_MS = 30 * 60 * 1000;
const GEMINI_INVALID_KEY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const GEMINI_HIGH_DEMAND_COOLDOWN_MS = 10 * 60 * 1000;
const GEMINI_UNSUPPORTED_MODEL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

let nextGeminiKeyIndex = 0;
const geminiKeyCooldowns = new Map();
const geminiModelCooldowns = new Map();

const MEDIA_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["ia", "autentico", "inconclusivo"]
    },
    confidence: {
      type: "integer",
      minimum: 0,
      maximum: 100
    },
    summary: {
      type: "string"
    },
    signals: {
      type: "array",
      items: {
        type: "string"
      }
    }
  },
  required: ["verdict", "confidence", "summary", "signals"]
};

const BOT_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["bot", "humano", "inconclusivo"]
    },
    confidence: {
      type: "integer",
      minimum: 0,
      maximum: 100
    },
    summary: {
      type: "string"
    },
    signals: {
      type: "array",
      items: {
        type: "string"
      }
    }
  },
  required: ["verdict", "confidence", "summary", "signals"]
};

const SOURCE_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["verdadeira", "falsa", "inconclusiva"]
    },
    confidence: {
      type: "integer",
      minimum: 0,
      maximum: 100
    },
    summary: {
      type: "string"
    },
    reasons: {
      type: "array",
      items: {
        type: "string"
      }
    }
  },
  required: ["verdict", "confidence", "summary", "reasons"]
};

const IMAGE_SYSTEM_PROMPT = [
  "Voce e um analista de autenticidade visual.",
  "Classifique a imagem em ia, autentico ou inconclusivo.",
  "Observe textura, maos, olhos, sombras, reflexos, perspectiva, texto, repeticao, recortes, contornos e coerencia espacial.",
  "confidence deve ser inteiro entre 0 e 100.",
  "signals deve listar de 3 a 5 sinais curtos e objetivos.",
  "summary deve explicar a decisao em portugues claro.",
  "Retorne apenas o JSON pedido."
].join(" ");

const AUDIO_SYSTEM_PROMPT = [
  "Voce e um analista forense de audio e musica.",
  "Classifique o arquivo em ia, autentico ou inconclusivo.",
  "Observe naturalidade do timbre, respiracao, transientes, repeticao, looping, ambiencia, ruido, colagens, artefatos espectrais, voz, instrumentacao e mixagem.",
  "confidence deve ser inteiro entre 0 e 100.",
  "signals deve listar de 3 a 5 sinais curtos e objetivos.",
  "summary deve explicar a decisao em portugues claro.",
  "Retorne apenas o JSON pedido."
].join(" ");

const VIDEO_SYSTEM_PROMPT = [
  "Voce e um analista forense de video.",
  "Classifique o video em ia, autentico ou inconclusivo.",
  "Observe consistencia temporal, labios, olhos, pele, reflexos, luz, sombras, fisica da cena, repeticoes, interpolacao, deformacoes e transicoes suspeitas.",
  "confidence deve ser inteiro entre 0 e 100.",
  "signals deve listar de 3 a 5 sinais curtos e objetivos.",
  "summary deve explicar a decisao em portugues claro.",
  "Retorne apenas o JSON pedido."
].join(" ");

const BOT_SYSTEM_PROMPT = [
  "Voce e um analista de autenticidade de perfis e contas online.",
  "Classifique a conta em bot, humano ou inconclusivo.",
  "Considere padrao do handle, excesso de numeros, legibilidade, aleatoriedade, rota do perfil, sinais de automacao e indicios de conta canonica.",
  "confidence deve ser inteiro entre 0 e 100.",
  "signals deve listar de 3 a 5 sinais curtos e objetivos.",
  "summary deve explicar a decisao em portugues claro.",
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

    if (!getGeminiApiKeys(env).length) {
      return jsonResponse({
        error: "GEMINI_API_KEY nao configurada no backend. Defina GEMINI_API_KEYS ou GEMINI_API_KEY."
      }, 500);
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

        return await handleMediaAnalysis(request, env, {
          scope: "image",
          fieldName: "image",
          label: "Imagem",
          prompt: IMAGE_SYSTEM_PROMPT,
          schema: MEDIA_SCHEMA,
          models: getGeminiModelCandidates(env, {
            listEnvName: "GEMINI_IMAGE_MODELS",
            singleEnvName: "GEMINI_IMAGE_MODEL",
            defaults: DEFAULT_MEDIA_MODELS
          }),
          maxSizeBytes: 8 * 1024 * 1024,
          expectedMimePrefix: "image/",
          defaultMimeType: "image/jpeg",
          userPrompt: "Analise esta imagem e devolva apenas o JSON solicitado."
        });
      }

      if (request.method === "POST" && url.pathname === "/api/analyze-audio") {
        const rateLimitResponse = await enforceRateLimit(
          request,
          env,
          "audio",
          getDailyLimit(env.AUDIO_DAILY_LIMIT, DEFAULT_AUDIO_DAILY_LIMIT)
        );

        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        return await handleMediaAnalysis(request, env, {
          scope: "audio",
          fieldName: "audio",
          label: "Musica",
          prompt: AUDIO_SYSTEM_PROMPT,
          schema: MEDIA_SCHEMA,
          models: getGeminiModelCandidates(env, {
            listEnvName: "GEMINI_AUDIO_MODELS",
            singleEnvName: "GEMINI_AUDIO_MODEL",
            defaults: DEFAULT_MEDIA_MODELS
          }),
          maxSizeBytes: 20 * 1024 * 1024,
          expectedMimePrefix: "audio/",
          defaultMimeType: "audio/mpeg",
          userPrompt: "Analise este audio ou musica e devolva apenas o JSON solicitado."
        });
      }

      if (request.method === "POST" && url.pathname === "/api/analyze-video") {
        const rateLimitResponse = await enforceRateLimit(
          request,
          env,
          "video",
          getDailyLimit(env.VIDEO_DAILY_LIMIT, DEFAULT_VIDEO_DAILY_LIMIT)
        );

        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        return await handleMediaAnalysis(request, env, {
          scope: "video",
          fieldName: "video",
          label: "Video",
          prompt: VIDEO_SYSTEM_PROMPT,
          schema: MEDIA_SCHEMA,
          models: getGeminiModelCandidates(env, {
            listEnvName: "GEMINI_VIDEO_MODELS",
            singleEnvName: "GEMINI_VIDEO_MODEL",
            defaults: DEFAULT_MEDIA_MODELS
          }),
          maxSizeBytes: 20 * 1024 * 1024,
          expectedMimePrefix: "video/",
          defaultMimeType: "video/mp4",
          userPrompt: "Analise este video e devolva apenas o JSON solicitado."
        });
      }

      if (request.method === "POST" && url.pathname === "/api/analyze-bot") {
        const rateLimitResponse = await enforceRateLimit(
          request,
          env,
          "bot",
          getDailyLimit(env.BOT_DAILY_LIMIT, DEFAULT_BOT_DAILY_LIMIT)
        );

        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        return await handleBotAnalysis(request, env);
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

async function handleMediaAnalysis(request, env, config) {
  const formData = await request.formData();
  const file = formData.get(config.fieldName);

  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonResponse({ error: `Envie um arquivo valido de ${config.label.toLowerCase()}.` }, 400);
  }

  if (!String(file.type || "").startsWith(config.expectedMimePrefix)) {
    return jsonResponse({ error: `O arquivo precisa ser um ${config.label.toLowerCase()}.` }, 400);
  }

  if (file.size > config.maxSizeBytes) {
    return jsonResponse({ error: `${config.label} deve ter no maximo ${formatBytes(config.maxSizeBytes)}.` }, 400);
  }

  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  const response = await callGemini(env, config.models, {
    systemInstruction: {
      parts: [{ text: config.prompt }]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: file.type || config.defaultMimeType,
              data: base64
            }
          },
          {
            text: config.userPrompt
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: config.schema,
      temperature: 0.2
    }
  });

  const analysis = parseGeminiJson(response.data);
  const verdictMap = mapMediaVerdict(analysis.verdict);

  return jsonResponse({
    status: verdictMap.status,
    badgeClass: verdictMap.badgeClass,
    label: `${config.label}: ${file.name} - ${formatBytes(file.size)}`,
    confidence: normalizeConfidence(analysis.confidence),
    text: analysis.summary,
    points: normalizeList(analysis.signals),
    model: response.model
  });
}

async function handleBotAnalysis(request, env) {
  const body = await request.json().catch(() => null);
  const value = String(body?.value || body?.link || "").trim();

  if (!value) {
    return jsonResponse({ error: "Envie um link, handle ou identificador para verificar o bot." }, 400);
  }

  const response = await callGemini(env, getGeminiModelCandidates(env, {
    listEnvName: "GEMINI_BOT_MODELS",
    singleEnvName: "GEMINI_BOT_MODEL",
    defaults: DEFAULT_MEDIA_MODELS
  }), {
    systemInstruction: {
      parts: [{ text: BOT_SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Analise o perfil abaixo e devolva apenas o JSON pedido.",
              `Perfil ou handle: ${value}`
            ].join("\n\n")
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: BOT_SCHEMA,
      temperature: 0.1
    }
  });

  const analysis = parseGeminiJson(response.data);
  const verdictMap = mapBotVerdict(analysis.verdict);

  return jsonResponse({
    status: verdictMap.status,
    badgeClass: verdictMap.badgeClass,
    label: "Perfil analisado",
    confidence: normalizeConfidence(analysis.confidence),
    text: analysis.summary,
    points: normalizeList(analysis.signals),
    model: response.model
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
  const modelCandidates = getGeminiModelCandidates(env, {
    listEnvName: "GEMINI_SOURCE_MODELS",
    singleEnvName: "GEMINI_SOURCE_MODEL",
    defaults: DEFAULT_SOURCE_MODELS
  });

  const groundedResponse = await callGemini(env, modelCandidates, {
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

  const groundedText = getGeminiText(groundedResponse.data);
  const groundingMeta = getGroundingMetadata(groundedResponse.data);

  const classifierResponse = await callGemini(env, modelCandidates, {
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
      responseJsonSchema: SOURCE_SCHEMA,
      temperature: 0.1
    }
  });

  const analysis = parseGeminiJson(classifierResponse.data);
  const verdictMap = mapSourceVerdict(analysis.verdict);

  return jsonResponse({
    status: verdictMap.status,
    badgeClass: verdictMap.badgeClass,
    label: `Dominio: ${pageData.domain}`,
    confidence: normalizeConfidence(analysis.confidence),
    text: analysis.summary,
    points: mergeReasonsWithSources(analysis.reasons, groundingMeta),
    model: classifierResponse.model
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
  const scopeLabels = {
    image: "imagem",
    source: "fonte",
    bot: "bot",
    audio: "musica",
    video: "video"
  };

  return jsonResponse({
    error: `Limite diario por IP atingido para analise de ${scopeLabels[scope] || scope}. Tente novamente apos ${resetLabel}.`,
    limit,
    remaining
  }, 429);
}

async function callGemini(env, models, payload) {
  const configuredKeys = getGeminiApiKeys(env);
  const configuredModels = getGeminiModelOrder(
    Array.isArray(models) && models.length ? models : [DEFAULT_MODEL]
  );

  if (!configuredKeys.length) {
    throw new Error("Nenhuma chave Gemini configurada no backend.");
  }

  if (!configuredModels.length) {
    throw new Error("Nenhum modelo Gemini configurado no backend.");
  }

  let lastErrorMessage = "Falha ao consultar a API Gemini.";
  let lastFailureReason = "";

  for (const model of configuredModels) {
    const orderedKeys = getGeminiKeyOrder(configuredKeys);

    for (const apiKey of orderedKeys) {
      let response;

      try {
        response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify(payload)
        });
      } catch (error) {
        throw new Error("Nao foi possivel conectar a API Gemini.");
      }

      const data = await response.json().catch(() => null);

      if (response.ok) {
        markGeminiKeySuccess(apiKey, configuredKeys);
        clearGeminiModelCooldown(model);

        return {
          data,
          model
        };
      }

      const interpretedError = interpretGeminiError(response, data);
      lastErrorMessage = interpretedError.message;
      lastFailureReason = interpretedError.reason;

      if (interpretedError.retryWithAnotherKey) {
        markGeminiKeyCooldown(apiKey, interpretedError.cooldownMs);
      }

      if (interpretedError.retryWithAnotherModel) {
        markGeminiModelCooldown(model, interpretedError.modelCooldownMs);
        break;
      }

      if (interpretedError.retryWithAnotherKey && orderedKeys.length > 1) {
        continue;
      }

      throw new Error(interpretedError.message);
    }

    if (!hasActiveGeminiKey(configuredKeys) && lastFailureReason !== "high_demand" && lastFailureReason !== "unsupported_model") {
      break;
    }
  }

  if (lastFailureReason === "high_demand") {
    throw new Error("Os modelos Gemini configurados estao em alta demanda no momento. Tente novamente em instantes.");
  }

  if (lastFailureReason === "unsupported_model") {
    throw new Error("Os modelos Gemini configurados nao estao disponiveis para este tipo de analise.");
  }

  throw new Error(lastErrorMessage);
}

function interpretGeminiError(response, data) {
  const status = Number(response?.status) || 500;
  const message = data?.error?.message || "Falha ao consultar a API Gemini.";
  const normalizedMessage = String(message).toLowerCase();

  if (normalizedMessage.includes("api key not valid")) {
    return {
      message: "Uma das chaves do Gemini e invalida. Trocando para a proxima chave configurada.",
      reason: "invalid_key",
      retryWithAnotherKey: true,
      retryWithAnotherModel: false,
      cooldownMs: GEMINI_INVALID_KEY_COOLDOWN_MS
    };
  }

  if (
    normalizedMessage.includes("quota")
    || normalizedMessage.includes("resource_exhausted")
    || normalizedMessage.includes("rate limit")
  ) {
    return {
      message: "A cota gratuita do Gemini foi excedida para a chave atual. Tentando outra chave configurada.",
      reason: "quota",
      retryWithAnotherKey: true,
      retryWithAnotherModel: false,
      cooldownMs: GEMINI_QUOTA_COOLDOWN_MS
    };
  }

  if (
    normalizedMessage.includes("currently experiencing high demand")
    || normalizedMessage.includes("high demand")
    || normalizedMessage.includes("temporarily unavailable")
    || normalizedMessage.includes("model is overloaded")
    || normalizedMessage.includes("unavailable")
    || status === 503
  ) {
    return {
      message: "O modelo atual do Gemini esta em alta demanda. Tentando um fallback menos concorrido.",
      reason: "high_demand",
      retryWithAnotherKey: false,
      retryWithAnotherModel: true,
      cooldownMs: 0,
      modelCooldownMs: GEMINI_HIGH_DEMAND_COOLDOWN_MS
    };
  }

  if (
    normalizedMessage.includes("not found for api version")
    || normalizedMessage.includes("is not found")
    || normalizedMessage.includes("is not supported for generatecontent")
    || normalizedMessage.includes("unsupported model")
    || (status === 404 && normalizedMessage.includes("model"))
  ) {
    return {
      message: "O modelo Gemini configurado nao esta disponivel para este metodo. Tentando outro modelo.",
      reason: "unsupported_model",
      retryWithAnotherKey: false,
      retryWithAnotherModel: true,
      cooldownMs: 0,
      modelCooldownMs: GEMINI_UNSUPPORTED_MODEL_COOLDOWN_MS
    };
  }

  if (
    normalizedMessage.includes("api_key_service_blocked")
    || normalizedMessage.includes("permission")
    || normalizedMessage.includes("permission_denied")
  ) {
    return {
      message: "Uma das chaves do Gemini nao tem permissao para este modelo ou metodo. Trocando para a proxima chave.",
      reason: "permission",
      retryWithAnotherKey: true,
      retryWithAnotherModel: false,
      cooldownMs: GEMINI_INVALID_KEY_COOLDOWN_MS
    };
  }

  return {
    message,
    reason: "generic",
    retryWithAnotherKey: false,
    retryWithAnotherModel: false,
    cooldownMs: 0,
    modelCooldownMs: 0
  };
}

function parseGeminiJson(response) {
  const rawText = getGeminiText(response);

  try {
    return JSON.parse(extractJsonPayload(rawText));
  } catch (error) {
    throw new Error("Nao foi possivel interpretar a resposta JSON do Gemini.");
  }
}

function extractJsonPayload(rawText) {
  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return rawText.slice(firstBrace, lastBrace + 1);
  }

  return rawText.trim();
}

function getGeminiText(response, options = {}) {
  const candidate = response?.candidates?.[0];
  const parts = candidate?.content?.parts;

  if (Array.isArray(parts)) {
    const text = parts
      .map((part) => part?.text || "")
      .join("\n")
      .trim();

    if (text) {
      return text;
    }
  }

  if (options.allowEmpty) {
    return "";
  }

  throw new Error(extractGeminiCandidateError(response));
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

function extractGeminiCandidateError(response) {
  const blockReason = response?.promptFeedback?.blockReason;

  if (blockReason) {
    return `O Gemini bloqueou a solicitacao antes de gerar resposta (${String(blockReason).toLowerCase()}).`;
  }

  const candidate = response?.candidates?.[0];
  const finishReason = candidate?.finishReason;

  if (finishReason === "SAFETY") {
    return "O Gemini bloqueou a resposta por politica de seguranca.";
  }

  if (finishReason === "MAX_TOKENS") {
    return "O Gemini interrompeu a resposta antes de concluir o JSON esperado.";
  }

  if (finishReason) {
    return `O Gemini encerrou a resposta sem conteudo utilizavel (${String(finishReason).toLowerCase()}).`;
  }

  return "O Gemini nao retornou conteudo utilizavel.";
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

function getGeminiApiKeys(env) {
  const rawValues = [env.GEMINI_API_KEYS, env.GEMINI_API_KEY]
    .filter((value) => typeof value === "string" && value.trim());

  const parsedKeys = rawValues.flatMap((value) => parseDelimitedConfigValue(value));
  return [...new Set(parsedKeys)];
}

function getGeminiModelCandidates(env, options) {
  const routeModels = parseDelimitedConfigValue(env[options.listEnvName]);

  if (routeModels.length) {
    return [...new Set(routeModels)];
  }

  const preferredModels = parseDelimitedConfigValue(env[options.singleEnvName]);
  const sharedModels = parseDelimitedConfigValue(env.GEMINI_MODELS || env.GEMINI_MODEL);

  return [...new Set([...preferredModels, ...sharedModels, ...options.defaults])];
}

function parseDelimitedConfigValue(rawValue) {
  const trimmed = String(rawValue || "").trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || "").trim())
          .filter(Boolean);
      }
    } catch (error) {
      // Fall back to line/comma parsing below.
    }
  }

  return trimmed
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getGeminiKeyOrder(keys) {
  if (!keys.length) {
    return [];
  }

  const rotated = [];

  for (let index = 0; index < keys.length; index += 1) {
    rotated.push(keys[(nextGeminiKeyIndex + index) % keys.length]);
  }

  const now = Date.now();
  const available = [];
  const coolingDown = [];

  for (const key of rotated) {
    const cooldownUntil = geminiKeyCooldowns.get(key) || 0;

    if (cooldownUntil > now) {
      coolingDown.push(key);
      continue;
    }

    available.push(key);
  }

  return [...available, ...coolingDown];
}

function getGeminiModelOrder(models) {
  if (!models.length) {
    return [];
  }

  const now = Date.now();
  const available = [];
  const coolingDown = [];

  for (const model of models) {
    const cooldownUntil = geminiModelCooldowns.get(model) || 0;

    if (cooldownUntil > now) {
      coolingDown.push(model);
      continue;
    }

    available.push(model);
  }

  return [...available, ...coolingDown];
}

function hasActiveGeminiKey(keys) {
  const now = Date.now();
  return keys.some((key) => (geminiKeyCooldowns.get(key) || 0) <= now);
}

function markGeminiKeySuccess(apiKey, configuredKeys) {
  geminiKeyCooldowns.delete(apiKey);

  const successfulIndex = configuredKeys.indexOf(apiKey);

  if (successfulIndex >= 0) {
    nextGeminiKeyIndex = (successfulIndex + 1) % configuredKeys.length;
  }
}

function markGeminiKeyCooldown(apiKey, cooldownMs) {
  geminiKeyCooldowns.set(apiKey, Date.now() + cooldownMs);
}

function markGeminiModelCooldown(model, cooldownMs) {
  geminiModelCooldowns.set(model, Date.now() + cooldownMs);
}

function clearGeminiModelCooldown(model) {
  geminiModelCooldowns.delete(model);
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

function mapMediaVerdict(verdict) {
  if (verdict === "ia") {
    return {
      status: "IA",
      badgeClass: "is-warn"
    };
  }

  if (verdict === "autentico") {
    return {
      status: "Autentico",
      badgeClass: "is-ok"
    };
  }

  return {
    status: "Inconclusivo",
    badgeClass: "is-demo"
  };
}

function mapBotVerdict(verdict) {
  if (verdict === "bot") {
    return {
      status: "Bot",
      badgeClass: "is-warn"
    };
  }

  if (verdict === "humano") {
    return {
      status: "Humano",
      badgeClass: "is-ok"
    };
  }

  return {
    status: "Inconclusivo",
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
