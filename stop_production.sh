#!/bin/bash

# Script para parar o servidor em modo produção
# Uso: ./stop_production.sh

echo "Parando servidor Gunicorn..."

# Procurar processos do Gunicorn relacionados ao wsgi:application
PID=$(pgrep -f "gunicorn.*wsgi:application")

if [ -z "$PID" ]; then
    echo "Nenhum processo Gunicorn encontrado rodando."
    exit 0
fi

echo "Processo encontrado: PID $PID"

# Parar o processo master do Gunicorn (que vai parar todos os workers)
kill -TERM $PID 2>/dev/null

# Aguardar até 10 segundos para o processo terminar graciosamente
for i in {1..10}; do
    if ! kill -0 $PID 2>/dev/null; then
        echo "Servidor parado com sucesso."
        exit 0
    fi
    sleep 1
done

# Se ainda estiver rodando após 10 segundos, forçar kill
if kill -0 $PID 2>/dev/null; then
    echo "Processo não respondeu ao TERM, forçando parada..."
    kill -KILL $PID 2>/dev/null
    sleep 1
fi

# Verificar se ainda há processos
REMAINING=$(pgrep -f "gunicorn.*wsgi:application")
if [ -z "$REMAINING" ]; then
    echo "Servidor parado com sucesso."
else
    echo "Aviso: Ainda há processos Gunicorn rodando. PIDs: $REMAINING"
    echo "Execute 'pkill -f gunicorn' para forçar parada de todos."
fi
