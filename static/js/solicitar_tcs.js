/**
 * Gerenciamento da funcionalidade Solicitar Tomografias
 */

let isExecutando = false;
let comandoAtual = 0;
let totalComandos = 3;
let sessionId = null;
let readerAtual = null;

/**
 * Inicializa o modal de solicitar tomografias
 */
function initSolicitarTCSModal() {
    const btnSolicitarTCS = document.getElementById('btn-solicitar-tcs');
    const modal = document.getElementById('modal-solicitar-tcs');
    const btnClose = document.getElementById('close-modal-solicitar-tcs');
    const btnFechar = document.getElementById('btn-fechar-solicitacao');
    const btnIniciar = document.getElementById('btn-iniciar-solicitacao');
    const btnInterromper = document.getElementById('btn-interromper-solicitacao');
    
    if (btnSolicitarTCS) {
        btnSolicitarTCS.addEventListener('click', function() {
            openSolicitarTCSModal();
        });
    }
    
    if (btnClose) {
        btnClose.addEventListener('click', function() {
            closeSolicitarTCSModal();
        });
    }
    
    if (btnFechar) {
        btnFechar.addEventListener('click', function() {
            closeSolicitarTCSModal();
        });
    }
    
    if (btnIniciar) {
        btnIniciar.addEventListener('click', function() {
            iniciarSolicitacao();
        });
    }
    
    if (btnInterromper) {
        btnInterromper.addEventListener('click', function() {
            interromperSolicitacao();
        });
    }
    
    // Fechar modal ao clicar fora
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal && !isExecutando) {
                closeSolicitarTCSModal();
            }
        });
    }
    
    // Fechar com ESC (apenas se não estiver executando)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('active') && !isExecutando) {
            closeSolicitarTCSModal();
        }
    });
}

/**
 * Abre o modal
 */
function openSolicitarTCSModal() {
    const modal = document.getElementById('modal-solicitar-tcs');
    if (!modal) return;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Resetar estado
    resetarTerminal();
    isExecutando = false;
    comandoAtual = 0;
    sessionId = Date.now().toString(); // Gerar ID único para esta sessão
    atualizarBotoes();
}

/**
 * Fecha o modal
 */
function closeSolicitarTCSModal() {
    if (isExecutando) {
        if (!confirm('A execução está em andamento. Deseja realmente fechar?')) {
            return;
        }
    }
    
    const modal = document.getElementById('modal-solicitar-tcs');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        resetarTerminal();
        isExecutando = false;
        comandoAtual = 0;
    }
}

/**
 * Reseta o terminal
 */
function resetarTerminal() {
    const terminalOutput = document.getElementById('terminal-output');
    if (terminalOutput) {
        terminalOutput.innerHTML = '<div class="terminal-line">Aguardando início da execução...</div>';
    }
    
    atualizarETA('Aguardando...', 0, 'Pronto para iniciar');
}

/**
 * Inicia a solicitação
 */
function iniciarSolicitacao() {
    if (isExecutando) {
        return;
    }
    
    isExecutando = true;
    comandoAtual = 0;
    sessionId = Date.now().toString(); // Gerar ID único para esta sessão
    
    atualizarBotoes();
    
    const terminalOutput = document.getElementById('terminal-output');
    if (terminalOutput) {
        terminalOutput.innerHTML = '<div class="terminal-line">Iniciando execução dos comandos...</div>';
    }
    
    atualizarETA('Iniciando...', 0, 'Preparando execução');
    
    // Executar primeiro comando
    executarProximoComando();
}

/**
 * Executa o próximo comando na sequência com streaming em tempo real
 */
function executarProximoComando() {
    if (comandoAtual >= totalComandos) {
        finalizarExecucao(true);
        return;
    }
    
    atualizarETA(
        `Executando comando ${comandoAtual + 1}/${totalComandos}...`,
        (comandoAtual / totalComandos) * 100,
        `Comando ${comandoAtual + 1} de ${totalComandos}`
    );
    
    adicionarLinhaTerminal(`\n>>> Executando comando ${comandoAtual + 1}/${totalComandos}...`);
    
    // Usar fetch com streaming para receber saída em tempo real
    fetch('/api/solicitar-tcs/executar', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comando_index: comandoAtual, session_id: sessionId })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Erro na resposta do servidor');
        }
        
        const reader = response.body.getReader();
        readerAtual = reader; // Armazenar referência para poder cancelar
        const decoder = new TextDecoder();
        let buffer = '';
        
        function lerStream(tentativas = 0) {
            const maxTentativas = 5;
            const delayRetry = 2000; // 2 segundos
            
            reader.read().then(({ done, value }) => {
                if (done) {
                    // Processar buffer restante
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
                buffer = linhas.pop() || ''; // Manter última linha incompleta no buffer
                
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
                        fetch('/api/solicitar-tcs/executar', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ comando_index: comandoAtual, session_id: sessionId })
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
                        atualizarETA(
                            `Executando comando ${data.comando_index + 1}/${data.total}...`,
                            (data.comando_index / data.total) * 100,
                            `Comando ${data.comando_index + 1} de ${data.total}`
                        );
                        break;
                        
                    case 'output':
                        adicionarLinhaTerminal(data.linha);
                        break;
                        
                    case 'sucesso':
                        atualizarETA(
                            `Comando ${data.comando_index + 1} concluído`,
                            data.progresso,
                            `Progresso: ${data.progresso}%`
                        );
                        // Executar próximo comando se não estiver completo
                        if (!data.completo) {
                            comandoAtual++;
                            setTimeout(() => {
                                executarProximoComando();
                            }, 500);
                        } else {
                            finalizarExecucao(true);
                        }
                        break;
                        
                    case 'erro':
                        adicionarLinhaTerminal(`\n❌ Erro: ${data.mensagem}`);
                        finalizarExecucao(false);
                        break;
                        
                    case 'completo':
                        adicionarLinhaTerminal(`\n✅ ${data.mensagem}`);
                        finalizarExecucao(true);
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
 * Adiciona uma linha ao terminal
 */
function adicionarLinhaTerminal(texto) {
    const terminalOutput = document.getElementById('terminal-output');
    if (!terminalOutput) return;
    
    // Dividir por linhas se houver quebras
    const linhas = texto.split('\n');
    linhas.forEach(linha => {
        if (linha.trim() !== '') {
            const div = document.createElement('div');
            div.className = 'terminal-line';
            div.textContent = linha;
            terminalOutput.appendChild(div);
        }
    });
    
    // Scroll automático para o final
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

/**
 * Registra execução no relatório CSV
 */
function registrarRelatorio(rotina, registros) {
    fetch('/api/relatorio/registrar', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            rotina: rotina,
            registros: registros
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Relatório registrado com sucesso:', data);
        } else {
            console.error('Erro ao registrar relatório:', data.error);
        }
    })
    .catch(error => {
        console.error('Erro ao registrar relatório:', error);
    });
}

/**
 * Atualiza a barra ETA
 */
function atualizarETA(label, progresso, status) {
    const etaLabel = document.getElementById('eta-label');
    const etaProgressFill = document.getElementById('eta-progress-fill');
    const etaStatus = document.getElementById('eta-status');
    
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
 * Finaliza a execução
 */
function finalizarExecucao(sucesso) {
    isExecutando = false;
    readerAtual = null;
    
    atualizarBotoes();
    
    if (sucesso) {
        atualizarETA('Concluído!', 100, 'Todos os comandos executados com sucesso');
        adicionarLinhaTerminal('\n✅ Execução concluída com sucesso!');
        
        // Contar registros no CSV e registrar no relatório
        contarERegistrarRelatorio();
    } else {
        atualizarETA('Erro na execução', 0, 'Execução interrompida');
    }
}

/**
 * Conta os registros no CSV e registra no relatório
 */
function contarERegistrarRelatorio() {
    fetch('/api/exames-solicitar/count')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const registros = data.registros || 0;
                // Registrar no relatório
                registrarRelatorio('Solicitar Tomografias', registros);
            } else {
                console.error('Erro ao contar registros:', data.error);
            }
        })
        .catch(error => {
            console.error('Erro ao contar registros:', error);
        });
}

/**
 * Interrompe a execução
 */
function interromperSolicitacao() {
    if (!isExecutando) {
        return;
    }
    
    if (!confirm('Tem certeza que deseja interromper a execução?')) {
        return;
    }
    
    // Cancelar leitura do stream
    if (readerAtual) {
        readerAtual.cancel();
        readerAtual = null;
    }
    
    // Chamar API para interromper o processo
    fetch('/api/solicitar-tcs/interromper', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            adicionarLinhaTerminal('\n⚠️ Execução interrompida pelo usuário');
            finalizarExecucao(false);
        } else {
            alert('Erro ao interromper: ' + (data.mensagem || data.error || 'Erro desconhecido'));
        }
    })
    .catch(error => {
        console.error('Erro ao interromper:', error);
        adicionarLinhaTerminal('\n⚠️ Execução interrompida (pode haver processo residual)');
        finalizarExecucao(false);
    });
}

/**
 * Atualiza o estado dos botões
 */
function atualizarBotoes() {
    const btnIniciar = document.getElementById('btn-iniciar-solicitacao');
    const btnInterromper = document.getElementById('btn-interromper-solicitacao');
    
    if (isExecutando) {
        if (btnIniciar) {
            btnIniciar.disabled = true;
            btnIniciar.style.display = 'none';
        }
        if (btnInterromper) {
            btnInterromper.disabled = false;
            btnInterromper.style.display = 'inline-block';
        }
    } else {
        if (btnIniciar) {
            btnIniciar.disabled = false;
            btnIniciar.innerHTML = '<i class="fas fa-play"></i> Iniciar';
            btnIniciar.style.display = 'inline-block';
        }
        if (btnInterromper) {
            btnInterromper.style.display = 'none';
        }
    }
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    initSolicitarTCSModal();
});

