# Variáveis de Ambiente - AUTOREG

Este documento descreve as variáveis de ambiente configuradas no arquivo `env`.

## Arquivo de Configuração

O arquivo `env` contém as variáveis de caminho utilizadas pela aplicação. A sintaxe suportada é:

```
VARIAVEL = valor
```

ou

```
VARIAVEL=valor
```

## Variáveis Configuradas

### WORKDIR
- **Descrição**: Diretório para arquivos temporários
- **Valor padrão**: `/home/michel/AutoReg`
- **Tipo**: Diretório
- **Uso**: Local onde serão armazenados arquivos temporários gerados pela aplicação

### PYTHONPATH
- **Descrição**: Caminho do executável Python3
- **Valor padrão**: `/home/michel/code/autoreg/venv/bin/python3`
- **Tipo**: Arquivo executável
- **Uso**: Caminho completo do interpretador Python a ser utilizado para execuções externas

### AUTOREGPATH
- **Descrição**: Caminho da aplicação Autoreg principal
- **Valor padrão**: `/home/michel/code/autoreg/autoreg.py`
- **Tipo**: Arquivo Python
- **Uso**: Caminho para o script principal do sistema Autoreg (aplicação backend)
- **Nota**: Se estiver usando Docker, este caminho deve ser relativo ao container

### DOCKER
- **Descrição**: Comando para acessar o container Docker
- **Valor padrão**: `/usr/bin/docker exec -it autoreg bash`
- **Tipo**: String de comando
- **Uso**: Comando usado para acessar o container onde a aplicação Autoreg roda
- **Nota**: O sistema extrai automaticamente o nome do container (ex: `autoreg`) para executar comandos dentro dele

### USE_DOCKER
- **Descrição**: Ativa/desativa a execução de comandos dentro do container Docker
- **Valor padrão**: `false`
- **Valores aceitos**: `true`, `false`, `1`, `0`, `yes`, `no`, `on`, `off`, `enabled`, `disabled`
- **Tipo**: Boolean (string)
- **Uso**: Controla se os comandos AUTOREG devem ser executados dentro do container Docker ou diretamente no host
- **Nota**: 
  - Se `USE_DOCKER=true`: Comandos serão executados via `docker exec <container> <comando>`
  - Se `USE_DOCKER=false`: Comandos serão executados diretamente no host
  - Mesmo com `USE_DOCKER=true`, se o container não estiver acessível, os comandos falharão

## Carregamento das Variáveis

As variáveis são carregadas automaticamente pelo módulo `config.py` que:

1. Lê o arquivo `env` na raiz do projeto
2. Parseia as variáveis (suporta espaços ao redor do `=`)
3. Define as variáveis no ambiente do sistema (`os.environ`)
4. Disponibiliza constantes para uso na aplicação

## Uso na Aplicação

```python
from config import WORKDIR, PYTHONPATH, AUTOREGPATH, DOCKER_CONTAINER, USE_DOCKER

# Exemplo de uso
import os
os.chdir(WORKDIR)  # Muda para o diretório de trabalho

# Verificar se Docker está habilitado
if USE_DOCKER and DOCKER_CONTAINER:
    # Comandos serão executados dentro do container
    pass
else:
    # Comandos serão executados diretamente no host
    pass
```

## Validação

Execute `python3 config.py` para validar se os caminhos configurados existem:

```bash
python3 config.py
```

Isso exibirá:
- ✓ para caminhos que existem
- ✗ para caminhos que não existem
- Tipo de cada caminho (Diretório ou Arquivo)

## Notas

- O arquivo `env` não deve ser commitado no repositório (já está no `.gitignore`)
- Cada ambiente (desenvolvimento, produção) pode ter seu próprio arquivo `env`
- Os valores padrão são usados caso o arquivo `env` não exista ou a variável não esteja definida

