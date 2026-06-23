// ============================================================
// VetSmart Extension — background.js (service worker)
// Executa o fetch para o n8n fora do CSP da página host.
// Content scripts enviam mensagens; este worker faz a requisição.
// ============================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'SEND_TO_N8N') return false;

  const { url, payload, timeoutMs } = message;
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs || 10000);

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then((response) => {
      clearTimeout(timerId);
      if (response.status === 200 || response.status === 201) {
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: `HTTP ${response.status}` });
      }
    })
    .catch((err) => {
      clearTimeout(timerId);
      if (err.name === 'AbortError') {
        sendResponse({ ok: false, error: 'timeout (10s)' });
      } else {
        sendResponse({ ok: false, error: err.message || 'sem conexão' });
      }
    });

  return true; // mantém o canal aberto para resposta assíncrona
});
