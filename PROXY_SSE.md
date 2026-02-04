# Proxy e rotas de streaming (SSE)

Se a aplicação estiver atrás de um **proxy reverso** (nginx, Traefik, Caddy, etc.), as rotas que usam **Server-Sent Events (SSE)** podem ser fechadas por timeout de leitura, gerando 502 para o cliente mesmo com o processo continuando no servidor.

## Rotas SSE

- `/api/solicitar-tcs/executar`
- `/api/processos/reconectar`
- `/api/exames-solicitar/preparar` (executar preparar)
- `/api/internacoes-solicitar/buscar-pendentes`
- Outras que retornam `text/event-stream`

## Configuração recomendada

### Gunicorn

O `gunicorn_config.py` já usa `timeout = 3600` (1 hora) para permitir streams longos.

### Nginx

Aumente o timeout de leitura para as rotas de API (ou para o `location` que faz proxy para o app):

```nginx
location /api/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding off;

    # Essencial para SSE: timeout de leitura alto (ex.: 1 hora)
    proxy_read_timeout 3600s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 3600s;
}
```

### Traefik

Exemplo com middleware ou anotações para aumentar timeout em rotas que servem SSE (consultar documentação da sua versão):

- `traefik.http.services.<nome>.loadbalancer.responseForwarding.flushInterval`
- Timeouts de read/write conforme documentação do Traefik.

### Caddy

No bloco `reverse_proxy`:

```
reverse_proxy backend {
    transport http {
        read_timeout 1h
        write_timeout 1h
    }
}
```

Sem um timeout de leitura alto no proxy, conexões SSE longas (minutos) podem ser encerradas e o usuário verá 502 mesmo com o processo rodando no servidor.
