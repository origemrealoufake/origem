const config = window.HACKANAV_CONFIG || {};

const mediaState = {
  image: { file: null, url: "" },
  audio: { file: null, url: "" },
  video: { file: null, url: "" }
};

document.addEventListener("DOMContentLoaded", () => {
  initVerifyTabs();
  initSourceAnalyzer();
  initBotAnalyzer();
  initUploadAnalyzer("image", "image/", "imagem");
  initUploadAnalyzer("audio", "audio/", "\u00e1udio");
  initUploadAnalyzer("video", "video/", "v\u00eddeo");
  activateTabFromHashOrDefault();
});

function initVerifyTabs() {
  const buttons = Array.from(document.querySelectorAll("[data-tab-button]"));
  const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));

  if (!buttons.length || !panels.length) {
    return;
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tabButton));
  });

  window.addEventListener("hashchange", () => {
    const target = readHashTarget();

    if (target) {
      activateTab(target, false);
    }
  });
}

function activateTab(target, updateHash = true) {
  const buttons = Array.from(document.querySelectorAll("[data-tab-button]"));
  const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));

  if (!buttons.length || !panels.length) {
    return;
  }

  buttons.forEach((button) => {
    const isActive = button.dataset.tabButton === target;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.tabPanel === target);
  });

  if (updateHash) {
    history.replaceState(null, "", `#${target}`);
  }
}

function activateTabFromHashOrDefault() {
  const buttons = Array.from(document.querySelectorAll("[data-tab-button]"));
  const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));

  if (!buttons.length || !panels.length) {
    return;
  }

  const target = readHashTarget() || buttons[0].dataset.tabButton || panels[0].dataset.tabPanel;
  activateTab(target, Boolean(readHashTarget()));
}

function readHashTarget() {
  const target = window.location.hash.replace("#", "").trim();

  if (!target) {
    return "";
  }

  const panel = document.querySelector(`[data-tab-panel="${target}"]`);
  return panel ? target : "";
}

function initSourceAnalyzer() {
  const input = document.getElementById("source-input");
  const button = document.getElementById("analyze-source-button");
  const message = document.getElementById("source-message");
  const result = getResultElements("source");

  if (!input || !button || !message || !result) {
    return;
  }

  button.addEventListener("click", async () => {
    const link = input.value.trim();

    if (!link) {
      setFeedback(message, "Cole um link para verificar a fonte.", "error");
      return;
    }

    if (!ensureConfigured(config.sourceEndpoint, message, "fonte")) {
      return;
    }

    button.disabled = true;
    button.textContent = "Verificando...";
    setFeedback(message, "Lendo a p\u00e1gina e cruzando refer\u00eancias com o Gemini...", "success");

    try {
      const data = await requestJson(config.sourceEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ link })
      });

      setResult(result, data);
      setFeedback(message, "Verifica\u00e7\u00e3o da fonte conclu\u00edda.", "success");
    } catch (error) {
      if (error?.status === 404) {
        setFeedback(
          message,
          "A rota Gemini de fonte ainda n\u00e3o foi publicada no worker. Publique o backend para usar esta aba.",
          "error"
        );
        return;
      }

      setFeedback(message, error.message || "Falha ao verificar a fonte.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Verificar fonte";
    }
  });
}

function initBotAnalyzer() {
  const input = document.getElementById("bot-input");
  const button = document.getElementById("analyze-bot-button");
  const message = document.getElementById("bot-message");
  const result = getResultElements("bot");

  if (!input || !button || !message || !result) {
    return;
  }

  button.addEventListener("click", async () => {
    const value = input.value.trim();

    if (!value) {
      setFeedback(message, "Cole um link, @ ou nome para verificar.", "error");
      return;
    }

    if (!ensureConfigured(config.botEndpoint, message, "bot")) {
      return;
    }

    button.disabled = true;
    button.textContent = "Analisando...";
    setFeedback(message, "Lendo os sinais estruturais do perfil com o Gemini...", "success");

    try {
      const data = await requestJson(config.botEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ value })
      });

      setResult(result, data);
      setFeedback(message, "An\u00e1lise do bot conclu\u00edda.", "success");
    } catch (error) {
      if (error?.status === 404) {
        setFeedback(
          message,
          "A rota Gemini de bot ainda n\u00e3o foi publicada no worker. Publique o backend para usar esta aba.",
          "error"
        );
        return;
      }

      setFeedback(message, error.message || "Falha ao analisar o perfil.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Analisar bot";
    }
  });
}

function initUploadAnalyzer(type, mimePrefix, typeLabel) {
  const input = document.getElementById(`${type}-input`);
  const upload = document.getElementById(`${type}-upload`);
  const preview = document.getElementById(`${type}-preview`);
  const button = document.getElementById(`analyze-${type}-button`);
  const message = document.getElementById(`${type}-message`);
  const result = getResultElements(type);

  if (!input || !upload || !preview || !button || !message || !result) {
    return;
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    upload.addEventListener(eventName, (event) => {
      event.preventDefault();
      upload.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    upload.addEventListener(eventName, (event) => {
      event.preventDefault();
      upload.classList.remove("is-dragging");
    });
  });

  upload.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];

    if (file) {
      handleSelectedUpload(type, file, preview, message, typeLabel);
    }
  });

  input.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    handleSelectedUpload(type, file, preview, message, typeLabel);
  });

  button.addEventListener("click", async () => {
    const file = mediaState[type].file;

    if (!file) {
      setFeedback(message, `Envie um arquivo de ${typeLabel} para iniciar a an\u00e1lise.`, "error");
      return;
    }

    if (!String(file.type || "").startsWith(mimePrefix)) {
      setFeedback(message, `O arquivo enviado n\u00e3o parece ser de ${typeLabel}.`, "error");
      return;
    }

    if (!ensureConfigured(config[`${type}Endpoint`], message, typeLabel)) {
      return;
    }

    button.disabled = true;
    button.textContent = "Analisando...";
    setFeedback(message, `Processando ${typeLabel} com o Gemini...`, "success");

    try {
      const formData = new FormData();
      formData.append(type, file);

      const data = await requestJson(config[`${type}Endpoint`], {
        method: "POST",
        body: formData
      });

      setResult(result, data);
      setFeedback(message, `An\u00e1lise de ${typeLabel} conclu\u00edda.`, "success");
    } catch (error) {
      if (error?.status === 404) {
        setFeedback(
          message,
          `A rota Gemini de ${typeLabel} ainda n\u00e3o foi publicada no worker. Publique o backend para usar esta aba.`,
          "error"
        );
        return;
      }

      setFeedback(message, error.message || `Falha ao analisar ${typeLabel}.`, "error");
    } finally {
      button.disabled = false;
      button.textContent = `Analisar ${capitalize(typeLabel)}`;
    }
  });
}

function getResultElements(prefix) {
  const badge = document.getElementById(`${prefix}-badge`);
  const label = document.getElementById(`${prefix}-label`);
  const confidence = document.getElementById(`${prefix}-confidence`);
  const text = document.getElementById(`${prefix}-text`);
  const points = document.getElementById(`${prefix}-points`);

  if (!badge || !label || !confidence || !text || !points) {
    return null;
  }

  return { badge, label, confidence, text, points };
}

function setFeedback(node, message, tone) {
  if (!node) {
    return;
  }

  node.textContent = message;
  node.classList.remove("is-error", "is-success");

  if (tone === "error") {
    node.classList.add("is-error");
  }

  if (tone === "success") {
    node.classList.add("is-success");
  }
}

function renderPoints(listNode, points) {
  const items = Array.isArray(points) && points.length ? points : ["Nenhum detalhe adicional retornado."];
  listNode.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function setResult(elements, data) {
  if (!elements) {
    return;
  }

  elements.badge.textContent = data.status || "Conclu\u00eddo";
  elements.badge.className = `result-badge ${data.badgeClass || "is-demo"}`;
  elements.label.textContent = data.label || "An\u00e1lise conclu\u00edda.";
  elements.confidence.textContent = `Confian\u00e7a: ${Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 0} de 100.`;
  elements.text.textContent = data.text || "Sem resumo adicional.";
  renderPoints(elements.points, data.points);
}

async function requestJson(url, options) {
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    const isLocalApi =
      String(url || "").includes("127.0.0.1:8787") || String(url || "").includes("localhost:8787");
    const message = isLocalApi
      ? "N\u00e3o foi poss\u00edvel conectar ao worker local do Gemini em 127.0.0.1:8787."
      : "N\u00e3o foi poss\u00edvel conectar \u00e0 API Gemini publicada.";
    const networkError = new Error(message);
    networkError.cause = error;
    throw networkError;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "A requisi\u00e7\u00e3o falhou.");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function ensureConfigured(endpoint, messageNode, typeLabel) {
  if (endpoint && !endpoint.includes("SEU-WORKER")) {
    return true;
  }

  setFeedback(
    messageNode,
    `Backend da an\u00e1lise de ${typeLabel} n\u00e3o configurado. Ajuste o arquivo config.js com a URL da API.`,
    "error"
  );

  return false;
}

function handleSelectedUpload(type, file, previewNode, messageNode, typeLabel) {
  if (!file) {
    mediaState[type].file = null;
    resetPreview(type, previewNode, typeLabel);
    return;
  }

  clearObjectUrl(type);
  mediaState[type].file = file;
  mediaState[type].url = URL.createObjectURL(file);
  renderPreview(type, file, previewNode, mediaState[type].url, typeLabel);
  setFeedback(messageNode, "", "neutral");
}

function renderPreview(type, file, previewNode, url, typeLabel) {
  let mediaMarkup = "";

  if (type === "image") {
    mediaMarkup = `<img src="${url}" alt="Arquivo enviado para an\u00e1lise" />`;
  } else if (type === "audio") {
    mediaMarkup = `<audio controls src="${url}"></audio>`;
  } else if (type === "video") {
    mediaMarkup = `<video controls playsinline src="${url}"></video>`;
  }

  previewNode.innerHTML = `
    <div class="preview-frame">
      ${mediaMarkup}
    </div>
    <div class="preview-meta">
      <strong>${file.name}</strong>
      <p>${file.type || "Formato n\u00e3o identificado"} - ${formatSize(file.size)} - ${capitalize(typeLabel)}</p>
    </div>
  `;
}

function resetPreview(type, previewNode, typeLabel) {
  clearObjectUrl(type);

  previewNode.innerHTML = `
    <div class="empty-state">
      <div>
        <strong>Nenhum arquivo enviado</strong>
        <p>A visualiza\u00e7\u00e3o do ${typeLabel} aparece aqui.</p>
      </div>
    </div>
  `;
}

function clearObjectUrl(type) {
  if (mediaState[type]?.url) {
    URL.revokeObjectURL(mediaState[type].url);
    mediaState[type].url = "";
  }
}

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function capitalize(value) {
  return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
}
