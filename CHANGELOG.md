# Changelog

Histórico de alterações notáveis do **AUTOREG-WEB**. O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/) quando aplicável.

---

## Índice

- [Em português (PT-BR)](#em-português-pt-br)
- [In English](#in-english)

---

## Em português (PT-BR)

### [Não lançado] (Unreleased)

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

[Não lançado]: https://github.com/mrpac6689/Autoreg-web/compare/v1.0.0...HEAD  
[1.0.0]: https://github.com/mrpac6689/Autoreg-web/releases/tag/v1.0.0

*(Substitua as URLs acima pelo repositório real do AUTOREG-WEB, se diferente.)*
