/**
 * Gerenciamento da planilha editável de Pendências de Internações
 */

(function() {
    'use strict';
    
    // Variáveis do módulo
    let pendenciasData = [];
    let originalPendenciasData = [];
    let isPendenciasEdited = false;
    
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
     * Configura os event listeners do botão atualizar
     */
    function setupAtualizarButton() {
        const btnAtualizar = document.getElementById('btn-atualizar-pendencias-internacoes');
        if (btnAtualizar && !btnAtualizar.dataset.listenerAttached) {
            btnAtualizar.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                loadPendenciasData();
            });
            btnAtualizar.dataset.listenerAttached = 'true';
        }
    }
    
    /**
     * Inicializa o modal de pendências
     */
    function initPendenciasModal() {
        const modal = document.getElementById('modal-pendencias-internacoes');
        const btnClose = document.getElementById('close-modal-pendencias-internacoes');
        const btnFechar = document.getElementById('btn-fechar-pendencias-internacoes');
        const btnAtualizar = document.getElementById('btn-atualizar-pendencias-internacoes');
        const btnSalvar = document.getElementById('btn-salvar-pendencias-internacoes');
        
        if (btnClose) {
            btnClose.addEventListener('click', function() {
                closePendenciasModal();
            });
        }
        
        if (btnFechar) {
            btnFechar.addEventListener('click', function() {
                closePendenciasModal();
            });
        }
        
        if (btnAtualizar) {
            btnAtualizar.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                loadPendenciasData();
            });
        }
        
        if (btnSalvar) {
            btnSalvar.addEventListener('click', function() {
                salvarPlanilhaPendencias();
            });
        }
        
        // Fechar ao clicar no overlay
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    closePendenciasModal();
                }
            });
        }
    }
    
    /**
     * Abre o modal de pendências
     */
    function openPendenciasModal() {
        const modal = document.getElementById('modal-pendencias-internacoes');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            // Garantir que os event listeners estão configurados
            setupAtualizarButton();
            loadPendenciasData();
        }
    }
    
    /**
     * Fecha o modal de pendências
     */
    async function closePendenciasModal() {
        if (isPendenciasEdited) {
            const resposta = await confirmSimNao('Há alterações não salvas. Deseja realmente fechar?');
            if (!resposta) {
                return;
            }
        }
        doClosePendenciasModal();
    }
    
    /**
     * Fecha o modal sem confirmação
     */
    function doClosePendenciasModal() {
        const modal = document.getElementById('modal-pendencias-internacoes');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            // Resetar estado
            isPendenciasEdited = false;
            clearPendenciasSelection();
        }
    }
    
    /**
     * Carrega os dados do CSV
     */
    function loadPendenciasData() {
        const btnAtualizar = document.getElementById('btn-atualizar-pendencias-internacoes');
        
        // Desabilitar botão durante o carregamento
        if (btnAtualizar) {
            btnAtualizar.disabled = true;
            const originalText = btnAtualizar.innerHTML;
            btnAtualizar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
            
            // Reabilitar após um tempo máximo (fallback)
            setTimeout(() => {
                if (btnAtualizar.disabled) {
                    btnAtualizar.disabled = false;
                    btnAtualizar.innerHTML = originalText;
                }
            }, 10000);
        }
        
        fetch('/api/pendencias-internacoes/load')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erro HTTP: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    pendenciasData = data.data;
                    originalPendenciasData = JSON.parse(JSON.stringify(data.data));
                    renderPendenciasSpreadsheet();
                    isPendenciasEdited = false;
                    checkForPendenciasEdits();
                    
                    // Feedback visual de sucesso
                    if (btnAtualizar) {
                        const originalText = btnAtualizar.innerHTML;
                        btnAtualizar.innerHTML = '<i class="fas fa-check"></i> Atualizado!';
                        btnAtualizar.classList.add('glass-button-success');
                        
                        setTimeout(() => {
                            btnAtualizar.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
                            btnAtualizar.classList.remove('glass-button-success');
                        }, 2000);
                    }
                } else {
                    alert('Erro ao carregar dados: ' + (data.error || 'Erro desconhecido'));
                }
            })
            .catch(error => {
                console.error('Erro:', error);
                alert('Erro ao carregar dados da planilha: ' + error.message);
            })
            .finally(() => {
                // Reabilitar botão
                if (btnAtualizar) {
                    btnAtualizar.disabled = false;
                    if (!btnAtualizar.innerHTML.includes('Atualizado!')) {
                        btnAtualizar.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
                    }
                }
            });
    }
    
    /**
     * Renderiza a planilha na tabela
     */
    function renderPendenciasSpreadsheet() {
        const header = document.getElementById('spreadsheet-header-pendencias-internacoes');
        const body = document.getElementById('spreadsheet-body-pendencias-internacoes');
        
        if (!header || !body) return;
        
        // Limpar conteúdo anterior
        header.innerHTML = '';
        body.innerHTML = '';
        
        // Garantir que sempre há pelo menos uma linha (cabeçalho)
        if (pendenciasData.length === 0) {
            pendenciasData = [['']]; // Cabeçalho vazio se não houver dados
        }
        
        // Usar a primeira linha do CSV como cabeçalho (sem forçar valores padrão)
        const headerData = pendenciasData[0] || [];
        
        // Renderizar cabeçalho usando a primeira linha do CSV
        const headerRow = document.createElement('tr');
        headerData.forEach((cell) => {
            const th = document.createElement('th');
            th.textContent = cell || '';
            th.contentEditable = false;
            th.classList.add('header-cell');
            headerRow.appendChild(th);
        });
        header.appendChild(headerRow);
        
        // Renderizar corpo
        // Determinar número de colunas baseado no cabeçalho
        const numCols = headerData.length;
        
        for (let i = 1; i < pendenciasData.length; i++) {
            const row = document.createElement('tr');
            const rowData = pendenciasData[i] || [];
            
            // Garantir que a linha tenha o mesmo número de colunas do cabeçalho
            for (let j = 0; j < numCols; j++) {
                const td = document.createElement('td');
                td.textContent = (rowData[j] !== undefined && rowData[j] !== null) ? String(rowData[j]) : '';
                td.contentEditable = true;
                td.dataset.row = i;
                td.dataset.col = j;
                
                td.addEventListener('blur', function() {
                    updatePendenciasCellData(this);
                });
                
                td.addEventListener('keydown', function(e) {
                    const result = handlePendenciasCellKeydown(e, this);
                    if (result === false) {
                        e.stopImmediatePropagation();
                    }
                }, true);
                
                td.addEventListener('focus', function(e) {
                    // Se não estiver fazendo seleção com teclado e não estiver com Shift pressionado, limpar seleção anterior
                    if (!isSelectingWithKeyboard && !e.shiftKey) {
                        clearPendenciasSelection();
                    }
                    // Só selecionar a célula se não estiver fazendo seleção com teclado
                    if (!isSelectingWithKeyboard) {
                        selectPendenciasCell(this);
                    }
                    
                    if (this.textContent && !isSelectingWithKeyboard) {
                        setTimeout(() => {
                            selectCellText(this);
                        }, 0);
                    }
                });
                
                td.addEventListener('click', function(e) {
                    if (e.shiftKey && selectionStartCell) {
                        selectPendenciasRange(selectionStartCell, this);
                    } else {
                        clearPendenciasSelection();
                        selectPendenciasCell(this);
                        selectionStartCell = this;
                    }
                });
                
                row.appendChild(td);
            }
            body.appendChild(row);
        }
        
        // Adicionar linha vazia no final
        addEmptyPendenciasRow();
    }
    
    /**
     * Adiciona uma linha vazia no final
     */
    function addEmptyPendenciasRow() {
        const body = document.getElementById('spreadsheet-body-pendencias-internacoes');
        if (!body) return;
        
        const newRowIndex = pendenciasData.length;
        const row = document.createElement('tr');
        const numCols = pendenciasData[0].length;
        
        while (pendenciasData.length <= newRowIndex) {
            pendenciasData.push([]);
        }
        
        for (let j = 0; j < numCols; j++) {
            const td = document.createElement('td');
            td.textContent = '';
            td.contentEditable = true;
            td.dataset.row = newRowIndex;
            td.dataset.col = j;
            
            td.addEventListener('blur', function() {
                updatePendenciasCellData(this);
            });
            
            td.addEventListener('keydown', function(e) {
                const result = handlePendenciasCellKeydown(e, this);
                if (result === false) {
                    e.stopImmediatePropagation();
                }
            }, true);
            
            td.addEventListener('focus', function(e) {
                // Se não estiver com Shift pressionado, limpar seleção anterior
                if (!e.shiftKey) {
                    clearPendenciasSelection();
                }
                selectPendenciasCell(this);
                
                if (this.textContent) {
                    setTimeout(() => {
                        selectCellText(this);
                    }, 0);
                }
            });
            
            td.addEventListener('click', function(e) {
                if (e.shiftKey && selectionStartCell) {
                    selectPendenciasRange(selectionStartCell, this);
                } else {
                    clearPendenciasSelection();
                    selectPendenciasCell(this);
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
    function updatePendenciasCellData(cell) {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        let value = cell.textContent.trim();
        
        // NUNCA permitir editar a primeira linha (cabeçalho)
        if (row === 0) {
            // Manter o valor atual do cabeçalho (não forçar valores padrão)
            if (pendenciasData[0] && pendenciasData[0][col] !== undefined) {
                cell.textContent = pendenciasData[0][col] || '';
            }
            return;
        }
        
        while (pendenciasData.length <= row) {
            pendenciasData.push([]);
        }
        
        while (pendenciasData[row].length <= col) {
            pendenciasData[row].push('');
        }
        
        pendenciasData[row][col] = value;
        
        checkForPendenciasEdits();
    }
    
    /**
     * Limpa a seleção atual
     */
    function clearPendenciasSelection() {
        selectedCells.forEach(cell => {
            cell.classList.remove('selected');
        });
        selectedCells.clear();
        
        selectedRows.forEach(rowIndex => {
            const body = document.getElementById('spreadsheet-body-pendencias-internacoes');
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
    function selectPendenciasCell(cell, addToSelection = false) {
        if (!addToSelection) {
            clearPendenciasSelection();
            selectionStartCell = cell;
        }
        
        cell.classList.add('selected');
        selectedCells.add(cell);
    }
    
    /**
     * Seleciona uma linha inteira
     */
    function selectPendenciasRow(rowIndex, addToSelection = false) {
        if (!addToSelection) {
            clearPendenciasSelection();
        }
        
        const body = document.getElementById('spreadsheet-body-pendencias-internacoes');
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
    function selectPendenciasRange(startCell, endCell) {
        const startRow = parseInt(startCell.dataset.row);
        const startCol = parseInt(startCell.dataset.col);
        const endRow = parseInt(endCell.dataset.row);
        const endCol = parseInt(endCell.dataset.col);
        
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);
        
        const body = document.getElementById('spreadsheet-body-pendencias-internacoes');
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
    function removeSelectedPendenciasRows() {
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
            if (rowIndex < pendenciasData.length) {
                pendenciasData.splice(rowIndex, 1);
            }
        });
        
        clearPendenciasSelection();
        renderPendenciasSpreadsheet();
        checkForPendenciasEdits();
    }
    
    /**
     * Manipula teclas na célula
     */
    function handlePendenciasCellKeydown(e, cell) {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const body = document.getElementById('spreadsheet-body-pendencias-internacoes');
        
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
                selectPendenciasCell(cell);
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
                        removeSelectedPendenciasRows();
                    }
                });
            } else {
                // Se não há linhas para remover, apenas limpar seleção
                clearPendenciasSelection();
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
                selectPendenciasCell(cell);
            }
            
            let targetCell = null;
            const numCols = pendenciasData[0].length;
            
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
                selectPendenciasRange(selectionStartCell, targetCell);
                
                // Atualizar a célula atual antes de mover o foco
                updatePendenciasCellData(cell);
                
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
                clearPendenciasSelection();
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
            updatePendenciasCellData(cell);
            
            if (e.key === 'ArrowLeft') {
                if (col > 0) {
                    const currentRow = body.children[bodyRow];
                    if (currentRow && currentRow.children[col - 1]) {
                        currentRow.children[col - 1].focus();
                        moveCursorToEnd(currentRow.children[col - 1]);
                    }
                } else if (bodyRow > 0) {
                    const prevRow = body.children[bodyRow - 1];
                    const numCols = pendenciasData[0].length;
                    if (prevRow && prevRow.children[numCols - 1]) {
                        prevRow.children[numCols - 1].focus();
                        moveCursorToEnd(prevRow.children[numCols - 1]);
                    }
                }
            } else if (e.key === 'ArrowRight') {
                const numCols = pendenciasData[0].length;
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
            updatePendenciasCellData(cell);
            const numCols = pendenciasData[0].length;
            
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
                    addEmptyPendenciasRow();
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
            updatePendenciasCellData(cell);
            
            if (bodyRow >= body.children.length - 1) {
                addEmptyPendenciasRow();
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
    function checkForPendenciasEdits() {
        isPendenciasEdited = JSON.stringify(pendenciasData) !== JSON.stringify(originalPendenciasData);
        
        const btnSalvar = document.getElementById('btn-salvar-pendencias-internacoes');
        if (btnSalvar) {
            if (isPendenciasEdited) {
                btnSalvar.classList.add('glass-button-warning');
                btnSalvar.title = 'Há alterações não salvas';
            } else {
                btnSalvar.classList.remove('glass-button-warning');
                btnSalvar.title = '';
            }
        }
    }
    
    /**
     * Salva a planilha
     */
    function salvarPlanilhaPendencias() {
        return new Promise((resolve, reject) => {
            const dataToSave = [];
            
            // Usar a primeira linha do CSV como cabeçalho (sem forçar valores padrão)
            if (pendenciasData.length > 0 && pendenciasData[0]) {
                dataToSave.push([...pendenciasData[0]]);
            } else {
                // Se não houver cabeçalho, criar um vazio
                dataToSave.push(['']);
            }
            
            // Determinar o número de colunas baseado no cabeçalho
            const numCols = dataToSave[0].length;
            
            for (let i = 1; i < pendenciasData.length; i++) {
                const row = pendenciasData[i];
                
                if (!row || !Array.isArray(row)) {
                    const emptyRow = new Array(numCols).fill('');
                    dataToSave.push(emptyRow);
                } else {
                    const rowData = [];
                    for (let j = 0; j < numCols; j++) {
                        rowData.push(row[j] !== undefined ? String(row[j]) : '');
                    }
                    dataToSave.push(rowData);
                }
            }
            
            fetch('/api/pendencias-internacoes/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data: dataToSave })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    pendenciasData = [...dataToSave];
                    originalPendenciasData = JSON.parse(JSON.stringify(pendenciasData));
                    isPendenciasEdited = false;
                    checkForPendenciasEdits();
                    alert('Planilha salva com sucesso!');
                    resolve();
                } else {
                    alert('Erro ao salvar: ' + (data.error || 'Erro desconhecido'));
                    reject();
                }
            })
            .catch(error => {
                console.error('Erro:', error);
                alert('Erro ao salvar planilha');
                reject();
            });
        });
    }
    
    // Funções auxiliares para manipulação de cursor
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
    
    // Inicializar quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initPendenciasModal();
            // Garantir que o botão atualizar está configurado após um pequeno delay
            setTimeout(setupAtualizarButton, 100);
        });
    } else {
        initPendenciasModal();
        // Garantir que o botão atualizar está configurado após um pequeno delay
        setTimeout(setupAtualizarButton, 100);
    }
    
    // Exportar função para abrir o modal
    window.openPendenciasModal = openPendenciasModal;
    
    // Exportar função para configurar o botão atualizar (caso seja necessário chamar externamente)
    window.setupPendenciasAtualizarButton = setupAtualizarButton;
})();
