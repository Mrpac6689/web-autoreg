/**
 * JavaScript principal para AUTOREG
 * Atualização de data/hora e funcionalidades gerais
 */

document.addEventListener('DOMContentLoaded', function() {
    // Mover botão flutuante para o body para garantir que fique acima de tudo
    const btnVisualizarRobo = document.getElementById('btn-visualizar-robo');
    if (btnVisualizarRobo && btnVisualizarRobo.parentElement !== document.body) {
        document.body.appendChild(btnVisualizarRobo);
    }
    
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
            } else if (action === 'prepara-sol-internacoes') {
                const btn = document.getElementById('btn-prepara-sol-internacoes');
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
    const browserReloadBtn = document.getElementById('browser-reload');
    
    // URL do serviço do robô - apontar diretamente para o Kasm conforme documentação
    const targetUrl = 'https://cms.michelpaes.com.br';
    
    // Pré-carregar iframe em segundo plano quando a página carregar
    if (iframeRobo) {
        // Carregar o iframe imediatamente, mas mantê-lo oculto até o modal abrir
        iframeRobo.src = targetUrl;
        
        // Quando o modal abrir, garantir que o iframe esteja visível
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (modalVisualizarRobo.classList.contains('active')) {
                        // Modal aberto - garantir que iframe está carregado e visível
                        if (!iframeRobo.src || iframeRobo.src === '') {
                            iframeRobo.src = targetUrl;
                        }
                    }
                }
            });
        });
        
        observer.observe(modalVisualizarRobo, {
            attributes: true,
            attributeFilter: ['class']
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
    
    // Abrir modal ao clicar no botão flutuante
    if (btnVisualizarRobo && modalVisualizarRobo && iframeRobo) {
        // Usar capture phase para garantir que o evento seja capturado antes dos modais
        btnVisualizarRobo.addEventListener('click', function(e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            openModal('modal-visualizar-robo');
        }, true); // true = capture phase
        
        // Também adicionar no bubble phase como fallback
        btnVisualizarRobo.addEventListener('click', function(e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });
    }
    
    // Fechar modal ao clicar no botão de fechar
    if (closeModalBtn && modalVisualizarRobo && iframeRobo) {
        closeModalBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeModal('modal-visualizar-robo');
        });
    }
    
    // Fechar modal ao clicar fora dele
    if (modalVisualizarRobo && iframeRobo) {
        modalVisualizarRobo.addEventListener('click', function(e) {
            if (e.target === modalVisualizarRobo) {
                closeModal('modal-visualizar-robo');
            }
        });
    }
    
    // Fechar modal com tecla ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modalVisualizarRobo && modalVisualizarRobo.classList.contains('active') && iframeRobo) {
            closeModal('modal-visualizar-robo');
        }
    });
}
