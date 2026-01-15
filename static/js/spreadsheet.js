/**
 * Gerenciamento da planilha editável de RAs
 */

let spreadsheetData = [];
let originalData = [];
let isEdited = false;
let currentModal = null;

/**
 * Inicializa o modal da planilha
 */
function initSpreadsheetModal() {
    const btnAddRas = document.getElementById('btn-add-ras');
    const modal = document.getElementById('modal-exames-solicitar');
    const btnClose = document.getElementById('close-modal-exames');
    const btnLimpar = document.getElementById('btn-limpar-ras');
    const btnSalvar = document.getElementById('btn-salvar-ras');
    const btnSair = document.getElementById('btn-sair-ras');
    
    if (btnAddRas) {
        btnAddRas.addEventListener('click', function() {
            openSpreadsheetModal();
        });
    }
    
    if (btnClose) {
        btnClose.addEventListener('click', function() {
            closeSpreadsheetModal();
        });
    }
    
    if (btnLimpar) {
        btnLimpar.addEventListener('click', function() {
            limparPlanilha();
        });
    }
    
    if (btnSalvar) {
        btnSalvar.addEventListener('click', function() {
            salvarPlanilha();
        });
    }
    
    if (btnSair) {
        btnSair.addEventListener('click', function() {
            closeSpreadsheetModal();
        });
    }
    
    // Fechar modal ao clicar fora
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeSpreadsheetModal();
            }
        });
    }
    
    // Fechar com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
            closeSpreadsheetModal();
        }
    });
}

/**
 * Abre o modal e carrega os dados
 */
function openSpreadsheetModal() {
    const modal = document.getElementById('modal-exames-solicitar');
    if (!modal) return;
    
    currentModal = modal;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    loadSpreadsheetData();
}

/**
 * Fecha o modal com verificação de edições
 */
function closeSpreadsheetModal() {
    if (isEdited) {
        if (confirm('Você tem alterações não salvas. Deseja salvar antes de sair?')) {
            salvarPlanilha().then(() => {
                doCloseModal();
            }).catch(() => {
                // Usuário cancelou ou erro ao salvar
            });
        } else {
            if (confirm('Tem certeza que deseja sair sem salvar?')) {
                doCloseModal();
            }
        }
    } else {
        doCloseModal();
    }
}

/**
 * Fecha o modal sem verificação
 */
function doCloseModal() {
    const modal = document.getElementById('modal-exames-solicitar');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        isEdited = false;
        spreadsheetData = [];
        originalData = [];
        
        // Remover classe has-changes do botão salvar
        const btnSalvar = document.getElementById('btn-salvar-ras');
        if (btnSalvar) {
            btnSalvar.classList.remove('has-changes');
        }
    }
}

/**
 * Carrega os dados do CSV
 */
function loadSpreadsheetData() {
    fetch('/api/exames-solicitar/load')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                spreadsheetData = data.data;
                originalData = JSON.parse(JSON.stringify(data.data)); // Deep copy
                renderSpreadsheet();
                isEdited = false;
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
function renderSpreadsheet() {
    const header = document.getElementById('spreadsheet-header');
    const body = document.getElementById('spreadsheet-body');
    
    if (!header || !body) return;
    
    // Limpar conteúdo anterior
    header.innerHTML = '';
    body.innerHTML = '';
    
    // Cabeçalho padrão do CSV
    const CABECALHO_PADRAO = ['ra', 'cns', 'procedimento', 'chave', 'solicitacao', 'erro'];
    
    // Garantir que sempre há pelo menos o cabeçalho
    if (spreadsheetData.length === 0) {
        // Se não houver dados, criar estrutura padrão com cabeçalho
        spreadsheetData = [CABECALHO_PADRAO];
    }
    
    // Garantir que a primeira linha é SEMPRE o cabeçalho válido
    if (spreadsheetData.length > 0) {
        // Forçar o cabeçalho correto, mesmo que tenha sido alterado
        spreadsheetData[0] = [...CABECALHO_PADRAO];
    } else {
        spreadsheetData[0] = [...CABECALHO_PADRAO];
    }
    
    // Renderizar cabeçalho (primeira linha - bloqueada)
    const headerRow = document.createElement('tr');
    spreadsheetData[0].forEach((cell, index) => {
        const th = document.createElement('th');
        th.textContent = cell || '';
        th.contentEditable = false;
        th.classList.add('header-cell');
        headerRow.appendChild(th);
    });
    header.appendChild(headerRow);
    
    // Renderizar corpo (linhas editáveis)
    for (let i = 1; i < spreadsheetData.length; i++) {
        const row = document.createElement('tr');
        const rowData = spreadsheetData[i] || [];
        
        // Garantir que a linha tenha o mesmo número de colunas do cabeçalho
        for (let j = 0; j < spreadsheetData[0].length; j++) {
            const td = document.createElement('td');
            td.textContent = rowData[j] || '';
            td.contentEditable = true;
            td.dataset.row = i;
            td.dataset.col = j;
            
            td.addEventListener('blur', function() {
                updateCellData(this);
            });
            
            td.addEventListener('keydown', function(e) {
                const result = handleCellKeydown(e, this);
                if (result === false) {
                    e.stopImmediatePropagation();
                }
            }, true); // Usar capture phase para garantir que seja executado primeiro
            
            td.addEventListener('focus', function() {
                // Selecionar todo o texto ao focar (exceto se estiver editando)
                if (this.textContent) {
                    setTimeout(() => {
                        selectCellText(this);
                    }, 0);
                }
            });
            
            row.appendChild(td);
        }
        body.appendChild(row);
    }
    
    // Adicionar linha vazia no final se necessário
    addEmptyRow();
}

/**
 * Adiciona uma linha vazia no final
 */
function addEmptyRow() {
    const body = document.getElementById('spreadsheet-body');
    if (!body) return;
    
    // Usar o número de linhas no DOM, não no spreadsheetData
    const currentRowCount = body.children.length;
    const row = document.createElement('tr');
    const numCols = spreadsheetData[0].length;
    
    // Garantir que o spreadsheetData tenha espaço para esta linha
    const newRowIndex = currentRowCount;
    while (spreadsheetData.length <= newRowIndex) {
        spreadsheetData.push([]);
    }
    
    for (let j = 0; j < numCols; j++) {
        const td = document.createElement('td');
        td.textContent = '';
        td.contentEditable = true;
        td.dataset.row = newRowIndex;
        td.dataset.col = j;
        
        td.addEventListener('blur', function() {
            updateCellData(this);
        });
        
        td.addEventListener('keydown', function(e) {
            const result = handleCellKeydown(e, this);
            if (result === false) {
                e.stopImmediatePropagation();
            }
        }, true); // Usar capture phase para garantir que seja executado primeiro
        
        td.addEventListener('focus', function() {
            // Selecionar todo o texto ao focar (exceto se estiver editando)
            if (this.textContent) {
                setTimeout(() => {
                    selectCellText(this);
                }, 0);
            }
        });
        
        row.appendChild(td);
    }
    body.appendChild(row);
}

/**
 * Atualiza os dados quando uma célula é editada
 */
function updateCellData(cell) {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const value = cell.textContent.trim();
    
    // NUNCA permitir editar a primeira linha (cabeçalho)
    if (row === 0) {
        // Restaurar o valor original do cabeçalho
        const CABECALHO_PADRAO = ['ra', 'cns', 'procedimento', 'chave', 'solicitacao', 'erro'];
        if (spreadsheetData[0] && spreadsheetData[0][col] !== CABECALHO_PADRAO[col]) {
            spreadsheetData[0][col] = CABECALHO_PADRAO[col];
            cell.textContent = CABECALHO_PADRAO[col];
        }
        return;
    }
    
    // Garantir que a linha existe
    while (spreadsheetData.length <= row) {
        spreadsheetData.push([]);
    }
    
    // Garantir que a linha tem o número correto de colunas
    while (spreadsheetData[row].length <= col) {
        spreadsheetData[row].push('');
    }
    
    spreadsheetData[row][col] = value;
    
    // Verificar se houve edição
    checkForEdits();
    
    // Não adicionar linha automaticamente aqui - deixar para o usuário usar Enter/Tab
    // Isso evita criar muitas linhas desnecessárias
}

/**
 * Verifica se houve edições
 */
function checkForEdits() {
    isEdited = JSON.stringify(spreadsheetData) !== JSON.stringify(originalData);
    
    // Atualizar visual do botão salvar
    const btnSalvar = document.getElementById('btn-salvar-ras');
    if (btnSalvar) {
        if (isEdited) {
            btnSalvar.classList.add('has-changes');
        } else {
            btnSalvar.classList.remove('has-changes');
        }
    }
}

/**
 * Manipula teclas na célula
 * Retorna false se o evento foi tratado e não deve propagar
 */
function handleCellKeydown(e, cell) {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const body = document.getElementById('spreadsheet-body');
    
    if (!body) return;
    
    // Tab - próxima célula à direita (ou primeira coluna da próxima linha se estiver na última coluna)
    if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const numCols = spreadsheetData[0].length;
        
        // Salvar o conteúdo atual antes de mover
        updateCellData(cell);
        
        if (col < numCols - 1) {
            // Próxima coluna na mesma linha
            const currentRow = body.children[row];
            if (currentRow && currentRow.children[col + 1]) {
                currentRow.children[col + 1].focus();
                // Selecionar todo o texto na célula
                selectCellText(currentRow.children[col + 1]);
            }
        } else {
            // Primeira coluna da próxima linha
            if (row < body.children.length - 1) {
                const nextRow = body.children[row + 1];
                if (nextRow && nextRow.children[0]) {
                    nextRow.children[0].focus();
                    selectCellText(nextRow.children[0]);
                }
            } else {
                // Se não houver próxima linha, adicionar uma
                addEmptyRow();
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
    
    // Enter - próxima linha, mesma coluna
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        
        // Salvar o conteúdo atual antes de mover
        updateCellData(cell);
        
        // Se estiver na última linha, adicionar uma nova
        if (row >= body.children.length - 1) {
            addEmptyRow();
            setTimeout(() => {
                const newRow = body.children[body.children.length - 1];
                if (newRow && newRow.children[col]) {
                    newRow.children[col].focus();
                    selectCellText(newRow.children[col]);
                }
            }, 10);
        } else {
            // Célula abaixo na mesma coluna
            const nextRow = body.children[row + 1];
            if (nextRow && nextRow.children[col]) {
                nextRow.children[col].focus();
                selectCellText(nextRow.children[col]);
            }
        }
        return false;
    }
    
    // Seta para baixo - próxima linha, mesma coluna
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        
        // Salvar o conteúdo atual antes de mover
        updateCellData(cell);
        
        // Se estiver na última linha, adicionar uma nova
        if (row >= body.children.length - 1) {
            addEmptyRow();
            setTimeout(() => {
                const newRow = body.children[body.children.length - 1];
                if (newRow && newRow.children[col]) {
                    newRow.children[col].focus();
                    selectCellText(newRow.children[col]);
                }
            }, 10);
        } else {
            // Célula abaixo na mesma coluna
            const nextRow = body.children[row + 1];
            if (nextRow && nextRow.children[col]) {
                nextRow.children[col].focus();
                selectCellText(nextRow.children[col]);
            }
        }
        return false;
    }
    
    // Seta para cima - linha anterior, mesma coluna
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        updateCellData(cell);
        if (row > 0) {
            const prevRow = body.children[row - 1];
            if (prevRow && prevRow.children[col]) {
                prevRow.children[col].focus();
                selectCellText(prevRow.children[col]);
            }
        }
        return false;
    }
    
    // Seta para esquerda - coluna anterior (ou última coluna da linha anterior)
    if (e.key === 'ArrowLeft') {
        // Só interceptar se não estiver no início do texto
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (range.startOffset > 0) {
                return true; // Deixa o comportamento padrão se não estiver no início
            }
        }
        
        e.preventDefault();
        e.stopPropagation();
        updateCellData(cell);
        if (col > 0) {
            // Coluna anterior na mesma linha
            const currentRow = body.children[row];
            if (currentRow && currentRow.children[col - 1]) {
                currentRow.children[col - 1].focus();
                // Mover cursor para o final do texto
                moveCursorToEnd(currentRow.children[col - 1]);
            }
        } else if (row > 0) {
            // Última coluna da linha anterior
            const prevRow = body.children[row - 1];
            const numCols = spreadsheetData[0].length;
            if (prevRow && prevRow.children[numCols - 1]) {
                prevRow.children[numCols - 1].focus();
                moveCursorToEnd(prevRow.children[numCols - 1]);
            }
        }
        return false;
    }
    
    // Seta para direita - próxima coluna (ou primeira coluna da próxima linha)
    if (e.key === 'ArrowRight') {
        // Só interceptar se não estiver no final do texto
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const cellText = cell.textContent;
            if (range.startOffset < cellText.length) {
                return true; // Deixa o comportamento padrão se não estiver no final
            }
        }
        
        e.preventDefault();
        e.stopPropagation();
        updateCellData(cell);
        const numCols = spreadsheetData[0].length;
        if (col < numCols - 1) {
            // Próxima coluna na mesma linha
            const currentRow = body.children[row];
            if (currentRow && currentRow.children[col + 1]) {
                currentRow.children[col + 1].focus();
                // Mover cursor para o início do texto
                moveCursorToStart(currentRow.children[col + 1]);
            }
        } else if (row < body.children.length - 1) {
            // Primeira coluna da próxima linha
            const nextRow = body.children[row + 1];
            if (nextRow && nextRow.children[0]) {
                nextRow.children[0].focus();
                moveCursorToStart(nextRow.children[0]);
            }
        }
        return false;
    }
    
    return true; // Permite comportamento padrão para outras teclas
}

/**
 * Seleciona todo o texto da célula
 */
function selectCellText(cell) {
    const range = document.createRange();
    range.selectNodeContents(cell);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Move o cursor para o final do texto na célula
 */
function moveCursorToEnd(cell) {
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Move o cursor para o início do texto na célula
 */
function moveCursorToStart(cell) {
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Limpa a planilha (mantém apenas o cabeçalho)
 */
function limparPlanilha() {
    if (confirm('Tem certeza que deseja limpar todos os dados? O cabeçalho será mantido.')) {
        if (spreadsheetData.length > 0) {
            spreadsheetData = [spreadsheetData[0]]; // Manter apenas o cabeçalho
            renderSpreadsheet();
            checkForEdits();
        }
    }
}

/**
 * Salva a planilha
 */
function salvarPlanilha() {
    return new Promise((resolve, reject) => {
        // Cabeçalho padrão que DEVE ser preservado
        const CABECALHO_PADRAO = ['ra', 'cns', 'procedimento', 'chave', 'solicitacao', 'erro'];
        
        // Garantir que a primeira linha sempre seja o cabeçalho correto
        const dataToSave = [...spreadsheetData];
        dataToSave[0] = [...CABECALHO_PADRAO]; // Forçar cabeçalho correto
        
        // Remover linhas vazias (exceto o cabeçalho)
        const dataFiltered = dataToSave.filter((row, index) => {
            if (index === 0) return true; // Sempre manter cabeçalho
            return row.some(cell => cell && cell.trim() !== '');
        });
        
        fetch('/api/exames-solicitar/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: dataFiltered })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Atualizar spreadsheetData com o cabeçalho correto
                spreadsheetData = [...dataFiltered];
                originalData = JSON.parse(JSON.stringify(spreadsheetData));
                isEdited = false;
                checkForEdits();
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

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    initSpreadsheetModal();
});

