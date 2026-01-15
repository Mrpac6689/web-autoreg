#!/usr/bin/env python3
"""
Script para gerenciar usuários do sistema AUTOREG
Uso:
    python manage_users.py add <username> <senha> [nome]
    python manage_users.py remove <username>
    python manage_users.py list
    python manage_users.py change-password <username> <nova_senha>
"""

import sys
import getpass
from auth import (
    adicionar_usuario, remover_usuario, listar_usuarios,
    alterar_senha, usuario_existe
)


def adicionar(username, senha, nome=""):
    """Adiciona um novo usuário"""
    if usuario_existe(username):
        print(f"❌ Erro: Usuário '{username}' já existe.")
        return False
    
    if adicionar_usuario(username, senha, nome):
        print(f"✅ Usuário '{username}' adicionado com sucesso!")
        return True
    else:
        print(f"❌ Erro ao adicionar usuário '{username}'.")
        return False


def remover(username):
    """Remove um usuário"""
    if not usuario_existe(username):
        print(f"❌ Erro: Usuário '{username}' não existe.")
        return False
    
    confirmacao = input(f"Tem certeza que deseja remover o usuário '{username}'? (s/N): ")
    if confirmacao.lower() != 's':
        print("Operação cancelada.")
        return False
    
    if remover_usuario(username):
        print(f"✅ Usuário '{username}' removido com sucesso!")
        return True
    else:
        print(f"❌ Erro ao remover usuário '{username}'.")
        return False


def listar():
    """Lista todos os usuários"""
    usuarios = listar_usuarios()
    
    if not usuarios:
        print("Nenhum usuário cadastrado.")
        return
    
    print("\n" + "="*60)
    print("USUÁRIOS CADASTRADOS")
    print("="*60)
    print(f"{'Usuário':<20} {'Nome':<25} {'Status':<10}")
    print("-"*60)
    
    for user in usuarios:
        status = "Ativo" if user.get('ativo', True) else "Inativo"
        nome = user.get('nome', user['username'])
        print(f"{user['username']:<20} {nome:<25} {status:<10}")
    
    print("="*60)
    print(f"Total: {len(usuarios)} usuário(s)\n")


def mudar_senha(username, nova_senha):
    """Altera a senha de um usuário"""
    if not usuario_existe(username):
        print(f"❌ Erro: Usuário '{username}' não existe.")
        return False
    
    if alterar_senha(username, nova_senha):
        print(f"✅ Senha do usuário '{username}' alterada com sucesso!")
        return True
    else:
        print(f"❌ Erro ao alterar senha do usuário '{username}'.")
        return False


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    comando = sys.argv[1].lower()
    
    if comando == 'add':
        if len(sys.argv) < 4:
            print("Uso: python manage_users.py add <username> <senha> [nome]")
            sys.exit(1)
        
        username = sys.argv[2]
        senha = sys.argv[3]
        nome = sys.argv[4] if len(sys.argv) > 4 else ""
        
        adicionar(username, senha, nome)
    
    elif comando == 'remove':
        if len(sys.argv) < 3:
            print("Uso: python manage_users.py remove <username>")
            sys.exit(1)
        
        username = sys.argv[2]
        remover(username)
    
    elif comando == 'list':
        listar()
    
    elif comando == 'change-password' or comando == 'changepassword':
        if len(sys.argv) < 4:
            print("Uso: python manage_users.py change-password <username> <nova_senha>")
            sys.exit(1)
        
        username = sys.argv[2]
        nova_senha = sys.argv[3]
        mudar_senha(username, nova_senha)
    
    else:
        print(f"❌ Comando desconhecido: {comando}")
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
