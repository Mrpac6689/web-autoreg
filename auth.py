"""
Sistema de autenticação para AUTOREG
Gerencia usuários e senhas com criptografia bcrypt
"""

import bcrypt
import json
import os
from pathlib import Path
from typing import Optional, Dict, List

# Caminho do arquivo de usuários
USERS_FILE = Path(__file__).parent / 'users.json'


def carregar_usuarios() -> Dict[str, Dict]:
    """Carrega usuários do arquivo JSON"""
    if not USERS_FILE.exists():
        return {}
    
    try:
        with open(USERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def salvar_usuarios(usuarios: Dict[str, Dict]) -> bool:
    """Salva usuários no arquivo JSON"""
    try:
        # Criar diretório se não existir
        USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
        
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(usuarios, f, indent=2, ensure_ascii=False)
        return True
    except IOError:
        return False


def hash_senha(senha: str) -> str:
    """Criptografa senha usando bcrypt"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(senha.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verificar_senha(senha: str, hash_senha: str) -> bool:
    """Verifica se a senha corresponde ao hash"""
    try:
        return bcrypt.checkpw(senha.encode('utf-8'), hash_senha.encode('utf-8'))
    except Exception:
        return False


def adicionar_usuario(username: str, senha: str, nome: str = "") -> bool:
    """Adiciona ou atualiza um usuário"""
    usuarios = carregar_usuarios()
    
    usuarios[username] = {
        'senha_hash': hash_senha(senha),
        'nome': nome or username,
        'ativo': True
    }
    
    return salvar_usuarios(usuarios)


def remover_usuario(username: str) -> bool:
    """Remove um usuário"""
    usuarios = carregar_usuarios()
    
    if username not in usuarios:
        return False
    
    del usuarios[username]
    return salvar_usuarios(usuarios)


def listar_usuarios() -> List[Dict]:
    """Lista todos os usuários (sem senhas)"""
    usuarios = carregar_usuarios()
    return [
        {
            'username': username,
            'nome': data.get('nome', username),
            'ativo': data.get('ativo', True)
        }
        for username, data in usuarios.items()
    ]


def autenticar(username: str, senha: str) -> Optional[Dict]:
    """Autentica um usuário e retorna dados do usuário se válido"""
    usuarios = carregar_usuarios()
    
    if username not in usuarios:
        return None
    
    usuario = usuarios[username]
    
    # Verificar se está ativo
    if not usuario.get('ativo', True):
        return None
    
    # Verificar senha
    if not verificar_senha(senha, usuario['senha_hash']):
        return None
    
    return {
        'username': username,
        'nome': usuario.get('nome', username)
    }


def alterar_senha(username: str, nova_senha: str) -> bool:
    """Altera a senha de um usuário"""
    usuarios = carregar_usuarios()
    
    if username not in usuarios:
        return False
    
    usuarios[username]['senha_hash'] = hash_senha(nova_senha)
    return salvar_usuarios(usuarios)


def usuario_existe(username: str) -> bool:
    """Verifica se um usuário existe"""
    usuarios = carregar_usuarios()
    return username in usuarios
