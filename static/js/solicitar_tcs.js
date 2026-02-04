/**
 * Gerenciamento da funcionalidade Solicitar Tomografias
 */

let isExecutando = false;
let comandoAtual = 0;
let totalComandos = 2;
let sessionId = null;
let readerAtual = null;
/** 0 = mostrar "Iniciar Processo", 1 = mostrar "Continuar..." (após interrupção ou erro no passo 0) */
let proximoPassoTCS = 0;

const STORAGE_KEY_TCS_SESSION = 'solicitar_tcs_session_id';

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
            iniciarSolicitacao(0);
        });
    }
    
    if (btnInterromper) {
        btnInterromper.addEventListener('click', function() {
            interromperSolicitacao();
        });
    }
    
    const btnContinuar = document.getElementById('btn-continuar-solicitacao');
    if (btnContinuar) {
        btnContinuar.addEventListener('click', function() {
            iniciarSolicitacao(1);
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
    
    resetarTerminal();
    isExecutando = false;
    comandoAtual = 0;
    proximoPassoTCS = 0;
    sessionId = sessionStorage.getItem(STORAGE_KEY_TCS_SESSION) || Date.now().toString();
    atualizarBotoes();
    
    // Se há sessionId persistido, verificar se ainda existe processo em execução para orientar reconectar
    if (sessionStorage.getItem(STORAGE_KEY_TCS_SESSION)) {
        fetch('/api/processos/listar')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.processos && data.processos.length > 0) {
                    const nosso = data.processos.find(p => p.session_id === sessionId && p.tipo === 'solicitar-tcs' && p.status === 'ativo');
                    if (nosso) {
                        adicionarLinhaTerminal('Há processo em execução desta sessão. Use "Reconectar a Processos em Execução" para continuar assistindo.');
                    }
                }
            })
            .catch(() => {});
    }
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
 * Inicia a solicitação (-eas e -ear).
 * @param {number} comandoInicial - 0 para iniciar do zero (-eas), 1 para continuar com -ear
 */
function iniciarSolicitacao(comandoInicial) {
    if (isExecutando) return;
    
    comandoAtual = comandoInicial;
    if (comandoInicial === 0) {
        sessionId = Date.now().toString();
        sessionStorage.setItem(STORAGE_KEY_TCS_SESSION, sessionId);
        const terminalOutput = document.getElementById('terminal-output');
        if (terminalOutput) {
            terminalOutput.innerHTML = '<div class="terminal-line">Iniciando execução (-eas, -ear)...</div>';
        }
    }
    
    isExecutando = true;
    atualizarBotoes();
    atualizarETA('Iniciando...', 0, 'Preparando execução');
    executarProximoComando();
}

/** Número máximo de tentativas em caso de 502/503 antes de consultar processos */
const MAX_RETRY_502 = 2;
/** Delays em ms para retry (backoff) */
const RETRY_DELAYS_MS = [2000, 5000];

/**
 * Em caso de 502/503, consulta processos ativos e orienta reconectar antes de finalizar
 * @param {number} status - código HTTP
 * @param {number} comandoIdx - índice do comando atual
 */
function tratarErroRespostaServidor(status, comandoIdx) {
    fetch('/api/processos/listar')
        .then(res => res.json())
        .then(data => {
            const processosTCS = data.success && data.processos
                ? data.processos.filter(p => p.tipo === 'solicitar-tcs' && p.status === 'ativo')
                : [];
            if (processosTCS.length > 0) {
                adicionarLinhaTerminal('\n⚠️ A conexão com o servidor foi interrompida (erro ' + status + '), mas o processo pode ainda estar em execução.');
                adicionarLinhaTerminal('Use "Reconectar a Processos em Execução" (botão flutuante) para tentar voltar ao stream.');
            }
            finalizarExecucao(false, comandoIdx);
        })
        .catch(() => {
            finalizarExecucao(false, comandoIdx);
        });
}

/**
 * Executa o próximo comando na sequência com streaming em tempo real
 * @param {number} retryCount - tentativa atual para 502/503 (0 = primeira)
 */
function executarProximoComando(retryCount) {
    if (typeof retryCount !== 'number') retryCount = 0;
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
    
    const doFetch = () => fetch('/api/solicitar-tcs/executar', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comando_index: comandoAtual, session_id: sessionId })
    });
    
    doFetch()
    .then(response => {
        if (!response.ok) {
            const status = response.status;
            if ((status === 502 || status === 503) && retryCount < MAX_RETRY_502) {
                const delay = RETRY_DELAYS_MS[retryCount] || 5000;
                adicionarLinhaTerminal(`\n⚠️ Servidor respondeu ${status}. Tentando novamente em ${delay / 1000}s... (${retryCount + 1}/${MAX_RETRY_502})`);
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        doFetch().then(resolve).catch(reject);
                    }, delay);
                }).then(nextResponse => {
                    if (!nextResponse.ok) {
                        tratarErroRespostaServidor(nextResponse.status, comandoAtual);
                        return null;
                    }
                    return nextResponse;
                });
            }
            tratarErroRespostaServidor(status, comandoAtual);
            return null;
        }
        return response;
    })
    .then(response => {
        if (!response) return;
        
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
                                finalizarExecucao(false, comandoAtual);
                            }
                        });
                    }, delayRetry);
                } else {
                    adicionarLinhaTerminal(`\n❌ Erro ao executar comando: ${error.message}`);
                    finalizarExecucao(false, comandoAtual);
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
                        adicionarLinhaTerminal('\n✅ ' + (data.mensagem || ''));
                        atualizarETA(
                            `Comando ${data.comando_index + 1} concluído`,
                            data.progresso,
                            `Progresso: ${data.progresso}%`
                        );
                        if (!data.completo) {
                            comandoAtual++;
                            adicionarLinhaTerminal('\n--- Executando próximo comando em sequência ---');
                            setTimeout(() => {
                                executarProximoComando();
                            }, 500);
                        } else {
                            finalizarExecucao(true);
                        }
                        break;
                        
                    case 'erro':
                        adicionarLinhaTerminal(`\n❌ Erro: ${data.mensagem}`);
                        finalizarExecucao(false, data.comando_index);
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
        // Em erro de rede, verificar se processo ainda está rodando no servidor
        fetch('/api/processos/listar')
            .then(res => res.json())
            .then(data => {
                const processosTCS = data.success && data.processos
                    ? data.processos.filter(p => p.tipo === 'solicitar-tcs' && p.status === 'ativo')
                    : [];
                if (processosTCS.length > 0) {
                    adicionarLinhaTerminal('O processo pode ainda estar em execução. Use "Reconectar a Processos em Execução" para tentar voltar ao stream.');
                }
                finalizarExecucao(false, comandoAtual);
            })
            .catch(() => finalizarExecucao(false, comandoAtual));
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
 * @param {boolean} sucesso
 * @param {number} [comandoIndex] - índice do comando que falhou (0 = -eas, 1 = -ear)
 */
function finalizarExecucao(sucesso, comandoIndex) {
    isExecutando = false;
    readerAtual = null;
    if (sucesso) {
        proximoPassoTCS = 0;
        sessionStorage.removeItem(STORAGE_KEY_TCS_SESSION);
    } else {
        proximoPassoTCS = (comandoIndex === 0) ? 1 : 0;
    }
    atualizarBotoes();
    
    if (sucesso) {
        atualizarETA('Concluído!', 100, 'Todos os comandos executados com sucesso');
        adicionarLinhaTerminal('\n✅ Execução concluída com sucesso!');
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
 * Interrompe a execução (envia Ctrl+C no servidor)
 */
function interromperSolicitacao() {
    if (!isExecutando) return;
    if (!confirm('Tem certeza que deseja interromper a execução?')) return;
    
    if (readerAtual) {
        readerAtual.cancel();
        readerAtual = null;
    }
    
    fetch('/api/solicitar-tcs/interromper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
    })
    .then(function(response) {
        return response.json().then(function(data) {
            if (data.success) {
                adicionarLinhaTerminal('\n⚠️ Processo interrompido pelo usuário');
            } else {
                adicionarLinhaTerminal('\n⚠️ ' + (data.mensagem || data.error || 'Erro ao interromper'));
            }
            isExecutando = false;
            proximoPassoTCS = 1;
            atualizarBotoes();
            atualizarETA('Interrompido', 0, 'Clique em Continuar... para executar -ear');
        });
    })
    .catch(function(error) {
        console.error('Erro ao interromper:', error);
        adicionarLinhaTerminal('\n⚠️ Erro ao interromper: ' + (error.message || error));
        isExecutando = false;
        proximoPassoTCS = 1;
        atualizarBotoes();
    });
}

/**
 * Atualiza o estado dos botões (Iniciar Processo / Interromper / Continuar...)
 */
function atualizarBotoes() {
    const btnIniciar = document.getElementById('btn-iniciar-solicitacao');
    const btnInterromper = document.getElementById('btn-interromper-solicitacao');
    const btnContinuar = document.getElementById('btn-continuar-solicitacao');
    
    if (isExecutando) {
        if (btnIniciar) btnIniciar.style.display = 'none';
        if (btnContinuar) btnContinuar.style.display = 'none';
        if (btnInterromper) {
            btnInterromper.style.display = 'inline-block';
            btnInterromper.disabled = false;
        }
    } else {
        if (btnInterromper) btnInterromper.style.display = 'none';
        if (proximoPassoTCS === 1) {
            if (btnIniciar) btnIniciar.style.display = 'none';
            if (btnContinuar) {
                btnContinuar.style.display = 'inline-block';
                btnContinuar.disabled = false;
            }
        } else {
            if (btnIniciar) {
                btnIniciar.innerHTML = '<i class="fas fa-play"></i> Iniciar Processo';
                btnIniciar.style.display = 'inline-block';
                btnIniciar.disabled = false;
            }
            if (btnContinuar) btnContinuar.style.display = 'none';
        }
    }
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    initSolicitarTCSModal();
});

