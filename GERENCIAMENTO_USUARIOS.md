# Gerenciamento de Usuários - AUTOREG

Este documento descreve como gerenciar usuários e senhas do sistema AUTOREG.

## Arquivo de Usuários

Os usuários são armazenados no arquivo `users.json` na raiz do projeto. As senhas são criptografadas usando **bcrypt**, garantindo segurança mesmo se o arquivo for acessado.

**⚠️ IMPORTANTE:** Mantenha o arquivo `users.json` seguro e não o compartilhe publicamente.

## Instalação de Dependências

Certifique-se de que as dependências estão instaladas:

```bash
pip install -r requirements.txt
```

As dependências necessárias para autenticação são:
- `bcrypt==4.1.2` - Criptografia de senhas
- `flask-login==0.6.3` - Gerenciamento de sessões

## Script de Gerenciamento

O sistema inclui um script Python para gerenciar usuários: `manage_users.py`

### Adicionar Usuário

Para adicionar um novo usuário:

```bash
python manage_users.py add <username> <senha> [nome]
```

**Exemplos:**
```bash
# Adicionar usuário com senha
python manage_users.py add admin senha123

# Adicionar usuário com nome completo
python manage_users.py add joao.silva senha456 "João da Silva"

# Adicionar usuário médico
python manage_users.py add dr.maria senha789 "Dra. Maria Santos"
```

**Parâmetros:**
- `username`: Nome de usuário (obrigatório, sem espaços)
- `senha`: Senha do usuário (obrigatório)
- `nome`: Nome completo do usuário (opcional, se não informado, usa o username)

### Remover Usuário

Para remover um usuário:

```bash
python manage_users.py remove <username>
```

**Exemplo:**
```bash
python manage_users.py remove joao.silva
```

⚠️ **Atenção:** Esta operação é irreversível. O usuário será solicitado a confirmar antes de remover.

### Listar Usuários

Para listar todos os usuários cadastrados:

```bash
python manage_users.py list
```

**Saída:**
```
============================================================
USUÁRIOS CADASTRADOS
============================================================
Usuário              Nome                      Status    
------------------------------------------------------------
admin                admin                     Ativo     
joao.silva           João da Silva             Ativo     
dr.maria             Dra. Maria Santos         Ativo     
============================================================
Total: 3 usuário(s)
```

### Alterar Senha

Para alterar a senha de um usuário:

```bash
python manage_users.py change-password <username> <nova_senha>
```

**Exemplo:**
```bash
python manage_users.py change-password admin novaSenha123
```

## Estrutura do Arquivo users.json

O arquivo `users.json` tem a seguinte estrutura:

```json
{
  "admin": {
    "senha_hash": "$2b$12$...",
    "nome": "Administrador",
    "ativo": true
  },
  "joao.silva": {
    "senha_hash": "$2b$12$...",
    "nome": "João da Silva",
    "ativo": true
  }
}
```

**Campos:**
- `senha_hash`: Hash bcrypt da senha (nunca armazene senhas em texto plano)
- `nome`: Nome completo do usuário
- `ativo`: Status do usuário (true/false)

## Segurança

### Boas Práticas

1. **Senhas Fortes:**
   - Use senhas com pelo menos 8 caracteres
   - Combine letras maiúsculas, minúsculas, números e símbolos
   - Evite senhas comuns ou previsíveis

2. **Gerenciamento de Acesso:**
   - Remova usuários que não precisam mais de acesso
   - Altere senhas periodicamente
   - Use nomes de usuário descritivos mas não óbvios

3. **Proteção do Arquivo:**
   - Mantenha `users.json` com permissões restritas (chmod 600)
   - Não commite o arquivo no controle de versão (já está no .gitignore)
   - Faça backup regular do arquivo

### Permissões Recomendadas

```bash
chmod 600 users.json
```

## Primeiro Usuário (Setup Inicial)

Para criar o primeiro usuário administrador:

```bash
python manage_users.py add admin SuaSenhaSegura123 "Administrador do Sistema"
```

## Integração com o Sistema

O sistema de autenticação está integrado com:

- **Flask-Login**: Gerencia sessões de usuário
- **bcrypt**: Criptografia de senhas
- **Rotas Protegidas**: Todas as rotas da API (exceto `/login` e `/api/login`) requerem autenticação

### Rotas Públicas
- `/login` - Página de login
- `/api/login` - API de autenticação

### Rotas Protegidas
- `/` - Página principal
- `/api/*` - Todas as APIs (exceto login)

## Solução de Problemas

### Erro: "Usuário ou senha inválidos"
- Verifique se o usuário existe: `python manage_users.py list`
- Confirme que a senha está correta
- Verifique se o usuário está ativo

### Erro: "Arquivo users.json não encontrado"
- O arquivo será criado automaticamente ao adicionar o primeiro usuário
- Verifique permissões do diretório

### Erro ao instalar bcrypt
```bash
# No Linux, pode ser necessário instalar dependências do sistema
sudo apt-get install python3-dev libffi-dev  # Debian/Ubuntu
sudo yum install python3-devel libffi-devel  # CentOS/RHEL
```

## Exemplos Completos

### Setup Completo do Sistema

```bash
# 1. Instalar dependências
pip install -r requirements.txt

# 2. Criar primeiro usuário administrador
python manage_users.py add admin Admin@2025 "Administrador"

# 3. Criar usuários adicionais
python manage_users.py add medico1 Medico@2025 "Dr. João Silva"
python manage_users.py add enfermeira1 Enfermeira@2025 "Enf. Maria Santos"

# 4. Listar usuários
python manage_users.py list

# 5. Alterar senha se necessário
python manage_users.py change-password admin NovaSenha@2025
```

### Manutenção Regular

```bash
# Listar todos os usuários
python manage_users.py list

# Remover usuário que não precisa mais de acesso
python manage_users.py remove usuario_antigo

# Alterar senha de usuário
python manage_users.py change-password usuario NovaSenha123
```

## Notas Técnicas

- As senhas são hasheadas com bcrypt usando salt automático
- Cada hash é único, mesmo para a mesma senha
- O sistema suporta múltiplos usuários simultâneos
- Sessões são gerenciadas pelo Flask-Login com cookies seguros
- O arquivo `users.json` é thread-safe para operações concorrentes
