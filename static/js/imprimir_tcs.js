/**
 * Gerenciamento da funcionalidade Imprimir Tomografias
 */

let pdfAtual = null; // Nome do PDF atualmente exibido

/**
 * Inicializa o modal de imprimir tomografias
 */
function initImprimirTCSModal() {
    const btnImprimirTCS = document.getElementById('btn-imprimir-tcs');
    const modal = document.getElementById('modal-imprimir-tcs');
    const btnClose = document.getElementById('close-modal-imprimir-tcs');
    const btnSair = document.getElementById('btn-sair-imprimir');
    const btnImprimir = document.getElementById('btn-imprimir-pdf');
    const btnHistorico = document.getElementById('btn-historico-pdf');
    const pdfViewer = document.getElementById('pdf-viewer');
    
    if (btnImprimirTCS) {
        btnImprimirTCS.addEventListener('click', function() {
            openImprimirTCSModal();
        });
    }
    
    if (btnClose) {
        btnClose.addEventListener('click', function() {
            closeImprimirTCSModal();
        });
    }
    
    if (btnSair) {
        btnSair.addEventListener('click', function() {
            closeImprimirTCSModal();
        });
    }
    
    if (btnImprimir) {
        btnImprimir.addEventListener('click', function() {
            imprimirPDF();
        });
    }
    
    if (btnHistorico) {
        btnHistorico.addEventListener('click', function() {
            abrirHistoricoPDFs();
        });
    }
    
    // Configurar modal de histórico
    const modalHistorico = document.getElementById('modal-historico-pdfs');
    const btnFecharHistorico = document.getElementById('btn-fechar-historico');
    const btnCloseHistorico = document.getElementById('close-modal-historico');
    
    if (btnFecharHistorico) {
        btnFecharHistorico.addEventListener('click', function() {
            fecharHistoricoPDFs();
        });
    }
    
    if (btnCloseHistorico) {
        btnCloseHistorico.addEventListener('click', function() {
            fecharHistoricoPDFs();
        });
    }
    
    // Fechar modal ao clicar fora
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeImprimirTCSModal();
            }
        });
    }
    
    if (modalHistorico) {
        modalHistorico.addEventListener('click', function(e) {
            if (e.target === modalHistorico) {
                fecharHistoricoPDFs();
            }
        });
    }
    
    // Fechar com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (modalHistorico && modalHistorico.classList.contains('active')) {
                fecharHistoricoPDFs();
            } else if (modal && modal.classList.contains('active')) {
                closeImprimirTCSModal();
            }
        }
    });
}

/**
 * Abre o modal e carrega o PDF mais recente
 */
function openImprimirTCSModal() {
    const modal = document.getElementById('modal-imprimir-tcs');
    const pdfViewer = document.getElementById('pdf-viewer');
    
    if (!modal || !pdfViewer) return;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Carregar PDF mais recente no iframe
    pdfViewer.src = '/api/imprimir-tcs/pdf';
    pdfAtual = null; // Resetar para indicar que é o mais recente
}

/**
 * Carrega um PDF específico no visualizador
 */
function carregarPDF(nomeArquivo) {
    const pdfViewer = document.getElementById('pdf-viewer');
    if (!pdfViewer) return;
    
    // Codificar nome do arquivo para URL
    const nomeCodificado = encodeURIComponent(nomeArquivo);
    pdfViewer.src = `/api/imprimir-tcs/pdf/${nomeCodificado}`;
    pdfAtual = nomeArquivo;
    
    // Fechar modal de histórico
    fecharHistoricoPDFs();
}

/**
 * Fecha o modal
 */
function closeImprimirTCSModal() {
    const modal = document.getElementById('modal-imprimir-tcs');
    const pdfViewer = document.getElementById('pdf-viewer');
    
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Limpar iframe para liberar recursos
        if (pdfViewer) {
            pdfViewer.src = '';
        }
    }
    
    pdfAtual = null;
}

/**
 * Abre o modal de histórico de PDFs
 */
function abrirHistoricoPDFs() {
    const modal = document.getElementById('modal-historico-pdfs');
    const lista = document.getElementById('historico-lista');
    
    if (!modal || !lista) return;
    
    modal.classList.add('active');
    
    // Carregar lista de PDFs
    lista.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-spin"></i> Carregando histórico...</div>';
    
    fetch('/api/imprimir-tcs/historico')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderizarHistorico(data.pdfs);
            } else {
                lista.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar histórico: ${data.error || 'Erro desconhecido'}</div>`;
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            lista.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar histórico</div>`;
        });
}

/**
 * Renderiza a lista de PDFs no histórico
 */
function renderizarHistorico(pdfs) {
    const lista = document.getElementById('historico-lista');
    if (!lista) return;
    
    if (pdfs.length === 0) {
        lista.innerHTML = '<div class="empty-message"><i class="fas fa-inbox"></i> Nenhum PDF encontrado</div>';
        return;
    }
    
    let html = '<div class="historico-header">';
    html += '<div class="historico-col-nome">Arquivo</div>';
    html += '<div class="historico-col-data">Data/Hora</div>';
    html += '<div class="historico-col-tamanho">Tamanho</div>';
    html += '<div class="historico-col-acoes">Ações</div>';
    html += '</div>';
    
    html += '<div class="historico-items">';
    
    pdfs.forEach((pdf, index) => {
        const isMaisRecente = index === 0;
        const tamanhoKB = (pdf.tamanho / 1024).toFixed(2);
        const tamanhoMB = (pdf.tamanho / (1024 * 1024)).toFixed(2);
        const tamanhoFormatado = pdf.tamanho > 1024 * 1024 ? `${tamanhoMB} MB` : `${tamanhoKB} KB`;
        
        html += `<div class="historico-item ${isMaisRecente ? 'mais-recente' : ''}">`;
        html += `<div class="historico-col-nome">`;
        if (isMaisRecente) {
            html += '<span class="badge-recente"><i class="fas fa-star"></i> Mais Recente</span>';
        }
        html += `<span class="nome-arquivo">${pdf.nome}</span>`;
        html += `</div>`;
        html += `<div class="historico-col-data">${pdf.data_modificacao}</div>`;
        html += `<div class="historico-col-tamanho">${tamanhoFormatado}</div>`;
        html += `<div class="historico-col-acoes">`;
        html += `<button class="btn-visualizar" onclick="carregarPDF('${pdf.nome.replace(/'/g, "\\'")}')" title="Visualizar">`;
        html += '<i class="fas fa-eye"></i> Visualizar';
        html += '</button>';
        html += `<button class="btn-imprimir-item" onclick="imprimirPDFEspecifico('${pdf.nome.replace(/'/g, "\\'")}')" title="Imprimir">`;
        html += '<i class="fas fa-print"></i> Imprimir';
        html += '</button>';
        html += `</div>`;
        html += `</div>`;
    });
    
    html += '</div>';
    
    lista.innerHTML = html;
}

/**
 * Fecha o modal de histórico
 */
function fecharHistoricoPDFs() {
    const modal = document.getElementById('modal-historico-pdfs');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Imprime o PDF atual
 */
function imprimirPDF() {
    const pdfViewer = document.getElementById('pdf-viewer');
    
    if (!pdfViewer) return;
    
    // Determinar URL do PDF
    let pdfUrl = '/api/imprimir-tcs/pdf';
    if (pdfAtual) {
        pdfUrl = `/api/imprimir-tcs/pdf/${encodeURIComponent(pdfAtual)}`;
    }
    
    // Tentar imprimir o iframe
    try {
        pdfViewer.contentWindow.print();
    } catch (e) {
        // Se não conseguir imprimir o iframe, abrir em nova janela
        const printWindow = window.open(pdfUrl, '_blank');
        
        if (printWindow) {
            printWindow.onload = function() {
                printWindow.print();
            };
        } else {
            alert('Por favor, permita pop-ups para imprimir o PDF');
        }
    }
}

/**
 * Imprime um PDF específico do histórico
 */
function imprimirPDFEspecifico(nomeArquivo) {
    const pdfUrl = `/api/imprimir-tcs/pdf/${encodeURIComponent(nomeArquivo)}`;
    const printWindow = window.open(pdfUrl, '_blank');
    
    if (printWindow) {
        printWindow.onload = function() {
            printWindow.print();
        };
    } else {
        alert('Por favor, permita pop-ups para imprimir o PDF');
    }
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    initImprimirTCSModal();
});
