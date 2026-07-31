# Do ambiente de trabalho → Extensão N8N

Extensão de navegador para auxiliar no registro manual de atendimentos veterinários do ambiente de trabalho 
-no caso 'SimplesVet' em uma planilha via webhook do n8n.

A extensão funciona como uma camada de captura assistida dentro do navegador: ela lê dados visíveis da página do ambiente, permite revisão e edição manual das informações capturadas e envia o payload final para um webhook configurado no n8n.

## Objetivo

Automatizar parte do fluxo repetitivo de preenchimento de planilhas clínicas veterinárias, sem alterar a estrutura original da planilha e sem modificar o funcionamento principal do ambiente.

A extensão foi pensada para:

* capturar dados do animal/prontuário na página do ambiente;
* permitir correção manual antes do envio;
* enviar os dados para um webhook do n8n;
* registrar cada atendimento como uma nova linha no Google Sheets;
* evitar preenchimento manual repetitivo;
* manter controle humano antes do envio.

---

## Fluxo de uso

1. A médica veterinária acessa o ambiente normalmente.
2. Faz login manualmente.
3. Abre a área de atendimento clínico.
4. Pesquisa o prontuário do animal.
5. Abre o cadastro/atendimento do paciente.
6. Clica em **Capturar** na extensão.
7. Confere e edita os campos capturados, se necessário.
8. Seleciona o **tipo de atendimento**.
9. Clica em **Enviar**.
10. O n8n recebe o JSON e adiciona uma nova linha na planilha.

---

## Importante

A extensão **não envia dados automaticamente**.

Ela só registra informações da página quando o usuário clica em:

```text
Capturar
```

E só envia os dados ao n8n quando o usuário clica em:

```text
Enviar
```

Isso permite revisar e corrigir qualquer informação capturada antes do envio.

---

## Roadmap

Possíveis melhorias futuras:

* configuração visual do webhook;
* configuração visual do token;
* logs locais de envio;
* indicador de status mais completo;
* suporte a múltiplos veterinários pagantes;
* modo produção com webhook HTTPS;
* empacotamento da extensão;
* publicação privada ou pública na Chrome Web Store;
* testes automatizados dos seletores principais.

---

## Licença

MIT — uso, cópia, modificação e distribuição livres, inclusive para fins comerciais, mantendo o aviso de copyright. Texto completo em `LICENSE`.

---

## Autor

Projeto desenvolvido para automação de fluxo clínico veterinário com ambiente desejado, n8n e Google Sheets.
