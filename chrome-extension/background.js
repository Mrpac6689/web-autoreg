/**
 * Background Service Worker para Autoreg CMS Helper
 * Gerencia comunicação e configurações da extensão
 */

chrome.runtime.onInstalled.addListener(() => {
    console.log('Autoreg CMS Helper instalado');
});

// Listener para mensagens do content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getApiBaseUrl') {
        chrome.storage.local.get(['apiBaseUrl'], (result) => {
            sendResponse({ apiBaseUrl: result.apiBaseUrl || null });
        });
        return true; // Indica que vamos responder assincronamente
    }
    
    if (request.action === 'setApiBaseUrl') {
        chrome.storage.local.set({ apiBaseUrl: request.url }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    // Criar flag via background script (não sujeito a CORS) - método POST antigo
    if (request.action === 'criarFlag') {
        criarFlagViaBackground(request.nomeFlag, request.apiBaseUrl)
            .then(result => {
                sendResponse(result);
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // Indica resposta assíncrona
    }
    
    // Criar flag via GET simples (endpoint /api/internacoes/grava ou /api/internacoes/pula)
    if (request.action === 'criarFlagGet') {
        // Validar parâmetros
        if (!request.endpoint || !request.apiBaseUrl) {
            sendResponse({ 
                success: false, 
                error: 'Endpoint ou URL da API não fornecidos' 
            });
            return true;
        }
        
        criarFlagViaGet(request.endpoint, request.apiBaseUrl)
            .then(result => {
                sendResponse(result);
            })
            .catch(error => {
                console.error('Erro ao processar criarFlagGet:', error);
                sendResponse({ 
                    success: false, 
                    error: error.message || 'Erro desconhecido ao criar flag' 
                });
            });
        return true; // Indica resposta assíncrona
    }
});

/**
 * Cria uma flag no servidor via background script
 * O background script não está sujeito a políticas CORS
 */
async function criarFlagViaBackground(nomeFlag, apiBaseUrl) {
    try {
        // Obter cookies da aplicação principal
        // Flask usa cookie 'session' por padrão, mas pode variar
        const allCookies = await chrome.cookies.getAll({ domain: '.michelpaes.com.br' });
        
        // Buscar cookies relevantes (session do Flask e autoreg_auth)
        const sessionCookie = allCookies.find(c => c.name === 'session');
        const authCookie = allCookies.find(c => c.name === 'autoreg_auth');
        
        // Construir string de cookies
        const cookieParts = [];
        if (sessionCookie) {
            cookieParts.push(`${sessionCookie.name}=${sessionCookie.value}`);
        }
        if (authCookie) {
            cookieParts.push(`${authCookie.name}=${authCookie.value}`);
        }
        const cookieString = cookieParts.join('; ');
        
        // Preparar headers
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Adicionar cookies se disponíveis
        if (cookieString) {
            headers['Cookie'] = cookieString;
        }
        
        // Fazer requisição via fetch (background script não está sujeito a CORS)
        const response = await fetch(`${apiBaseUrl}/api/internacoes-solicitar/criar-flag`, {
            method: 'POST',
            headers: headers,
            credentials: 'include', // Tentar incluir cookies automaticamente também
            body: JSON.stringify({
                flag: nomeFlag
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: `HTTP ${response.status}: ${errorText}` };
            }
            return { success: false, error: errorData.error || `HTTP ${response.status}` };
        }

        const data = await response.json();
        
        if (data.success) {
            return { success: true, mensagem: data.mensagem || 'Comando enviado. Aguarde...' };
        } else {
            return { success: false, error: data.error || 'Erro desconhecido' };
        }
    } catch (error) {
        console.error('Erro ao criar flag no background:', error);
        return { success: false, error: error.message || 'Erro de conexão' };
    }
}

/**
 * Cria uma flag via GET simples (endpoint /api/internacoes/grava ou /api/internacoes/pula)
 * O background script não está sujeito a políticas CORS
 */
async function criarFlagViaGet(endpoint, apiBaseUrl) {
    try {
        // Obter cookies da aplicação principal
        const allCookies = await chrome.cookies.getAll({ domain: '.michelpaes.com.br' });
        
        // Buscar cookies relevantes (session do Flask e autoreg_auth)
        const sessionCookie = allCookies.find(c => c.name === 'session');
        const authCookie = allCookies.find(c => c.name === 'autoreg_auth');
        
        // Construir string de cookies
        const cookieParts = [];
        if (sessionCookie) {
            cookieParts.push(`${sessionCookie.name}=${sessionCookie.value}`);
        }
        if (authCookie) {
            cookieParts.push(`${authCookie.name}=${authCookie.value}`);
        }
        const cookieString = cookieParts.join('; ');
        
        // Preparar headers
        const headers = {};
        
        // Adicionar cookies se disponíveis
        if (cookieString) {
            headers['Cookie'] = cookieString;
        }
        
        // Validar URL
        const url = `${apiBaseUrl}${endpoint}`;
        try {
            new URL(url);
        } catch (e) {
            return { success: false, error: `URL inválida: ${url}` };
        }
        
        // Fazer requisição GET simples (background script não está sujeito a CORS)
        let response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: headers,
                credentials: 'include', // Tentar incluir cookies automaticamente também
            });
        } catch (fetchError) {
            // Erro de rede (conexão recusada, timeout, etc)
            return { 
                success: false, 
                error: `Erro de conexão: ${fetchError.message}. Verifique se a URL está correta: ${apiBaseUrl}` 
            };
        }

        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: `HTTP ${response.status}: ${errorText.substring(0, 100)}` };
            }
            return { success: false, error: errorData.error || `HTTP ${response.status}` };
        }

        const data = await response.json();
        
        if (data.success) {
            return { success: true, mensagem: data.mensagem || 'Comando enviado. Aguarde...' };
        } else {
            return { success: false, error: data.error || 'Erro desconhecido' };
        }
    } catch (error) {
        console.error('Erro ao criar flag via GET no background:', error);
        return { 
            success: false, 
            error: error.message || 'Erro de conexão. Verifique a URL da API nas opções da extensão.' 
        };
    }
}
