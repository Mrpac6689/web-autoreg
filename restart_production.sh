#!/bin/bash

# Script para reiniciar o servidor em modo produção
# Uso: ./restart_production.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Reiniciando servidor Autoreg Web"
echo "=========================================="

# Parar o servidor
echo ""
echo "1. Parando servidor atual..."
"$SCRIPT_DIR/stop_production.sh"

# Aguardar um pouco para garantir que o servidor parou completamente
sleep 2

# Verificar se ainda há processos rodando
REMAINING=$(pgrep -f "gunicorn.*wsgi:application")
if [ ! -z "$REMAINING" ]; then
    echo "Aviso: Ainda há processos rodando. Forçando parada..."
    pkill -9 -f "gunicorn.*wsgi:application"
    sleep 1
fi

# Iniciar o servidor em background
echo ""
echo "2. Iniciando servidor em background..."
"$SCRIPT_DIR/start_production.sh" --background

# Aguardar um pouco para verificar se iniciou
sleep 3

# Verificar se o servidor está rodando
PID=$(pgrep -f "gunicorn.*wsgi:application")
if [ ! -z "$PID" ]; then
    echo ""
    echo "=========================================="
    echo "✓ Servidor reiniciado com sucesso!"
    echo "  PID: $PID"
    echo "  URL: http://100.99.180.78:5000"
    echo "=========================================="
else
    echo ""
    echo "=========================================="
    echo "✗ Erro: Servidor não iniciou corretamente"
    echo "  Verifique os logs para mais informações"
    echo "=========================================="
    exit 1
fi
