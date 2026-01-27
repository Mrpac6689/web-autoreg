/**
 * Content Script para Autoreg CMS Helper
 * Injeta botões flutuantes na página do CMS para criar flags
 */

(function() {
    'use strict';

    // Configurações
    const API_ENDPOINTS = [
        'https://autoreg.michelpaes.com.br',
        'https://michelpaes.com.br',
        'http://localhost:5000',
        'http://127.0.0.1:5000'
    ];

    let apiBaseUrl = null;
    let coreUrl = null;
    let buttonsContainer = null;
    let btnSalvar = null;
    let btnPular = null;

    /**
     * Verifica se a página atual é a página do Core Autoreg
     */
    async function verificarSeEPaginaCore() {
        // Obter URL do Core do storage
        const stored = await chrome.storage.local.get(['coreUrl']);
        if (!stored.coreUrl) {
            // Se não estiver configurado, não mostrar botões
            return false;
        }
        
        coreUrl = stored.coreUrl;
        
        // Obter a origem atual (sem path)
        const currentOrigin = window.location.origin;
        
        // Comparar origens
        try {
            const coreUrlObj = new URL(coreUrl);
            const currentUrlObj = new URL(currentOrigin);
            
            // Comparar host (incluindo porta se houver)
            // Isso garante que https://cms.michelpaes.com.br corresponda a https://cms.michelpaes.com.br
            const coreHost = coreUrlObj.host.toLowerCase();
            const currentHost = currentUrlObj.host.toLowerCase();
            
            return coreHost === currentHost;
        } catch (e) {
            // Fallback: comparação simples de strings (case-insensitive)
            const coreUrlLower = coreUrl.toLowerCase();
            const currentOriginLower = currentOrigin.toLowerCase();
            return currentOriginLower === coreUrlLower || currentOriginLower.startsWith(coreUrlLower);
        }
    }

    /**
     * Detecta a URL base da API
     */
    async function detectApiBaseUrl() {
        // Primeiro, tentar obter do storage
        const stored = await chrome.storage.local.get(['apiBaseUrl']);
        if (stored.apiBaseUrl) {
            apiBaseUrl = stored.apiBaseUrl;
            return apiBaseUrl;
        }

        // Tentar detectar a partir da origem atual (se estiver no mesmo domínio)
        const currentOrigin = window.location.origin;
        if (currentOrigin.includes('michelpaes.com.br')) {
            // Se estiver em um subdomínio, tentar o domínio principal da aplicação
            const possibleUrls = [
                currentOrigin.replace('cms.', 'autoreg.'),
                currentOrigin.replace('cms.', ''),
                'https://autoreg.michelpaes.com.br'
            ];
            
            for (const url of possibleUrls) {
                try {
                    // Testar se a API está acessível usando HEAD request
                    const testResponse = await fetch(`${url}/api/internacoes-solicitar/criar-flag`, {
                        method: 'HEAD',
                        credentials: 'include'
                    });
                    
                    // Se não retornou 404, provavelmente é o endpoint correto
                    if (testResponse.status !== 404) {
                        apiBaseUrl = url;
                        await chrome.storage.local.set({ apiBaseUrl: url });
                        return url;
                    }
                } catch (e) {
                    // Continuar tentando
                }
            }
        }

        // Tentar os endpoints padrão
        for (const url of API_ENDPOINTS) {
            try {
                const response = await fetch(`${url}/api/internacoes-solicitar/criar-flag`, {
                    method: 'HEAD',
                    credentials: 'include'
                });
                
                // Se não retornou 404, provavelmente é o endpoint correto
                if (response.status !== 404) {
                    apiBaseUrl = url;
                    await chrome.storage.local.set({ apiBaseUrl: url });
                    return url;
                }
            } catch (e) {
                // Continuar tentando
            }
        }

        // Se não encontrou, usar o primeiro como padrão e mostrar aviso
        apiBaseUrl = API_ENDPOINTS[0];
        mostrarNotificacao('Configure a URL da API nas opções da extensão', 'error');
        return apiBaseUrl;
    }

    /**
     * Cria uma flag no servidor via background script (evita CORS)
     * Usa endpoints GET simples: /api/internacoes/grava ou /api/internacoes/pula
     */
    async function criarFlag(nomeFlag) {
        if (!apiBaseUrl) {
            apiBaseUrl = await detectApiBaseUrl();
        }

        // Verificar se apiBaseUrl está configurado
        if (!apiBaseUrl) {
            mostrarNotificacao('URL da API não configurada. Configure nas opções da extensão.', 'error');
            return false;
        }

        try {
            // Mapear nome da flag para endpoint
            let endpoint = '';
            if (nomeFlag === 'grava.flag') {
                endpoint = '/api/internacoes/grava';
            } else if (nomeFlag === 'pula.flag') {
                endpoint = '/api/internacoes/pula';
            } else {
                mostrarNotificacao(`Flag ${nomeFlag} não suportada`, 'error');
                return false;
            }

            // Verificar se o runtime está disponível (evita "Extension context invalidated")
            if (!chrome.runtime || !chrome.runtime.sendMessage) {
                mostrarNotificacao('Extensão não disponível. Recarregue a página.', 'error');
                return false;
            }

            // Enviar mensagem para o background script que não está sujeito a CORS
            let response;
            try {
                response = await chrome.runtime.sendMessage({
                    action: 'criarFlagGet',
                    endpoint: endpoint,
                    apiBaseUrl: apiBaseUrl
                });
            } catch (runtimeError) {
                // Tratar erro específico de contexto invalidado
                if (runtimeError.message && runtimeError.message.includes('Extension context invalidated')) {
                    mostrarNotificacao('Extensão foi recarregada. Recarregue a página.', 'error');
                    return false;
                }
                throw runtimeError; // Re-lançar outros erros
            }
            
            // Verificar se recebeu resposta
            if (!response) {
                mostrarNotificacao('Sem resposta do servidor. Verifique a conexão.', 'error');
                return false;
            }
            
            if (response.success) {
                mostrarNotificacao(`Comando ${nomeFlag} recebido. Aguarde...`, 'success');
                return true;
            } else {
                const errorMsg = response.error || 'Erro desconhecido';
                mostrarNotificacao(`Erro: ${errorMsg}`, 'error');
                return false;
            }
        } catch (error) {
            console.error('Erro ao criar flag:', error);
            const errorMessage = error.message || 'Erro desconhecido';
            
            // Mensagens de erro mais amigáveis
            if (errorMessage.includes('Extension context invalidated')) {
                mostrarNotificacao('Extensão foi recarregada. Recarregue a página.', 'error');
            } else if (errorMessage.includes('Failed to fetch')) {
                mostrarNotificacao('Erro de conexão. Verifique a URL da API nas opções.', 'error');
            } else {
                mostrarNotificacao(`Erro: ${errorMessage}`, 'error');
            }
            return false;
        }
    }

    /**
     * Mostra notificação de feedback
     */
    function mostrarNotificacao(mensagem, tipo = 'success') {
        // Remover notificação anterior se existir
        const notifAnterior = document.querySelector('.autoreg-notification');
        if (notifAnterior) {
            notifAnterior.remove();
        }

        const notificacao = document.createElement('div');
        notificacao.className = `autoreg-notification ${tipo}`;
        notificacao.textContent = mensagem;
        document.body.appendChild(notificacao);

        // Mostrar
        setTimeout(() => {
            notificacao.classList.add('show');
        }, 10);

        // Esconder após 3 segundos
        setTimeout(() => {
            notificacao.classList.remove('show');
            setTimeout(() => {
                notificacao.remove();
            }, 300);
        }, 3000);
    }

    /**
     * Cria os botões flutuantes
     */
    function criarBotoes() {
        if (buttonsContainer) {
            return; // Já foram criados
        }

        // Container
        buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'autoreg-floating-buttons-container';
        document.body.appendChild(buttonsContainer);

        // Botão Salvar
        btnSalvar = document.createElement('button');
        btnSalvar.className = 'autoreg-floating-action-button-round autoreg-btn-salvar';
        btnSalvar.id = 'autoreg-btn-salvar-spa';
        btnSalvar.title = 'Salvar URL atual e avançar (s)';
        btnSalvar.innerHTML = '<i class="fas fa-save"></i><div class="autoreg-spinner"></div>';
        btnSalvar.addEventListener('click', async function(e) {
            e.stopPropagation();
            if (btnSalvar.classList.contains('loading')) {
                return;
            }
            
            btnSalvar.classList.add('loading');
            btnSalvar.disabled = true;
            
            const sucesso = await criarFlag('grava.flag');
            
            btnSalvar.classList.remove('loading');
            btnSalvar.disabled = false;
        });
        buttonsContainer.appendChild(btnSalvar);

        // Botão Pular
        btnPular = document.createElement('button');
        btnPular.className = 'autoreg-floating-action-button-round autoreg-btn-pular';
        btnPular.id = 'autoreg-btn-pular-spa';
        btnPular.title = 'Pular linha e avançar (p)';
        btnPular.innerHTML = '<i class="fas fa-forward"></i><div class="autoreg-spinner"></div>';
        btnPular.addEventListener('click', async function(e) {
            e.stopPropagation();
            if (btnPular.classList.contains('loading')) {
                return;
            }
            
            btnPular.classList.add('loading');
            btnPular.disabled = true;
            
            const sucesso = await criarFlag('pula.flag');
            
            btnPular.classList.remove('loading');
            btnPular.disabled = false;
        });
        buttonsContainer.appendChild(btnPular);

        // Carregar Font Awesome se não estiver disponível
        if (!document.querySelector('link[href*="fontawesome"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
            document.head.appendChild(link);
        }
    }

    /**
     * Adiciona atalhos de teclado
     */
    function adicionarAtalhosTeclado() {
        document.addEventListener('keydown', function(e) {
            // Só processar se não estiver digitando em um input/textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Tecla 's' para salvar
            if (e.key === 's' || e.key === 'S') {
                if (btnSalvar && !btnSalvar.disabled) {
                    e.preventDefault();
                    btnSalvar.click();
                }
            }

            // Tecla 'p' para pular
            if (e.key === 'p' || e.key === 'P') {
                if (btnPular && !btnPular.disabled) {
                    e.preventDefault();
                    btnPular.click();
                }
            }
        });
    }

    /**
     * Injeta um elemento invisível para sinalizar que a extensão está instalada
     * Isso é usado na página da API para que o botão "Instalar Extensão" seja ocultado
     */
    function injetarMarcadorExtensao() {
        // Verificar se já existe o marcador
        if (document.getElementById('autoreg-extension-installed-marker')) {
            return;
        }
        
        // Criar elemento invisível para sinalizar que a extensão está instalada
        const marker = document.createElement('div');
        marker.id = 'autoreg-extension-installed-marker';
        marker.style.display = 'none';
        marker.setAttribute('data-autoreg-extension', 'installed');
        document.body.appendChild(marker);
    }

    /**
     * Inicialização
     */
    async function init() {
        // Verificar se é a página do Core antes de criar os botões
        const ePaginaCore = await verificarSeEPaginaCore();
        
        if (!ePaginaCore) {
            // Não é a página do Core, mas pode ser a página da API
            // Verificar se é a página da API e injetar marcador invisível
            const stored = await chrome.storage.local.get(['apiBaseUrl']);
            
            let deveInjetarMarcador = false;
            
            if (stored.apiBaseUrl) {
                try {
                    const apiUrlObj = new URL(stored.apiBaseUrl);
                    const currentUrlObj = new URL(window.location.origin);
                    
                    // Se for a página da API, injetar marcador
                    if (apiUrlObj.host.toLowerCase() === currentUrlObj.host.toLowerCase()) {
                        deveInjetarMarcador = true;
                    }
                } catch (e) {
                    // Se houver erro ao comparar URLs, não injetar (evitar falsos positivos)
                    console.log('Erro ao comparar URLs:', e);
                }
            }
            
            // Se deve injetar o marcador, fazer isso
            if (deveInjetarMarcador) {
                // Aguardar página carregar
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', function() {
                        injetarMarcadorExtensao();
                    });
                } else {
                    injetarMarcadorExtensao();
                }
            }
            
            return;
        }
        
        // É a página do Core, continuar com a inicialização
        // Aguardar página carregar completamente
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                criarBotoes();
                adicionarAtalhosTeclado();
                detectApiBaseUrl();
            });
        } else {
            criarBotoes();
            adicionarAtalhosTeclado();
            detectApiBaseUrl();
        }
    }

    // Iniciar
    init();
})();
