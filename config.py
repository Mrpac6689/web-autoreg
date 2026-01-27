"""
Módulo de configuração para carregar variáveis de ambiente do arquivo env
"""

import os
from pathlib import Path


def load_env_file(env_file='env'):
    """
    Carrega variáveis de ambiente de um arquivo env customizado.
    
    O arquivo pode ter formato:
    VARIAVEL = valor
    ou
    VARIAVEL=valor
    
    Args:
        env_file (str): Nome do arquivo de configuração
        
    Returns:
        dict: Dicionário com as variáveis carregadas
    """
    env_vars = {}
    env_path = Path(__file__).parent / env_file
    
    if not env_path.exists():
        print(f"Aviso: Arquivo {env_file} não encontrado")
        return env_vars
    
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            
            # Ignora linhas vazias e comentários
            if not line or line.startswith('#'):
                continue
            
            # Suporta ambos os formatos: VAR = valor e VAR=valor
            if '=' in line:
                # Remove espaços ao redor do = e divide
                parts = [p.strip() for p in line.split('=', 1)]
                if len(parts) == 2:
                    key, value = parts
                    env_vars[key] = value
                    # Define também como variável de ambiente do sistema
                    os.environ[key] = value
    
    return env_vars


# Carrega as variáveis do arquivo env
env_config = load_env_file()

# Variáveis de caminho
WORKDIR = env_config.get('WORKDIR', '/home/michel/AutoReg')
PYTHONPATH = env_config.get('PYTHONPATH', '/usr/bin/python3')
AUTOREGPATH = env_config.get('AUTOREGPATH', '/home/michel/code/autoreg/autoreg.py')
DOCKER = env_config.get('DOCKER', '/usr/bin/docker exec -it autoreg bash')

# Flag para ativar/desativar execução em container Docker
USE_DOCKER_STR = env_config.get('USE_DOCKER', 'false').lower().strip()
USE_DOCKER = USE_DOCKER_STR in ['true', '1', 'yes', 'on', 'enabled']

# Chave secreta para assinatura de cookies e sessões
# IMPORTANTE: Gere uma chave aleatória única para produção!
# Use: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY = env_config.get('SECRET_KEY', None)

# Extrair nome do container do comando Docker
# Formato esperado: /usr/bin/docker exec -it <container> bash
DOCKER_CONTAINER = None
if USE_DOCKER and DOCKER:
    parts = DOCKER.split()
    for i, part in enumerate(parts):
        if part == 'exec' and i + 1 < len(parts):
            # Próximo parâmetro pode ser -it, então o container está depois
            if i + 2 < len(parts) and parts[i + 1] in ['-it', '-i', '-t']:
                DOCKER_CONTAINER = parts[i + 2] if i + 2 < len(parts) else None
            elif i + 1 < len(parts):
                DOCKER_CONTAINER = parts[i + 1]
            break

# Validação dos caminhos
def validate_paths():
    """Valida se os caminhos configurados existem"""
    paths_status = {
        'WORKDIR': {
            'path': WORKDIR,
            'exists': os.path.exists(WORKDIR),
            'is_dir': os.path.isdir(WORKDIR) if os.path.exists(WORKDIR) else False
        },
        'PYTHONPATH': {
            'path': PYTHONPATH,
            'exists': os.path.exists(PYTHONPATH),
            'is_file': os.path.isfile(PYTHONPATH) if os.path.exists(PYTHONPATH) else False
        },
        'AUTOREGPATH': {
            'path': AUTOREGPATH,
            'exists': os.path.exists(AUTOREGPATH),
            'is_file': os.path.isfile(AUTOREGPATH) if os.path.exists(AUTOREGPATH) else False
        }
    }
    return paths_status


# Exibe informações sobre as variáveis carregadas
if __name__ == '__main__':
    print("=== Configuração de Variáveis de Ambiente ===\n")
    print(f"WORKDIR: {WORKDIR}")
    print(f"PYTHONPATH: {PYTHONPATH}")
    print(f"AUTOREGPATH: {AUTOREGPATH}")
    print(f"DOCKER: {DOCKER}")
    print(f"USE_DOCKER: {USE_DOCKER}")
    print(f"DOCKER_CONTAINER: {DOCKER_CONTAINER if USE_DOCKER else 'Desabilitado'}")
    print("\n=== Validação de Caminhos ===\n")
    status = validate_paths()
    for var_name, info in status.items():
        exists = "✓" if info['exists'] else "✗"
        print(f"{exists} {var_name}: {info['path']}")
        if info['exists']:
            if 'is_dir' in info:
                print(f"  Tipo: Diretório" if info['is_dir'] else "  Tipo: Arquivo")
            elif 'is_file' in info:
                print(f"  Tipo: Arquivo" if info['is_file'] else "  Tipo: Diretório")

