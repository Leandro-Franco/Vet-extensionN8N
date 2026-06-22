// ============================================================
// VetSmart Extension — content.js
// Captura dados de atendimento clínico no SimplesVet e envia
// para n8n webhook. Somente ativo para KAMILE TORRES.
// ============================================================

const LOG = '[SimplesVetExt]';
const PAYING_VET = 'KAMILE TORRES';
const PANEL_ID = 'svext-panel';
const WEBHOOK_TIMEOUT_MS = 10000;

// Defaults — overridden by values saved in popup settings
let WEBHOOK_URL = 'http://localhost:5678/webhook-test/teste-json-mile';
let TOKEN = 'secret';

// ============================================================
// State machine
// ============================================================

const STATES = {
  IDLE: 'IDLE',
  AGUARDANDO_CAPTURA: 'AGUARDANDO_CAPTURA',
  CAPTURADO: 'CAPTURADO',
  ENVIANDO: 'ENVIANDO',
  ENVIADO: 'ENVIADO',
  ERRO: 'ERRO',
};

let currentState = STATES.IDLE;
let vetName = null;
let isSending = false;
let isMinimized = false;

// Track attached observers/listeners to avoid duplicates
let navigationObserver = null;
let tatObserverAttached = false;
let salvarObserverAttached = false;

function setState(newState) {
  console.log(`${LOG} Estado: ${currentState} → ${newState}`);
  currentState = newState;
  updatePanelUI();
}

// ============================================================
// Username normalization
// ============================================================

function normalizeVeterinarianName(usernameText) {
  if (!usernameText) return null;
  const firstPart = usernameText.split('|')[0].trim().toUpperCase();
  if (firstPart === 'KAMILE TORRES') return 'KAMILE TORRES';
  if (firstPart === 'KAMILE') return 'KAMILE TORRES';
  return null;
}

// ============================================================
// DOM utilities
// ============================================================

function waitForElement(selector, timeout = 5000, root = document) {
  return new Promise((resolve, reject) => {
    const el = root.querySelector(selector);
    if (el) { resolve(el); return; }
    const obs = new MutationObserver(() => {
      const found = root.querySelector(selector);
      if (found) { obs.disconnect(); resolve(found); }
    });
    obs.observe(root.body || root.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      reject(new Error(`Timeout waiting for: ${selector}`));
    }, timeout);
  });
}

function normalizeText(text) {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ').toUpperCase();
}

function todayFormatted() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${now.getFullYear()}`;
}

// ============================================================
// Data extraction
// ============================================================

function extractPacienteProntuario() {
  const span = document.querySelector('#divDadosAnimal');
  if (!span) return { paciente: '', prontuario: '' };

  const fichaSpan = span.querySelector('.ficha');
  let prontuario = '';
  if (fichaSpan) {
    prontuario = fichaSpan.textContent.replace(/[()]/g, '').trim();
  }

  const clone = span.cloneNode(true);
  const fichaClone = clone.querySelector('.ficha');
  if (fichaClone) fichaClone.remove();
  const paciente = normalizeText(clone.textContent);

  return { paciente, prontuario };
}

function extractSexo() {
  const candidates = document.querySelectorAll('.span6.sepH_b, .sepH_b');
  for (const el of candidates) {
    const text = el.textContent || '';
    if (/macho/i.test(text)) return 'MACHO';
    if (/f[eê]mea|feminino/i.test(text)) return 'FÊMEA';
  }
  return '';
}

function normalizarEspecie(src) {
  const s = (src || '').toLowerCase();
  if (/c[aã]o|canino|canina/.test(s)) return 'CANINA';
  if (/gato|felino|felina/.test(s)) return 'FELINA';
  return '';
}

function extractEspecie() {
  const img = document.querySelector('#btn_alterarfoto');
  if (!img) return '';
  return normalizarEspecie(img.getAttribute('src') || '');
}

function extractTutor() {
  const span = document.querySelector('#divDadosProprietario');
  if (!span) return '';
  const clone = span.cloneNode(true);
  const ficha = clone.querySelector('.ficha');
  if (ficha) ficha.remove();
  return normalizeText(clone.textContent);
}

function extractPatologia() {
  const hidden = document.querySelector('#pat_int_codigo_text');
  if (hidden && hidden.value && hidden.value.trim()) {
    return normalizeText(hidden.value);
  }
  const select = document.querySelector('#pat_int_codigo');
  if (select && select.selectedIndex >= 0) {
    const opt = select.options[select.selectedIndex];
    if (opt && opt.text && opt.text.trim()) {
      return normalizeText(opt.text);
    }
  }
  return '';
}

function captureCurrentPageData() {
  const { paciente, prontuario } = extractPacienteProntuario();
  return {
    data: todayFormatted(),
    prontuario,
    paciente,
    especie: extractEspecie(),
    sexo: extractSexo(),
    tutor_responsavel: extractTutor(),
    tipo_atendimento: 'SIMPLES',
    veterinario_responsavel: vetName || PAYING_VET,
    patologia: extractPatologia(),
  };
}

// ============================================================
// Payload / validation
// ============================================================

function getPayloadFromEditableFields() {
  const val = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  return {
    token: TOKEN,
    data: val('svext-data'),
    prontuario: val('svext-prontuario'),
    paciente: val('svext-paciente'),
    especie: val('svext-especie'),
    sexo: val('svext-sexo'),
    tutor_responsavel: val('svext-tutor'),
    tipo_atendimento: val('svext-tipo'),
    veterinario_responsavel: val('svext-vet'),
    patologia: val('svext-patologia'),
  };
}

const REQUIRED_FIELDS = ['data', 'prontuario', 'paciente', 'especie', 'sexo',
  'tutor_responsavel', 'tipo_atendimento', 'veterinario_responsavel', 'patologia'];

function validatePayload(payload) {
  return REQUIRED_FIELDS.filter(f => !payload[f]);
}

// ============================================================
// Webhook
// ============================================================

async function sendToN8N(payload) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timerId);
    if (response.status === 200 || response.status === 201) return { ok: true };
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (err) {
    clearTimeout(timerId);
    if (err.name === 'AbortError') return { ok: false, error: 'timeout (10s)' };
    return { ok: false, error: err.message || 'sem conexão' };
  }
}

// ============================================================
// Storage
// ============================================================

function saveToStorage(data) {
  chrome.storage.local.set({ svext_current: data });
}

function clearStorage() {
  chrome.storage.local.remove('svext_current');
}

function loadFromStorage(cb) {
  chrome.storage.local.get(['svext_current', 'svext_webhook_url', 'svext_token'], (result) => {
    if (result.svext_webhook_url) WEBHOOK_URL = result.svext_webhook_url;
    if (result.svext_token) TOKEN = result.svext_token;
    cb(result.svext_current || null);
  });
}

// ============================================================
// Panel — styles
// ============================================================

function injectStyles() {
  if (document.getElementById('svext-styles')) return;
  const style = document.createElement('style');
  style.id = 'svext-styles';
  style.textContent = `
    #svext-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 270px;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.20);
      z-index: 2147483647;
      font-family: Arial, sans-serif;
      font-size: 12px;
      color: #333;
    }
    #svext-header {
      background: #2e7d32;
      color: #fff;
      padding: 7px 10px;
      border-radius: 8px 8px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }
    #svext-title { font-weight: bold; font-size: 13px; letter-spacing: 0.3px; }
    #svext-btn-minimize {
      background: none;
      border: 1px solid rgba(255,255,255,0.5);
      color: #fff;
      font-size: 14px;
      line-height: 1;
      width: 22px;
      height: 22px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #svext-body { padding: 8px 10px 10px; }
    #svext-vet-label {
      font-size: 10px;
      color: #555;
      margin-bottom: 6px;
      padding: 2px 4px;
      background: #f1f8e9;
      border-radius: 3px;
    }
    #svext-status {
      padding: 5px 7px;
      border-radius: 4px;
      margin-bottom: 7px;
      font-size: 11px;
      line-height: 1.4;
    }
    .svext-info    { background: #e3f2fd; color: #1565c0; }
    .svext-success { background: #e8f5e9; color: #2e7d32; }
    .svext-error   { background: #ffebee; color: #c62828; }
    .svext-warn    { background: #fff8e1; color: #e65100; }
    #svext-actions {
      display: flex;
      gap: 5px;
      margin-bottom: 8px;
    }
    #svext-actions button {
      flex: 1;
      padding: 5px 2px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: bold;
      transition: opacity 0.15s;
    }
    #svext-actions button:disabled { opacity: 0.45; cursor: default; }
    #svext-btn-capturar { background: #1565c0; color: #fff; }
    #svext-btn-enviar   { background: #2e7d32; color: #fff; }
    #svext-btn-limpar   { background: #e65100; color: #fff; }
    #svext-fields { border-top: 1px solid #eee; padding-top: 8px; }
    #svext-fields label {
      display: block;
      margin-bottom: 5px;
      font-size: 10px;
      font-weight: bold;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    #svext-fields input,
    #svext-fields select,
    #svext-fields textarea {
      display: block;
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #ccc;
      border-radius: 3px;
      padding: 3px 5px;
      font-size: 11px;
      margin-top: 2px;
      font-family: Arial, sans-serif;
      color: #222;
      background: #fafafa;
    }
    #svext-fields textarea { resize: vertical; min-height: 36px; }
  `;
  document.head.appendChild(style);
}

// ============================================================
// Panel — HTML structure
// ============================================================

function renderPanel() {
  if (document.getElementById(PANEL_ID)) return;
  injectStyles();

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div id="svext-header">
      <span id="svext-title">🐾 VetSmart</span>
      <button id="svext-btn-minimize" title="Minimizar">−</button>
    </div>
    <div id="svext-body">
      <div id="svext-vet-label"></div>
      <div id="svext-status" class="svext-info">Iniciando...</div>
      <div id="svext-actions">
        <button id="svext-btn-capturar" disabled>Capturar</button>
        <button id="svext-btn-enviar"   disabled>Enviar</button>
        <button id="svext-btn-limpar">Limpar</button>
      </div>
      <div id="svext-fields" style="display:none;">
        <label>Data
          <input id="svext-data" type="text" placeholder="DD/MM/YYYY">
        </label>
        <label>Prontuário
          <input id="svext-prontuario" type="text">
        </label>
        <label>Paciente
          <input id="svext-paciente" type="text">
        </label>
        <label>Espécie
          <select id="svext-especie">
            <option value="">— selecione —</option>
            <option value="CANINA">CANINA</option>
            <option value="FELINA">FELINA</option>
          </select>
        </label>
        <label>Sexo
          <select id="svext-sexo">
            <option value="">— selecione —</option>
            <option value="MACHO">MACHO</option>
            <option value="FÊMEA">FÊMEA</option>
          </select>
        </label>
        <label>Tutor Responsável
          <input id="svext-tutor" type="text">
        </label>
        <label>Tipo de Atendimento
          <select id="svext-tipo">
            <option value="SIMPLES">SIMPLES</option>
            <option value="EMERGÊNCIA">EMERGÊNCIA</option>
            <option value="RETORNO">RETORNO</option>
          </select>
        </label>
        <label>Veterinário Responsável
          <input id="svext-vet" type="text">
        </label>
        <label>Patologia
          <textarea id="svext-patologia" rows="2"></textarea>
        </label>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  bindPanelEvents();
}

// ============================================================
// Panel — events
// ============================================================

function bindPanelEvents() {
  document.getElementById('svext-btn-minimize').addEventListener('click', (e) => {
    e.stopPropagation();
    minimizePanel(!isMinimized);
  });
  document.getElementById('svext-header').addEventListener('click', () => {
    if (isMinimized) minimizePanel(false);
  });

  document.getElementById('svext-btn-capturar').addEventListener('click', handleCapturar);
  document.getElementById('svext-btn-enviar').addEventListener('click', handleEnviar);
  document.getElementById('svext-btn-limpar').addEventListener('click', handleLimpar);
}

function minimizePanel(collapsed) {
  isMinimized = collapsed;
  const body = document.getElementById('svext-body');
  const btn  = document.getElementById('svext-btn-minimize');
  if (body) body.style.display = collapsed ? 'none' : '';
  if (btn)  btn.textContent = collapsed ? '+' : '−';
}

// ============================================================
// Panel — UI update
// ============================================================

function setStatus(message, type = 'info') {
  const el = document.getElementById('svext-status');
  if (!el) return;
  el.textContent = message;
  el.className = `svext-${type}`;
}

function updatePanelUI() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  const btnCap  = document.getElementById('svext-btn-capturar');
  const btnEnv  = document.getElementById('svext-btn-enviar');
  const btnLim  = document.getElementById('svext-btn-limpar');
  const fields  = document.getElementById('svext-fields');
  const vetLbl  = document.getElementById('svext-vet-label');

  const hasAnimal = !!document.querySelector('#divView.divForm');

  if (vetLbl) vetLbl.textContent = vetName ? `Veterinária identificada: ${vetName}` : '';

  const sending = currentState === STATES.ENVIANDO;
  const hasData = [STATES.CAPTURADO, STATES.ENVIANDO, STATES.ENVIADO, STATES.ERRO].includes(currentState);

  if (btnCap) btnCap.disabled = !hasAnimal || sending;
  if (btnEnv) btnEnv.disabled = !hasData || sending || currentState === STATES.ENVIADO;
  if (btnLim) btnLim.disabled = sending;
  if (fields) fields.style.display = hasData ? 'block' : 'none';

  const statusMap = {
    [STATES.IDLE]:               { msg: 'Aguardando login...', type: 'info' },
    [STATES.AGUARDANDO_CAPTURA]: { msg: hasAnimal ? 'Prontuário aberto. Clique em Capturar.' : 'Abra um prontuário para capturar.', type: 'info' },
    [STATES.CAPTURADO]:          { msg: 'Dados capturados. Revise e clique em Enviar.', type: 'warn' },
    [STATES.ENVIANDO]:           { msg: 'Enviando...', type: 'info' },
    [STATES.ENVIADO]:            { msg: 'Enviado com sucesso!', type: 'success' },
  };

  if (currentState !== STATES.ERRO && statusMap[currentState]) {
    setStatus(statusMap[currentState].msg, statusMap[currentState].type);
  }
}

// ============================================================
// Editable fields
// ============================================================

function fillEditableFields(data) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
  };
  set('svext-data',       data.data);
  set('svext-prontuario', data.prontuario);
  set('svext-paciente',   data.paciente);
  set('svext-especie',    data.especie);
  set('svext-sexo',       data.sexo);
  set('svext-tutor',      data.tutor_responsavel);
  set('svext-tipo',       data.tipo_atendimento || 'SIMPLES');
  set('svext-vet',        data.veterinario_responsavel);
  set('svext-patologia',  data.patologia);
}

function clearEditableFields() {
  fillEditableFields({
    data: '', prontuario: '', paciente: '', especie: '', sexo: '',
    tutor_responsavel: '', tipo_atendimento: 'SIMPLES',
    veterinario_responsavel: vetName || '', patologia: '',
  });
}

// ============================================================
// Button handlers
// ============================================================

function handleCapturar() {
  if (!document.querySelector('#divView.divForm')) {
    setStatus('Nenhum prontuário aberto.', 'error');
    return;
  }
  try {
    const data = captureCurrentPageData();
    fillEditableFields(data);
    saveToStorage(data);
    console.log(`${LOG} Dados capturados:`, data);
    setState(STATES.CAPTURADO);
  } catch (err) {
    console.error(`${LOG} Erro ao capturar:`, err);
    setStatus(`Erro ao capturar: ${err.message}`, 'error');
    setState(STATES.ERRO);
  }
}

async function handleEnviar() {
  if (isSending) return;

  const payload = getPayloadFromEditableFields();
  const missing = validatePayload(payload);
  if (missing.length > 0) {
    setStatus(`Campos obrigatórios em falta: ${missing.join(', ')}`, 'error');
    setState(STATES.ERRO);
    return;
  }

  isSending = true;
  setState(STATES.ENVIANDO);
  console.log(`${LOG} Enviando payload:`, payload);

  const result = await sendToN8N(payload);
  isSending = false;

  if (result.ok) {
    setState(STATES.ENVIADO);
    clearStorage();
    setTimeout(() => {
      clearEditableFields();
      setState(STATES.AGUARDANDO_CAPTURA);
    }, 2000);
  } else {
    console.error(`${LOG} Falha ao enviar: ${result.error}`);
    setStatus(`Erro ao enviar: ${result.error}`, 'error');
    setState(STATES.ERRO);
  }
}

function handleLimpar() {
  clearStorage();
  clearEditableFields();
  setState(STATES.AGUARDANDO_CAPTURA);
  console.log(`${LOG} Dados limpos.`);
}

// ============================================================
// Physical exam template — Consulta Clínica Geral
// ============================================================

const EXAM_TEMPLATE = [
  'Orelhas/ouvido: sem alteração',
  'Linfonodos: sem alteração',
  'Pele/Pêlo: sem alteração',
  'Membros torácicos: sem alteração',
  'Tórax: sem alteração',
  'Membros pélvicos: sem alteração',
  'Abdome: sem alteração',
  'Urinário: sem alteração',
  'Genital: sem alteração',
  'Músculo-esquelético: sem alteração',
  'Nervoso: sem alteração',
];

const EXAM_LABELS = [
  'Orelhas/ouvido:',
  'Linfonodos:',
  'Pele/Pêlo:',
  'Membros torácicos:',
  'Tórax:',
  'Membros pélvicos:',
  'Abdome:',
  'Urinário:',
  'Genital:',
  'Músculo-esquelético:',
  'Nervoso:',
];

function getEditorIframe() {
  const iframe = document.querySelector(
    'iframe[id$="_ifr"], iframe.mce-edit-area, iframe[name*="editor"]'
  );
  if (iframe && iframe.contentDocument) return iframe.contentDocument;
  return null;
}

function applyTemplateToDoc(editorDoc) {
  let applied = 0;

  // Strategy 1: XPath — p[22] through p[32]
  try {
    for (let i = 0; i < EXAM_TEMPLATE.length; i++) {
      const result = editorDoc.evaluate(
        `/html/body/p[${22 + i}]`,
        editorDoc,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const node = result.singleNodeValue;
      if (node) {
        node.textContent = EXAM_TEMPLATE[i];
        applied++;
      }
    }
  } catch (err) {
    console.warn(`${LOG} WARN: XPath strategy failed:`, err.message);
  }

  // Strategy 2: fallback by label prefix
  if (applied < EXAM_TEMPLATE.length) {
    console.warn(`${LOG} WARN: XPath matched ${applied}/${EXAM_TEMPLATE.length}, usando fallback por rótulo`);
    editorDoc.querySelectorAll('body p').forEach((p) => {
      const text = (p.textContent || '').trim();
      for (let i = 0; i < EXAM_LABELS.length; i++) {
        if (text.startsWith(EXAM_LABELS[i])) {
          p.textContent = EXAM_TEMPLATE[i];
          break;
        }
      }
    });
  }

  // Notify TinyMCE of the change
  try {
    editorDoc.body.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (_) { /* ignore */ }

  console.log(`${LOG} Template Consulta Clínica Geral aplicado.`);
}

function applyConsultaClinicaGeralTemplate() {
  const editorDoc = getEditorIframe();
  if (editorDoc) {
    applyTemplateToDoc(editorDoc);
    return;
  }
  // Wait up to 2 seconds for the iframe to appear
  let attempts = 0;
  const interval = setInterval(() => {
    const doc = getEditorIframe();
    attempts++;
    if (doc) {
      clearInterval(interval);
      applyTemplateToDoc(doc);
    } else if (attempts >= 20) {
      clearInterval(interval);
      console.warn(`${LOG} WARN: editor iframe não encontrado após 2s`);
    }
  }, 100);
}

function observeTatIntCodigo() {
  if (tatObserverAttached) return;
  const select = document.querySelector('#tat_int_codigo');
  if (!select) return;
  select.addEventListener('change', () => {
    const val = select.value;
    const text = select.options[select.selectedIndex]
      ? select.options[select.selectedIndex].text
      : '';
    if (val === '780583' || /consulta cl[ií]nica geral/i.test(text)) {
      console.log(`${LOG} Consulta Clínica Geral selecionada — aplicando template...`);
      applyConsultaClinicaGeralTemplate();
    }
  });
  tatObserverAttached = true;
}

function observeSalvarPatologia() {
  if (salvarObserverAttached) return;
  const btn = document.querySelector('#btn_salvar_apa');
  if (!btn) return;
  btn.addEventListener('click', () => {
    setTimeout(() => {
      const pat = extractPatologia();
      const field = document.getElementById('svext-patologia');
      if (field && pat) {
        field.value = pat;
        console.log(`${LOG} Patologia atualizada após salvar: ${pat}`);
      }
    }, 600);
  });
  salvarObserverAttached = true;
}

// ============================================================
// SPA navigation handling
// ============================================================

function isLoginPage() {
  return /\/login\//i.test(window.location.pathname);
}

function detectLoggedInUser() {
  const span = document.querySelector('span.username');
  if (!span) return null;
  return normalizeVeterinarianName(span.textContent);
}

let navDebounceTimer = null;

function handleNavigation() {
  clearTimeout(navDebounceTimer);
  navDebounceTimer = setTimeout(() => {
    const panel = document.getElementById(PANEL_ID);

    if (isLoginPage()) {
      if (panel) panel.style.display = 'none';
      return;
    }

    const normalized = detectLoggedInUser();
    if (!normalized) {
      if (panel) panel.style.display = 'none';
      return;
    }

    if (normalized !== vetName) {
      vetName = normalized;
      console.log(`${LOG} Veterinária re-identificada: ${vetName}`);
    }

    if (!document.getElementById(PANEL_ID)) {
      renderPanel();
    } else if (panel) {
      panel.style.display = '';
    }

    if (currentState === STATES.IDLE) {
      setState(STATES.AGUARDANDO_CAPTURA);
    } else {
      updatePanelUI();
    }

    // Re-attach observers for dynamic elements that may have been re-rendered
    tatObserverAttached = false;
    salvarObserverAttached = false;
    observeTatIntCodigo();
    observeSalvarPatologia();
  }, 250);
}

function startNavigationObserver() {
  if (navigationObserver) return;
  navigationObserver = new MutationObserver(handleNavigation);
  navigationObserver.observe(document.body, { childList: true, subtree: false });
}

// ============================================================
// Init
// ============================================================

function init() {
  console.log(`${LOG} Extensão iniciada em: ${window.location.href}`);

  loadFromStorage((saved) => {
    if (isLoginPage()) {
      console.log(`${LOG} Página de login — extensão inativa.`);
      startNavigationObserver();
      return;
    }

    if (saved) {
      console.log(`${LOG} Dados anteriores encontrados no storage.`);
    }

    const normalized = detectLoggedInUser();
    if (normalized) {
      vetName = normalized;
      console.log(`${LOG} Veterinária identificada: ${vetName}`);
      renderPanel();

      if (saved) {
        fillEditableFields(saved);
        setState(STATES.CAPTURADO);
      } else {
        setState(STATES.AGUARDANDO_CAPTURA);
      }

      observeTatIntCodigo();
      observeSalvarPatologia();
    } else {
      // Username not yet in DOM — wait for it
      waitForElement('span.username', 30000).then((el) => {
        const name = normalizeVeterinarianName(el.textContent);
        if (name) {
          vetName = name;
          console.log(`${LOG} Veterinária identificada após espera: ${vetName}`);
          renderPanel();
          setState(STATES.AGUARDANDO_CAPTURA);
          observeTatIntCodigo();
          observeSalvarPatologia();
        } else {
          console.log(`${LOG} Usuário não autorizado: "${el.textContent.trim()}" — painel não será exibido.`);
        }
      }).catch(() => {
        console.warn(`${LOG} WARN: span.username não encontrado na página.`);
      });
    }

    startNavigationObserver();
  });
}

init();
