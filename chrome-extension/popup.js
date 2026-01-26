/**
 * Script do popup da extensão
 */

document.addEventListener('DOMContentLoaded', function() {
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

    // Carregar URL salva
    chrome.storage.local.get(['apiBaseUrl'], function(result) {
        if (result.apiBaseUrl) {
            apiUrlInput.value = result.apiBaseUrl;
        }
    });

    // Salvar URL
    saveBtn.addEventListener('click', function() {
        const url = apiUrlInput.value.trim();
        
        // Validar URL básica
        if (!url) {
            mostrarMensagem('Por favor, informe uma URL válida.', 'error');
            return;
        }
        
        // Validar formato básico de URL
        let urlObj;
        try {
            urlObj = new URL(url);
        } catch (e) {
            mostrarMensagem('URL inválida. Use o formato: https://exemplo.com', 'error');
            return;
        }
        
        // Forçar HTTPS se não tiver protocolo ou se for HTTP
        if (urlObj.protocol === 'http:') {
            urlObj.protocol = 'https:';
            url = urlObj.toString();
            apiUrlInput.value = url;
            mostrarMensagem('URL alterada para HTTPS automaticamente.', 'success');
        }
        
        // Desabilitar botão durante salvamento
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
        
        // Salvar URL
        chrome.storage.local.set({ apiBaseUrl: url }, function() {
            // Reabilitar botão
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvar';
            
            // Mostrar mensagem de sucesso
            mostrarMensagem('URL salva com sucesso!', 'success');
            
            // Fechar popup após 1 segundo (opcional)
            setTimeout(() => {
                window.close();
            }, 1500);
        });
    });
    
    // Permitir salvar com Enter
    apiUrlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveBtn.click();
        }
    });
});
