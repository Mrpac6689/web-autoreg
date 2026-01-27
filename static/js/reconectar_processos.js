/**
 * Gerenciamento da funcionalidade de Reconectar Processos
 */

(function() {
    'use strict';
    
    let readerAtual = null;
    let sessionIdConectado = null;
    
    /**
     * Inicializa o modal de reconectar processos
     */
    function initReconectarProcessosModal() {
        const btnReconectar = document.getElementById('btn-reconectar-processos');
        const modal = document.getElementById('modal-reconectar-processos');
        const btnClose = document.getElementById('close-modal-reconectar-processos');
        const btnFechar = document.getElementById('btn-fechar-reconectar-processos');
        const btnInvestigar = document.getElementById('btn-investigar-processos');
        
        // Abrir modal ao clicar no botão flutuante
        if (btnReconectar) {
            btnReconectar.addEventListener('click', function(e) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                openReconectarModal();
            }, true);
        }
        
        // Fechar modal
        if (btnClose) {
            btnClose.addEventListener('click', function() {
                closeReconectarModal();
            });
        }
        
        if (btnFechar) {
            btnFechar.addEventListener('click', function() {
                closeReconectarModal();
            });
        }
        
        // Investigar processos
        if (btnInvestigar) {
            btnInvestigar.addEventListener('click', function() {
                investigarProcessos();
            });
        }
        
        // Fechar modal ao clicar fora
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    closeReconectarModal();
                }
            });
        }
        
        // Fechar com ESC
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
                closeReconectarModal();
            }
        });
    }
    
    /**
     * Abre o modal
     */
    function openReconectarModal() {
        const modal = document.getElementById('modal-reconectar-processos');
        if (!modal) return;
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Resetar estado
        resetarTerminal();
        esconderProcessos();
        sessionIdConectado = null;
        
        // Esconder terminal inicialmente
        const terminalContainer = document.getElementById('terminal-container-reconectar');
        if (terminalContainer) {
            terminalContainer.style.display = 'none';
        }
    }
    
    /**
     * Fecha o modal
     */
    function closeReconectarModal() {
        // Cancelar leitura do stream se estiver ativa
        if (readerAtual) {
            readerAtual.cancel();
            readerAtual = null;
        }
        
        const modal = document.getElementById('modal-reconectar-processos');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    
    /**
     * Esconde a lista de processos
     */
    function esconderProcessos() {
        const processosLista = document.getElementById('processos-lista');
        const processosContainer = document.getElementById('processos-container');
        if (processosLista) processosLista.style.display = 'none';
        if (processosContainer) processosContainer.innerHTML = '';
    }
    
    /**
     * Mostra a lista de processos
     */
    function mostrarProcessos(processos) {
        const processosLista = document.getElementById('processos-lista');
        const processosContainer = document.getElementById('processos-container');
        
        if (!processosLista || !processosContainer) return;
        
        processosContainer.innerHTML = '';
        
        if (processos.length === 0) {
            processosContainer.innerHTML = '<p style="color: var(--text-light);">Nenhum processo em execução encontrado.</p>';
            processosLista.style.display = 'block';
            return;
        }
        
        processos.forEach(processo => {
            const div = document.createElement('div');
            div.className = 'processo-item';
            div.style.cssText = 'padding: 15px; margin-bottom: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 8px;';
            
            const statusColor = processo.status === 'ativo' ? '#4caf50' : '#ff9800';
            
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: var(--text-light);">Session ID:</strong> 
                        <span style="color: var(--text-light); font-family: monospace;">${processo.session_id}</span><br>
                        <strong style="color: var(--text-light);">PID:</strong> 
                        <span style="color: var(--text-light);">${processo.pid}</span><br>
                        <strong style="color: var(--text-light);">Status:</strong> 
                        <span style="color: ${statusColor};">${processo.status}</span><br>
                        <strong style="color: var(--text-light);">Comando:</strong> 
                        <span style="color: var(--text-light); font-size: 0.9rem;">${processo.comando}</span>
                    </div>
                    <button class="glass-button-action" onclick="reconectarProcesso('${processo.session_id}')" ${processo.status !== 'ativo' ? 'disabled' : ''}>
                        <i class="fas fa-plug"></i> Conectar
                    </button>
                </div>
            `;
            
            processosContainer.appendChild(div);
        });
        
        processosLista.style.display = 'block';
    }
    
    /**
     * Investiga processos em execução
     */
    function investigarProcessos() {
        const btnInvestigar = document.getElementById('btn-investigar-processos');
        if (btnInvestigar) {
            btnInvestigar.disabled = true;
            btnInvestigar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Investigando...';
        }
        
        resetarTerminal();
        adicionarLinhaTerminal('Investigando processos em execução...');
        
        fetch('/api/processos/listar')
            .then(response => {
                console.log('Resposta do servidor:', response);
                if (!response.ok) {
                    throw new Error(`Erro HTTP: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Dados recebidos:', data);
                if (data.success) {
                    if (data.debug) {
                        console.log('Debug info:', data.debug);
                        adicionarLinhaTerminal(`\n[DEBUG] Total no dicionário: ${data.debug.total_no_dict}, Session IDs: ${data.debug.session_ids.join(', ') || 'nenhum'}`);
                    }
                    if (data.total > 0) {
                        mostrarProcessos(data.processos);
                        adicionarLinhaTerminal(`\n✅ Encontrados ${data.total} processo(s) em execução`);
                    } else {
                        adicionarLinhaTerminal(`\nℹ️ Nenhum processo em execução encontrado`);
                        if (data.debug && data.debug.total_no_dict > 0) {
                            adicionarLinhaTerminal(`\n⚠️ Há ${data.debug.total_no_dict} processo(s) no dicionário, mas nenhum está ativo`);
                        }
                        esconderProcessos();
                    }
                } else {
                    adicionarLinhaTerminal(`\n❌ Erro: ${data.error || 'Erro desconhecido'}`);
                    esconderProcessos();
                }
            })
            .catch(error => {
                console.error('Erro ao investigar processos:', error);
                adicionarLinhaTerminal(`\n❌ Erro ao investigar processos: ${error.message}`);
                esconderProcessos();
            })
            .finally(() => {
                if (btnInvestigar) {
                    btnInvestigar.disabled = false;
                    btnInvestigar.innerHTML = '<i class="fas fa-search"></i> Investigar Processos em Execução';
                }
            });
    }
    
    /**
     * Reconecta a um processo específico
     */
    window.reconectarProcesso = function(sessionId) {
        if (sessionIdConectado === sessionId) {
            adicionarLinhaTerminal('\n⚠️ Já conectado a este processo');
            return;
        }
        
        // Cancelar conexão anterior se houver
        if (readerAtual) {
            readerAtual.cancel();
            readerAtual = null;
        }
        
        sessionIdConectado = sessionId;
        
        // Mostrar terminal
        const terminalContainer = document.getElementById('terminal-container-reconectar');
        if (terminalContainer) {
            terminalContainer.style.display = 'block';
        }
        
        resetarTerminal();
        adicionarLinhaTerminal(`Conectando ao processo ${sessionId}...`);
        
        fetch('/api/processos/reconectar', {
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
            
            function lerStream() {
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
                    
                    lerStream();
                }).catch(error => {
                    console.error('Erro ao ler stream:', error);
                    adicionarLinhaTerminal(`\n❌ Erro ao ler stream: ${error.message}`);
                });
            }
            
            function processarEvento(dadosJson) {
                try {
                    const data = JSON.parse(dadosJson);
                    
                    switch(data.tipo) {
                        case 'info':
                            adicionarLinhaTerminal(`\nℹ️ ${data.mensagem}`);
                            break;
                            
                        case 'output':
                            adicionarLinhaTerminal(data.linha);
                            break;
                            
                        case 'erro':
                            adicionarLinhaTerminal(`\n❌ Erro: ${data.mensagem}`);
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
            adicionarLinhaTerminal(`\n❌ Erro ao conectar: ${error.message}`);
        });
    };
    
    /**
     * Reseta o terminal
     */
    function resetarTerminal() {
        const terminalOutput = document.getElementById('terminal-output-reconectar');
        if (terminalOutput) {
            terminalOutput.innerHTML = '<div class="terminal-line">Aguardando conexão...</div>';
        }
    }
    
    /**
     * Adiciona uma linha ao terminal
     */
    function adicionarLinhaTerminal(texto) {
        const terminalOutput = document.getElementById('terminal-output-reconectar');
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
    
    // Inicializar quando o DOM estiver pronto
    if (!window.reconectarProcessosInitialized) {
        window.reconectarProcessosInitialized = true;
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                initReconectarProcessosModal();
            });
        } else {
            initReconectarProcessosModal();
        }
    }
})();
