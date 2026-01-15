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
    const CABECALHO_PADRAO = ['ra', 'hora', 'cns', 'procedimento', 'chave', 'solicitacao'];
    
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
            
            // Formatação de hora apenas quando o foco sai da célula (col 1)
            if (j === 1) {
                // Formatar e salvar quando o foco sair da célula (Tab, Enter, clique fora)
                td.addEventListener('blur', function() {
                    const valor = this.textContent.trim();
                    const numeros = valor.replace(/\D/g, '');
                    
                    // Se houver números, formatar
                    if (numeros && numeros.length > 0) {
                        const horaFormatada = formatarHora(numeros);
                        // Aplicar formatação se for diferente
                        if (horaFormatada && horaFormatada !== valor) {
                            this.textContent = horaFormatada;
                        }
                    } else if (valor !== '' && valor !== ':') {
                        // Se não houver números mas houver texto, limpar
                        this.textContent = '';
                    }
                    
                    // Salvar os dados
                    updateCellData(this);
                });
            } else {
                // Para outras colunas, apenas salvar no blur
                td.addEventListener('blur', function() {
                    updateCellData(this);
                });
            }
            
            // Listener de keydown para navegação (deve vir depois da formatação de hora)
            const keydownHandler = function(e) {
                // Se for coluna hora, permitir formatação primeiro
                if (j === 1 && (e.key >= '0' && e.key <= '9' || e.key === 'Backspace' || e.key === 'Delete')) {
                    // Não fazer nada aqui, deixar o handler de formatação processar
                    // A formatação será aplicada no keyup/input
                }
                
                const result = handleCellKeydown(e, this);
                if (result === false) {
                    e.stopImmediatePropagation();
                }
            };
            
            td.addEventListener('keydown', keydownHandler, true); // Usar capture phase para garantir que seja executado primeiro
            
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
    
    // IMPORTANTE: O índice da nova linha em spreadsheetData
    // spreadsheetData[0] = cabeçalho
    // spreadsheetData[1+] = linhas de dados
    // Se temos 3 linhas no body, elas são spreadsheetData[1], [2], [3]
    // Então a próxima linha será spreadsheetData[4] = spreadsheetData.length
    const newRowIndex = spreadsheetData.length; // Próximo índice disponível em spreadsheetData
    const row = document.createElement('tr');
    const numCols = spreadsheetData[0].length;
    
    // Garantir que o spreadsheetData tenha espaço para esta linha
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
        
        // Formatação de hora também para linhas adicionadas dinamicamente (col 1)
        if (j === 1) {
            // Formatar e salvar quando o foco sair da célula
            td.addEventListener('blur', function() {
                const valor = this.textContent.trim();
                const numeros = valor.replace(/\D/g, '');
                
                // Se houver números, formatar
                if (numeros && numeros.length > 0) {
                    const horaFormatada = formatarHora(numeros);
                    // Aplicar formatação se for diferente
                    if (horaFormatada && horaFormatada !== valor) {
                        this.textContent = horaFormatada;
                    }
                } else if (valor !== '' && valor !== ':') {
                    // Se não houver números mas houver texto, limpar
                    this.textContent = '';
                }
                
                // Salvar os dados
                updateCellData(this);
            });
        }
        
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
    let value = cell.textContent.trim();
    
    // NUNCA permitir editar a primeira linha (cabeçalho)
    if (row === 0) {
        // Restaurar o valor original do cabeçalho
        const CABECALHO_PADRAO = ['ra', 'hora', 'cns', 'procedimento', 'chave', 'solicitacao'];
        if (spreadsheetData[0] && spreadsheetData[0][col] !== CABECALHO_PADRAO[col]) {
            spreadsheetData[0][col] = CABECALHO_PADRAO[col];
            cell.textContent = CABECALHO_PADRAO[col];
        }
        return;
    }
    
    // Para coluna hora, não formatar aqui - a formatação já foi feita pelos listeners
    // Apenas salvar o valor que já está formatado
    
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
 * Formata hora automaticamente
 * Exemplo: 1102 -> 11:02, 9 -> 09:00, 930 -> 09:30, 1851 -> 18:51
 */
function formatarHora(valor) {
    // Remover caracteres não numéricos
    let numeros = valor.replace(/\D/g, '');
    
    // Se estiver vazio, retornar vazio
    if (!numeros || numeros.length === 0) {
        return '';
    }
    
    // Limitar a 4 dígitos
    if (numeros.length > 4) {
        numeros = numeros.substring(0, 4);
    }
    
    // Formatar baseado no tamanho
    let hora = '';
    let minuto = '';
    
    if (numeros.length === 1) {
        // 1 dígito: 9 -> 09:00
        hora = '0' + numeros;
        minuto = '00';
    } else if (numeros.length === 2) {
        // 2 dígitos: 11 -> 11:00
        hora = numeros;
        minuto = '00';
    } else if (numeros.length === 3) {
        // 3 dígitos: 930 -> 09:30
        hora = '0' + numeros[0];
        minuto = numeros.substring(1, 3);
    } else {
        // 4 dígitos: 1102 -> 11:02, 1851 -> 18:51
        hora = numeros.substring(0, 2);
        minuto = numeros.substring(2, 4);
    }
    
    // Validar hora (0-23) e minuto (0-59)
    let h = parseInt(hora, 10);
    let m = parseInt(minuto, 10);
    
    // Validar e corrigir hora
    if (isNaN(h) || h < 0) {
        h = 0;
    } else if (h > 23) {
        h = 23;
    }
    
    // Validar e corrigir minuto
    if (isNaN(m) || m < 0) {
        m = 0;
    } else if (m > 59) {
        m = 59;
    }
    
    // Formatar com zero à esquerda
    hora = h.toString().padStart(2, '0');
    minuto = m.toString().padStart(2, '0');
    
    return `${hora}:${minuto}`;
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
    
    // IMPORTANTE: dataset.row é o índice em spreadsheetData (1 = primeira linha de dados)
    // Mas body.children usa índice baseado em 0 (0 = primeira linha no body)
    // Então bodyRow = row - 1 (porque row 1 em spreadsheetData = índice 0 no body)
    const bodyRow = row - 1;
    
    // Tab - próxima célula à direita (ou primeira coluna da próxima linha se estiver na última coluna)
    if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const numCols = spreadsheetData[0].length;
        
        // Salvar o conteúdo atual antes de mover
        updateCellData(cell);
        
        if (col < numCols - 1) {
            // Próxima coluna na mesma linha
            const currentRow = body.children[bodyRow];
            if (currentRow && currentRow.children[col + 1]) {
                currentRow.children[col + 1].focus();
                // Selecionar todo o texto na célula
                selectCellText(currentRow.children[col + 1]);
            }
        } else {
            // Primeira coluna da próxima linha
            if (bodyRow < body.children.length - 1) {
                const nextRow = body.children[bodyRow + 1];
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
    
    // Enter - próxima linha, mesma coluna (exceto coluna hora que vai para coluna ra abaixo)
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        
        // Salvar o conteúdo atual antes de mover
        updateCellData(cell);
        
        // Se estiver na coluna hora (col 1), ir para a célula abaixo na coluna ra (col 0)
        if (col === 1) {
            const targetCol = 0; // Coluna ra
            
            // Se estiver na última linha, adicionar uma nova
            if (bodyRow >= body.children.length - 1) {
                addEmptyRow();
                setTimeout(() => {
                    const newRow = body.children[body.children.length - 1];
                    if (newRow && newRow.children[targetCol]) {
                        newRow.children[targetCol].focus();
                        selectCellText(newRow.children[targetCol]);
                    }
                }, 10);
            } else {
                // Célula abaixo na coluna ra
                const nextRow = body.children[bodyRow + 1];
                if (nextRow && nextRow.children[targetCol]) {
                    nextRow.children[targetCol].focus();
                    selectCellText(nextRow.children[targetCol]);
                }
            }
        } else {
            // Comportamento padrão: célula abaixo na mesma coluna
            if (bodyRow >= body.children.length - 1) {
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
                const nextRow = body.children[bodyRow + 1];
                if (nextRow && nextRow.children[col]) {
                    nextRow.children[col].focus();
                    selectCellText(nextRow.children[col]);
                }
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
        if (bodyRow >= body.children.length - 1) {
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
            const nextRow = body.children[bodyRow + 1];
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
        if (bodyRow > 0) {
            const prevRow = body.children[bodyRow - 1];
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
            const currentRow = body.children[bodyRow];
            if (currentRow && currentRow.children[col - 1]) {
                currentRow.children[col - 1].focus();
                // Mover cursor para o final do texto
                moveCursorToEnd(currentRow.children[col - 1]);
            }
        } else if (bodyRow > 0) {
            // Última coluna da linha anterior
            const prevRow = body.children[bodyRow - 1];
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
            const currentRow = body.children[bodyRow];
            if (currentRow && currentRow.children[col + 1]) {
                currentRow.children[col + 1].focus();
                // Mover cursor para o início do texto
                moveCursorToStart(currentRow.children[col + 1]);
            }
        } else if (bodyRow < body.children.length - 1) {
            // Primeira coluna da próxima linha
            const nextRow = body.children[bodyRow + 1];
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
        const CABECALHO_PADRAO = ['ra', 'hora', 'cns', 'procedimento', 'chave', 'solicitacao'];
        
        // SIMPLIFICADO: Salvar TODAS as linhas do spreadsheetData
        // spreadsheetData[0] = cabeçalho (será substituído pelo padrão)
        // spreadsheetData[1+] = linhas de dados (serão salvas como estão)
        const dataToSave = [];
        
        // Primeiro, sempre adicionar o cabeçalho padrão
        dataToSave.push([...CABECALHO_PADRAO]);
        
        // Depois, adicionar TODAS as linhas de dados (a partir do índice 1)
        // Não filtrar nada - salvar todas as linhas, mesmo que vazias
        for (let i = 1; i < spreadsheetData.length; i++) {
            const row = spreadsheetData[i];
            
            // Garantir que a linha seja um array
            if (!row || !Array.isArray(row)) {
                // Se não for array, criar um array vazio
                const emptyRow = new Array(CABECALHO_PADRAO.length).fill('');
                dataToSave.push(emptyRow);
            } else {
                // Garantir que a linha tenha o número correto de colunas
                const rowData = [];
                for (let j = 0; j < CABECALHO_PADRAO.length; j++) {
                    rowData.push(row[j] !== undefined ? String(row[j]) : '');
                }
                dataToSave.push(rowData);
            }
        }
        
        // Debug: verificar o que está sendo enviado
        console.log('Dados a serem salvos:', dataToSave);
        console.log('Número de linhas (incluindo cabeçalho):', dataToSave.length);
        console.log('Primeira linha (cabeçalho):', dataToSave[0]);
        for (let i = 1; i < dataToSave.length; i++) {
            console.log(`Linha ${i} de dados:`, dataToSave[i]);
        }
        
        fetch('/api/exames-solicitar/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: dataToSave })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Atualizar spreadsheetData com o cabeçalho correto
                spreadsheetData = [...dataToSave];
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

