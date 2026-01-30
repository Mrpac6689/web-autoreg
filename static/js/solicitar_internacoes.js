/**
 * Gerenciamento da funcionalidade Solicitar Internações
 */

(function() {
    'use strict';
    
    let isExecutando = false;
    let comandoAtual = 0;
    let totalComandos = 4; // -spa -sia -ssr -snt
    let sessionId = null;
    let readerAtual = null;
    let modalRoboAberto = false;
    let abaCms = null; // Referência à aba do CMS aberta
    
    /**
     * Inicializa o modal de solicitar internações
     */
    function initSolicitarInternacoesModal() {
        const btnSolicitarInternacoes = document.getElementById('btn-solicitar-internacoes');
        const modal = document.getElementById('modal-solicitar-internacoes');
        const btnClose = document.getElementById('close-modal-solicitar-internacoes');
        const btnFechar = document.getElementById('btn-fechar-solicitar-internacoes');
        const btnRevisarAIH = document.getElementById('btn-revisar-aih-internacoes');
        const btnExtrairGHosp = document.getElementById('btn-extrair-ghosp-internacoes');
        const btnSolicitarSISREG = document.getElementById('btn-solicitar-sisreg-internacoes');
        const btnGravaCodigos = document.getElementById('btn-grava-codigos-internacoes');
        const btnInterromper = document.getElementById('btn-interromper-processo-internacoes');
        const btnExibirPendencias = document.getElementById('btn-exibir-pendencias-internacoes');
        
        // Configurar botão no menu também
        const menuItem = document.querySelector('[data-action="solicitar-internacoes"]');
        if (menuItem) {
            menuItem.addEventListener('click', function(e) {
                e.preventDefault();
                // A verificação será feita quando o botão for clicado
                if (btnSolicitarInternacoes) {
                    btnSolicitarInternacoes.click();
                }
            });
        }
        
        if (btnSolicitarInternacoes) {
            btnSolicitarInternacoes.addEventListener('click', function() {
                // Verificar se a extensão está instalada antes de abrir o modal
                if (typeof verificarExtensaoInstalada === 'function' && !verificarExtensaoInstalada()) {
                    // Extensão não está instalada - mostrar alerta
                    alert('Para utilização desta função, é necessário instalar a Extensão no Chrome.');
                    // Abrir modal de instalação da extensão
                    if (typeof openModal === 'function') {
                        // Verificar tipo de arquivo disponível antes de abrir
                        fetch('/api/extension/check')
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    const instrucoesCrx = document.getElementById('instrucoes-crx');
                                    const instrucoesZip = document.getElementById('instrucoes-zip');
                                    
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
                                // Abrir modal mesmo em caso de erro
                                openModal('modal-instalar-extensao');
                            });
                    } else {
                        // Fallback: tentar abrir o modal diretamente
                        const modalInstalarExtensao = document.getElementById('modal-instalar-extensao');
                        if (modalInstalarExtensao) {
                            modalInstalarExtensao.style.display = 'flex';
                            modalInstalarExtensao.classList.add('active');
                        }
                    }
                    return;
                }
                // Extensão está instalada - abrir modal normalmente
                openSolicitarInternacoesModal();
            });
        }
        
        if (btnClose) {
            btnClose.addEventListener('click', function() {
                closeSolicitarInternacoesModal();
            });
        }
        
        if (btnFechar) {
            btnFechar.addEventListener('click', function() {
                closeSolicitarInternacoesModal();
            });
        }
        
        if (btnRevisarAIH) {
            btnRevisarAIH.addEventListener('click', function() {
                revisarSolicitacoesAIH();
            });
        }
        
        if (btnExtrairGHosp) {
            btnExtrairGHosp.addEventListener('click', function() {
                extrairInformacoesGHosp();
            });
        }
        
        if (btnSolicitarSISREG) {
            btnSolicitarSISREG.addEventListener('click', function() {
                solicitarSISREG();
            });
        }
        
        if (btnGravaCodigos) {
            btnGravaCodigos.addEventListener('click', function() {
                gravaCodigosSolicitacao();
            });
        }
        
        const btnProcessarPendencias = document.getElementById('btn-processar-pendencias-internacoes');
        if (btnProcessarPendencias) {
            btnProcessarPendencias.addEventListener('click', function() {
                processarPendencias();
            });
        }
        
        if (btnInterromper) {
            btnInterromper.addEventListener('click', function() {
                interromperProcesso();
            });
        }
        
        // Fechar modal ao clicar fora
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal && !isExecutando) {
                    closeSolicitarInternacoesModal();
                }
            });
        }
        
        // Fechar com ESC (apenas se não estiver executando)
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal && modal.classList.contains('active') && !isExecutando) {
                closeSolicitarInternacoesModal();
            }
        });
        
        if (btnExibirPendencias) {
            btnExibirPendencias.addEventListener('click', function() {
                if (window.openPendenciasModal) {
                    window.openPendenciasModal();
                } else {
                    console.error('Função openPendenciasModal não encontrada');
                }
            });
        }
        
        // Configurar botões do modal do robô
        setupModalRobo();
    }
    
    /**
     * Configura o modal do robô durante execução do -spa
     */
    function setupModalRobo() {
        const modalRobo = document.getElementById('modal-robo-spa');
        const iframeRobo = document.getElementById('iframe-robo-spa');
        const btnSalvar = document.getElementById('btn-salvar-spa');
        const btnPular = document.getElementById('btn-pular-spa');
        const btnMinimize = document.getElementById('minimize-modal-robo-spa');
        const btnMaximize = document.getElementById('maximize-modal-robo-spa');
        const modalHeader = modalRobo ? modalRobo.querySelector('.modal-header') : null;
        
        // URL do serviço do robô - usar proxy para melhor performance
        const targetUrl = '/api/robo-proxy?url=' + encodeURIComponent('https://cms.michelpaes.com.br');
        
        // NÃO carregar o iframe imediatamente - apenas quando o modal for aberto
        // Isso melhora a performance inicial
        
        // Botão Salvar - cria flag grava.flag
        if (btnSalvar) {
            btnSalvar.addEventListener('click', function(e) {
                e.stopPropagation();
                criarFlag('grava.flag');
            });
        }
        
        // Botão Pular - cria flag pula.flag
        if (btnPular) {
            btnPular.addEventListener('click', function(e) {
                e.stopPropagation();
                criarFlag('pula.flag');
            });
        }
        
        // Botão Minimizar
        if (btnMinimize) {
            btnMinimize.addEventListener('click', function(e) {
                e.stopPropagation();
                minimizarModalRobo();
            });
        }
        
        // Botão Maximizar
        if (btnMaximize) {
            btnMaximize.addEventListener('click', function(e) {
                e.stopPropagation();
                maximizarModalRobo();
            });
        }
        
        // Clicar no header minimizado para maximizar
        if (modalHeader) {
            modalHeader.addEventListener('click', function(e) {
                if (modalRobo && modalRobo.classList.contains('minimized')) {
                    // Só maximizar se não clicou em um botão
                    if (!e.target.closest('button')) {
                        maximizarModalRobo();
                    }
                }
            });
        }
    }
    
    /**
     * Minimiza o modal do robô
     */
    function minimizarModalRobo() {
        const modalRobo = document.getElementById('modal-robo-spa');
        const btnMinimize = document.getElementById('minimize-modal-robo-spa');
        const btnMaximize = document.getElementById('maximize-modal-robo-spa');
        const iframeRobo = document.getElementById('iframe-robo-spa');
        
        if (modalRobo) {
            modalRobo.classList.add('minimized');
            if (btnMinimize) btnMinimize.style.display = 'none';
            if (btnMaximize) btnMaximize.style.display = 'flex';
            
            // Salvar src atual quando minimizar
            if (iframeRobo && iframeRobo.src && iframeRobo.src !== 'about:blank') {
                iframeRobo.dataset.originalSrc = iframeRobo.src;
            }
        }
    }
    
    /**
     * Maximiza o modal do robô
     */
    function maximizarModalRobo() {
        const modalRobo = document.getElementById('modal-robo-spa');
        const btnMinimize = document.getElementById('minimize-modal-robo-spa');
        const btnMaximize = document.getElementById('maximize-modal-robo-spa');
        const iframeRobo = document.getElementById('iframe-robo-spa');
        
        if (modalRobo) {
            modalRobo.classList.remove('minimized');
            if (btnMinimize) btnMinimize.style.display = 'flex';
            if (btnMaximize) btnMaximize.style.display = 'none';
            
            // Restaurar iframe quando maximizado
            if (iframeRobo && iframeRobo.dataset.originalSrc) {
                if (iframeRobo.src !== iframeRobo.dataset.originalSrc) {
                    iframeRobo.src = iframeRobo.dataset.originalSrc;
                }
            }
        }
    }
    
    /**
     * Cria uma flag no servidor
     */
    function criarFlag(nomeFlag) {
        fetch('/api/internacoes-solicitar/criar-flag', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                flag: nomeFlag
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const acao = nomeFlag === 'grava.flag' ? 'Salvar' : 'Pular';
                adicionarLinhaTerminal(`\n>>> Flag ${nomeFlag} criada - ação: ${acao}`);
            } else {
                console.error('Erro ao criar flag:', data.error);
                adicionarLinhaTerminal(`\n❌ Erro ao criar flag: ${data.error}`);
            }
        })
        .catch(error => {
            console.error('Erro ao criar flag:', error);
            adicionarLinhaTerminal(`\n❌ Erro ao criar flag: ${error.message}`);
        });
    }
    
    /**
     * Remove uma flag do servidor
     */
    function removerFlag(nomeFlag) {
        fetch('/api/internacoes-solicitar/remover-flag', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                flag: nomeFlag
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log(`Flag ${nomeFlag} removida`);
            } else {
                console.error('Erro ao remover flag:', data.error);
            }
        })
        .catch(error => {
            console.error('Erro ao remover flag:', error);
        });
    }
    
    /**
     * Abre o CMS em nova aba (substitui o modal do robô)
     */
    function abrirModalRobo() {
        // Ao invés de abrir modal com iframe, abrir nova aba
        const targetUrl = 'https://cms.michelpaes.com.br';
        
        // Se já existe uma aba aberta, focar nela
        if (abaCms && !abaCms.closed) {
            abaCms.focus();
            console.log('Focando na aba do CMS já aberta');
        } else {
            // Abrir nova aba
            abaCms = window.open(targetUrl, '_blank');
            if (abaCms) {
                console.log('Abrindo CMS em nova aba:', targetUrl);
                modalRoboAberto = true;
                adicionarLinhaTerminal('\n📂 CMS aberto em nova aba. Use os botões flutuantes da extensão para interagir.');
            } else {
                console.error('Erro ao abrir nova aba. Verifique se os pop-ups estão bloqueados.');
                adicionarLinhaTerminal('\n❌ Erro: Não foi possível abrir o CMS. Verifique se os pop-ups estão permitidos.');
            }
        }
    }
    
    /**
     * Fecha a aba do CMS (substitui fechar modal do robô)
     */
    function fecharModalRobo() {
        if (abaCms && !abaCms.closed) {
            // Tentar fechar a aba (pode não funcionar se o usuário não permitir)
            try {
                abaCms.close();
            } catch (e) {
                console.log('Não foi possível fechar a aba automaticamente:', e);
            }
        }
        abaCms = null;
        modalRoboAberto = false;
    }
    
    /**
     * Abre o modal
     */
    function openSolicitarInternacoesModal() {
        const modal = document.getElementById('modal-solicitar-internacoes');
        if (!modal) return;
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Resetar estado
        resetarTerminal();
        isExecutando = false;
        comandoAtual = 0;
        totalComandos = 3; // -sia -ssr -snt (para iniciar solicitações)
        sessionId = Date.now().toString();
        modalRoboAberto = false;
        abaCms = null;
        atualizarBotoes();
        
        // Esconder ETA inicialmente
        const etaContainer = document.getElementById('eta-container-solicitar-internacoes');
        if (etaContainer) {
            etaContainer.style.display = 'none';
        }
    }
    
    /**
     * Fecha o modal
     */
    function closeSolicitarInternacoesModal() {
        if (isExecutando) {
            if (!confirm('A execução está em andamento. Deseja realmente fechar?')) {
                return;
            }
            interromperProcesso();
        }
        
        // Fechar modal do robô se estiver aberto
        if (modalRoboAberto) {
            fecharModalRobo();
        }
        
        const modal = document.getElementById('modal-solicitar-internacoes');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    
    /**
     * Revisa as solicitações AIH (executa -spa e grava produção)
     */
    function revisarSolicitacoesAIH() {
        if (isExecutando) {
            return;
        }
        
        isExecutando = true;
        sessionId = Date.now().toString();
        
        atualizarBotoes();
        
        // Mostrar ETA
        const etaContainer = document.getElementById('eta-container-solicitar-internacoes');
        if (etaContainer) {
            etaContainer.style.display = 'block';
        }
        
        resetarTerminal();
        adicionarLinhaTerminal('Iniciando revisão de solicitações AIH...');
        adicionarLinhaTerminal('Executando comando: -spa');
        atualizarETA('Preparando...', 0, 'Aguardando início');
        
        // Executar comando -spa com gravação de produção
        executarRevisarAIH();
    }
    
    /**
     * Executa o comando -spa e grava a produção
     */
    function executarRevisarAIH() {
        // Se for o primeiro comando (-spa), abrir modal do robô imediatamente
        setTimeout(() => {
            abrirModalRobo();
        }, 500);
        
        atualizarETA('Executando -spa...', 0, 'Revisando solicitações AIH');
        
        fetch('/api/internacoes-solicitar/revisar-aih', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: sessionId
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Erro na resposta do servidor');
            }
            
            const reader = response.body.getReader();
            readerAtual = reader;
            const decoder = new TextDecoder();
            let buffer = '';
            
            function lerStream(tentativas = 0) {
                const maxTentativas = 5;
                const delayRetry = 2000; // 2 segundos
                
                reader.read().then(({ done, value }) => {
                    if (done) {
                        if (buffer.trim()) {
                            const linhas = buffer.split('\n');
                            linhas.forEach(linha => {
                                if (linha.startsWith('data: ')) {
                                    processarEventoRevisar(linha.substring(6));
                                }
                            });
                        }
                        return;
                    }
                    
                    buffer += decoder.decode(value, { stream: true });
                    const linhas = buffer.split('\n');
                    buffer = linhas.pop() || '';
                    
                    linhas.forEach(linha => {
                        if (linha.startsWith('data: ')) {
                            processarEventoRevisar(linha.substring(6));
                        }
                    });
                    
                    lerStream(0); // Resetar tentativas em caso de sucesso
                }).catch(error => {
                    console.error('Erro ao ler stream:', error);
                    const errorMsg = error.message.toLowerCase();
                    
                    // Verificar se é network error e ainda há tentativas
                    if ((errorMsg.includes('network error') || errorMsg.includes('failed to fetch') || errorMsg.includes('networkerror')) && tentativas < maxTentativas) {
                        adicionarLinhaTerminal(`\n⚠️ Erro de rede detectado. Tentando reconectar... (${tentativas + 1}/${maxTentativas})`);
                        
                        // Tentar reconectar após delay
                        setTimeout(() => {
                            // Recriar a requisição para retomar o processo
                            fetch('/api/internacoes-solicitar/revisar-aih', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    session_id: sessionId
                                })
                            })
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error('Erro na resposta do servidor');
                                }
                                
                                const newReader = response.body.getReader();
                                readerAtual = newReader;
                                const newDecoder = new TextDecoder();
                                buffer = ''; // Resetar buffer
                                
                                // Continuar leitura com nova conexão
                                lerStream(tentativas + 1);
                            })
                            .catch(retryError => {
                                if (tentativas + 1 < maxTentativas) {
                                    lerStream(tentativas + 1);
                                } else {
                                    adicionarLinhaTerminal(`\n❌ Erro ao executar comando após ${maxTentativas} tentativas: ${retryError.message}`);
                                    finalizarExecucao(false);
                                }
                            });
                        }, delayRetry);
                    } else {
                        adicionarLinhaTerminal(`\n❌ Erro ao executar comando: ${error.message}`);
                        finalizarExecucao(false);
                    }
                });
            }
            
            function processarEventoRevisar(dadosJson) {
                try {
                    const data = JSON.parse(dadosJson);
                    
                    switch(data.tipo) {
                        case 'inicio':
                            adicionarLinhaTerminal(`\n>>> Iniciando: ${data.comando}`);
                            break;
                            
                        case 'output':
                            adicionarLinhaTerminal(data.linha);
                            break;
                            
                        case 'aguardando_input':
                            adicionarLinhaTerminal(`\n⏸️ Aguardando interação do usuário...`);
                            adicionarLinhaTerminal('Use os botões flutuantes da extensão Chrome na página do CMS para Salvar ou Pular');
                            
                            // Se a aba do CMS ainda não estiver aberta, abrir
                            if (!modalRoboAberto) {
                                console.log('Evento aguardando_input recebido - abrindo CMS em nova aba');
                                abrirModalRobo();
                            }
                            break;
                            
                        case 'info':
                            adicionarLinhaTerminal(`\nℹ️ ${data.mensagem}`);
                            break;
                            
                        case 'aviso':
                            adicionarLinhaTerminal(`\n⚠️ ${data.mensagem}`);
                            break;
                            
                        case 'sucesso':
                            atualizarETA('Concluído!', 100, 'Revisão concluída com sucesso');
                            adicionarLinhaTerminal(`\n✅ ${data.mensagem || 'Revisão de solicitações AIH concluída com sucesso!'}`);
                            
                            // Fechar modal do robô se estiver aberto
                            if (modalRoboAberto) {
                                fecharModalRobo();
                            }
                            
                            finalizarExecucao(true);
                            break;
                            
                        case 'erro':
                            adicionarLinhaTerminal(`\n❌ Erro: ${data.mensagem}`);
                            // Fechar modal do robô mesmo em erro
                            if (modalRoboAberto) {
                                fecharModalRobo();
                            }
                            finalizarExecucao(false);
                            break;
                    }
                } catch (e) {
                    console.error('Erro ao processar evento:', e, dadosJson);
                }
            }
            
            lerStream();
        })
        .catch(error => {
            console.error('Erro:', error);
            adicionarLinhaTerminal(`\n❌ Erro ao executar comando: ${error.message}`);
            finalizarExecucao(false);
        });
    }
    
    /**
     * Extrai informações GHosp (grava produção e executa -sia)
     */
    function extrairInformacoesGHosp() {
        if (isExecutando) {
            return;
        }
        
        isExecutando = true;
        sessionId = Date.now().toString();
        
        atualizarBotoes();
        
        // Mostrar ETA
        const etaContainer = document.getElementById('eta-container-solicitar-internacoes');
        if (etaContainer) {
            etaContainer.style.display = 'block';
        }
        
        resetarTerminal();
        adicionarLinhaTerminal('Iniciando extração de informações GHosp...');
        adicionarLinhaTerminal('Gravando produção no relatório...');
        atualizarETA('Gravando produção...', 0, 'Registrando produção');
        
        // Primeiro, gravar a produção no relatório
        fetch('/api/internacoes-solicitar/gravar-producao', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                adicionarLinhaTerminal(`✅ ${data.mensagem}`);
                adicionarLinhaTerminal('Executando comando: -sia');
                atualizarETA('Preparando...', 0, 'Aguardando início');
                
                // Executar comando -sia (índice 1)
                executarComandoIndividual(1, '-sia', 'Extração de informações GHosp');
            } else {
                adicionarLinhaTerminal(`⚠️ Aviso: ${data.error || 'Erro ao gravar produção'}`);
                adicionarLinhaTerminal('Continuando com a execução do comando...');
                adicionarLinhaTerminal('Executando comando: -sia');
                atualizarETA('Preparando...', 0, 'Aguardando início');
                
                // Continuar mesmo com erro na gravação
                executarComandoIndividual(1, '-sia', 'Extração de informações GHosp');
            }
        })
        .catch(error => {
            console.error('Erro ao gravar produção:', error);
            adicionarLinhaTerminal(`⚠️ Aviso: Erro ao gravar produção: ${error.message}`);
            adicionarLinhaTerminal('Continuando com a execução do comando...');
            adicionarLinhaTerminal('Executando comando: -sia');
            atualizarETA('Preparando...', 0, 'Aguardando início');
            
            // Continuar mesmo com erro na gravação
            executarComandoIndividual(1, '-sia', 'Extração de informações GHosp');
        });
    }
    
    /**
     * Solicita SISREG (executa -ssr)
     */
    function solicitarSISREG() {
        if (isExecutando) {
            return;
        }
        
        isExecutando = true;
        sessionId = Date.now().toString();
        
        atualizarBotoes();
        
        // Mostrar ETA
        const etaContainer = document.getElementById('eta-container-solicitar-internacoes');
        if (etaContainer) {
            etaContainer.style.display = 'block';
        }
        
        resetarTerminal();
        adicionarLinhaTerminal('Iniciando solicitação SISREG...');
        adicionarLinhaTerminal('Executando comando: -ssr');
        atualizarETA('Preparando...', 0, 'Aguardando início');
        
        // Executar comando -ssr (índice 2)
        executarComandoIndividual(2, '-ssr', 'Solicitação SISREG');
    }
    
    /**
     * Grava códigos de solicitação (executa -snt)
     */
    function gravaCodigosSolicitacao() {
        if (isExecutando) {
            return;
        }
        
        isExecutando = true;
        sessionId = Date.now().toString();
        
        atualizarBotoes();
        
        // Mostrar ETA
        const etaContainer = document.getElementById('eta-container-solicitar-internacoes');
        if (etaContainer) {
            etaContainer.style.display = 'block';
        }
        
        resetarTerminal();
        adicionarLinhaTerminal('Iniciando gravação de códigos de solicitação...');
        adicionarLinhaTerminal('Executando comando: -snt');
        atualizarETA('Preparando...', 0, 'Aguardando início');
        
        // Executar comando -snt (índice 3)
        executarComandoIndividual(3, '-snt', 'Gravação de códigos de solicitação');
    }
    
    /**
     * Executa um comando individual usando o endpoint existente
     */
    function executarComandoIndividual(comandoIndex, nomeComando, descricao) {
        adicionarLinhaTerminal(`\n>>> Executando comando: ${nomeComando}`);
        atualizarETA(`Executando ${nomeComando}...`, 0, descricao);
        
        fetch('/api/internacoes-solicitar/executar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: sessionId,
                comando_index: comandoIndex
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Erro na resposta do servidor');
            }
            
            const reader = response.body.getReader();
            readerAtual = reader;
            const decoder = new TextDecoder();
            let buffer = '';
            
            function lerStream(tentativas = 0) {
                const maxTentativas = 5;
                const delayRetry = 2000; // 2 segundos
                
                reader.read().then(({ done, value }) => {
                    if (done) {
                        if (buffer.trim()) {
                            const linhas = buffer.split('\n');
                            linhas.forEach(linha => {
                                if (linha.startsWith('data: ')) {
                                    processarEventoIndividual(linha.substring(6), descricao);
                                }
                            });
                        }
                        return;
                    }
                    
                    buffer += decoder.decode(value, { stream: true });
                    const linhas = buffer.split('\n');
                    buffer = linhas.pop() || '';
                    
                    linhas.forEach(linha => {
                        if (linha.startsWith('data: ')) {
                            processarEventoIndividual(linha.substring(6), descricao);
                        }
                    });
                    
                    lerStream(0); // Resetar tentativas em caso de sucesso
                }).catch(error => {
                    console.error('Erro ao ler stream:', error);
                    const errorMsg = error.message.toLowerCase();
                    
                    // Verificar se é network error e ainda há tentativas
                    if ((errorMsg.includes('network error') || errorMsg.includes('failed to fetch') || errorMsg.includes('networkerror')) && tentativas < maxTentativas) {
                        adicionarLinhaTerminal(`\n⚠️ Erro de rede detectado. Tentando reconectar... (${tentativas + 1}/${maxTentativas})`);
                        
                        // Tentar reconectar após delay
                        setTimeout(() => {
                            // Recriar a requisição para retomar o processo
                            fetch('/api/internacoes-solicitar/executar', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    session_id: sessionId,
                                    comando_index: comandoIndex
                                })
                            })
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error('Erro na resposta do servidor');
                                }
                                
                                const newReader = response.body.getReader();
                                readerAtual = newReader;
                                const newDecoder = new TextDecoder();
                                buffer = ''; // Resetar buffer
                                
                                // Continuar leitura com nova conexão
                                lerStream(tentativas + 1);
                            })
                            .catch(retryError => {
                                if (tentativas + 1 < maxTentativas) {
                                    lerStream(tentativas + 1);
                                } else {
                                    adicionarLinhaTerminal(`\n❌ Erro ao executar comando após ${maxTentativas} tentativas: ${retryError.message}`);
                                    finalizarExecucao(false);
                                }
                            });
                        }, delayRetry);
                    } else {
                        adicionarLinhaTerminal(`\n❌ Erro ao executar comando: ${error.message}`);
                        finalizarExecucao(false);
                    }
                });
            }
            
            function processarEventoIndividual(dadosJson, descricao) {
                try {
                    const data = JSON.parse(dadosJson);
                    
                    switch(data.tipo) {
                        case 'inicio':
                            adicionarLinhaTerminal(`\n>>> Iniciando: ${data.comando}`);
                            break;
                            
                        case 'output':
                            adicionarLinhaTerminal(data.linha);
                            break;
                            
                        case 'aguardando_input':
                            adicionarLinhaTerminal(`\n⏸️ Aguardando interação do usuário...`);
                            break;
                            
                        case 'sucesso':
                            atualizarETA('Concluído!', 100, `${descricao} concluída`);
                            adicionarLinhaTerminal(`\n✅ ${data.mensagem || 'Comando executado com sucesso!'}`);
                            finalizarExecucao(true);
                            break;
                            
                        case 'erro':
                            adicionarLinhaTerminal(`\n❌ Erro: ${data.mensagem}`);
                            finalizarExecucao(false);
                            break;
                    }
                } catch (e) {
                    console.error('Erro ao processar evento:', e, dadosJson);
                }
            }
            
            lerStream();
        })
        .catch(error => {
            console.error('Erro:', error);
            adicionarLinhaTerminal(`\n❌ Erro ao executar comando: ${error.message}`);
            finalizarExecucao(false);
        });
    }
    
    /**
     * Inicia o processo de solicitações (executa -sia -ssr -snt)
     */
    function iniciarSolicitacoes() {
        if (isExecutando) {
            return;
        }
        
        isExecutando = true;
        comandoAtual = 1; // Começar em -sia (índice 1)
        totalComandos = 3; // Apenas 3 comandos (-sia, -ssr, -snt)
        sessionId = Date.now().toString();
        
        atualizarBotoes();
        
        // Mostrar ETA
        const etaContainer = document.getElementById('eta-container-solicitar-internacoes');
        if (etaContainer) {
            etaContainer.style.display = 'block';
        }
        
        resetarTerminal();
        adicionarLinhaTerminal('Iniciando solicitações de internações...');
        adicionarLinhaTerminal('Gravando produção no relatório...');
        atualizarETA('Gravando produção...', 0, 'Registrando produção');
        
        // Primeiro, gravar a produção no relatório
        fetch('/api/internacoes-solicitar/gravar-producao', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                adicionarLinhaTerminal(`✅ ${data.mensagem}`);
                adicionarLinhaTerminal('Executando comandos: -sia -ssr -snt');
                atualizarETA('Preparando...', 0, 'Aguardando início');
                
                // Executar primeiro comando (-sia) após gravar produção
                executarProximoComando();
            } else {
                adicionarLinhaTerminal(`⚠️ Aviso: ${data.error || 'Erro ao gravar produção'}`);
                adicionarLinhaTerminal('Continuando com a execução dos comandos...');
                adicionarLinhaTerminal('Executando comandos: -sia -ssr -snt');
                atualizarETA('Preparando...', 0, 'Aguardando início');
                
                // Continuar mesmo com erro na gravação
                executarProximoComando();
            }
        })
        .catch(error => {
            console.error('Erro ao gravar produção:', error);
            adicionarLinhaTerminal(`⚠️ Aviso: Erro ao gravar produção: ${error.message}`);
            adicionarLinhaTerminal('Continuando com a execução dos comandos...');
            adicionarLinhaTerminal('Executando comandos: -sia -ssr -snt');
            atualizarETA('Preparando...', 0, 'Aguardando início');
            
            // Continuar mesmo com erro na gravação
            executarProximoComando();
        });
    }
    
    /**
     * Processa apenas as pendências (executa -ssr -snt)
     */
    function processarPendencias() {
        if (isExecutando) {
            return;
        }
        
        isExecutando = true;
        comandoAtual = 2; // Começar em -ssr (índice 2)
        totalComandos = 2; // Apenas 2 comandos (-ssr e -snt)
        sessionId = Date.now().toString();
        
        atualizarBotoes();
        
        // Mostrar ETA
        const etaContainer = document.getElementById('eta-container-solicitar-internacoes');
        if (etaContainer) {
            etaContainer.style.display = 'block';
        }
        
        resetarTerminal();
        adicionarLinhaTerminal('Iniciando processamento de pendências...');
        adicionarLinhaTerminal('Executando comandos: -ssr -snt');
        atualizarETA('Preparando...', 0, 'Aguardando início');
        
        // Executar primeiro comando (-ssr)
        executarProximoComandoPendencias();
    }
    
    /**
     * Executa o próximo comando na sequência de processamento de pendências
     */
    function executarProximoComandoPendencias() {
        // Comando atual relativo aos comandos de pendências (0 = -ssr, 1 = -snt)
        const comandoRelativo = comandoAtual - 2;
        
        if (comandoRelativo >= totalComandos) {
            atualizarETA('Concluído!', 100, 'Todos os comandos executados');
            adicionarLinhaTerminal('\n✅ Processamento de pendências concluído com sucesso!');
            finalizarExecucao(true);
            return;
        }
        
        const comandos = ['-ssr', '-snt'];
        const nomeComando = comandos[comandoRelativo];
        
        adicionarLinhaTerminal(`\n>>> Executando comando: ${nomeComando}`);
        atualizarETA(`Executando ${nomeComando}...`, (comandoRelativo / totalComandos) * 100, `Comando ${comandoRelativo + 1} de ${totalComandos}`);
        
        fetch('/api/internacoes-solicitar/executar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: sessionId,
                comando_index: comandoAtual // Usar índice absoluto (2 ou 3)
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Erro na resposta do servidor');
            }
            
            const reader = response.body.getReader();
            readerAtual = reader;
            const decoder = new TextDecoder();
            let buffer = '';
            
            function lerStream(tentativas = 0) {
                const maxTentativas = 5;
                const delayRetry = 2000; // 2 segundos
                
                reader.read().then(({ done, value }) => {
                    if (done) {
                        if (buffer.trim()) {
                            const linhas = buffer.split('\n');
                            linhas.forEach(linha => {
                                if (linha.startsWith('data: ')) {
                                    processarEventoPendencias(linha.substring(6));
                                }
                            });
                        }
                        return;
                    }
                    
                    buffer += decoder.decode(value, { stream: true });
                    const linhas = buffer.split('\n');
                    buffer = linhas.pop() || '';
                    
                    linhas.forEach(linha => {
                        if (linha.startsWith('data: ')) {
                            processarEventoPendencias(linha.substring(6));
                        }
                    });
                    
                    lerStream(0); // Resetar tentativas em caso de sucesso
                }).catch(error => {
                    console.error('Erro ao ler stream:', error);
                    const errorMsg = error.message.toLowerCase();
                    
                    // Verificar se é network error e ainda há tentativas
                    if ((errorMsg.includes('network error') || errorMsg.includes('failed to fetch') || errorMsg.includes('networkerror')) && tentativas < maxTentativas) {
                        adicionarLinhaTerminal(`\n⚠️ Erro de rede detectado. Tentando reconectar... (${tentativas + 1}/${maxTentativas})`);
                        
                        // Tentar reconectar após delay
                        setTimeout(() => {
                            // Recriar a requisição para retomar o processo
                            fetch('/api/internacoes-solicitar/executar', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    session_id: sessionId,
                                    comando_index: comandoAtual
                                })
                            })
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error('Erro na resposta do servidor');
                                }
                                
                                const newReader = response.body.getReader();
                                readerAtual = newReader;
                                const newDecoder = new TextDecoder();
                                buffer = ''; // Resetar buffer
                                
                                // Continuar leitura com nova conexão
                                lerStream(tentativas + 1);
                            })
                            .catch(retryError => {
                                if (tentativas + 1 < maxTentativas) {
                                    lerStream(tentativas + 1);
                                } else {
                                    adicionarLinhaTerminal(`\n❌ Erro ao executar comando após ${maxTentativas} tentativas: ${retryError.message}`);
                                    finalizarExecucao(false);
                                }
                            });
                        }, delayRetry);
                    } else {
                        adicionarLinhaTerminal(`\n❌ Erro ao executar comando: ${error.message}`);
                        finalizarExecucao(false);
                    }
                });
            }
            
            function processarEventoPendencias(dadosJson) {
                try {
                    const data = JSON.parse(dadosJson);
                    const comandoRelativo = comandoAtual - 2;
                    
                    switch(data.tipo) {
                        case 'inicio':
                            adicionarLinhaTerminal(`\n>>> Iniciando: ${data.comando}`);
                            break;
                            
                        case 'output':
                            adicionarLinhaTerminal(data.linha);
                            break;
                            
                        case 'aguardando_input':
                            // Não deve acontecer para -ssr e -snt, mas tratar caso aconteça
                            adicionarLinhaTerminal(`\n⏸️ Aguardando interação do usuário...`);
                            break;
                            
                        case 'sucesso':
                            atualizarETA(`Comando ${comandoRelativo + 1} concluído`, ((comandoRelativo + 1) / totalComandos) * 100, `Comando ${comandoRelativo + 1} de ${totalComandos} concluído`);
                            adicionarLinhaTerminal(`\n✅ ${data.mensagem || 'Comando executado com sucesso!'}`);
                            
                            // Executar próximo comando
                            comandoAtual++;
                            setTimeout(() => {
                                executarProximoComandoPendencias();
                            }, 500);
                            break;
                            
                        case 'erro':
                            adicionarLinhaTerminal(`\n❌ Erro: ${data.mensagem}`);
                            finalizarExecucao(false);
                            break;
                    }
                } catch (e) {
                    console.error('Erro ao processar evento:', e, dadosJson);
                }
            }
            
            lerStream();
        })
        .catch(error => {
            console.error('Erro:', error);
            adicionarLinhaTerminal(`\n❌ Erro ao executar comando: ${error.message}`);
            finalizarExecucao(false);
        });
    }
    
    /**
     * Executa o próximo comando na sequência (apenas -sia, -ssr, -snt)
     */
    function executarProximoComando() {
        // Comando atual relativo aos comandos de solicitação (0 = -sia, 1 = -ssr, 2 = -snt)
        const comandoRelativo = comandoAtual - 1;
        
        if (comandoRelativo >= totalComandos) {
            atualizarETA('Concluído!', 100, 'Todos os comandos executados');
            adicionarLinhaTerminal('\n✅ Processo concluído com sucesso!');
            finalizarExecucao(true);
            return;
        }
        
        const comandos = ['-sia', '-ssr', '-snt'];
        const nomeComando = comandos[comandoRelativo];
        
        adicionarLinhaTerminal(`\n>>> Executando comando: ${nomeComando}`);
        atualizarETA(`Executando ${nomeComando}...`, (comandoRelativo / totalComandos) * 100, `Comando ${comandoRelativo + 1} de ${totalComandos}`);
        
        fetch('/api/internacoes-solicitar/executar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: sessionId,
                comando_index: comandoAtual
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Erro na resposta do servidor');
            }
            
            const reader = response.body.getReader();
            readerAtual = reader;
            const decoder = new TextDecoder();
            let buffer = '';
            
            function lerStream(tentativas = 0) {
                const maxTentativas = 5;
                const delayRetry = 2000; // 2 segundos
                
                reader.read().then(({ done, value }) => {
                    if (done) {
                        if (buffer.trim()) {
                            const linhas = buffer.split('\n');
                            linhas.forEach(linha => {
                                if (linha.startsWith('data: ')) {
                                    processarEvento(linha.substring(6));
                                }
                            });
                        }
                        return;
                    }
                    
                    buffer += decoder.decode(value, { stream: true });
                    const linhas = buffer.split('\n');
                    buffer = linhas.pop() || '';
                    
                    linhas.forEach(linha => {
                        if (linha.startsWith('data: ')) {
                            processarEvento(linha.substring(6));
                        }
                    });
                    
                    lerStream(0); // Resetar tentativas em caso de sucesso
                }).catch(error => {
                    console.error('Erro ao ler stream:', error);
                    const errorMsg = error.message.toLowerCase();
                    
                    // Verificar se é network error e ainda há tentativas
                    if ((errorMsg.includes('network error') || errorMsg.includes('failed to fetch') || errorMsg.includes('networkerror')) && tentativas < maxTentativas) {
                        adicionarLinhaTerminal(`\n⚠️ Erro de rede detectado. Tentando reconectar... (${tentativas + 1}/${maxTentativas})`);
                        
                        // Tentar reconectar após delay
                        setTimeout(() => {
                            // Recriar a requisição para retomar o processo
                            fetch('/api/internacoes-solicitar/executar', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    session_id: sessionId,
                                    comando_index: comandoAtual
                                })
                            })
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error('Erro na resposta do servidor');
                                }
                                
                                const newReader = response.body.getReader();
                                readerAtual = newReader;
                                const newDecoder = new TextDecoder();
                                buffer = ''; // Resetar buffer
                                
                                // Continuar leitura com nova conexão
                                lerStream(tentativas + 1);
                            })
                            .catch(retryError => {
                                if (tentativas + 1 < maxTentativas) {
                                    lerStream(tentativas + 1);
                                } else {
                                    adicionarLinhaTerminal(`\n❌ Erro ao executar comando após ${maxTentativas} tentativas: ${retryError.message}`);
                                    finalizarExecucao(false);
                                }
                            });
                        }, delayRetry);
                    } else {
                        adicionarLinhaTerminal(`\n❌ Erro ao executar comando: ${error.message}`);
                        finalizarExecucao(false);
                    }
                });
            }
            
            function processarEvento(dadosJson) {
                try {
                    const data = JSON.parse(dadosJson);
                    
                    switch(data.tipo) {
                        case 'inicio':
                            adicionarLinhaTerminal(`\n>>> Iniciando: ${data.comando}`);
                            break;
                            
                        case 'output':
                            adicionarLinhaTerminal(data.linha);
                            break;
                            
                        case 'aguardando_input':
                            // Comando está aguardando input do usuário
                            adicionarLinhaTerminal(`\n⏸️ Aguardando interação do usuário...`);
                            adicionarLinhaTerminal('Use os botões flutuantes da extensão Chrome na página do CMS para Salvar ou Pular');
                            
                            // Se for o primeiro comando (-spa) e a aba do CMS ainda não estiver aberta, abrir
                            if (comandoAtual === 0 && !modalRoboAberto) {
                                console.log('Evento aguardando_input recebido - abrindo CMS em nova aba');
                                abrirModalRobo();
                            }
                            break;
                            
                        case 'sucesso':
                            const comandoRelativo = comandoAtual - 1;
                            atualizarETA(`Comando ${comandoRelativo + 1} concluído`, ((comandoRelativo + 1) / totalComandos) * 100, `Comando ${comandoRelativo + 1} de ${totalComandos} concluído`);
                            adicionarLinhaTerminal(`\n✅ ${data.mensagem || 'Comando executado com sucesso!'}`);
                            
                            // Executar próximo comando
                            comandoAtual++;
                            setTimeout(() => {
                                executarProximoComando();
                            }, 500);
                            break;
                            
                        case 'erro':
                            adicionarLinhaTerminal(`\n❌ Erro: ${data.mensagem}`);
                            finalizarExecucao(false);
                            break;
                    }
                } catch (e) {
                    console.error('Erro ao processar evento:', e, dadosJson);
                }
            }
            
            lerStream();
        })
        .catch(error => {
            console.error('Erro:', error);
            adicionarLinhaTerminal(`\n❌ Erro ao executar comando: ${error.message}`);
            finalizarExecucao(false);
        });
    }
    
    /**
     * Interrompe o processo
     */
    function interromperProcesso() {
        if (!isExecutando) {
            return;
        }
        
        if (!confirm('Tem certeza que deseja interromper o processo?')) {
            return;
        }
        
        if (readerAtual) {
            readerAtual.cancel();
            readerAtual = null;
        }
        
        // Fechar modal do robô se estiver aberto
        if (modalRoboAberto) {
            fecharModalRobo();
        }
        
        fetch('/api/internacoes-solicitar/interromper-execucao', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ session_id: sessionId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                adicionarLinhaTerminal('\n⚠️ Processo interrompido pelo usuário');
                finalizarExecucao(false);
            } else {
                alert('Erro ao interromper: ' + (data.mensagem || data.error || 'Erro desconhecido'));
            }
        })
        .catch(error => {
            console.error('Erro ao interromper:', error);
            adicionarLinhaTerminal('\n⚠️ Processo interrompido (pode haver processo residual)');
            finalizarExecucao(false);
        });
    }
    
    /**
     * Finaliza a execução
     */
    function finalizarExecucao(sucesso) {
        isExecutando = false;
        readerAtual = null;
        
        // Resetar valores
        comandoAtual = 0;
        totalComandos = 3; // -sia -ssr -snt (para iniciar solicitações)
        
        atualizarBotoes();
        
        if (!sucesso) {
            atualizarETA('Erro na execução', 0, 'Processo interrompido');
        }
    }
    
    /**
     * Reseta o terminal
     */
    function resetarTerminal() {
        const terminalOutput = document.getElementById('terminal-output-solicitar-internacoes');
        if (terminalOutput) {
            terminalOutput.innerHTML = '<div class="terminal-line">Aguardando início da execução...</div>';
        }
    }
    
    /**
     * Adiciona uma linha ao terminal
     */
    function adicionarLinhaTerminal(texto) {
        const terminalOutput = document.getElementById('terminal-output-solicitar-internacoes');
        if (!terminalOutput) return;
        
        const linhas = texto.split('\n');
        linhas.forEach(linha => {
            if (linha.trim() !== '') {
                const div = document.createElement('div');
                div.className = 'terminal-line';
                div.textContent = linha;
                terminalOutput.appendChild(div);
            }
        });
        
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }
    
    /**
     * Atualiza a barra ETA
     */
    function atualizarETA(label, progresso, status) {
        const etaLabel = document.getElementById('eta-label-solicitar-internacoes');
        const etaProgressFill = document.getElementById('eta-progress-fill-solicitar-internacoes');
        const etaStatus = document.getElementById('eta-status-solicitar-internacoes');
        
        if (etaLabel) {
            etaLabel.textContent = label;
        }
        
        if (etaProgressFill) {
            etaProgressFill.style.width = `${progresso}%`;
        }
        
        if (etaStatus) {
            etaStatus.textContent = status;
        }
    }
    
    /**
     * Atualiza o estado dos botões
     */
    function atualizarBotoes() {
        const btnRevisarAIH = document.getElementById('btn-revisar-aih-internacoes');
        const btnExtrairGHosp = document.getElementById('btn-extrair-ghosp-internacoes');
        const btnSolicitarSISREG = document.getElementById('btn-solicitar-sisreg-internacoes');
        const btnGravaCodigos = document.getElementById('btn-grava-codigos-internacoes');
        const btnExibirPendencias = document.getElementById('btn-exibir-pendencias-internacoes');
        const btnProcessarPendencias = document.getElementById('btn-processar-pendencias-internacoes');
        const btnInterromper = document.getElementById('btn-interromper-processo-internacoes');
        
        if (isExecutando) {
            // Desabilitar e esconder todos os botões de ação durante execução
            if (btnRevisarAIH) {
                btnRevisarAIH.disabled = true;
                btnRevisarAIH.style.display = 'none';
            }
            if (btnExtrairGHosp) {
                btnExtrairGHosp.disabled = true;
                btnExtrairGHosp.style.display = 'none';
            }
            if (btnSolicitarSISREG) {
                btnSolicitarSISREG.disabled = true;
                btnSolicitarSISREG.style.display = 'none';
            }
            if (btnGravaCodigos) {
                btnGravaCodigos.disabled = true;
                btnGravaCodigos.style.display = 'none';
            }
            if (btnExibirPendencias) {
                btnExibirPendencias.disabled = true;
                btnExibirPendencias.style.display = 'none';
            }
            if (btnProcessarPendencias) {
                btnProcessarPendencias.disabled = true;
                btnProcessarPendencias.style.display = 'none';
            }
            if (btnInterromper) {
                btnInterromper.disabled = false;
                btnInterromper.style.display = 'inline-block';
            }
        } else {
            // Habilitar e mostrar todos os botões quando não está executando
            if (btnRevisarAIH) {
                btnRevisarAIH.disabled = false;
                btnRevisarAIH.style.display = 'inline-block';
            }
            if (btnExtrairGHosp) {
                btnExtrairGHosp.disabled = false;
                btnExtrairGHosp.style.display = 'inline-block';
            }
            if (btnSolicitarSISREG) {
                btnSolicitarSISREG.disabled = false;
                btnSolicitarSISREG.style.display = 'inline-block';
            }
            if (btnGravaCodigos) {
                btnGravaCodigos.disabled = false;
                btnGravaCodigos.style.display = 'inline-block';
            }
            if (btnExibirPendencias) {
                btnExibirPendencias.disabled = false;
                btnExibirPendencias.style.display = 'inline-block';
            }
            if (btnProcessarPendencias) {
                btnProcessarPendencias.disabled = false;
                btnProcessarPendencias.style.display = 'inline-block';
            }
            if (btnInterromper) {
                btnInterromper.style.display = 'none';
            }
        }
    }
    
    // Inicializar quando o DOM estiver pronto
    if (!window.solicitarInternacoesInitialized) {
        window.solicitarInternacoesInitialized = true;
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                initSolicitarInternacoesModal();
            });
        } else {
            initSolicitarInternacoesModal();
        }
    }
})();
