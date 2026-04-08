(function () {
  const params = new URLSearchParams(window.location.search);
  const customApi = params.get("api");
  const forceLocal = params.get("local") === "1";
  const isLocalHost = ["127.0.0.1", "localhost"].includes(window.location.hostname);
  const isLocalContext = forceLocal || isLocalHost;
  const baseUrl = customApi || (isLocalContext
    ? "http://127.0.0.1:8787"
    : "https://origem-api.contageometrydash144.workers.dev");

  window.HACKANAV_CONFIG = window.HACKANAV_CONFIG || {
    imageEndpoint: `${baseUrl}/api/analyze-image`,
    sourceEndpoint: `${baseUrl}/api/analyze-source`,
    botEndpoint: `${baseUrl}/api/analyze-bot`,
    audioEndpoint: `${baseUrl}/api/analyze-audio`,
    videoEndpoint: `${baseUrl}/api/analyze-video`
  };
})();
