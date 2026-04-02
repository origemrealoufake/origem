const config = window.HACKANAV_CONFIG || {};

const tabButtons = Array.from(document.querySelectorAll("[data-tab-button]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
const navTabLinks = Array.from(document.querySelectorAll('a[href="#imagem"], a[href="#fonte"]'));

const uploadBox = document.getElementById("upload-box");
const imageInput = document.getElementById("image-input");
const imagePreview = document.getElementById("image-preview");
const imageButton = document.getElementById("analyze-image-button");
const imageMessage = document.getElementById("image-message");
const imageBadge = document.getElementById("image-badge");
const imageLabel = document.getElementById("image-label");
const imageText = document.getElementById("image-text");
const imagePoints = document.getElementById("image-points");

const sourceInput = document.getElementById("source-input");
const sourceButton = document.getElementById("analyze-source-button");
const sourceMessage = document.getElementById("source-message");
const sourceBadge = document.getElementById("source-badge");
const sourceLabel = document.getElementById("source-label");
const sourceText = document.getElementById("source-text");
const sourcePoints = document.getElementById("source-points");

let selectedImage = null;
let previewUrl = "";

function activateTab(target) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabButton === target;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.tabPanel === target);
  });
}

function setFeedback(node, message, tone) {
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
  elements.badge.textContent = data.status;
  elements.badge.className = `result-badge ${data.badgeClass}`;
  elements.label.textContent = data.label;
  elements.text.textContent = data.text;
  renderPoints(elements.points, data.points);
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

function showImagePreview(file) {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }

  previewUrl = URL.createObjectURL(file);
  imagePreview.innerHTML = `
    <div class="preview-frame">
      <img src="${previewUrl}" alt="Imagem enviada para analise" />
    </div>
    <div class="preview-meta">
      <strong>${file.name}</strong>
      <p>${file.type || "Formato nao identificado"} • ${formatSize(file.size)}</p>
    </div>
  `;
}

function resetImagePreview() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = "";
  }

  imagePreview.innerHTML = `
    <div class="empty-state">
      <div>
        <strong>Nenhuma imagem enviada</strong>
        <p>A visualizacao do arquivo aparece aqui.</p>
      </div>
    </div>
  `;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "A requisicao falhou.");
  }

  return data;
}

function handleSelectedImage(file) {
  if (!file) {
    selectedImage = null;
    resetImagePreview();
    return;
  }

  selectedImage = file;
  showImagePreview(file);
  setFeedback(imageMessage, "", "neutral");
}

function ensureConfigured(endpoint, messageNode, typeLabel) {
  if (endpoint && !endpoint.includes("SEU-WORKER")) {
    return true;
  }

  setFeedback(
    messageNode,
    `Backend da analise de ${typeLabel} nao configurado. Ajuste o arquivo config.js com a URL da API.`,
    "error"
  );
  return false;
}

const imageResultElements = {
  badge: imageBadge,
  label: imageLabel,
  text: imageText,
  points: imagePoints
};

const sourceResultElements = {
  badge: sourceBadge,
  label: sourceLabel,
  text: sourceText,
  points: sourcePoints
};

tabButtons.forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tabButton));
});

navTabLinks.forEach((link) => {
  link.addEventListener("click", () => {
    const target = link.getAttribute("href") === "#fonte" ? "fonte" : "imagem";
    activateTab(target);
  });
});

if (uploadBox) {
  ["dragenter", "dragover"].forEach((eventName) => {
    uploadBox.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadBox.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadBox.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadBox.classList.remove("is-dragging");
    });
  });

  uploadBox.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      handleSelectedImage(file);
    }
  });
}

if (imageInput) {
  imageInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    handleSelectedImage(file);
  });
}

if (imageButton) {
  imageButton.addEventListener("click", async () => {
    if (!selectedImage) {
      setFeedback(imageMessage, "Envie uma imagem para iniciar a analise.", "error");
      return;
    }

    if (!ensureConfigured(config.imageEndpoint, imageMessage, "imagem")) {
      return;
    }

    imageButton.disabled = true;
    imageButton.textContent = "Analisando...";
    setFeedback(imageMessage, "Processando imagem com a IA...", "success");

    try {
      const formData = new FormData();
      formData.append("image", selectedImage);

      const data = await requestJson(config.imageEndpoint, {
        method: "POST",
        body: formData
      });

      setResult(imageResultElements, data);
      setFeedback(imageMessage, "Analise da imagem concluida.", "success");
    } catch (error) {
      setFeedback(imageMessage, error.message || "Falha ao analisar imagem.", "error");
    } finally {
      imageButton.disabled = false;
      imageButton.textContent = "Analisar imagem";
    }
  });
}

if (sourceButton) {
  sourceButton.addEventListener("click", async () => {
    const link = sourceInput.value.trim();

    if (!link) {
      setFeedback(sourceMessage, "Cole um link para verificar a fonte.", "error");
      return;
    }

    if (!ensureConfigured(config.sourceEndpoint, sourceMessage, "fonte")) {
      return;
    }

    sourceButton.disabled = true;
    sourceButton.textContent = "Verificando...";
    setFeedback(sourceMessage, "Lendo a noticia e comparando com outras referencias...", "success");

    try {
      const data = await requestJson(config.sourceEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ link })
      });

      setResult(sourceResultElements, data);
      setFeedback(sourceMessage, "Verificacao da fonte concluida.", "success");
    } catch (error) {
      setFeedback(sourceMessage, error.message || "Falha ao verificar a fonte.", "error");
    } finally {
      sourceButton.disabled = false;
      sourceButton.textContent = "Verificar fonte";
    }
  });
}

activateTab("imagem");
resetImagePreview();
