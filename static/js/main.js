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
    
    // Atualizar data e hora com tratamento de erro melhorado
    updateDateTime();
    // Usar intervalo maior para reduzir carga no servidor (5 segundos)
    setInterval(updateDateTime, 5000);
    
    // Configurar event listeners para botões
    setupButtonListeners();
    
    // Configurar menu flutuante
    setupFloatingMenu();
    
    // Configurar logout
    setupLogout();
    
    // Configurar botão de visualizar robô
    setupVisualizarRobo();
    
    // Verificar se extensão está instalada e ocultar botão se necessário
    verificarExtensaoEAtualizarBotao();
    
    // Configurar botão de instalar extensão
    setupInstalarExtensao();
});

// Variável para controlar se já está fazendo uma requisição
let isUpdatingDateTime = false;
// Contador de erros consecutivos
let consecutiveErrors = 0;
// Intervalo máximo entre tentativas quando há erros (em ms)
const MAX_RETRY_INTERVAL = 30000; // 30 segundos

/**
 * Atualiza a data e hora atual
 */
function updateDateTime() {
    // Evitar múltiplas requisições simultâneas
    if (isUpdatingDateTime) {
        return;
    }
    
    // Se houver muitos erros consecutivos, aumentar o intervalo entre tentativas
    if (consecutiveErrors > 3) {
        // Usar fallback local e não fazer requisição por um tempo
        const now = new Date();
        const dateStr = now.toLocaleDateString('pt-BR');
        const timeStr = now.toLocaleTimeString('pt-BR');
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            timeElement.textContent = `${dateStr} - ${timeStr}`;
        }
        return;
    }
    
    isUpdatingDateTime = true;
    
    fetch('/api/current-time')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            consecutiveErrors = 0; // Resetar contador de erros em caso de sucesso
            const timeElement = document.getElementById('current-time');
            if (timeElement) {
                timeElement.textContent = `${data.date} - ${data.time}`;
            }
        })
        .catch(error => {
            consecutiveErrors++;
            // Só logar erro se não houver muitos erros consecutivos (evitar spam)
            if (consecutiveErrors <= 3) {
                console.warn('Erro ao atualizar data/hora do servidor, usando data/hora local:', error.message);
            }
            // Fallback para data/hora local
            const now = new Date();
            const dateStr = now.toLocaleDateString('pt-BR');
            const timeStr = now.toLocaleTimeString('pt-BR');
            const timeElement = document.getElementById('current-time');
            if (timeElement) {
                timeElement.textContent = `${dateStr} - ${timeStr}`;
            }
        })
        .finally(() => {
            isUpdatingDateTime = false;
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
        modal.style.display = 'flex';
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
        modal.style.display = 'none';
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
            } else if (action === 'solicitar-internacoes') {
                const btn = document.getElementById('btn-solicitar-internacoes');
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

/**
 * Verifica se a extensão Chrome está instalada e atualiza a visibilidade do botão
 * Se não estiver instalada, mostra o botão. Se estiver, mantém oculto.
 */
function verificarExtensaoEAtualizarBotao() {
    const btnInstalarExtensao = document.getElementById('btn-instalar-extensao');
    if (!btnInstalarExtensao) {
        return;
    }
    
    // Função para mostrar o botão (extensão não está instalada)
    function mostrarBotao() {
        btnInstalarExtensao.style.display = 'flex';
    }
    
    // Função para ocultar o botão (extensão está instalada)
    function ocultarBotao() {
        btnInstalarExtensao.style.display = 'none';
    }
    
    // Verificar se a extensão está instalada
    // A extensão injeta um marcador invisível na página da API
    function verificarElementosExtensao() {
        // Usar a função global para verificar
        const extensaoInstalada = verificarExtensaoInstalada();
        
        if (extensaoInstalada) {
            // Extensão está instalada - manter oculto
            ocultarBotao();
            return true;
        } else {
            // Extensão não está instalada - mostrar botão
            mostrarBotao();
            return false;
        }
    }
    
    // Aguardar um pouco para dar tempo da extensão carregar (se estiver instalada)
    setTimeout(function() {
        // Verificar imediatamente após o delay
        const extensaoInstalada = verificarElementosExtensao();
        
        // Se a extensão não estiver instalada, já mostramos o botão
        // Se estiver instalada, continuamos verificando periodicamente para garantir
        if (extensaoInstalada) {
            // Extensão encontrada, manter oculto e continuar verificando por um tempo
            let tentativas = 0;
            const intervalo = setInterval(function() {
                tentativas++;
                // Verificar novamente para garantir
                verificarElementosExtensao();
                if (tentativas >= 5) {
                    clearInterval(intervalo);
                }
            }, 500);
            
            // Usar MutationObserver para detectar mudanças
            const observer = new MutationObserver(function(mutations) {
                verificarElementosExtensao();
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Parar observação após alguns segundos
            setTimeout(() => {
                observer.disconnect();
            }, 5000);
        } else {
            // Extensão não encontrada, mas continuar verificando por um tempo
            // caso a extensão seja instalada depois
            let tentativas = 0;
            const intervalo = setInterval(function() {
                tentativas++;
                if (verificarElementosExtensao() || tentativas >= 20) {
                    clearInterval(intervalo);
                }
            }, 500);
            
            // Usar MutationObserver para detectar quando a extensão injeta elementos
            const observer = new MutationObserver(function(mutations) {
                if (verificarElementosExtensao()) {
                    observer.disconnect();
                    clearInterval(intervalo);
                }
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Parar observação após 10 segundos
            setTimeout(() => {
                observer.disconnect();
                clearInterval(intervalo);
            }, 10000);
        }
        
        // Também verificar quando a página recebe foco (usuário pode ter instalado em outra aba)
        window.addEventListener('focus', function() {
            verificarElementosExtensao();
        });
    }, 1000); // Aguardar 1 segundo para dar tempo da extensão carregar
}

/**
 * Função global para verificar se a extensão Chrome está instalada e ativa
 * Retorna true se estiver instalada, false caso contrário
 * Esta função pode ser usada por outros módulos para verificar a instalação da extensão
 */
function verificarExtensaoInstalada() {
    // Verificar se há o marcador invisível da extensão
    const marcadorExtensao = document.getElementById('autoreg-extension-installed-marker');
    
    if (marcadorExtensao) {
        return true;
    }
    
    // Fallback: verificar também os botões flutuantes (caso esteja na página do Core)
    const elementosExtensao = document.querySelectorAll(
        '.autoreg-floating-buttons-container, ' +
        '.autoreg-floating-action-button-round, ' +
        '#autoreg-btn-salvar-spa, ' +
        '#autoreg-btn-pular-spa'
    );
    
    return elementosExtensao.length > 0;
}

/**
 * Configura o botão e modal para instalar extensão Chrome
 */
function setupInstalarExtensao() {
    const btnInstalarExtensao = document.getElementById('btn-instalar-extensao');
    const modalInstalarExtensao = document.getElementById('modal-instalar-extensao');
    const closeModalBtn = document.getElementById('close-modal-instalar-extensao');
    const btnFecharModal = document.getElementById('btn-fechar-modal-extensao');
    const btnDownloadExtensao = document.getElementById('btn-download-extensao');
    const instrucoesCrx = document.getElementById('instrucoes-crx');
    const instrucoesZip = document.getElementById('instrucoes-zip');
    
    // Abrir modal ao clicar no botão
    if (btnInstalarExtensao) {
        btnInstalarExtensao.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            
            if (!modalInstalarExtensao) {
                console.error('Modal não encontrado: modal-instalar-extensao');
                return;
            }
            
            // Verificar tipo de arquivo disponível
            fetch('/api/extension/check')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        // Mostrar instruções corretas baseado no tipo de arquivo
                        if (data.has_crx) {
                            if (instrucoesCrx) instrucoesCrx.style.display = 'block';
                            if (instrucoesZip) instrucoesZip.style.display = 'none';
                        } else {
                            if (instrucoesCrx) instrucoesCrx.style.display = 'none';
                            if (instrucoesZip) instrucoesZip.style.display = 'block';
                        }
                    }
                    
                    // Abrir modal
                    openModal('modal-instalar-extensao');
                })
                .catch(error => {
                    console.error('Erro ao verificar tipo de extensão:', error);
                    // Mostrar instruções ZIP por padrão em caso de erro
                    if (instrucoesCrx) instrucoesCrx.style.display = 'none';
                    if (instrucoesZip) instrucoesZip.style.display = 'block';
                    openModal('modal-instalar-extensao');
                });
        });
    } else {
        console.error('Botão btn-instalar-extensao não encontrado');
    }
    
    // Botão de download
    if (btnDownloadExtensao) {
        btnDownloadExtensao.addEventListener('click', function(e) {
            e.stopPropagation();
            // Fazer download do arquivo
            window.location.href = '/api/extension/download';
        });
    }
    
    // Fechar modal ao clicar no botão de fechar (X)
    if (closeModalBtn && modalInstalarExtensao) {
        closeModalBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeModal('modal-instalar-extensao');
        });
    }
    
    // Fechar modal ao clicar no botão "Fechar"
    if (btnFecharModal && modalInstalarExtensao) {
        btnFecharModal.addEventListener('click', function(e) {
            e.stopPropagation();
            closeModal('modal-instalar-extensao');
        });
    }
    
    // Fechar modal ao clicar fora dele
    if (modalInstalarExtensao) {
        modalInstalarExtensao.addEventListener('click', function(e) {
            if (e.target === modalInstalarExtensao) {
                closeModal('modal-instalar-extensao');
            }
        });
    }
    
    // Fechar modal com tecla ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modalInstalarExtensao && modalInstalarExtensao.classList.contains('active')) {
            closeModal('modal-instalar-extensao');
        }
    });
}
