# Browser Extension Prompt — SimplesVet to n8n

Create a browser extension for Chrome/Edge using Manifest V3.

## General objective

Create an extension that works on the SimplesVet system, under the domain:

```text
https://app.simples.vet/*
```

The extension must assist a specific veterinarian during the clinical appointment workflow by manually capturing data from the animal/patient record page, allowing the user to review and edit the captured data, and then manually sending the final payload to an n8n webhook.

The extension will work almost like a lightweight web scraping assistant inside the browser.

The extension must **not automatically register information from the page**. It must only read/capture the page data after the user explicitly clicks the **“Capturar”** button.

After the data is captured, all fields must be displayed in editable text inputs/selects so the veterinarian can correct any wrong information before sending.

The extension must only send data to n8n after the user clicks the **“Enviar”** button.

After the webhook confirms successful delivery, the extension must clear the temporary data and wait for a new capture.

The Google Sheets structure must not be modified. The n8n workflow will receive the payload and perform only an Append Row operation. Every submission must create a new row. There must be no update of existing rows.

## General technical requirements

Use Manifest V3.

Create at least:

```text
manifest.json
content.js
popup.html or an in-page panel
background/service worker if necessary
```

The extension must run only on:

```text
https://app.simples.vet/*
```

Use `chrome.storage.local` to temporarily store the current captured appointment data. This is required — do not use only in-memory state. `chrome.storage.local` ensures the captured data survives page reloads and SPA navigations within SimplesVet.

Do not store the veterinarian’s password.

Do not automate login using credentials.

The veterinarian will log in manually.

The extension must detect the logged-in user after the system renders the username on the page.

The n8n webhook will be:

```text
http://localhost:5678/webhook-test/teste-json-mile
```

> **Note:** This is the development/test webhook URL. For production, update this URL to the live n8n webhook endpoint. Consider making the webhook URL configurable in `popup.html` settings so it can be changed without modifying the source code.

The fetch to the n8n webhook must be performed directly from `content.js` using the Fetch API. No background service worker is needed for this request because `http://localhost:5678/*` is declared in `host_permissions`, which grants the content script permission to make cross-origin requests to that origin in Manifest V3.

The extension must also send a token/secret in the payload:

```text
secret
```

## Workflow context

The veterinarian accesses:

```text
https://app.simples.vet/login/login.php
```

The login button has a structure similar to:

```html
<button id="btn_login" class="btn blue g-recaptcha" type="submit">
  Entrar no SimplesVet
</button>
```

The extension does not need to automate the login.

After login, the user’s name appears in:

```html
<span class="username">NOME DA MÉDICA | HOVET UFRA</span>
```

The responsible veterinarian’s name must be extracted from this `span`.

The `normalizeVeterinarianName(usernameText)` function must apply the following logic:

```text
1. Take the text content of span.username
2. Split on "|" and take the first part, trimmed
3. If the result is "KAMILE TORRES" → use as-is
4. If the result is "KAMILE" (first name only) → normalize to "KAMILE TORRES"
5. Any other value → user is not the paying veterinarian
```

Examples:

```text
"KAMILE | HOVET UFRA"        → "KAMILE TORRES"
"KAMILE TORRES | HOVET UFRA" → "KAMILE TORRES"
"OUTRO MEDICO | HOVET UFRA"  → not authorized
```

The extension must process data only if the normalized name matches:

```text
KAMILE TORRES
```

If the logged-in user does not match the paying veterinarian, the extension panel must be completely hidden. No panel, no button, no visible element must be injected into the page for unauthorized users.

## Navigation context

The veterinarian clicks “Atendimento Clínico”.

The menu link has a structure similar to:

```html
<a class="link-menu" data-id="118" href="https://app.simples.vet/principal/cliente/cliente.php" target="_self">
  <span class="title">Atendimento Clínico</span>
</a>
```

Then the veterinarian types the patient record number, filters the results, and clicks on the animal found.

The animal appears in a structure similar to:

```html
<td class="cel-animais">
  <a class="linkAnimalLista animalMarcado" rel="66044545,45615882">BOB</a>
</td>
```

After the click, a div containing the animal data is rendered:

```html
<div id="divView" class="row-fluid divForm" style="display: block;">
  ...
</div>
```

The extension must wait for the presence of:

```text
#divView.row-fluid.divForm
```

However, the extension must not automatically capture data when this div appears.

The div presence only means the page is ready to be captured.

The actual capture must happen only when the user clicks:

```text
Capturar
```

## SPA navigation handling

SimplesVet is a Single Page Application (SPA). When the veterinarian navigates between sections (e.g., from the patient list to the animal record), the browser does not perform a full page reload. The URL may or may not change via `history.pushState`.

The extension must handle this by:

```text
1. Observing DOM mutations using a MutationObserver on document.body to detect when key elements appear or disappear
2. Re-checking the logged-in username on each navigation to validate the active user
3. Re-checking whether #divView is present on each navigation
4. Never injecting multiple copies of the in-page panel — always check if the panel already exists before injecting
5. Detecting the login page URL (https://app.simples.vet/login/*) and hiding/removing the panel if the user navigates to it
```

Implement a `handleNavigation()` function that:

```text
- Is called on MutationObserver callbacks when significant DOM changes occur
- Re-reads span.username and re-validates the logged-in user
- Updates the panel visibility accordingly
- Does not reset captured state when navigating, unless navigating away from the clinical appointment context
```

## Capture behavior

The extension must provide a visible interface, either in a popup or preferably as a small fixed panel inside the SimplesVet page.

This interface must include:

```text
Capturar
Enviar
Limpar
```

The **Capturar** button must:

```text
1. Read the current page DOM
2. Extract the available fields
3. Normalize the values
4. Fill the extension’s editable fields with the captured data
5. Allow the veterinarian to manually correct any field before sending
```

The **Enviar** button must:

```text
1. Validate that all required fields are present
2. Send the current edited values to the n8n webhook
3. Wait for HTTP 200 or 201
4. If successful, clear the temporary state
5. Return to waiting for a new capture
```

The **Limpar** button must:

```text
1. Clear all temporary captured data
2. Clear all editable fields
3. Return the extension to the waiting state
```

The extension must never send data automatically just because the page loaded, the animal was opened, or the pathology was saved.

## Fields to capture

### 1. DATA

The date must be the current day.

Extract it from the local browser timestamp.

Format:

```text
DD/MM/YYYY
```

### 2. PRONTUÁRIO and PACIENTE

They appear close together in:

```html
<span id="divDadosAnimal" class="popovers">
  BOB
  <span class="ficha" style="font-size: 16px;">(74639)</span>
</span>
```

Rules:

```text
paciente = main text inside #divDadosAnimal, excluding the ficha span
prontuario = number inside span.ficha, without parentheses
```

Example:

```text
paciente: "BOB"
prontuario: "74639"
```

### 3. SEXO

It appears in a structure similar to:

```html
<div class="span6 sepH_b">
  BEGE
  <br>
  Macho, Fértil
  <br>
</div>
```

Rules:

```text
If the text contains "Macho", send "MACHO"
If the text contains "Fêmea", "Femea", or "Feminino", send "FÊMEA"
```

### 4. ESPÉCIE

The species is indicated by the `src` attribute of the image with:

```html
<img id="btn_alterarfoto" src="https://s3-sa-east-1.amazonaws.com/simplesvet-public/animal/cao-icon.jpg">
```

Rules:

```text
If src contains "cao", "cão", "canino", or "canina", use "CANINA"
If src contains "gato", "felino", or "felina", use "FELINA"
```

Implement:

```text
normalizarEspecie(src)
```

### 5. TUTOR RESPONSÁVEL

It appears in:

```text
#divDadosProprietario
```

Example structure:

```html
<span id="divDadosProprietario" class="popovers">
  JURSULA AMARAL SANTOS
  <span class="ficha" style="font-size: 16px;">(50629)</span>
</span>
```

Rules:

```text
tutor_responsavel = main text inside #divDadosProprietario, excluding the ficha span
```

Example:

```text
"JURSULA AMARAL SANTOS"
```

### 6. VETERINÁRIO RESPONSÁVEL

This value is captured after login from:

```text
span.username
```

Use the normalized logged-in veterinarian name.

Example:

```text
"KAMILE TORRES"
```

### 7. TIPO DE ATENDIMENTO

The appointment type will not be extracted from SimplesVet.

It must be selected inside the extension interface.

The extension must show a select with the available options:

```text
SIMPLES
EMERGÊNCIA
RETORNO
```

The default value when the panel loads or after a **Capturar** must be:

```text
SIMPLES
```

The selected value must be editable/selectable before sending.

The Google Sheets expects exactly these values:

```text
SIMPLES
EMERGÊNCIA
RETORNO
```

### 8. PATOLOGIA

The pathology is handled in the environment containing:

```html
<select id="pat_int_codigo" class="span8 m-wrap" name="pat_int_codigo" validate="required">
</select>

<input id="pat_int_codigo_text" class="m-wrap" type="hidden" name="pat_int_codigo_text" value="FRATURA TIBIA E FIBULA">
```

The system sends a POST request to:

```text
https://app.simples.vet/principal/cliente/animal/forms/patologia_crud.php
```

The pathology save button has the structure:

```html
<button id="btn_salvar_apa" class="btn green pull-left sepV_b" type="submit">
  <i class="icon-ok icon-white"></i>
  Salvar
</button>
```

The extension must not automatically send data after this button is clicked.

The extension may use this button click as a helpful moment to refresh the pathology field inside the extension, but the final webhook send must still depend on the user clicking:

```text
Enviar
```

Pathology capture rule:

```text
Prefer #pat_int_codigo_text.value
If empty, try to capture the selected option text from #pat_int_codigo
Normalize to uppercase and remove excessive spaces
```

Example:

```text
"FRATURA TIBIA E FIBULA"
```

## Editable fields before sending

After clicking **Capturar**, the extension must display all captured fields as editable fields.

The user must be able to correct the data before clicking **Enviar**.

The editable fields must include:

```text
data
prontuario
paciente
especie
sexo
tutor_responsavel
tipo_atendimento
veterinario_responsavel
patologia
```

Recommended input types:

```text
data: text input
prontuario: text input
paciente: text input
especie: select with CANINA/FELINA
sexo: select with MACHO/FÊMEA
tutor_responsavel: text input
tipo_atendimento: select with SIMPLES/EMERGÊNCIA/RETORNO
veterinario_responsavel: text input
patologia: text input or textarea
```

The values sent to n8n must be taken from the editable fields, not directly from the DOM after the user reviews them.

## Payload rules

The extension must send data to n8n only after the user clicks:

```text
Enviar
```

All required fields must be available.

Required fields:

```text
data
prontuario
paciente
especie
sexo
tutor_responsavel
tipo_atendimento
veterinario_responsavel
patologia
```

Payload JSON to the webhook:

```json
{
  "token": "secret",
  "data": "31/05/2026",
  "prontuario": "74639",
  "paciente": "BOB",
  "especie": "CANINA",
  "sexo": "MACHO",
  "tutor_responsavel": "JURSULA AMARAL SANTOS",
  "tipo_atendimento": "SIMPLES",
  "veterinario_responsavel": "KAMILE TORRES",
  "patologia": "FRATURA TIBIA E FIBULA"
}
```

The n8n workflow will append a new row to Google Sheets.

The extension must not send extra columns or fields.

Do not send:

```text
PLANILHA
ID_AUTOMACAO
STATUS
ORIGEM
CAPTURADO_EM
```

## State control

Implement a simple state machine:

### IDLE

Waiting for login or a relevant page.

### LOGADO

The logged-in veterinarian has been identified.

### AGUARDANDO_CAPTURA

The extension is waiting for the user to click **Capturar**.

### CAPTURADO

The data was captured from the page and filled into editable fields.

### PRONTO_PARA_ENVIO

All required editable fields are filled and valid.

### ENVIANDO

The request to the n8n webhook is in progress.

### ENVIADO

The webhook responded successfully.

### ERRO

There was a validation error, missing required field, or sending error.

After receiving HTTP 200 or 201 from n8n:

```text
1. Clear the temporary captured data
2. Clear chrome.storage.local data related to the current appointment
3. Clear the editable fields
4. Return to AGUARDANDO_CAPTURA
5. Allow the same prontuario to be captured and sent again in the future
```

Important:

```text
The same prontuario can appear multiple times.
Each appointment must generate a new row.
Do not implement upsert.
Do not search for an existing row.
Do not permanently block the same prontuario.
Only prevent accidental duplicate sending caused by double-clicking Enviar.
```

## Duplicate protection

Implement:

```text
isSending flag
short cooldown after clicking Enviar
disable Enviar button while sending
do not send again while the previous request is pending
```

If the webhook responds successfully:

```text
clear state
```

If the webhook fails:

```text
keep the editable values
show a visible error message
allow the user to try sending again
```

A webhook call is considered failed if any of the following occurs:

```text
- The HTTP response status is not 200 or 201
- The request times out after 10 seconds
- A network error occurs (fetch throws an exception)
```

In all failure cases, display the specific reason in the error message (e.g., "Erro: timeout", "Erro: HTTP 500", "Erro: sem conexão").

## Extension visual interface

Create a small interface that is visible only when:

```text
the logged-in user has been identified
the logged-in user matches KAMILE TORRES
the current URL is NOT the login page (https://app.simples.vet/login/*)
the user is inside the SimplesVet page
```

The panel must be completely absent from the DOM when:

```text
- the logged-in user is not KAMILE TORRES
- the current page is the login page
```

The interface may be a popup or a fixed in-page panel.

Preferred: fixed in-page panel, positioned at the bottom-right corner of the viewport (`position: fixed; bottom: 20px; right: 20px`).

The panel must include a **Minimizar** button (or toggle icon) that collapses the panel to a small icon/title bar, so it does not cover page content when the veterinarian needs full access to the SimplesVet UI. Clicking the icon again expands the panel.

The panel must show (when expanded):

```text
extension status
identified veterinarian
Capturar button
editable fields
Enviar button
Limpar button
Minimizar button
last send status
```

The panel must be simple, lightweight, and must not interfere with the normal use of SimplesVet.

The user must be able to review and manually edit all captured values before sending.

## HTML / physical exam customization

### Context: where the select and the editor live

The `#tat_int_codigo` select element is part of the clinical appointment form rendered in the main SimplesVet page (`https://app.simples.vet/principal/cliente/cliente.php` or a sub-path). It is accessible from the main document via `document.querySelector('#tat_int_codigo')`.

The physical exam body text, however, is rendered inside a rich text editor — most likely TinyMCE — which uses an `<iframe>` with its own `document`. The XPath `/html/body/p[N]` refers to the `<body>` of that iframe's document, not the main page body.

To access the editor iframe's document:

```javascript
function getEditorIframe() {
  // TinyMCE typically renders an iframe with id ending in "_ifr"
  const iframe = document.querySelector('iframe[id$="_ifr"], iframe.mce-edit-area, iframe[name*="editor"]');
  if (iframe && iframe.contentDocument) {
    return iframe.contentDocument;
  }
  return null;
}
```

All XPath and paragraph operations for the physical exam must target the document returned by `getEditorIframe()`, not the main `document`.

### Trigger

When the veterinarian selects this field in SimplesVet:

```html
<select id="tat_int_codigo" name="tat_int_codigo" class="span12 m-wrap" validate="required">
```

And the selected option is:

```html
<option value="780583">Consulta Clínica Geral</option>
```

The extension must pre-fill the physical exam body by replacing the paragraphs from XPath:

```text
/html/body/p[22]
```

through:

```text
/html/body/p[32]
```

inside the editor iframe's document, with the following values respectively:

```text
/html/body/p[22] = "Orelhas/ouvido: sem alteração"
/html/body/p[23] = "Linfonodos: sem alteração"
/html/body/p[24] = "Pele/Pêlo: sem alteração"
/html/body/p[25] = "Membros torácicos: sem alteração"
/html/body/p[26] = "Tórax: sem alteração"
/html/body/p[27] = "Membros pélvicos: sem alteração"
/html/body/p[28] = "Abdome: sem alteração"
/html/body/p[29] = "Urinário: sem alteração"
/html/body/p[30] = "Genital: sem alteração"
/html/body/p[31] = "Músculo-esquelético: sem alteração"
/html/body/p[32] = "Nervoso: sem alteração"
```

### Fallback strategy

If the XPath positions fail (e.g., the editor content has a different number of paragraphs), use a text-based fallback: search all `<p>` elements inside the editor iframe for ones whose `textContent` starts with one of these known labels and replace only those:

```text
"Orelhas/ouvido:"
"Linfonodos:"
"Pele/Pêlo:"
"Membros torácicos:"
"Tórax:"
"Membros pélvicos:"
"Abdome:"
"Urinário:"
"Genital:"
"Músculo-esquelético:"
"Nervoso:"
```

If neither strategy finds the paragraphs, log a warning `[SimplesVetExt] WARN: physical exam paragraphs not found` and do not throw an error.

### Rules for this customization

```text
Apply the change immediately after the veterinarian selects "Consulta Clínica Geral" on #tat_int_codigo
Monitor changes on #tat_int_codigo using a change event listener (not polling)
When the value is "780583" or the selected option text is "Consulta Clínica Geral", apply the replacements
Wait up to 2 seconds for the editor iframe to be available before giving up
Dispatch an input event on the editor body after changes so TinyMCE registers the modification
Do not automatically click any save button
Only assist the veterinarian by pre-filling text that she can review and save manually
```

## Suggested functions

Implement functions such as:

```text
waitForElement(selector, timeout)
waitForXPath(xpath, document, timeout)   // accepts a target document (main or iframe)
normalizeText(text)
normalizeDate(date)
normalizeVeterinarianName(usernameText)  // handles "KAMILE | HOVET UFRA" and "KAMILE TORRES | HOVET UFRA"
extractPacienteProntuario()
extractSexo()
extractEspecie()
extractTutor()
extractPatologia()
captureCurrentPageData()
fillEditableFields(data)
getPayloadFromEditableFields()
validatePayload(payload)
sendToN8N(payload)                       // fetch with 10s timeout, errors are caught and displayed
clearCurrentAttendance()
setState(newState)
renderPanel()
minimizePanel(collapsed)                 // toggles the panel between expanded and minimized states
getEditorIframe()                        // returns the contentDocument of the TinyMCE iframe
applyConsultaClinicaGeralTemplate()      // uses XPath first, falls back to text-label search
observeTatIntCodigo()
observeSalvarPatologia()
handleNavigation()                       // called on DOM mutation; re-validates user and panel visibility
```

## Suggested file structure

### manifest.json

Use:

```text
manifest_version: 3
permissions:
  - storage
host_permissions:
  - https://app.simples.vet/*
  - http://localhost:5678/*
content_scripts:
  - matches: ["https://app.simples.vet/*"]
  - js: ["content.js"]
  - run_at: "document_idle"
```

### content.js

Must contain:

```text
DOM reading logic
in-page panel
editable field rendering
state management
manual capture behavior
manual send behavior
webhook request
physical exam template logic
```

### popup.html

Optional.

If used, the popup may only provide settings such as webhook URL and token.

The main workflow should be available directly on the SimplesVet page through the in-page panel.

### background.js / service worker

Not required for the webhook fetch. The fetch to `http://localhost:5678/*` can be made directly from `content.js` because that origin is declared in `host_permissions`, granting cross-origin fetch rights to the content script in Manifest V3.

Only add a background service worker if a future need arises that requires persistent background logic beyond what content scripts can do.

## Quality requirements

```text
Clean and modular code
Comment important logic
No external libraries
Do not depend on jQuery, even if the page uses jQuery
Use plain JavaScript
Handle errors with try/catch
Use console.log with prefix: [SimplesVetExt]
Use console.error with prefix: [SimplesVetExt] for all caught errors and failure states
Use console.warn with prefix: [SimplesVetExt] for non-fatal warnings (e.g., element not found, fallback used)
Do not break the original page behavior
Do not block original clicks
Do not remove original elements
Do not modify data for non-paying veterinarians
Do not send data if the logged-in veterinarian is not KAMILE TORRES
Do not modify the Google Sheets structure
Do not create extra columns
Do not perform upsert
Always send data as a new row through n8n
```

## Acceptance criteria

1. After login, the extension captures the veterinarian name from `span.username`.
2. If the logged-in veterinarian is not `KAMILE TORRES`, the extension panel is completely absent from the DOM — no visible element is injected.
3. If the logged-in text is `"KAMILE | HOVET UFRA"` or `"KAMILE TORRES | HOVET UFRA"`, both normalize to `KAMILE TORRES` and the extension activates.
4. The extension panel is not rendered on the login page (`https://app.simples.vet/login/*`).
5. The extension does not automatically capture page data.
6. The extension captures data only after the user clicks **Capturar**.
7. When the user clicks **Capturar**, the extension reads the current DOM and captures:

   * data
   * prontuario
   * paciente
   * especie
   * sexo
   * tutor_responsavel
   * veterinario_responsavel
   * patologia, if available
8. The captured values appear in editable fields.
9. The user can manually edit every captured value before sending.
10. The `tipo_atendimento` select defaults to `SIMPLES` after each capture.
11. The user can choose `tipo_atendimento` from:

   * SIMPLES
   * EMERGÊNCIA
   * RETORNO
12. The extension sends data only after the user clicks **Enviar**.
13. The payload contains only:

* token
* data
* prontuario
* paciente
* especie
* sexo
* tutor_responsavel
* tipo_atendimento
* veterinario_responsavel
* patologia

14. The extension does not send `PLANILHA` or any technical extra field.
15. If the webhook returns HTTP 200 or 201, the extension clears the temporary data.
16. If the webhook fails (non-2xx, timeout after 10s, or network error), the editable fields are preserved and a descriptive error message is shown.
17. After clearing, the extension waits for a new manual capture.
18. The same prontuario can be captured and sent again in the future.
19. The extension prevents duplicate sending caused by double-clicking **Enviar**.
20. The in-page panel includes a **Minimizar** button that collapses it to a small title bar without removing it from the DOM.
21. When `#tat_int_codigo` is set to `780583` or `Consulta Clínica Geral`, the extension fills paragraphs `p[22]` through `p[32]` inside the editor iframe with the specified “sem alteração” values.
22. If the XPath-based replacement fails, the extension falls back to searching paragraphs by their label text.
23. The extension does not automatically save the physical exam text.
24. The extension does not automatically save or send pathology after clicking `#btn_salvar_apa`; it may refresh the editable pathology field, but the user must still click **Enviar** manually.
25. SPA navigation within SimplesVet does not inject duplicate panels or break the extension state.

## Installation instructions to include in the final answer

Explain how to install locally in Chrome/Edge:

```text
1. Open chrome://extensions
2. Enable Developer Mode
3. Click Load unpacked
4. Select the extension folder
5. Open https://app.simples.vet/
6. Log in manually
7. Open the clinical appointment page
8. Click Capturar
9. Review/edit the fields
10. Click Enviar
```

