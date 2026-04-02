(function () {
  const isLocalHost = ["127.0.0.1", "localhost"].includes(window.location.hostname);

  window.HACKANAV_CONFIG = window.HACKANAV_CONFIG || {
    imageEndpoint: isLocalHost
      ? "http://127.0.0.1:8787/api/analyze-image"
      : "https://origem-api.realoufake.workers.dev/api/analyze-image",
    sourceEndpoint: isLocalHost
      ? "http://127.0.0.1:8787/api/analyze-source"
      : "https://origem-api.realoufake.workers.dev/api/analyze-source"
  };
})();
