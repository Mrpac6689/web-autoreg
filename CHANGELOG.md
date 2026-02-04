# Changelog

Histórico de alterações notáveis do **AUTOREG-WEB**. O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/) quando aplicável.

---

## Índice

- [Em português (PT-BR)](#em-português-pt-br)
- [In English](#in-english)

---

## Em português (PT-BR)

### [Não lançado] (Unreleased)

#### Corrigido

- **Streaming e 502 nos modais:** solução para desconexão aparente dos streams de terminal (502) e para "Investigar Processos" não encontrar processos em execução.
  - Gunicorn: timeout aumentado para 3600 s e uso de um único worker para estado de processos consistente (listar/reconectar).
  - Backend: keepalive SSE (comentário a cada ~20 s) em todas as rotas de streaming para evitar que proxy/balanceador feche por idle.
  - Cliente (Solicitar Tomografias): em 502/503 ou erro de rede, consulta `/api/processos/listar` e orienta o usuário a usar "Reconectar a Processos em Execução" quando o processo ainda estiver rodando; retry automático (2 tentativas com backoff) em 502/503; sessionId persistido em sessionStorage para orientar reconexão ao reabrir o modal.
  - Documentação: PROXY_SSE.md com exemplos de configuração de proxy (nginx, Traefik, Caddy) para timeouts longos em rotas SSE.

#### Documentação

- Documentação: README.md completo com seções em PT-BR e inglês.
- Documentação: CHANGELOG.md para histórico de versões.
- Funcionalidades e tecnologias descritas em detalhes no README.
- Referência ao AUTOREG (Core) e licença GNU GPL no README.

### [1.0.0] — 2025

#### Adicionado

- **Interface web:** aplicação Flask com visual Glassmorphism; Bootstrap 5.3.2 e Font Awesome locais; design responsivo.
- **Autenticação:** login com usuário e senha; gerenciamento de usuários (criação, remoção, alteração de senha); suporte a chave de API por usuário.
- **Tomografias:** inserção de RAs, solicitação de TCs (rotina Core), impressão em PDF e histórico.
- **Internações:** preparação de solicitações, execução sequencial de etapas do Core (-spa, -sia, -ssr, -snt), interrupção e reconexão a processos; revisão de AIH e gravação de produção.
- **Flags:** criação/remoção de flags (grava.flag, pula.flag) via API; integração com extensão Chrome.
- **Visualizar robô:** proxy HTTP e WebSocket para KasmVNC; integração com Kasm para exibir o ambiente onde o Core roda.
- **Produção e relatórios:** registro de execuções de rotinas (CSV); API interna e API externa com autenticação por chave de API; gráficos (Chart.js).
- **API externa:** endpoint `POST /api/externa/relatorio/registrar` para chamadas curl e integrações externas (incluindo Core); documentação em API_EXTERNA_RELATORIO.md.
- **Extensão Chrome:** botões Salvar/Pular na sessão KasmVNC; atalhos S e P; configuração de URL do Core e do front-end.
- **Documentação do Core:** exibição do README do Core quando configurado (CORE_README_PATH).
- **Processos:** listagem e reconexão a processos em execução (incluindo dentro de Docker).
- **Configuração:** arquivo `env` (env_example); variáveis WORKDIR, PYTHONPATH, AUTOREGPATH, DOCKER, USE_DOCKER, SECRET_KEY; documentação em VARIAVEIS_AMBIENTE.md.
- **Produção:** Gunicorn (gunicorn_config.py), WSGI (wsgi.py), scripts start/stop/restart e exemplo de unit systemd (autoregweb.service).

#### Segurança

- Cookies de sessão com HttpOnly, Secure e SameSite; SECRET_KEY configurável via env.
- Senhas com bcrypt; chaves de API únicas por usuário para a API externa.

---

## In English

### [Unreleased]

#### Fixed

- **Streaming and 502 in modals:** fix for apparent disconnection of terminal streams (502) and "Investigate Processes" not finding running processes.
  - Gunicorn: timeout increased to 3600 s and single worker for consistent process state (list/reconnect).
  - Backend: SSE keepalive (comment every ~20 s) on all streaming routes to prevent proxy/load balancer from closing due to idle.
  - Client (Request Tomographies): on 502/503 or network error, calls `/api/processos/listar` and guides user to use "Reconnect to Running Processes" when the process is still running; automatic retry (2 attempts with backoff) on 502/503; sessionId persisted in sessionStorage to guide reconnect when reopening the modal.
  - Documentation: PROXY_SSE.md with proxy configuration examples (nginx, Traefik, Caddy) for long timeouts on SSE routes.

#### Documentation

- Documentation: full README with PT-BR and English sections.
- Documentation: CHANGELOG.md for version history.
- Features and technologies described in detail in README.
- Reference to AUTOREG (Core) and GNU GPL license in README.

### [1.0.0] — 2025

#### Added

- **Web interface:** Flask app with Glassmorphism UI; local Bootstrap 5.3.2 and Font Awesome; responsive layout.
- **Authentication:** login with username and password; user management (create, remove, change password); API key per user.
- **Tomographies:** RA input, TC request (Core routine), PDF print and history.
- **Hospitalizations:** request preparation, sequential Core steps (-spa, -sia, -ssr, -snt), interrupt and reconnect processes; AIH review and production recording.
- **Flags:** create/remove flags (grava.flag, pula.flag) via API; Chrome extension integration.
- **View robot:** HTTP and WebSocket proxy to KasmVNC; Kasm integration to show the Core environment.
- **Production and reports:** routine run recording (CSV); internal and external API with API key auth; charts (Chart.js).
- **External API:** endpoint `POST /api/externa/relatorio/registrar` for curl and external integrations (including Core); docs in API_EXTERNA_RELATORIO.md.
- **Chrome extension:** Save/Skip buttons on KasmVNC session; shortcuts S and P; Core and front-end URL configuration.
- **Core documentation:** display Core README when configured (CORE_README_PATH).
- **Processes:** list and reconnect running processes (including inside Docker).
- **Configuration:** `env` file (env_example); WORKDIR, PYTHONPATH, AUTOREGPATH, DOCKER, USE_DOCKER, SECRET_KEY; docs in VARIAVEIS_AMBIENTE.md.
- **Production:** Gunicorn (gunicorn_config.py), WSGI (wsgi.py), start/stop/restart scripts and systemd unit example (autoregweb.service).

#### Security

- Session cookies with HttpOnly, Secure and SameSite; SECRET_KEY configurable via env.
- Passwords with bcrypt; unique API keys per user for external API.

---

[Não lançado]: https://github.com/mrpac6689/web-autoreg/compare/v1.0.0...HEAD  
[1.0.0]: https://github.com/mrpac6689/web-autoreg/releases/tag/v1.0.0


