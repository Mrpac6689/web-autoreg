# Autoreg - Controle - Extensão Chrome

Extensão do Chrome que adiciona botões flutuantes na página do KasmVNC rodando o core do AUTOREG.

Autoreg é uma aplicação sob licença GNU GPL. Documentação e código fonte disponíveis em github.com/mrpac6689.

## Licença

```
Copyright (C) 2024 Autoreg CMS Helper

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
```

## Funcionalidades

- **Botões Flutuantes**: Dois botões no canto superior direito da página do CMS
  - **Salvar** (verde): Cria a flag `grava.flag` no servidor
  - **Pular** (laranja): Cria a flag `pula.flag` no servidor

- **Atalhos de Teclado**:
  - `S`: Salvar (cria grava.flag)
  - `P`: Pular (cria pula.flag)

- **Feedback Visual**: Notificações de sucesso/erro ao criar flags

## Instalação

### Modo Desenvolvimento

1. Abra o Chrome e vá para `chrome://extensions/`
2. Ative o "Modo do desenvolvedor" (canto superior direito)
3. Clique em "Carregar sem compactação"
4. Selecione a pasta `chrome-extension` deste projeto
5. A extensão será carregada e estará ativa

### Configuração

1. Clique no ícone da extensão na barra de ferramentas
2. Configure a URL base da API:
   - **Core do Autoreg**: URL onde está rodando o KasmVNC com o core do Autoreg (ex: `https://cms.michelpaes.com.br`)
   - **Frontend**: URL da aplicação web Autoreg (ex: `https://autoreg.michelpaes.com.br` ou `http://localhost:5000`)
3. Clique em "Salvar"

**Nota**: A extensão é configurável e não fica atrelada a um domínio específico. Você pode configurá-la para trabalhar com qualquer instalação do Autoreg. A extensão tentará detectar automaticamente a URL da API, mas é recomendado configurá-la manualmente para garantir o funcionamento correto.

## Como Funciona

1. Quando você acessa o endereço configurado (core do Autoreg ou frontend), a extensão é ativada automaticamente
2. Os botões flutuantes são injetados na página do KasmVNC
3. Ao clicar em "Salvar" ou "Pular" (ou usar os atalhos S/P), a extensão faz uma requisição para:
   ```
   {API_BASE_URL}/api/internacoes-solicitar/criar-flag
   ```
4. A flag (`grava.flag` ou `pula.flag`) é criada no servidor e o processo backend continua a execução

## Requisitos

- Chrome ou navegador baseado em Chromium
- A aplicação Autoreg deve estar rodando e acessível
- Você deve estar autenticado na aplicação (cookies de sessão são enviados automaticamente)

## Estrutura de Arquivos

```
chrome-extension/
├── manifest.json      # Configuração da extensão
├── content.js         # Script que injeta os botões na página
├── content.css        # Estilos dos botões flutuantes
├── background.js      # Service worker para comunicação
├── popup.html         # Interface de configuração
├── popup.js           # Script do popup
├── icons/             # Ícones da extensão (precisa criar)
└── README.md          # Este arquivo
```

## Notas

- Os ícones da extensão precisam ser criados (16x16, 48x48, 128x128 pixels)
- A extensão requer permissões para acessar o endereço em que roda o core Docker do AutoReg. e fazer requisições à API.
- As flags criadas são: `grava.flag` e `pula.flag`

## Desenvolvimento

Para modificar a extensão:

1. Faça as alterações nos arquivos
2. Vá para `chrome://extensions/`
3. Clique no botão de recarregar da extensão
4. Recarregue a página do CMS para ver as mudanças

## Suporte

Em caso de problemas:
1. Verifique se a URL da API está configurada corretamente
2. Verifique se você está autenticado na aplicação Autoreg
3. Verifique o console do navegador para erros (F12)
4. Verifique se os pop-ups não estão bloqueados
