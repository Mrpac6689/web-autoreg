/**
 * Gerenciamento da planilha editável de Internações a Solicitar
 */

(function() {
    'use strict';
    
    // Variáveis do módulo
    let internacoesData = [];
    let originalInternacoesData = [];
    let isInternacoesEdited = false;
    let isExecutandoBusca = false;
    let sessionIdInternacoes = null;
    let readerAtualInternacoes = null;
    
    // Sistema de seleção
    let selectionStartCell = null;
    let selectedCells = new Set();
    let selectedRows = new Set();
    let isSelectingWithKeyboard = false; // Flag para evitar limpar seleção durante seleção com teclado
    
    /**
     * Função auxiliar para confirmação com botões Sim/Não
     */
    function confirmSimNao(mensagem) {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-confirm-dialog');
            const messageEl = document.getElementById('confirm-message');
            const btnSim = document.getElementById('btn-confirm-sim');
            const btnNao = document.getElementById('btn-confirm-nao');
            
            if (!modal || !messageEl || !btnSim || !btnNao) {
                // Fallback para confirm nativo se o modal não existir
                resolve(confirm(mensagem));
                return;
            }
            
            messageEl.textContent = mensagem;
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            modal.classList.add('active');
            
            const cleanup = () => {
                modal.classList.remove('active');
                modal.style.display = 'none';
                document.body.style.overflow = '';
                btnSim.onclick = null;
                btnNao.onclick = null;
                // Remover listener do overlay
                modal.onclick = null;
            };
            
            // Fechar ao clicar no overlay (fora do modal)
            modal.onclick = (e) => {
                if (e.target === modal) {
                    cleanup();
                    resolve(false);
                }
            };
            
            btnSim.onclick = () => {
                cleanup();
                resolve(true);
            };
            
            btnNao.onclick = () => {
                cleanup();
                resolve(false);
            };
        });
    }

/**
 * Inicializa o modal da planilha de internações
 */
function initInternacoesModal() {
    const btnPreparaSol = document.getElementById('btn-prepara-sol-internacoes');
    const modal = document.getElementById('modal-internacoes-solicitar');
    const btnClose = document.getElementById('close-modal-internacoes');
    const btnLimpar = document.getElementById('btn-limpar-internacoes');
    const btnSalvar = document.getElementById('btn-salvar-internacoes');
    const btnSair = document.getElementById('btn-fechar-internacoes');
    const btnBuscarPendentes = document.getElementById('btn-buscar-pendentes');
    const btnInterromper = document.getElementById('btn-interromper-busca');
    
    if (btnPreparaSol) {
        btnPreparaSol.addEventListener('click', function() {
            openInternacoesModal();
        });
    }
    
    if (btnClose) {
        btnClose.addEventListener('click', function() {
            closeInternacoesModal();
        });
    }
    
    if (btnLimpar) {
        btnLimpar.addEventListener('click', function() {
            limparPlanilhaInternacoes();
        });
    }
    
    if (btnSalvar) {
        btnSalvar.addEventListener('click', function() {
            salvarPlanilhaInternacoes().then(() => {
                doCloseInternacoesModal();
            }).catch(() => {
                // Erro ao salvar - modal permanece aberto
            });
        });
    }
    
    if (btnSair) {
        btnSair.addEventListener('click', function() {
            closeInternacoesModal();
        });
    }
    
    if (btnBuscarPendentes) {
        btnBuscarPendentes.addEventListener('click', function() {
            buscarPendentes();
        });
    }
    
    if (btnInterromper) {
        btnInterromper.addEventListener('click', function() {
            interromperBusca();
        });
    }
    
    // Fechar modal ao clicar fora
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal && !isExecutandoBusca) {
                closeInternacoesModal();
            }
        });
    }
    
    // Fechar com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('active') && !isExecutandoBusca) {
            closeInternacoesModal();
        }
    });
}

/**
 * Abre o modal e carrega os dados
 */
function openInternacoesModal() {
    const modal = document.getElementById('modal-internacoes-solicitar');
    if (!modal) return;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Esconder terminal e ETA inicialmente
    const terminalContainer = document.getElementById('terminal-container-internacoes');
    const etaContainer = document.getElementById('eta-container-internacoes');
    if (terminalContainer) terminalContainer.style.display = 'none';
    if (etaContainer) etaContainer.style.display = 'none';
    
    loadInternacoesData();
}

/**
 * Fecha o modal com verificação de edições
 */
async function closeInternacoesModal() {
    if (isExecutandoBusca) {
        const resposta = await confirmSimNao('A busca está em andamento. Deseja realmente fechar?');
        if (!resposta) {
            return;
        }
        interromperBusca();
    }
    
    if (isInternacoesEdited) {
        const resposta1 = await confirmSimNao('Você tem alterações não salvas. Deseja salvar antes de sair?');
        if (resposta1) {
            salvarPlanilhaInternacoes().then(() => {
                doCloseInternacoesModal();
            }).catch(() => {
                // Usuário cancelou ou erro ao salvar
            });
        } else {
            const resposta2 = await confirmSimNao('Tem certeza que deseja sair sem salvar?');
            if (resposta2) {
                doCloseInternacoesModal();
            }
        }
    } else {
        doCloseInternacoesModal();
    }
}

/**
 * Fecha o modal sem verificação
 */
function doCloseInternacoesModal() {
    const modal = document.getElementById('modal-internacoes-solicitar');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        isInternacoesEdited = false;
        internacoesData = [];
        originalInternacoesData = [];
        isExecutandoBusca = false;
        sessionIdInternacoes = null;
        
        // Esconder terminal e ETA
        const terminalContainer = document.getElementById('terminal-container-internacoes');
        const etaContainer = document.getElementById('eta-container-internacoes');
        if (terminalContainer) terminalContainer.style.display = 'none';
        if (etaContainer) etaContainer.style.display = 'none';
        
        // Remover classe has-changes do botão salvar
        const btnSalvar = document.getElementById('btn-salvar-internacoes');
        if (btnSalvar) {
            btnSalvar.classList.remove('has-changes');
        }
        
        atualizarBotoesInternacoes();
    }
}

/**
 * Carrega os dados do CSV
 */
function loadInternacoesData() {
    fetch('/api/internacoes-solicitar/load')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                internacoesData = data.data;
                originalInternacoesData = JSON.parse(JSON.stringify(data.data));
                renderInternacoesSpreadsheet();
                isInternacoesEdited = false;
            } else {
                alert('Erro ao carregar dados: ' + (data.error || 'Erro desconhecido'));
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            alert('Erro ao carregar dados da planilha');
        });
}

/**
 * Renderiza a planilha na tabela
 */
function renderInternacoesSpreadsheet() {
    const header = document.getElementById('spreadsheet-header-internacoes');
    const body = document.getElementById('spreadsheet-body-internacoes');
    
    if (!header || !body) return;
    
    // Limpar conteúdo anterior
    header.innerHTML = '';
    body.innerHTML = '';
    
    // Cabeçalho padrão do CSV
    const CABECALHO_PADRAO = ['ra', 'data', 'hora', 'cns', 'procedimento', 'chave'];
    
    // Garantir que sempre há pelo menos o cabeçalho
    if (internacoesData.length === 0) {
        internacoesData = [CABECALHO_PADRAO];
    }
    
    // Garantir que a primeira linha é SEMPRE o cabeçalho válido
    if (internacoesData.length > 0) {
        internacoesData[0] = [...CABECALHO_PADRAO];
    } else {
        internacoesData[0] = [...CABECALHO_PADRAO];
    }
    
    // Renderizar cabeçalho
    const headerRow = document.createElement('tr');
    internacoesData[0].forEach((cell) => {
        const th = document.createElement('th');
        th.textContent = cell || '';
        th.contentEditable = false;
        th.classList.add('header-cell');
        headerRow.appendChild(th);
    });
    header.appendChild(headerRow);
    
    // Renderizar corpo
    for (let i = 1; i < internacoesData.length; i++) {
        const row = document.createElement('tr');
        const rowData = internacoesData[i] || [];
        
        for (let j = 0; j < internacoesData[0].length; j++) {
            const td = document.createElement('td');
            td.textContent = rowData[j] || '';
            td.contentEditable = true;
            td.dataset.row = i;
            td.dataset.col = j;
            
            td.addEventListener('blur', function() {
                updateInternacoesCellData(this);
            });
            
            td.addEventListener('keydown', function(e) {
                const result = handleInternacoesCellKeydown(e, this);
                if (result === false) {
                    e.stopImmediatePropagation();
                }
            }, true);
            
            td.addEventListener('focus', function(e) {
                // Se não estiver fazendo seleção com teclado e não estiver com Shift pressionado, limpar seleção anterior
                if (!isSelectingWithKeyboard && !e.shiftKey) {
                    clearInternacoesSelection();
                }
                // Só selecionar a célula se não estiver fazendo seleção com teclado
                if (!isSelectingWithKeyboard) {
                    selectInternacoesCell(this);
                }
                
                if (this.textContent && !isSelectingWithKeyboard) {
                    setTimeout(() => {
                        selectCellText(this);
                    }, 0);
                }
            });
            
            td.addEventListener('click', function(e) {
                if (e.shiftKey && selectionStartCell) {
                    selectInternacoesRange(selectionStartCell, this);
                } else {
                    clearInternacoesSelection();
                    selectInternacoesCell(this);
                    selectionStartCell = this;
                }
            });
            
            row.appendChild(td);
        }
        body.appendChild(row);
    }
    
    // Adicionar linha vazia no final
    addEmptyInternacoesRow();
}

/**
 * Adiciona uma linha vazia no final
 */
function addEmptyInternacoesRow() {
    const body = document.getElementById('spreadsheet-body-internacoes');
    if (!body) return;
    
    const newRowIndex = internacoesData.length;
    const row = document.createElement('tr');
    const numCols = internacoesData[0].length;
    
    while (internacoesData.length <= newRowIndex) {
        internacoesData.push([]);
    }
    
    for (let j = 0; j < numCols; j++) {
        const td = document.createElement('td');
        td.textContent = '';
        td.contentEditable = true;
        td.dataset.row = newRowIndex;
        td.dataset.col = j;
        
        td.addEventListener('blur', function() {
            updateInternacoesCellData(this);
        });
        
        td.addEventListener('keydown', function(e) {
            const result = handleInternacoesCellKeydown(e, this);
            if (result === false) {
                e.stopImmediatePropagation();
            }
        }, true);
        
        td.addEventListener('focus', function(e) {
            // Se não estiver com Shift pressionado, limpar seleção anterior
            if (!e.shiftKey) {
                clearInternacoesSelection();
            }
            selectInternacoesCell(this);
            
            if (this.textContent) {
                setTimeout(() => {
                    selectCellText(this);
                }, 0);
            }
        });
        
        td.addEventListener('click', function(e) {
            if (e.shiftKey && selectionStartCell) {
                selectInternacoesRange(selectionStartCell, this);
            } else {
                clearInternacoesSelection();
                selectInternacoesCell(this);
                selectionStartCell = this;
            }
        });
        
        row.appendChild(td);
    }
    body.appendChild(row);
}

/**
 * Atualiza os dados quando uma célula é editada
 */
function updateInternacoesCellData(cell) {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    let value = cell.textContent.trim();
    
    // NUNCA permitir editar a primeira linha (cabeçalho)
    if (row === 0) {
        const CABECALHO_PADRAO = ['ra', 'data', 'hora', 'cns', 'procedimento', 'chave'];
        if (internacoesData[0] && internacoesData[0][col] !== CABECALHO_PADRAO[col]) {
            internacoesData[0][col] = CABECALHO_PADRAO[col];
            cell.textContent = CABECALHO_PADRAO[col];
        }
        return;
    }
    
    while (internacoesData.length <= row) {
        internacoesData.push([]);
    }
    
    while (internacoesData[row].length <= col) {
        internacoesData[row].push('');
    }
    
    internacoesData[row][col] = value;
    
    checkForInternacoesEdits();
}

/**
 * Limpa a seleção atual
 */
function clearInternacoesSelection() {
    selectedCells.forEach(cell => {
        cell.classList.remove('selected');
    });
    selectedCells.clear();
    
    selectedRows.forEach(rowIndex => {
        const body = document.getElementById('spreadsheet-body-internacoes');
        if (body && body.children[rowIndex - 1]) {
            body.children[rowIndex - 1].classList.remove('row-selected');
        }
    });
    selectedRows.clear();
    
    selectionStartCell = null;
}

/**
 * Seleciona uma célula
 */
function selectInternacoesCell(cell, addToSelection = false) {
    if (!addToSelection) {
        clearInternacoesSelection();
        selectionStartCell = cell;
    }
    
    cell.classList.add('selected');
    selectedCells.add(cell);
}

/**
 * Seleciona uma linha inteira
 */
function selectInternacoesRow(rowIndex, addToSelection = false) {
    if (!addToSelection) {
        clearInternacoesSelection();
    }
    
    const body = document.getElementById('spreadsheet-body-internacoes');
    if (!body || rowIndex < 1) return;
    
    const bodyRow = rowIndex - 1;
    if (bodyRow >= body.children.length) return;
    
    const row = body.children[bodyRow];
    if (!row) return;
    
    row.classList.add('row-selected');
    selectedRows.add(rowIndex);
    
    // Selecionar todas as células da linha
    Array.from(row.children).forEach(cell => {
        cell.classList.add('selected');
        selectedCells.add(cell);
    });
}

/**
 * Seleciona um range de células
 */
function selectInternacoesRange(startCell, endCell) {
    // Não limpar seleção aqui - vamos apenas expandir
    // clearInternacoesSelection();
    
    const startRow = parseInt(startCell.dataset.row);
    const startCol = parseInt(startCell.dataset.col);
    const endRow = parseInt(endCell.dataset.row);
    const endCol = parseInt(endCell.dataset.col);
    
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    
    const body = document.getElementById('spreadsheet-body-internacoes');
    if (!body) return;
    
    // Limpar apenas células que não estão no novo range
    selectedCells.forEach(cell => {
        const cellRow = parseInt(cell.dataset.row);
        const cellCol = parseInt(cell.dataset.col);
        if (cellRow < minRow || cellRow > maxRow || cellCol < minCol || cellCol > maxCol) {
            cell.classList.remove('selected');
            selectedCells.delete(cell);
        }
    });
    
    // Adicionar células do range
    for (let r = minRow; r <= maxRow; r++) {
        const bodyRow = r - 1;
        if (bodyRow < 0 || bodyRow >= body.children.length) continue;
        
        const row = body.children[bodyRow];
        if (!row) continue;
        
        for (let c = minCol; c <= maxCol; c++) {
            if (c >= row.children.length) continue;
            const cell = row.children[c];
            if (!selectedCells.has(cell)) {
                cell.classList.add('selected');
                selectedCells.add(cell);
            }
        }
    }
}

/**
 * Remove linhas selecionadas
 */
function removeSelectedInternacoesRows() {
    const rowsToRemove = new Set();
    
    // Adicionar linhas explicitamente selecionadas
    selectedRows.forEach(rowIndex => {
        if (rowIndex > 0) { // Não remover cabeçalho
            rowsToRemove.add(rowIndex);
        }
    });
    
    // Adicionar linhas identificadas através de células selecionadas
    selectedCells.forEach(cell => {
        if (cell && cell.dataset && cell.dataset.row) {
            const row = parseInt(cell.dataset.row);
            if (row > 0 && !isNaN(row)) { // Não remover cabeçalho
                rowsToRemove.add(row);
            }
        }
    });
    
    if (rowsToRemove.size === 0) return;
    
    // Remover linhas em ordem decrescente para não afetar índices
    const sortedRows = Array.from(rowsToRemove).sort((a, b) => b - a);
    sortedRows.forEach(rowIndex => {
        if (rowIndex < internacoesData.length) {
            internacoesData.splice(rowIndex, 1);
        }
    });
    
    clearInternacoesSelection();
    renderInternacoesSpreadsheet();
    checkForInternacoesEdits();
}

/**
 * Manipula teclas na célula
 */
function handleInternacoesCellKeydown(e, cell) {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const body = document.getElementById('spreadsheet-body-internacoes');
    
    if (!body) return;
    
    const bodyRow = row - 1;
    
    // Delete - remover linhas selecionadas
    if (e.key === 'Delete' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        // Verificar se há seleção de texto dentro da célula atual
        const selection = window.getSelection();
        let isEditingCell = false;
        
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            // Verificar se a seleção está dentro da célula atual
            if (cell.contains(range.commonAncestorContainer) || cell === range.commonAncestorContainer) {
                // Verificar se há texto selecionado (não apenas cursor)
                if (range.toString().length > 0) {
                    isEditingCell = true;
                }
            }
        }
        
        // Se estiver editando texto dentro da célula, permitir comportamento padrão
        if (isEditingCell) {
            return true; // Permitir comportamento padrão (deletar texto)
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        // Se não há células ou linhas selecionadas, selecionar a célula atual
        if (selectedRows.size === 0 && selectedCells.size === 0) {
            selectInternacoesCell(cell);
        }
        
        // Calcular número de linhas únicas que serão removidas
        const rowsToRemove = new Set();
        selectedRows.forEach(rowIndex => {
            if (rowIndex > 0) rowsToRemove.add(rowIndex);
        });
        selectedCells.forEach(selectedCell => {
            if (selectedCell && selectedCell.dataset && selectedCell.dataset.row) {
                const row = parseInt(selectedCell.dataset.row);
                if (row > 0 && !isNaN(row)) {
                    rowsToRemove.add(row);
                }
            }
        });
        
        const numLinhas = rowsToRemove.size;
        if (numLinhas > 0) {
            confirmSimNao(`Tem certeza que deseja remover ${numLinhas} linha(s)?`).then((resposta) => {
                if (resposta) {
                    removeSelectedInternacoesRows();
                }
            });
        } else {
            // Se não há linhas para remover, apenas limpar seleção
            clearInternacoesSelection();
        }
        return false;
    }
    
    // Shift + setas - seleção
    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        e.stopPropagation();
        
        // Se não houver célula inicial, usar a célula atual
        if (!selectionStartCell) {
            selectionStartCell = cell;
            // Selecionar a célula inicial também
            selectInternacoesCell(cell);
        }
        
        let targetCell = null;
        const numCols = internacoesData[0].length;
        
        if (e.key === 'ArrowLeft') {
            // Selecionar célula à esquerda
            if (col > 0) {
                const currentRow = body.children[bodyRow];
                if (currentRow && currentRow.children[col - 1]) {
                    targetCell = currentRow.children[col - 1];
                }
            } else if (bodyRow > 0) {
                // Se estiver na primeira coluna, selecionar última coluna da linha anterior
                const prevRow = body.children[bodyRow - 1];
                if (prevRow && prevRow.children[numCols - 1]) {
                    targetCell = prevRow.children[numCols - 1];
                }
            }
        } else if (e.key === 'ArrowRight') {
            // Selecionar célula à direita
            if (col < numCols - 1) {
                const currentRow = body.children[bodyRow];
                if (currentRow && currentRow.children[col + 1]) {
                    targetCell = currentRow.children[col + 1];
                }
            } else if (bodyRow < body.children.length - 1) {
                // Se estiver na última coluna, selecionar primeira coluna da próxima linha
                const nextRow = body.children[bodyRow + 1];
                if (nextRow && nextRow.children[0]) {
                    targetCell = nextRow.children[0];
                }
            }
        } else if (e.key === 'ArrowUp') {
            // Selecionar célula acima
            if (bodyRow > 0) {
                const prevRow = body.children[bodyRow - 1];
                if (prevRow && prevRow.children[col]) {
                    targetCell = prevRow.children[col];
                }
            }
        } else if (e.key === 'ArrowDown') {
            // Selecionar célula abaixo
            if (bodyRow < body.children.length - 1) {
                const nextRow = body.children[bodyRow + 1];
                if (nextRow && nextRow.children[col]) {
                    targetCell = nextRow.children[col];
                }
            }
        }
        
        if (targetCell) {
            // Marcar que estamos fazendo seleção com teclado
            isSelectingWithKeyboard = true;
            
            // Expandir seleção do início até a célula alvo
            selectInternacoesRange(selectionStartCell, targetCell);
            
            // Atualizar a célula atual antes de mover o foco
            updateInternacoesCellData(cell);
            
            // Mover foco para a célula alvo sem limpar seleção
            targetCell.focus();
            
            // Não selecionar texto da célula, apenas manter o foco visual
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                selection.removeAllRanges();
            }
            
            // Resetar flag após um pequeno delay para permitir que o event listener de focus execute
            setTimeout(() => {
                isSelectingWithKeyboard = false;
            }, 10);
        }
        
        return false;
    }
    
    // Setas sem Shift - navegação
    if (!e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        // Se houver seleção, limpar antes de navegar
        if (selectedCells.size > 0 || selectedRows.size > 0) {
            clearInternacoesSelection();
        }
        
        // Verificar se está no início/fim do texto para navegar
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const cellText = cell.textContent;
            
            if (e.key === 'ArrowLeft' && range.startOffset > 0) {
                return true; // Deixar comportamento padrão
            }
            if (e.key === 'ArrowRight' && range.startOffset < cellText.length) {
                return true; // Deixar comportamento padrão
            }
        }
        
        e.preventDefault();
        e.stopPropagation();
        updateInternacoesCellData(cell);
        
        if (e.key === 'ArrowLeft') {
            if (col > 0) {
                const currentRow = body.children[bodyRow];
                if (currentRow && currentRow.children[col - 1]) {
                    currentRow.children[col - 1].focus();
                    moveCursorToEnd(currentRow.children[col - 1]);
                }
            } else if (bodyRow > 0) {
                const prevRow = body.children[bodyRow - 1];
                const numCols = internacoesData[0].length;
                if (prevRow && prevRow.children[numCols - 1]) {
                    prevRow.children[numCols - 1].focus();
                    moveCursorToEnd(prevRow.children[numCols - 1]);
                }
            }
        } else if (e.key === 'ArrowRight') {
            const numCols = internacoesData[0].length;
            if (col < numCols - 1) {
                const currentRow = body.children[bodyRow];
                if (currentRow && currentRow.children[col + 1]) {
                    currentRow.children[col + 1].focus();
                    moveCursorToStart(currentRow.children[col + 1]);
                }
            } else if (bodyRow < body.children.length - 1) {
                const nextRow = body.children[bodyRow + 1];
                if (nextRow && nextRow.children[0]) {
                    nextRow.children[0].focus();
                    moveCursorToStart(nextRow.children[0]);
                }
            }
        } else if (e.key === 'ArrowUp') {
            if (bodyRow > 0) {
                const prevRow = body.children[bodyRow - 1];
                if (prevRow && prevRow.children[col]) {
                    prevRow.children[col].focus();
                    moveCursorToEnd(prevRow.children[col]);
                }
            }
        } else if (e.key === 'ArrowDown') {
            if (bodyRow < body.children.length - 1) {
                const nextRow = body.children[bodyRow + 1];
                if (nextRow && nextRow.children[col]) {
                    nextRow.children[col].focus();
                    moveCursorToStart(nextRow.children[col]);
                }
            }
        }
        
        return false;
    }
    
    if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        updateInternacoesCellData(cell);
        const numCols = internacoesData[0].length;
        
        if (col < numCols - 1) {
            const currentRow = body.children[bodyRow];
            if (currentRow && currentRow.children[col + 1]) {
                currentRow.children[col + 1].focus();
                selectCellText(currentRow.children[col + 1]);
            }
        } else {
            if (bodyRow < body.children.length - 1) {
                const nextRow = body.children[bodyRow + 1];
                if (nextRow && nextRow.children[0]) {
                    nextRow.children[0].focus();
                    selectCellText(nextRow.children[0]);
                }
            } else {
                addEmptyInternacoesRow();
                setTimeout(() => {
                    const newRow = body.children[body.children.length - 1];
                    if (newRow && newRow.children[0]) {
                        newRow.children[0].focus();
                        selectCellText(newRow.children[0]);
                    }
                }, 10);
            }
        }
        return false;
    }
    
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        updateInternacoesCellData(cell);
        
        if (bodyRow >= body.children.length - 1) {
            addEmptyInternacoesRow();
            setTimeout(() => {
                const newRow = body.children[body.children.length - 1];
                if (newRow && newRow.children[col]) {
                    newRow.children[col].focus();
                    selectCellText(newRow.children[col]);
                }
            }, 10);
        } else {
            const nextRow = body.children[bodyRow + 1];
            if (nextRow && nextRow.children[col]) {
                nextRow.children[col].focus();
                selectCellText(nextRow.children[col]);
            }
        }
        return false;
    }
    
    return true;
}

/**
 * Verifica se houve edições
 */
function checkForInternacoesEdits() {
    isInternacoesEdited = JSON.stringify(internacoesData) !== JSON.stringify(originalInternacoesData);
    
    const btnSalvar = document.getElementById('btn-salvar-internacoes');
    if (btnSalvar) {
        if (isInternacoesEdited) {
            btnSalvar.classList.add('has-changes');
        } else {
            btnSalvar.classList.remove('has-changes');
        }
    }
}

/**
 * Limpa a planilha
 */
async function limparPlanilhaInternacoes() {
    const resposta = await confirmSimNao('Tem certeza que deseja limpar todos os dados? O cabeçalho será mantido.');
    if (resposta) {
        if (internacoesData.length > 0) {
            internacoesData = [internacoesData[0]];
            renderInternacoesSpreadsheet();
            checkForInternacoesEdits();
        }
    }
}

/**
 * Salva a planilha
 */
function salvarPlanilhaInternacoes() {
    return new Promise((resolve, reject) => {
        const CABECALHO_PADRAO = ['ra', 'data', 'hora', 'cns', 'procedimento', 'chave'];
        const dataToSave = [];
        
        dataToSave.push([...CABECALHO_PADRAO]);
        
        for (let i = 1; i < internacoesData.length; i++) {
            const row = internacoesData[i];
            
            if (!row || !Array.isArray(row)) {
                const emptyRow = new Array(CABECALHO_PADRAO.length).fill('');
                dataToSave.push(emptyRow);
            } else {
                const rowData = [];
                for (let j = 0; j < CABECALHO_PADRAO.length; j++) {
                    rowData.push(row[j] !== undefined ? String(row[j]) : '');
                }
                dataToSave.push(rowData);
            }
        }
        
        fetch('/api/internacoes-solicitar/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: dataToSave })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                internacoesData = [...dataToSave];
                originalInternacoesData = JSON.parse(JSON.stringify(internacoesData));
                isInternacoesEdited = false;
                checkForInternacoesEdits();
                alert('Planilha salva com sucesso!');
                resolve();
            } else {
                alert('Erro ao salvar: ' + (data.error || 'Erro desconhecido'));
                reject();
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            alert('Erro ao salvar a planilha');
            reject();
        });
    });
}

/**
 * Busca pendentes executando o comando -sia
 */
function buscarPendentes() {
    if (isExecutandoBusca) {
        return;
    }
    
    isExecutandoBusca = true;
    sessionIdInternacoes = Date.now().toString();
    
    atualizarBotoesInternacoes();
    
    // Mostrar terminal e ETA
    const terminalContainer = document.getElementById('terminal-container-internacoes');
    const etaContainer = document.getElementById('eta-container-internacoes');
    if (terminalContainer) terminalContainer.style.display = 'block';
    if (etaContainer) etaContainer.style.display = 'block';
    
    resetarTerminalInternacoes();
    adicionarLinhaTerminalInternacoes('Iniciando busca de pendentes...');
    atualizarETAInternacoes('Executando...', 0, 'Buscando pendentes');
    
    // Usar fetch com streaming
    fetch('/api/internacoes-solicitar/buscar-pendentes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionIdInternacoes })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Erro na resposta do servidor');
        }
        
        const reader = response.body.getReader();
        readerAtualInternacoes = reader;
        const decoder = new TextDecoder();
        let buffer = '';
        
        function lerStream() {
            reader.read().then(({ done, value }) => {
                if (done) {
                    if (buffer.trim()) {
                        const linhas = buffer.split('\n');
                        linhas.forEach(linha => {
                            if (linha.startsWith('data: ')) {
                                processarEventoInternacoes(linha.substring(6));
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
                        processarEventoInternacoes(linha.substring(6));
                    }
                });
                
                lerStream();
            }).catch(error => {
                console.error('Erro ao ler stream:', error);
                adicionarLinhaTerminalInternacoes(`\n❌ Erro ao executar comando: ${error.message}`);
                finalizarBuscaInternacoes(false);
            });
        }
        
        function processarEventoInternacoes(dadosJson) {
            try {
                const data = JSON.parse(dadosJson);
                
                switch(data.tipo) {
                    case 'inicio':
                        adicionarLinhaTerminalInternacoes(`\n>>> Iniciando: ${data.comando}`);
                        atualizarETAInternacoes('Executando...', 50, 'Buscando pendentes');
                        break;
                        
                    case 'output':
                        adicionarLinhaTerminalInternacoes(data.linha);
                        break;
                        
                    case 'sucesso':
                        atualizarETAInternacoes('Concluído!', 100, 'Busca concluída com sucesso');
                        adicionarLinhaTerminalInternacoes(`\n✅ ${data.mensagem}`);
                        adicionarLinhaTerminalInternacoes('\n🔄 Atualizando planilha com os dados mais recentes...');
                        finalizarBuscaInternacoes(true);
                        // Recarregar dados após busca bem-sucedida
                        setTimeout(() => {
                            loadInternacoesData();
                            adicionarLinhaTerminalInternacoes('✅ Planilha atualizada com sucesso!');
                        }, 1000);
                        break;
                        
                    case 'erro':
                        adicionarLinhaTerminalInternacoes(`\n❌ Erro: ${data.mensagem}`);
                        finalizarBuscaInternacoes(false);
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
        adicionarLinhaTerminalInternacoes(`\n❌ Erro ao executar comando: ${error.message}`);
        finalizarBuscaInternacoes(false);
    });
}

/**
 * Interrompe a busca
 */
async function interromperBusca() {
    if (!isExecutandoBusca) {
        return;
    }
    
    const resposta = await confirmSimNao('Tem certeza que deseja interromper a busca?');
    if (!resposta) {
        return;
    }
    
    if (readerAtualInternacoes) {
        readerAtualInternacoes.cancel();
        readerAtualInternacoes = null;
    }
    
    fetch('/api/internacoes-solicitar/interromper', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionIdInternacoes })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            adicionarLinhaTerminalInternacoes('\n⚠️ Busca interrompida pelo usuário');
            finalizarBuscaInternacoes(false);
        } else {
            alert('Erro ao interromper: ' + (data.mensagem || data.error || 'Erro desconhecido'));
        }
    })
    .catch(error => {
        console.error('Erro ao interromper:', error);
        adicionarLinhaTerminalInternacoes('\n⚠️ Busca interrompida (pode haver processo residual)');
        finalizarBuscaInternacoes(false);
    });
}

/**
 * Finaliza a busca
 */
function finalizarBuscaInternacoes(sucesso) {
    isExecutandoBusca = false;
    readerAtualInternacoes = null;
    
    atualizarBotoesInternacoes();
    
    if (!sucesso) {
        atualizarETAInternacoes('Erro na execução', 0, 'Busca interrompida');
    }
}

/**
 * Reseta o terminal
 */
function resetarTerminalInternacoes() {
    const terminalOutput = document.getElementById('terminal-output-internacoes');
    if (terminalOutput) {
        terminalOutput.innerHTML = '<div class="terminal-line">Aguardando início da execução...</div>';
    }
}

/**
 * Adiciona uma linha ao terminal
 */
function adicionarLinhaTerminalInternacoes(texto) {
    const terminalOutput = document.getElementById('terminal-output-internacoes');
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
function atualizarETAInternacoes(label, progresso, status) {
    const etaLabel = document.getElementById('eta-label-internacoes');
    const etaProgressFill = document.getElementById('eta-progress-fill-internacoes');
    const etaStatus = document.getElementById('eta-status-internacoes');
    
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
function atualizarBotoesInternacoes() {
    const btnBuscar = document.getElementById('btn-buscar-pendentes');
    const btnInterromper = document.getElementById('btn-interromper-busca');
    
    if (isExecutandoBusca) {
        if (btnBuscar) {
            btnBuscar.disabled = true;
            btnBuscar.style.display = 'none';
        }
        if (btnInterromper) {
            btnInterromper.disabled = false;
            btnInterromper.style.display = 'inline-block';
        }
    } else {
        if (btnBuscar) {
            btnBuscar.disabled = false;
            btnBuscar.style.display = 'inline-block';
        }
        if (btnInterromper) {
            btnInterromper.style.display = 'none';
        }
    }
}

// Funções auxiliares reutilizadas do spreadsheet.js
function selectCellText(cell) {
    const range = document.createRange();
    range.selectNodeContents(cell);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function moveCursorToEnd(cell) {
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function moveCursorToStart(cell) {
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

    // Inicializar quando o DOM estiver pronto (apenas uma vez)
    if (!window.internacoesModalInitialized) {
        window.internacoesModalInitialized = true;
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                initInternacoesModal();
            });
        } else {
            // DOM já está pronto
            initInternacoesModal();
        }
    }
})(); // Fim do IIFE
