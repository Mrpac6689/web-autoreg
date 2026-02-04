# Configuração do Gunicorn para produção
bind = "100.99.180.78:5000"
# Um worker para que listar/reconectar processos vejam o mesmo estado (processos_ativos em memória)
workers = 1
threads = 2
# Timeout alto para permitir streams SSE longos (ex.: solicitar TCs pode levar muitos minutos)
timeout = 3600
worker_class = "sync"
accesslog = "-"
errorlog = "-"
loglevel = "info"
keepalive = 5
max_requests = 1000
max_requests_jitter = 50
