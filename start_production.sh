#!/bin/bash

# Script para iniciar o servidor em modo produção
# Uso: ./start_production.sh [--background]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Verificar se já está rodando
EXISTING=$(pgrep -f "gunicorn.*wsgi:application")
if [ ! -z "$EXISTING" ]; then
    echo "Aviso: Servidor Gunicorn já está rodando (PID: $EXISTING)"
    echo "Use ./stop_production.sh para parar antes de iniciar novamente."
    exit 1
fi

# Ativar ambiente virtual (se estiver usando)
if [ -d "venv" ]; then
    source venv/bin/activate
fi

echo "Iniciando servidor Gunicorn em http://100.99.180.78:5000..."

# Verificar se deve rodar em background
if [ "$1" == "--background" ] || [ "$1" == "-b" ]; then
    echo "Executando em background (logs em gunicorn.log)..."
    nohup gunicorn -c gunicorn_config.py wsgi:application > gunicorn.log 2>&1 &
    sleep 2
    PID=$(pgrep -f "gunicorn.*wsgi:application")
    if [ ! -z "$PID" ]; then
        echo "✓ Servidor iniciado em background (PID: $PID)"
    else
        echo "✗ Erro ao iniciar servidor. Verifique gunicorn.log"
        exit 1
    fi
else
    # Executar com Gunicorn em foreground
    gunicorn -c gunicorn_config.py wsgi:application
fi
