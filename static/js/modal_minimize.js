/**
 * Sistema genérico de minimização de modais
 */

(function() {
    'use strict';
    
    /**
     * Inicializa o sistema de minimização para todos os modais
     */
    function initModalMinimize() {
        // Encontrar todos os modais (exceto confirm_dialog)
        const modals = document.querySelectorAll('.glass-modal:not(#modal-confirm-dialog)');
        
        modals.forEach(modal => {
            const modalId = modal.id;
            if (!modalId) return;
            
            const header = modal.querySelector('.modal-header');
            if (!header) return;
            
            // Verificar se já tem botões de minimizar/maximizar
            const existingMinimize = header.querySelector('.glass-modal-minimize');
            const existingMaximize = header.querySelector('.glass-modal-maximize');
            
            if (existingMinimize || existingMaximize) {
                // Já tem botões, apenas configurar event listeners
                setupModalButtons(modal);
            } else {
                // Criar botões de minimizar/maximizar
                createMinimizeButtons(modal, header);
            }
        });
    }
    
    /**
     * Cria os botões de minimizar/maximizar no header do modal
     */
    function createMinimizeButtons(modal, header) {
        // Criar container para ações do header se não existir
        let actionsContainer = header.querySelector('.modal-header-actions');
        if (!actionsContainer) {
            actionsContainer = document.createElement('div');
            actionsContainer.className = 'modal-header-actions';
            
            // Mover botão de fechar para dentro do container se existir
            const btnClose = header.querySelector('.glass-modal-close');
            if (btnClose && btnClose.parentNode === header) {
                header.removeChild(btnClose);
                actionsContainer.appendChild(btnClose);
            }
            
            header.appendChild(actionsContainer);
        } else {
            // Se o container já existe, verificar se o botão de fechar está dentro dele
            const btnClose = header.querySelector('.glass-modal-close');
            if (btnClose && btnClose.parentNode === header) {
                header.removeChild(btnClose);
                actionsContainer.appendChild(btnClose);
            }
        }
        
        // Verificar se já existem botões de minimizar/maximizar
        const existingMinimize = actionsContainer.querySelector('.glass-modal-minimize');
        const existingMaximize = actionsContainer.querySelector('.glass-modal-maximize');
        
        if (!existingMinimize) {
            // Criar botão minimizar
            const btnMinimize = document.createElement('button');
            btnMinimize.className = 'glass-modal-minimize';
            btnMinimize.id = `minimize-${modal.id}`;
            btnMinimize.title = 'Minimizar';
            btnMinimize.innerHTML = '<i class="fas fa-window-minimize"></i>';
            actionsContainer.insertBefore(btnMinimize, actionsContainer.firstChild);
        }
        
        if (!existingMaximize) {
            // Criar botão maximizar (inicialmente oculto)
            const btnMaximize = document.createElement('button');
            btnMaximize.className = 'glass-modal-maximize';
            btnMaximize.id = `maximize-${modal.id}`;
            btnMaximize.title = 'Restaurar';
            btnMaximize.style.display = 'none';
            btnMaximize.innerHTML = '<i class="fas fa-window-maximize"></i>';
            const btnClose = actionsContainer.querySelector('.glass-modal-close');
            if (btnClose) {
                actionsContainer.insertBefore(btnMaximize, btnClose);
            } else {
                actionsContainer.appendChild(btnMaximize);
            }
        }
        
        // Configurar event listeners
        setupModalButtons(modal);
    }
    
    /**
     * Configura os event listeners para minimizar/maximizar
     */
    function setupModalButtons(modal) {
        const modalId = modal.id;
        const btnMinimize = document.getElementById(`minimize-${modalId}`) || 
                           modal.querySelector('.glass-modal-minimize');
        const btnMaximize = document.getElementById(`maximize-${modalId}`) || 
                           modal.querySelector('.glass-modal-maximize');
        const header = modal.querySelector('.modal-header');
        
        if (btnMinimize) {
            // Remover listeners antigos
            const newBtnMinimize = btnMinimize.cloneNode(true);
            btnMinimize.parentNode.replaceChild(newBtnMinimize, btnMinimize);
            
            newBtnMinimize.addEventListener('click', function(e) {
                e.stopPropagation();
                minimizeModal(modal);
            });
        }
        
        if (btnMaximize) {
            // Remover listeners antigos
            const newBtnMaximize = btnMaximize.cloneNode(true);
            btnMaximize.parentNode.replaceChild(newBtnMaximize, btnMaximize);
            
            newBtnMaximize.addEventListener('click', function(e) {
                e.stopPropagation();
                maximizeModal(modal);
            });
        }
        
        // Clicar no header minimizado para maximizar
        if (header) {
            header.addEventListener('click', function(e) {
                if (modal.classList.contains('minimized')) {
                    // Só maximizar se não clicou em um botão
                    if (!e.target.closest('button')) {
                        maximizeModal(modal);
                    }
                }
            });
        }
    }
    
    /**
     * Reorganiza os modais minimizados para ficarem lado a lado
     */
    function reorganizeMinimizedModals() {
        // Encontrar todos os modais minimizados (exceto confirm_dialog)
        const minimizedModals = Array.from(document.querySelectorAll('.glass-modal:not(#modal-confirm-dialog).minimized'));
        
        if (minimizedModals.length === 0) return;
        
        // Configurações de posicionamento
        const modalWidth = 400; // Largura do modal minimizado
        const modalHeight = 80; // Altura do modal minimizado
        const gap = 10; // Espaçamento entre modais
        const bottomOffset = 120; // Distância do fundo (deixar espaço para botões flutuantes)
        const rightOffset = 20; // Distância da direita
        
        // Calcular posição inicial (da direita para a esquerda)
        minimizedModals.forEach((modal, index) => {
            const modalContent = modal.querySelector('.glass-modal-content');
            if (!modalContent) return;
            
            // Posição da direita para a esquerda
            const right = rightOffset + (minimizedModals.length - 1 - index) * (modalWidth + gap);
            
            // Aplicar posição e tamanho (forçar valores para sobrescrever CSS específico)
            modalContent.style.position = 'fixed';
            modalContent.style.bottom = `${bottomOffset}px`;
            modalContent.style.right = `${right}px`;
            modalContent.style.left = 'auto';
            modalContent.style.top = 'auto';
            modalContent.style.width = `${modalWidth}px`;
            modalContent.style.maxWidth = `${modalWidth}px`;
            modalContent.style.minWidth = `${modalWidth}px`; // Forçar min-width também
            modalContent.style.height = `${modalHeight}px`;
            modalContent.style.maxHeight = `${modalHeight}px`;
            modalContent.style.margin = '0';
        });
    }
    
    /**
     * Minimiza um modal
     */
    function minimizeModal(modal) {
        if (!modal) return;
        
        const btnMinimize = modal.querySelector('.glass-modal-minimize');
        const btnMaximize = modal.querySelector('.glass-modal-maximize');
        
        modal.classList.add('minimized');
        
        if (btnMinimize) btnMinimize.style.display = 'none';
        if (btnMaximize) btnMaximize.style.display = 'flex';
        
        // Salvar posição original se necessário
        if (!modal.dataset.originalPosition) {
            const rect = modal.querySelector('.glass-modal-content').getBoundingClientRect();
            modal.dataset.originalPosition = JSON.stringify({
                top: rect.top,
                left: rect.left
            });
        }
        
        // Reorganizar todos os modais minimizados
        setTimeout(() => {
            reorganizeMinimizedModals();
        }, 100);
    }
    
    /**
     * Maximiza/restaura um modal
     */
    function maximizeModal(modal) {
        if (!modal) return;
        
        const btnMinimize = modal.querySelector('.glass-modal-minimize');
        const btnMaximize = modal.querySelector('.glass-modal-maximize');
        
        modal.classList.remove('minimized');
        
        if (btnMinimize) btnMinimize.style.display = 'flex';
        if (btnMaximize) btnMaximize.style.display = 'none';
        
        // Restaurar posição original se existir
        const modalContent = modal.querySelector('.glass-modal-content');
        if (modalContent && modal.dataset.originalPosition) {
            try {
                const originalPos = JSON.parse(modal.dataset.originalPosition);
                modalContent.style.position = '';
                modalContent.style.bottom = '';
                modalContent.style.right = '';
                modalContent.style.left = '';
                modalContent.style.top = '';
                modalContent.style.width = '';
                modalContent.style.maxWidth = '';
                modalContent.style.height = '';
                modalContent.style.maxHeight = '';
                modalContent.style.margin = '';
            } catch (e) {
                console.error('Erro ao restaurar posição original:', e);
            }
        }
        
        // Reorganizar modais minimizados restantes
        setTimeout(() => {
            reorganizeMinimizedModals();
        }, 100);
    }
    
    /**
     * Verifica se um modal está minimizado
     */
    function isModalMinimized(modal) {
        return modal && modal.classList.contains('minimized');
    }
    
    // Inicializar quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initModalMinimize();
            // Re-inicializar após um pequeno delay para garantir que todos os modais foram carregados
            setTimeout(initModalMinimize, 500);
        });
    } else {
        initModalMinimize();
        setTimeout(initModalMinimize, 500);
    }
    
    // Re-inicializar quando novos modais forem adicionados dinamicamente
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1 && node.classList && node.classList.contains('glass-modal')) {
                        if (node.id !== 'modal-confirm-dialog') {
                            const header = node.querySelector('.modal-header');
                            if (header) {
                                createMinimizeButtons(node, header);
                            }
                        }
                    }
                });
            }
            
            // Reorganizar quando um modal minimizado é removido ou sua classe muda
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                if (target.classList && target.classList.contains('glass-modal')) {
                    const wasMinimized = mutation.oldValue && mutation.oldValue.includes('minimized');
                    const isMinimized = target.classList.contains('minimized');
                    
                    if (wasMinimized !== isMinimized) {
                        setTimeout(reorganizeMinimizedModals, 100);
                    }
                }
            }
            
            // Reorganizar quando um modal é removido do DOM
            if (mutation.removedNodes.length) {
                mutation.removedNodes.forEach(function(node) {
                    if (node.nodeType === 1 && node.classList && node.classList.contains('glass-modal')) {
                        if (node.classList.contains('minimized')) {
                            setTimeout(reorganizeMinimizedModals, 100);
                        }
                    }
                });
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true
    });
    
    // Interceptar função closeModal para reorganizar quando um modal minimizado é fechado
    const originalCloseModal = window.closeModal;
    if (originalCloseModal) {
        window.closeModal = function(modalId) {
            const modal = document.getElementById(modalId);
            const wasMinimized = modal && modal.classList.contains('minimized');
            
            originalCloseModal(modalId);
            
            // Se o modal estava minimizado, reorganizar os restantes
            if (wasMinimized) {
                setTimeout(reorganizeMinimizedModals, 100);
            }
        };
    }
    
    // Reorganizar modais minimizados quando a janela é redimensionada
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            reorganizeMinimizedModals();
        }, 250);
    });
    
    // Reorganizar quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(reorganizeMinimizedModals, 500);
        });
    } else {
        setTimeout(reorganizeMinimizedModals, 500);
    }
    
    // Exportar funções para uso externo
    window.minimizeModal = minimizeModal;
    window.maximizeModal = maximizeModal;
    window.isModalMinimized = isModalMinimized;
    window.initModalMinimize = initModalMinimize;
    window.reorganizeMinimizedModals = reorganizeMinimizedModals;
})();
