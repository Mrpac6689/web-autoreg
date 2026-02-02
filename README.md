# AUTOREG-WEB

Sistema web para operação e monitoramento do **AUTOREG** — Sistema Automatizado de operações G-HOSP e SISREG, desenvolvido para o Núcleo Interno de Regulação (NIR) do Hospital de Urgência E Emrgência de Rio Branco (HUERB).

Este documento descreve o projeto em detalhes: funcionalidades, tecnologias, APIs, extensão Chrome, integração com Kasm e licenciamento. Uma versão em inglês encontra-se na seção **English** mais abaixo.

---

## Índice (PT-BR)

1. [Sobre o AUTOREG-WEB](#sobre-o-autoreg-web)
2. [Base do sistema: AUTOREG](#base-do-sistema-autoreg)
3. [Funcionalidades](#funcionalidades)
4. [Tecnologias utilizadas](#tecnologias-utilizadas)
5. [APIs](#apis)
6. [Extensão Chrome](#extensão-chrome)
7. [Integração com Kasm (KasmVNC)](#integração-com-kasm-kasmvnc)
8. [Instalação e configuração](#instalação-e-configuração)
9. [Estrutura do projeto](#estrutura-do-projeto)
10. [Licença](#licença)
11. [Autor e contato](#autor-e-contato)

---

## Sobre o AUTOREG-WEB

O **AUTOREG-WEB** é a interface web que permite aos usuários do NIR-HUERB acionar e acompanhar as rotinas automatizadas do núcleo de regulação hospitalar. Por meio de uma interface moderna (estilo glassmorphism), responsiva e segura, é possível solicitar tomografias, preparar e executar solicitações de internações, imprimir relatórios, visualizar o robô em tempo real e consultar a produção de relatórios, entre outras ações.

A aplicação comunica-se com o **Core do AUTOREG** (script Python `autoreg.py`), seja em ambiente local ou dentro de um container Docker, e oferece APIs REST para uso interno (interface web) e externo (integração com outros sistemas e chamadas via `curl`).

---

## Base do sistema: AUTOREG

O AUTOREG-WEB é o *front-end* e orquestrador web do sistema **AUTOREG**. O núcleo lógico das rotinas (acesso a portais, automação de telas, regras de negócio) está no projeto **AUTOREG** (Core), em Python, disponível sob licença GNU GPL.

- **Repositório e documentação do AUTOREG (Core):** [github.com/mrpac6689](https://github.com/mrpac6689)  
- Recomenda-se conhecer a documentação e o código-fonte do AUTOREG para entender a base do sistema e os módulos disponíveis (ex.: `-stc`, `-sia`, `-spa`, etc.).

---

## Funcionalidades

- **Autenticação:** login com usuário e senha; gerenciamento de usuários (criação, remoção, alteração de senha); suporte a chave de API por usuário para a API externa.
- **Inserir RAs para Tomografias:** carga e persistência de números de RA para solicitação de tomografias.
- **Solicitar Tomografias:** disparo da rotina do Core (ex.: `-stc`) com acompanhamento de saída em tempo real; interrupção sob demanda.
- **Imprimir Tomografias:** geração e download de PDFs; histórico de impressões.
- **Preparar Solicitações de Internações:** carga de dados e pendências para o fluxo de internações.
- **Solicitar Internações:** execução sequencial de etapas do Core (ex.: `-spa`, `-sia`, `-ssr`, `-snt`) com saída em tempo real; interrupção e reconexão a processos.
- **Visualizar Robô (KasmVNC):** acesso ao ambiente gráfico onde o Core roda, via proxy HTTP e WebSocket para KasmVNC, integrado à interface.
- **Produção e Relatórios:** registro de execuções de rotinas (local e via API externa); consulta e gráficos de produção (ex.: Chart.js).
- **Documentação:** exibição da documentação do Core (README) quando configurada (`CORE_README_PATH`).
- **Extensão Chrome:** instalação e configuração da extensão para interação com o Core no Kasm (Salvar/Pular e criação de flags).
- **Reconectar Processos:** listagem e reconexão a processos do Core em execução (incluindo em Docker).

Todas as ações sensíveis exigem login; a API externa de relatórios usa autenticação por chave de API.

---

## Tecnologias utilizadas

| Camada | Tecnologia |
|--------|------------|
| **Back-end** | Python 3.x, Flask 3.x, Gunicorn (produção), WSGI (Plesk/servidores) |
| **Autenticação** | Flask-Login, bcrypt (hash de senhas) |
| **HTTP/Integração** | requests, urllib3 (chamadas ao Core, proxy Kasm, APIs) |
| **Tempo real** | websocket-client (proxy WebSocket para KasmVNC) |
| **Front-end (estrutura)** | HTML5, Jinja2 (templates) |
| **Estilo** | CSS3 (Glassmorphism), Bootstrap 5.3.2 (local), Font Awesome (ícones), SCSS onde aplicável |
| **Comportamento** | JavaScript (ES6+), módulos por funcionalidade (main, login, modais, relatórios, etc.) |
| **Gráficos e PDF** | Chart.js, jsPDF, html2canvas (via CDN conforme templates) |
| **Ambiente** | Arquivo `env` (variáveis de ambiente), config.py; opcional: Docker para execução do Core |
| **Servidor** | Gunicorn (bind, workers, timeout configuráveis); opcional: systemd (autoregweb.service), scripts start/stop/restart |

Resumo: **Python**, **Flask**, **Gunicorn**, **Bootstrap**, **CSS/SCSS**, **JavaScript**, **Jinja2**, **bcrypt**, **Flask-Login**, **requests**, **websocket-client**, **Chart.js**, **jsPDF**, **html2canvas**, **Font Awesome**, e ferramentas de sistema (Bash, systemd) para implantação.

---

## APIs

### API local (uso pela interface web)

A aplicação expõe diversas rotas REST para a própria interface (autenticação por sessão/cookie):

- **Autenticação:** `POST /api/login`, `POST /api/logout`, `GET /api/auth-check`
- **Exames/Tomografias:** carregar/salvar RAs, executar/interromper solicitação de TCs, PDF e histórico
- **Internações:** carregar/salvar dados, buscar pendentes, executar sequência, interromper, revisar AIH, gravar produção, criar/remover flags (`grava.flag`, `pula.flag`), enviar comando
- **Robô/Kasm:** proxy HTTP `GET /api/robo-proxy` e WebSocket para KasmVNC
- **Processos:** listar e reconectar processos ativos (incluindo dentro de Docker)
- **Relatório interno:** `POST /api/relatorio/registrar` (registro de produção pela sessão)
- **Documentação:** `GET /api/docs/readme` (README do Core, se configurado)
- **Extensão:** download e verificação da extensão Chrome

Todas as rotas acima (exceto login e API externa) requerem usuário autenticado.

### API externa (chamadas curl e integrações)

A API externa permite registrar execução de rotinas no relatório de produção **sem** usar a interface web, ideal para o **Core do AUTOREG** ou outros sistemas chamarem via `curl` ou cliente HTTP.

- **Endpoint:** `POST /api/externa/relatorio/registrar`
- **Autenticação:** chave de API (header `X-API-Key` ou campo `api_key` no body JSON)
- **Body (JSON):** `rotina` (string, obrigatório), `registros` (inteiro, obrigatório, ≥ 0)
- **CORS:** habilitado para permitir chamadas de outras origens

Exemplo com **curl**:

```bash
curl -X POST https://seu-dominio.com/api/externa/relatorio/registrar \
  -H "Content-Type: application/json" \
  -H "X-API-Key: SUA_CHAVE_API" \
  -d '{"rotina": "Solicitar Internações", "registros": 25}'
```

Cada usuário possui uma chave de API (gerada na criação da conta ou na primeira inicialização). Documentação detalhada: [API_EXTERNA_RELATORIO.md](API_EXTERNA_RELATORIO.md).

---

## Extensão Chrome

A **extensão Chrome** do AUTOREG-WEB adiciona botões flutuantes na página do KasmVNC onde o Core do AUTOREG está em execução, permitindo:

- **Salvar:** cria a flag `grava.flag` no servidor (atalho **S**)
- **Pular:** cria a flag `pula.flag` no servidor (atalho **P**)

Ela se comunica com a API do AUTOREG-WEB (por exemplo, `POST /api/internacoes-solicitar/criar-flag`) e pode ser configurada com a URL do Core (KasmVNC) e a URL do front-end. Instalação em modo desenvolvedor: carregar a pasta `chrome-extension/` em `chrome://extensions/`. Detalhes: [chrome-extension/README.md](chrome-extension/README.md).

---

## Integração com Kasm (KasmVNC)

O AUTOREG-WEB integra-se ao **Kasm** (KasmVNC) para:

1. **Visualizar o robô:** a interface oferece uma tela que exibe o ambiente gráfico onde o Core roda. O backend atua como **proxy HTTP** (`/api/robo-proxy`) e **proxy WebSocket** para o KasmVNC, contornando restrições de origem e permitindo incorporar a sessão VNC na própria aplicação.
2. **Extensão Chrome:** na sessão KasmVNC, a extensão injeta os botões Salvar/Pular e envia comandos para a API do AUTOREG-WEB, que por sua vez cria as flags no ambiente do Core (Docker/host).

A URL do KasmVNC é configurável (por exemplo, via parâmetro ou configuração do front-end); o proxy conecta-se ao serviço VNC (ex.: `127.0.0.1:6901`) conforme a implantação.

---

## Instalação e configuração

1. **Requisitos:** Python 3.x, pip; opcional: Docker (se o Core rodar em container).
2. **Clonar/baixar** o repositório e criar o arquivo de ambiente:
   ```bash
   cp env_example env
   # Editar env: WORKDIR, PYTHONPATH, AUTOREGPATH, DOCKER, USE_DOCKER, SECRET_KEY, etc.
   ```
3. **Variáveis principais em `env`:**  
   `WORKDIR`, `PYTHONPATH`, `AUTOREGPATH`, `DOCKER`, `USE_DOCKER`, `SECRET_KEY`. Opcional: `CORE_README_PATH`. Ver [VARIAVEIS_AMBIENTE.md](VARIAVEIS_AMBIENTE.md) e [env_example](env_example).
4. **Dependências Python:**
   ```bash
   pip install -r requirements.txt
   ```
5. **Desenvolvimento:**  
   `python app.py` (ou Flask run). A aplicação estará disponível em `http://localhost:5000` (ou a porta configurada).
6. **Produção:**  
   Usar Gunicorn, por exemplo: `gunicorn -c gunicorn_config.py wsgi:application`. Opcional: systemd com `autoregweb.service` e scripts `start_production.sh` / `stop_production.sh` / `restart_production.sh`.
7. **Plesk/Apache:** definir aplicação Python/WSGI com entrada em `wsgi.py`; habilitar `mod_rewrite` se usar `.htaccess`.

O primeiro usuário pode ser criado via script de gerenciamento de usuários (ver [GERENCIAMENTO_USUARIOS.md](GERENCIAMENTO_USUARIOS.md) se existir no repositório).

---

## Estrutura do projeto

```
Autoreg-web/
├── app.py                  # Aplicação Flask principal
├── auth.py                 # Autenticação e usuários
├── config.py               # Carregamento do env
├── wsgi.py                 # Entrada WSGI (Plesk/produção)
├── gunicorn_config.py      # Configuração Gunicorn
├── manage_users.py         # Gerenciamento de usuários
├── requirements.txt        # Dependências Python
├── env_example             # Exemplo de arquivo env
├── autoregweb.service      # Exemplo de unit systemd
├── start_production.sh     # Inicialização em produção
├── stop_production.sh
├── restart_production.sh
├── static/
│   ├── css/                # Glassmorphism, relatórios, documentação
│   ├── js/                 # main, modais, relatórios, etc.
│   ├── bootstrap/          # Bootstrap local
│   └── fontawesome/        # Ícones
├── templates/              # index, login, modais
├── chrome-extension/       # Extensão Chrome (manifest, content, popup, ícones)
├── API_EXTERNA_RELATORIO.md
├── VARIAVEIS_AMBIENTE.md
└── README.md               # Este arquivo
```

---

## Licença

Este projeto é distribuído sob a **GNU General Public License v3.0 (GPL-3.0)**. Você pode usar, modificar e distribuir o software sob os termos da licença, desde que mantenha os avisos de copyright e o texto da GPL. Não há garantia; para os detalhes legais, consulte o arquivo [LICENSE](LICENSE) no repositório ou [https://www.gnu.org/licenses/gpl-3.0.html](https://www.gnu.org/licenses/gpl-3.0.html).

---

## Autor e contato

Copyright © 2025 Michel Ribeiro Paes — [www.michelpaes.adv.br](https://www.michelpaes.adv.br).

Para dúvidas sobre o AUTOREG-WEB ou o AUTOREG (Core), consulte a documentação no repositório e no repositório do AUTOREG (github.com/mrpac6689).

---

# English

## AUTOREG-WEB

Web system for operating and monitoring **AUTOREG** — Automated system for G-HOSP and SISREG operations, developed for the Internal Regulation Center (NIR) of the Emergency Hospital of Rio Branco (HUERB).

This document describes the project in detail: features, technologies, APIs, Chrome extension, Kasm integration, and licensing.

---

## Table of contents (EN)

1. [About AUTOREG-WEB](#about-autoreg-web)
2. [System base: AUTOREG](#system-base-autoreg)
3. [Features](#features)
4. [Technologies used](#technologies-used)
5. [APIs](#apis-en)
6. [Chrome extension](#chrome-extension-en)
7. [Kasm (KasmVNC) integration](#kasm-kasmvnc-integration)
8. [Installation and configuration](#installation-and-configuration-en)
9. [Project structure](#project-structure-en)
10. [License](#license-en)
11. [Author and contact](#author-and-contact-en)

---

## About AUTOREG-WEB

**AUTOREG-WEB** is the web interface that allows NIR-HUERB users to trigger and monitor the hospital regulation center’s automated routines. Through a modern (glassmorphism-style), responsive, and secure interface, users can request tomographies, prepare and run hospitalization requests, print reports, view the robot in real time, and check production reports, among other actions.

The application talks to the **AUTOREG Core** (Python script `autoreg.py`), either on the host or inside a Docker container, and provides REST APIs for internal use (web UI) and external use (integration with other systems and `curl` calls).

---

## System base: AUTOREG

AUTOREG-WEB is the web front-end and orchestrator for **AUTOREG**. The core logic of the routines (portal access, screen automation, business rules) lives in the **AUTOREG** (Core) project, in Python, available under the GNU GPL.

- **AUTOREG (Core) repository and documentation:** [github.com/mrpac6689](https://github.com/mrpac6689)  
- We recommend reading the AUTOREG documentation and source code to understand the system base and available modules (e.g. `-stc`, `-sia`, `-spa`, etc.).

---

## Features

- **Authentication:** login with username and password; user management (create, remove, change password); API key per user for the external API.
- **Add RAs for Tomographies:** load and persist RA numbers for tomography requests.
- **Request Tomographies:** run Core routine (e.g. `-stc`) with real-time output and optional interruption.
- **Print Tomographies:** generate and download PDFs; print history.
- **Prepare Hospitalization Requests:** load data and pending items for the hospitalization flow.
- **Request Hospitalizations:** run Core steps in sequence (e.g. `-spa`, `-sia`, `-ssr`, `-snt`) with real-time output; interrupt and reconnect to processes.
- **View Robot (KasmVNC):** access the graphical environment where the Core runs, via HTTP and WebSocket proxy to KasmVNC, integrated in the UI.
- **Production and Reports:** record routine runs (local and via external API); view production data and charts (e.g. Chart.js).
- **Documentation:** display Core documentation (README) when configured (`CORE_README_PATH`).
- **Chrome extension:** install and configure the extension for interacting with the Core in Kasm (Save/Skip and flag creation).
- **Reconnect Processes:** list and reconnect to running Core processes (including inside Docker).

Sensitive actions require login; the external reports API uses API key authentication.

---

## Technologies used

| Layer | Technology |
|--------|------------|
| **Back-end** | Python 3.x, Flask 3.x, Gunicorn (production), WSGI (Plesk/servers) |
| **Authentication** | Flask-Login, bcrypt (password hashing) |
| **HTTP/Integration** | requests, urllib3 (Core calls, Kasm proxy, APIs) |
| **Real-time** | websocket-client (WebSocket proxy for KasmVNC) |
| **Front-end (structure)** | HTML5, Jinja2 (templates) |
| **Styling** | CSS3 (Glassmorphism), Bootstrap 5.3.2 (local), Font Awesome (icons), SCSS where used |
| **Behavior** | JavaScript (ES6+), modular by feature (main, login, modals, reports, etc.) |
| **Charts and PDF** | Chart.js, jsPDF, html2canvas (via CDN as in templates) |
| **Environment** | `env` file (environment variables), config.py; optional: Docker for Core execution |
| **Server** | Gunicorn (bind, workers, timeout configurable); optional: systemd (autoregweb.service), start/stop/restart scripts |

Summary: **Python**, **Flask**, **Gunicorn**, **Bootstrap**, **CSS/SCSS**, **JavaScript**, **Jinja2**, **bcrypt**, **Flask-Login**, **requests**, **websocket-client**, **Chart.js**, **jsPDF**, **html2canvas**, **Font Awesome**, and system tools (Bash, systemd) for deployment.

---

## APIs (EN)

### Local API (used by the web UI)

The app exposes many REST routes for the UI (session/cookie authentication):

- **Auth:** `POST /api/login`, `POST /api/logout`, `GET /api/auth-check`
- **Exams/Tomographies:** load/save RAs, run/stop TC request, PDF and history
- **Hospitalizations:** load/save data, fetch pending, run sequence, interrupt, review AIH, save production, create/remove flags (`grava.flag`, `pula.flag`), send command
- **Robot/Kasm:** HTTP proxy `GET /api/robo-proxy` and WebSocket for KasmVNC
- **Processes:** list and reconnect active processes (including inside Docker)
- **Internal report:** `POST /api/relatorio/registrar` (production record by session)
- **Documentation:** `GET /api/docs/readme` (Core README if configured)
- **Extension:** Chrome extension download and check

All of the above (except login and external API) require an authenticated user.

### External API (curl and integrations)

The external API registers routine runs in the production report **without** using the web UI, so the **AUTOREG Core** or other systems can call it via `curl` or any HTTP client.

- **Endpoint:** `POST /api/externa/relatorio/registrar`
- **Authentication:** API key (header `X-API-Key` or `api_key` in JSON body)
- **Body (JSON):** `rotina` (string, required), `registros` (integer, required, ≥ 0)
- **CORS:** enabled for cross-origin calls.

Example with **curl**:

```bash
curl -X POST https://your-domain.com/api/externa/relatorio/registrar \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"rotina": "Solicitar Internações", "registros": 25}'
```

Each user has an API key (generated on account creation or on first startup). Full details: [API_EXTERNA_RELATORIO.md](API_EXTERNA_RELATORIO.md).

---

## Chrome extension (EN)

The **Chrome extension** adds floating buttons on the KasmVNC page where the AUTOREG Core runs:

- **Save:** creates `grava.flag` on the server (shortcut **S**)
- **Skip:** creates `pula.flag` on the server (shortcut **P**)

It talks to the AUTOREG-WEB API (e.g. `POST /api/internacoes-solicitar/criar-flag`) and can be configured with the Core (KasmVNC) URL and front-end URL. Install in developer mode by loading the `chrome-extension/` folder in `chrome://extensions/`. Details: [chrome-extension/README.md](chrome-extension/README.md).

---

## Kasm (KasmVNC) integration

AUTOREG-WEB integrates with **Kasm** (KasmVNC) to:

1. **View the robot:** the UI provides a screen showing the graphical environment where the Core runs. The backend acts as an **HTTP proxy** (`/api/robo-proxy`) and **WebSocket proxy** to KasmVNC, working around origin restrictions and embedding the VNC session in the app.
2. **Chrome extension:** on the KasmVNC session, the extension injects Save/Skip buttons and sends commands to the AUTOREG-WEB API, which creates the flags in the Core environment (Docker/host).

The KasmVNC URL is configurable (e.g. via parameter or front-end config); the proxy connects to the VNC service (e.g. `127.0.0.1:6901`) according to your deployment.

---

## Installation and configuration (EN)

1. **Requirements:** Python 3.x, pip; optional: Docker (if Core runs in a container).
2. **Clone/download** the repo and create the env file:
   ```bash
   cp env_example env
   # Edit env: WORKDIR, PYTHONPATH, AUTOREGPATH, DOCKER, USE_DOCKER, SECRET_KEY, etc.
   ```
3. **Main variables in `env`:**  
   `WORKDIR`, `PYTHONPATH`, `AUTOREGPATH`, `DOCKER`, `USE_DOCKER`, `SECRET_KEY`. Optional: `CORE_README_PATH`. See [VARIAVEIS_AMBIENTE.md](VARIAVEIS_AMBIENTE.md) and [env_example](env_example).
4. **Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
5. **Development:**  
   `python app.py` (or Flask run). App available at `http://localhost:5000` (or configured port).
6. **Production:**  
   Use Gunicorn, e.g.: `gunicorn -c gunicorn_config.py wsgi:application`. Optional: systemd with `autoregweb.service` and `start_production.sh` / `stop_production.sh` / `restart_production.sh`.
7. **Plesk/Apache:** set Python/WSGI app with entry point `wsgi.py`; enable `mod_rewrite` if using `.htaccess`.

The first user can be created via the user management script (see [GERENCIAMENTO_USUARIOS.md](GERENCIAMENTO_USUARIOS.md) if present in the repo).

---

## Project structure (EN)

```
Autoreg-web/
├── app.py                  # Main Flask application
├── auth.py                 # Authentication and users
├── config.py               # Env loading
├── wsgi.py                 # WSGI entry (Plesk/production)
├── gunicorn_config.py      # Gunicorn config
├── manage_users.py         # User management
├── requirements.txt        # Python dependencies
├── env_example             # Example env file
├── autoregweb.service      # Example systemd unit
├── start_production.sh     # Production startup
├── stop_production.sh
├── restart_production.sh
├── static/
│   ├── css/                # Glassmorphism, reports, documentation
│   ├── js/                 # main, modals, reports, etc.
│   ├── bootstrap/          # Local Bootstrap
│   └── fontawesome/        # Icons
├── templates/              # index, login, modals
├── chrome-extension/       # Chrome extension (manifest, content, popup, icons)
├── API_EXTERNA_RELATORIO.md
├── VARIAVEIS_AMBIENTE.md
└── README.md               # This file
```

---

## License (EN)

This project is distributed under the **GNU General Public License v3.0 (GPL-3.0)**. You may use, modify, and distribute the software under the terms of the license, provided you keep the copyright notices and the GPL text. There is no warranty; for legal details see the [LICENSE](LICENSE) file in the repository or [https://www.gnu.org/licenses/gpl-3.0.html](https://www.gnu.org/licenses/gpl-3.0.html).

---

## Author and contact (EN)

Copyright © 2025 Michel Ribeiro Paes — [www.michelpaes.adv.br](https://www.michelpaes.adv.br).

For questions about AUTOREG-WEB or AUTOREG (Core), refer to the repository documentation and the AUTOREG repository (github.com/mrpac6689).
