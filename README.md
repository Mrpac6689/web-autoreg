# AUTOREG - Sistema Automatizado de operações G-HOSP e SISREG

Sistema web desenvolvido em Python/Flask com visual Glassmorphism para o Núcleo Interno de Regulação (NIR) do Hospital de Urgência de Rio Branco (HUERB).

## Características

- **Visual Glassmorphism**: Interface moderna com efeito de vidro fosco, bordas arredondadas e sensação de profundidade
- **Bootstrap Local**: Bootstrap 5.3.2 baixado localmente (sem dependência de CDN externo)
- **Design Responsivo**: Adaptável a diferentes tamanhos de tela
- **Atualização em Tempo Real**: Data e hora atualizadas automaticamente

## Estrutura do Projeto

```
Autoreg-web/
├── app.py                 # Aplicação Flask principal
├── requirements.txt       # Dependências Python
├── .htaccess             # Configuração Apache/Plesk
├── logo.png              # Logo do NIR-HUERB
├── static/
│   ├── css/
│   │   └── glassmorphism.css  # Estilos glassmorphism
│   ├── js/
│   │   └── main.js            # JavaScript principal
│   ├── bootstrap/             # Bootstrap local
│   └── logo.png               # Logo (cópia)
└── templates/
    └── index.html             # Template principal
```

## Instalação

### 1. Instalar dependências Python

```bash
pip install -r requirements.txt
```

### 2. Configuração no Plesk

1. Acesse o Plesk e configure o domínio/subdomínio
2. Configure o Python como aplicação
3. Defina o arquivo de entrada como `app.py`
4. Configure o WSGI conforme necessário
5. Certifique-se de que o módulo `mod_rewrite` está habilitado no Apache

### 3. Executar localmente (desenvolvimento)

```bash
python app.py
```

A aplicação estará disponível em `http://localhost:5000`

## Funcionalidades

### Página Inicial

- **Barra Superior**: Exibe descrição do sistema e data/hora atual
- **Título Destacado**: Nome completo do sistema em destaque
- **Área de Botões**: 12 botões organizados em grid responsivo
  - Primeiro botão: "Adicionar RAs para solicitar Tomografias"
  - Demais botões: Placeholders para futuras funcionalidades
- **Rodapé**: Informações de copyright

### Visual Glassmorphism

- Efeito de vidro fosco com `backdrop-filter: blur()`
- Bordas arredondadas (20px)
- Sombras suaves para profundidade
- Transições suaves em interações
- Gradiente de fundo para contraste

## Desenvolvimento

### Adicionar Novas Funcionalidades

1. Adicione rotas em `app.py`
2. Crie templates em `templates/`
3. Adicione estilos em `static/css/glassmorphism.css` se necessário
4. Adicione JavaScript em `static/js/main.js` se necessário

### Estrutura de Arquivos

- Mantenha arquivos com máximo de 600 linhas
- Separe CSS, JS e controllers em arquivos independentes
- Reutilize componentes quando possível

## Tecnologias Utilizadas

- **Python 3.x**
- **Flask 3.0.0**
- **Bootstrap 5.3.2** (local)
- **CSS3** (Glassmorphism)
- **JavaScript ES6+**

## Autor

Copyright © 2025 por Michel Ribeiro Paes - www.michelpaes.adv.br

## Licença

Todos os direitos reservados.

