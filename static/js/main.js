/**
 * JavaScript principal para AUTOREG
 * Atualização de data/hora e funcionalidades gerais
 */

document.addEventListener('DOMContentLoaded', function() {
    // Atualizar data e hora
    updateDateTime();
    setInterval(updateDateTime, 1000);
    
    // Configurar event listeners para botões
    setupButtonListeners();
    
    // Configurar menu flutuante
    setupFloatingMenu();
    
    // Configurar logout
    setupLogout();
    
    // Configurar botão de visualizar robô
    setupVisualizarRobo();
});

/**
 * Atualiza a data e hora atual
 */
function updateDateTime() {
    fetch('/api/current-time')
        .then(response => response.json())
        .then(data => {
            const timeElement = document.getElementById('current-time');
            if (timeElement) {
                timeElement.textContent = `${data.date} - ${data.time}`;
            }
        })
        .catch(error => {
            console.error('Erro ao atualizar data/hora:', error);
            // Fallback para data/hora local
            const now = new Date();
            const dateStr = now.toLocaleDateString('pt-BR');
            const timeStr = now.toLocaleTimeString('pt-BR');
            const timeElement = document.getElementById('current-time');
            if (timeElement) {
                timeElement.textContent = `${dateStr} - ${timeStr}`;
            }
        });
}

/**
 * Configura os event listeners dos botões
 */
function setupButtonListeners() {
    // Botão "Inserir RAs TCs" é gerenciado pelo spreadsheet.js
    
    // Outros botões podem ser configurados aqui
    const buttons = document.querySelectorAll('.glass-button');
    buttons.forEach((button, index) => {
        if (index > 0) { // Pular o primeiro botão que é gerenciado pelo spreadsheet.js
            button.addEventListener('click', function() {
                const buttonText = this.textContent.trim();
                console.log(`Botão clicado: ${buttonText}`);
                // Funcionalidade será implementada conforme necessário
            });
        }
    });
}

/**
 * Abre um modal glassmorphism
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

/**
 * Fecha um modal glassmorphism
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Fecha modal ao clicar fora dele
 */
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('glass-modal')) {
        event.target.classList.remove('active');
    }
});

/**
 * Configura o menu flutuante
 */
function setupFloatingMenu() {
    const menuToggle = document.getElementById('menu-toggle');
    const menuClose = document.getElementById('menu-close');
    const floatingMenu = document.getElementById('floating-menu');
    const menuOverlay = document.getElementById('menu-overlay');
    
    // Abrir menu
    if (menuToggle) {
        menuToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            floatingMenu.classList.add('active');
            menuOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }
    
    // Fechar menu
    function closeMenu() {
        floatingMenu.classList.remove('active');
        menuOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    if (menuClose) {
        menuClose.addEventListener('click', closeMenu);
    }
    
    // Fechar ao clicar no overlay
    menuOverlay.addEventListener('click', closeMenu);
    
    // Fechar ao clicar em um item do menu
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const action = this.getAttribute('data-action');
            
            // Simular ação do botão correspondente
            if (action === 'add-ras') {
                const btn = document.getElementById('btn-add-ras');
                if (btn) btn.click();
            } else {
                // Encontrar botão correspondente pela posição
                const buttons = document.querySelectorAll('.glass-button');
                const actionIndex = parseInt(action.replace('func-', '')) - 1;
                if (buttons[actionIndex]) {
                    buttons[actionIndex].click();
                }
            }
            
            closeMenu();
        });
    });
    
    // Fechar com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && floatingMenu.classList.contains('active')) {
            closeMenu();
        }
    });
}

/**
 * Configura o botão de logout
 */
function setupLogout() {
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', function() {
            if (confirm('Deseja realmente sair do sistema?')) {
                fetch('/api/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        window.location.href = '/login';
                    } else {
                        alert('Erro ao fazer logout. Redirecionando...');
                        window.location.href = '/login';
                    }
                })
                .catch(error => {
                    console.error('Erro:', error);
                    window.location.href = '/login';
                });
            }
        });
    }
}

/**
 * Configura o botão flutuante e modal para visualizar robô (navegador)
 */
function setupVisualizarRobo() {
    const btnVisualizarRobo = document.getElementById('btn-visualizar-robo');
    const modalVisualizarRobo = document.getElementById('modal-visualizar-robo');
    const iframeRobo = document.getElementById('iframe-robo');
    const closeModalBtn = document.getElementById('close-modal-visualizar-robo');
    
    // Controles do navegador
    const browserBackBtn = document.getElementById('browser-back');
    const browserForwardBtn = document.getElementById('browser-forward');
    const browserReloadBtn = document.getElementById('browser-reload');
    const browserUrlInput = document.getElementById('browser-url-input');
    const browserGoBtn = document.getElementById('browser-go');
    const browserQuickRobotBtn = document.getElementById('browser-quick-robot');
    
    // URL do serviço do robô - apontar diretamente para o Kasm conforme documentação
    const targetUrl = 'https://cms.michelpaes.com.br';
    
    // Histórico de navegação
    let history = [];
    let historyIndex = -1;
    
    // Função para navegar para uma URL
    function navigateToUrl(url) {
        if (!url) return;
        
        // Se não começa com http:// ou https://, assumir que é relativa
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
            url = '/' + url;
        }
        
        // Para URLs externas, usar diretamente (sem proxy)
        // Conforme documentação do Kasm, o iframe deve apontar diretamente para o servidor Kasm
        
        // Adicionar ao histórico
        history = history.slice(0, historyIndex + 1);
        history.push(url);
        historyIndex = history.length - 1;
        
        // Atualizar iframe
        iframeRobo.src = url;
        browserUrlInput.value = url;
        
        // Atualizar botões de navegação
        updateNavigationButtons();
    }
    
    // Função para atualizar botões de navegação
    function updateNavigationButtons() {
        if (browserBackBtn) {
            browserBackBtn.disabled = historyIndex <= 0;
        }
        if (browserForwardBtn) {
            browserForwardBtn.disabled = historyIndex >= history.length - 1;
        }
    }
    
    // Atualizar URL quando o iframe navegar
    if (iframeRobo) {
        iframeRobo.addEventListener('load', function() {
            try {
                // Tentar obter a URL atual do iframe (pode falhar por CORS)
                const iframeUrl = iframeRobo.contentWindow.location.href;
                if (browserUrlInput && iframeUrl) {
                    browserUrlInput.value = iframeUrl;
                }
            } catch (e) {
                // CORS bloqueia acesso à URL do iframe, manter URL atual
            }
            updateNavigationButtons();
        });
    }
    
    // Botão voltar
    if (browserBackBtn) {
        browserBackBtn.addEventListener('click', function() {
            if (historyIndex > 0) {
                historyIndex--;
                const url = history[historyIndex];
                iframeRobo.src = url;
                if (browserUrlInput) {
                    browserUrlInput.value = url;
                }
                updateNavigationButtons();
            }
        });
    }
    
    // Botão avançar
    if (browserForwardBtn) {
        browserForwardBtn.addEventListener('click', function() {
            if (historyIndex < history.length - 1) {
                historyIndex++;
                const url = history[historyIndex];
                iframeRobo.src = url;
                if (browserUrlInput) {
                    browserUrlInput.value = url;
                }
                updateNavigationButtons();
            }
        });
    }
    
    // Botão recarregar
    if (browserReloadBtn) {
        browserReloadBtn.addEventListener('click', function() {
            if (iframeRobo && iframeRobo.src) {
                iframeRobo.src = iframeRobo.src;
            }
        });
    }
    
    // Botão ir (navegar para URL)
    if (browserGoBtn) {
        browserGoBtn.addEventListener('click', function() {
            if (browserUrlInput) {
                navigateToUrl(browserUrlInput.value);
            }
        });
    }
    
    // Navegar ao pressionar Enter no campo de URL
    if (browserUrlInput) {
        browserUrlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                navigateToUrl(browserUrlInput.value);
            }
        });
    }
    
    // Botão rápido para acessar o robô
    if (browserQuickRobotBtn) {
        browserQuickRobotBtn.addEventListener('click', function() {
            navigateToUrl(targetUrl);
        });
    }
    
    // Abrir modal ao clicar no botão flutuante
    if (btnVisualizarRobo && modalVisualizarRobo && iframeRobo) {
        btnVisualizarRobo.addEventListener('click', function(e) {
            e.stopPropagation();
            // Carregar iframe apenas quando abrir o modal
            navigateToUrl(targetUrl);
            openModal('modal-visualizar-robo');
        });
    }
    
    // Fechar modal ao clicar no botão de fechar
    if (closeModalBtn && modalVisualizarRobo && iframeRobo) {
        closeModalBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            // Limpar iframe ao fechar para parar o carregamento
            iframeRobo.src = '';
            history = [];
            historyIndex = -1;
            if (browserUrlInput) {
                browserUrlInput.value = '';
            }
            closeModal('modal-visualizar-robo');
        });
    }
    
    // Fechar modal ao clicar fora dele
    if (modalVisualizarRobo && iframeRobo) {
        modalVisualizarRobo.addEventListener('click', function(e) {
            if (e.target === modalVisualizarRobo) {
                // Limpar iframe ao fechar
                iframeRobo.src = '';
                history = [];
                historyIndex = -1;
                if (browserUrlInput) {
                    browserUrlInput.value = '';
                }
                closeModal('modal-visualizar-robo');
            }
        });
    }
    
    // Fechar modal com tecla ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modalVisualizarRobo && modalVisualizarRobo.classList.contains('active') && iframeRobo) {
            // Limpar iframe ao fechar
            iframeRobo.src = '';
            history = [];
            historyIndex = -1;
            if (browserUrlInput) {
                browserUrlInput.value = '';
            }
            closeModal('modal-visualizar-robo');
        }
    });
    
    // Inicializar botões de navegação
    updateNavigationButtons();
}
