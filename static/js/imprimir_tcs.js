/**
 * Gerenciamento da funcionalidade Imprimir Tomografias
 */

/**
 * Inicializa o modal de imprimir tomografias
 */
function initImprimirTCSModal() {
    const btnImprimirTCS = document.getElementById('btn-imprimir-tcs');
    const modal = document.getElementById('modal-imprimir-tcs');
    const btnClose = document.getElementById('close-modal-imprimir-tcs');
    const btnSair = document.getElementById('btn-sair-imprimir');
    const btnImprimir = document.getElementById('btn-imprimir-pdf');
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
    
    // Fechar modal ao clicar fora
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeImprimirTCSModal();
            }
        });
    }
    
    // Fechar com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
            closeImprimirTCSModal();
        }
    });
}

/**
 * Abre o modal e carrega o PDF
 */
function openImprimirTCSModal() {
    const modal = document.getElementById('modal-imprimir-tcs');
    const pdfViewer = document.getElementById('pdf-viewer');
    
    if (!modal || !pdfViewer) return;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Carregar PDF no iframe
    pdfViewer.src = '/api/imprimir-tcs/pdf';
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
}

/**
 * Imprime o PDF
 */
function imprimirPDF() {
    const pdfViewer = document.getElementById('pdf-viewer');
    
    if (!pdfViewer) return;
    
    // Tentar imprimir o iframe
    try {
        pdfViewer.contentWindow.print();
    } catch (e) {
        // Se não conseguir imprimir o iframe, abrir em nova janela
        const pdfUrl = '/api/imprimir-tcs/pdf';
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

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    initImprimirTCSModal();
});

