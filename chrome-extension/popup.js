/**
 * Script do popup da extensão
 */

document.addEventListener('DOMContentLoaded', function() {
    const coreUrlInput = document.getElementById('coreUrl');
    const apiUrlInput = document.getElementById('apiUrl');
    const saveBtn = document.getElementById('saveBtn');
    const messageDiv = document.getElementById('message');

    // Função para mostrar mensagem
    function mostrarMensagem(texto, tipo) {
        messageDiv.textContent = texto;
        messageDiv.className = `message ${tipo} show`;
        
        // Remover mensagem após 3 segundos
        setTimeout(() => {
            messageDiv.classList.remove('show');
            setTimeout(() => {
                messageDiv.textContent = '';
                messageDiv.className = 'message';
            }, 300);
        }, 3000);
    }

    // Função para validar URL
    function validarUrl(url, campoNome) {
        if (!url) {
            mostrarMensagem(`Por favor, informe uma ${campoNome} válida.`, 'error');
            return null;
        }
        
        // Validar formato básico de URL
        let urlObj;
        try {
            urlObj = new URL(url);
        } catch (e) {
            mostrarMensagem(`${campoNome} inválida. Use o formato: https://exemplo.com`, 'error');
            return null;
        }
        
        // Forçar HTTPS se for HTTP
        if (urlObj.protocol === 'http:') {
            urlObj.protocol = 'https:';
            const urlCorrigida = urlObj.toString();
            mostrarMensagem(`${campoNome} alterada para HTTPS automaticamente.`, 'success');
            return urlCorrigida;
        }
        
        return url;
    }

    // Carregar URLs salvas
    chrome.storage.local.get(['coreUrl', 'apiBaseUrl'], function(result) {
        if (result.coreUrl) {
            coreUrlInput.value = result.coreUrl;
        }
        if (result.apiBaseUrl) {
            apiUrlInput.value = result.apiBaseUrl;
        }
    });

    // Salvar URLs
    saveBtn.addEventListener('click', function() {
        const coreUrlValidada = validarUrl(coreUrlInput.value.trim(), 'URL do Core');
        if (!coreUrlValidada) {
            return;
        }
        
        const apiUrlValidada = validarUrl(apiUrlInput.value.trim(), 'URL da API');
        if (!apiUrlValidada) {
            return;
        }
        
        // Atualizar valores se foram corrigidos para HTTPS
        if (coreUrlValidada !== coreUrlInput.value.trim()) {
            coreUrlInput.value = coreUrlValidada;
        }
        if (apiUrlValidada !== apiUrlInput.value.trim()) {
            apiUrlInput.value = apiUrlValidada;
        }
        
        // Desabilitar botão durante salvamento
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
        
        // Salvar URLs
        chrome.storage.local.set({ 
            coreUrl: coreUrlValidada,
            apiBaseUrl: apiUrlValidada 
        }, function() {
            // Reabilitar botão
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvar';
            
            // Mostrar mensagem de sucesso
            mostrarMensagem('Configurações salvas com sucesso!', 'success');
            
            // Fechar popup após 1 segundo
            setTimeout(() => {
                window.close();
            }, 1500);
        });
    });
    
    // Permitir salvar com Enter em qualquer campo
    coreUrlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveBtn.click();
        }
    });
    
    apiUrlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveBtn.click();
        }
    });
});
