/**
 * Gerenciamento do modal de confirmação
 * Adiciona foco automático no botão "Sim" quando o modal é aberto
 */

(function() {
    'use strict';
    
    /**
     * Coloca foco no botão "Sim" do modal de confirmação
     */
    function focusConfirmSim() {
        const btnSim = document.getElementById('btn-confirm-sim');
        if (btnSim) {
            setTimeout(function() {
                btnSim.focus();
            }, 150);
        }
    }
    
    /**
     * Configura o foco automático no botão "Sim"
     */
    function setupConfirmDialogFocus() {
        const modal = document.getElementById('modal-confirm-dialog');
        const btnSim = document.getElementById('btn-confirm-sim');
        
        if (!modal || !btnSim) return;
        
        // Observar quando o modal é exibido
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes') {
                    const display = modal.style.display;
                    const isActive = modal.classList.contains('active');
                    
                    // Se o modal foi aberto (display: flex ou classe active)
                    if ((display === 'flex' || isActive) && !modal.dataset.focusSet) {
                        focusConfirmSim();
                        modal.dataset.focusSet = 'true';
                    } else if (display === 'none' && !isActive) {
                        // Resetar flag quando o modal é fechado
                        modal.dataset.focusSet = '';
                    }
                }
            });
        });
        
        // Observar mudanças no estilo e classe do modal
        observer.observe(modal, {
            attributes: true,
            attributeFilter: ['style', 'class']
        });
        
        // Interceptar quando o modal é aberto via função openModal
        const originalOpenModal = window.openModal;
        if (originalOpenModal) {
            window.openModal = function(modalId) {
                originalOpenModal(modalId);
                if (modalId === 'modal-confirm-dialog') {
                    focusConfirmSim();
                }
            };
        }
        
        // Interceptar quando o modal é aberto diretamente
        const checkModalOpen = setInterval(function() {
            const display = modal.style.display;
            const isActive = modal.classList.contains('active');
            
            if ((display === 'flex' || isActive) && !modal.dataset.focusSet) {
                focusConfirmSim();
                modal.dataset.focusSet = 'true';
            } else if (display === 'none' && !isActive && modal.dataset.focusSet) {
                modal.dataset.focusSet = '';
            }
        }, 100);
        
        // Limpar intervalo após 30 segundos (evitar vazamento de memória)
        setTimeout(function() {
            clearInterval(checkModalOpen);
        }, 30000);
    }
    
    // Inicializar quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupConfirmDialogFocus);
    } else {
        setupConfirmDialogFocus();
    }
    
    // Re-inicializar após um pequeno delay para garantir que o modal foi carregado
    setTimeout(setupConfirmDialogFocus, 500);
    
    // Exportar função para uso externo
    window.focusConfirmSim = focusConfirmSim;
})();
