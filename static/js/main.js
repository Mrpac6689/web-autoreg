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
