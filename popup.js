const DEFAULT_URL   = 'https://n8n-n8n.stlrvo.easypanel.host/webhook/e3dfce07-c096-4228-94bb-2a0f09d9f48c';
const DEFAULT_TOKEN = 'secret';

const urlInput   = document.getElementById('webhook-url');
const tokenInput = document.getElementById('token');
const saveBtn    = document.getElementById('save');
const msgEl      = document.getElementById('msg');

chrome.storage.local.get(['svext_webhook_url', 'svext_token'], (result) => {
  urlInput.value   = result.svext_webhook_url || DEFAULT_URL;
  tokenInput.value = result.svext_token       || DEFAULT_TOKEN;
});

saveBtn.addEventListener('click', () => {
  const url   = urlInput.value.trim();
  const token = tokenInput.value.trim();

  if (!url) {
    msgEl.style.color = '#c62828';
    msgEl.textContent = 'URL não pode estar vazia.';
    return;
  }

  chrome.storage.local.set({ svext_webhook_url: url, svext_token: token }, () => {
    msgEl.style.color = '#2e7d32';
    msgEl.textContent = 'Configurações salvas!';
    setTimeout(() => { msgEl.textContent = ''; }, 2500);
  });
});
