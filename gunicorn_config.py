# Configuração do Gunicorn para produção
bind = "100.99.180.78:5000"
workers = 4
threads = 2
timeout = 120
worker_class = "sync"
accesslog = "-"
errorlog = "-"
loglevel = "info"
keepalive = 5
max_requests = 1000
max_requests_jitter = 50
