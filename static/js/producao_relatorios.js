/**
 * Gerenciamento do Módulo de Produção e Relatórios
 */

// Variáveis globais
let graficoModulo = null;
let graficoUsuario = null;
let graficoPeriodo = null;
let dadosAtuais = null;
let filtrosAtivos = {
    data_inicial: '',
    data_final: '',
    usuarios: [],
    modulos: []
};

// Cores para os gráficos (tema glassmorphism)
const coresGraficos = [
    'rgba(74, 144, 226, 0.8)',   // Azul
    'rgba(118, 75, 162, 0.8)',   // Roxo
    'rgba(76, 175, 80, 0.8)',    // Verde
    'rgba(255, 152, 0, 0.8)',    // Laranja
    'rgba(244, 67, 54, 0.8)',    // Vermelho
    'rgba(33, 150, 243, 0.8)',   // Azul claro
    'rgba(156, 39, 176, 0.8)',   // Roxo claro
    'rgba(0, 188, 212, 0.8)'     // Ciano
];

// Cores para gráficos em PDF (fundo branco)
const coresPDF = [
    '#4a90e2',   // Azul
    '#764ba2',   // Roxo
    '#4caf50',   // Verde
    '#ff9800',   // Laranja
    '#f44336',   // Vermelho
    '#2196f3',   // Azul claro
    '#9c27b0',   // Roxo claro
    '#00bcd4'    // Ciano
];

/**
 * Inicializa o modal de produção e relatórios
 */
function initProducaoRelatoriosModal() {
    const btnAbrir = document.getElementById('btn-producao-relatorios');
    const modal = document.getElementById('modal-producao-relatorios');
    const btnFechar = document.getElementById('btn-fechar-producao-relatorios');
    const btnClose = document.getElementById('close-modal-producao-relatorios');
    const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
    const btnLimparFiltros = document.getElementById('btn-limpar-filtros');
    const btnImprimir = document.getElementById('btn-imprimir-relatorio');
    const btnToggleFiltros = document.getElementById('btn-toggle-filtros');
    const filtrosSection = document.getElementById('filtros-section');
    
    // Abrir modal
    if (btnAbrir) {
        btnAbrir.addEventListener('click', function() {
            openModal('modal-producao-relatorios');
            inicializarFiltros();
            carregarDados();
            // Esconder filtros ao abrir
            if (filtrosSection) filtrosSection.style.display = 'none';
            if (btnToggleFiltros) {
                btnToggleFiltros.innerHTML = '<i class="fas fa-filter"></i> Mostrar Filtros';
            }
        });
    }
    
    // Toggle filtros
    if (btnToggleFiltros && filtrosSection) {
        btnToggleFiltros.addEventListener('click', function() {
            const isVisible = filtrosSection.style.display !== 'none';
            if (isVisible) {
                filtrosSection.style.display = 'none';
                btnToggleFiltros.innerHTML = '<i class="fas fa-filter"></i> Mostrar Filtros';
            } else {
                filtrosSection.style.display = 'block';
                btnToggleFiltros.innerHTML = '<i class="fas fa-filter"></i> Ocultar Filtros';
            }
        });
    }
    
    // Abrir via menu
    const menuItem = document.querySelector('[data-action="producao-relatorios"]');
    if (menuItem) {
        menuItem.addEventListener('click', function(e) {
            e.preventDefault();
            if (btnAbrir) btnAbrir.click();
        });
    }
    
    // Fechar modal
    if (btnFechar) {
        btnFechar.addEventListener('click', function() {
            closeModal('modal-producao-relatorios');
        });
    }
    
    if (btnClose) {
        btnClose.addEventListener('click', function() {
            closeModal('modal-producao-relatorios');
        });
    }
    
    // Aplicar filtros
    if (btnAplicarFiltros) {
        btnAplicarFiltros.addEventListener('click', function() {
            aplicarFiltros();
        });
    }
    
    // Limpar filtros
    if (btnLimparFiltros) {
        btnLimparFiltros.addEventListener('click', function() {
            limparFiltros();
        });
    }
    
    // Imprimir relatório
    if (btnImprimir) {
        btnImprimir.addEventListener('click', function() {
            gerarPDF();
        });
    }
    
    // Fechar modal ao clicar fora
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal('modal-producao-relatorios');
            }
        });
    }
    
    // Fechar com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
            closeModal('modal-producao-relatorios');
        }
    });
}

/**
 * Inicializa os filtros com valores padrão
 */
function inicializarFiltros() {
    // Definir período padrão: primeiro dia do mês até hoje
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    
    const dataInicial = document.getElementById('filtro-data-inicial');
    const dataFinal = document.getElementById('filtro-data-final');
    
    if (dataInicial) {
        dataInicial.value = primeiroDiaMes.toISOString().split('T')[0];
    }
    if (dataFinal) {
        dataFinal.value = hoje.toISOString().split('T')[0];
    }
}

/**
 * Carrega dados do backend
 */
function carregarDados() {
    const loadingMsg = document.getElementById('loading-message');
    const errorMsg = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    
    // Mostrar loading
    if (loadingMsg) loadingMsg.style.display = 'flex';
    if (errorMsg) errorMsg.style.display = 'none';
    
    // Construir URL com filtros
    const params = new URLSearchParams();
    if (filtrosAtivos.data_inicial) {
        params.append('data_inicial', filtrosAtivos.data_inicial);
    }
    if (filtrosAtivos.data_final) {
        params.append('data_final', filtrosAtivos.data_final);
    }
    filtrosAtivos.usuarios.forEach(u => params.append('usuarios[]', u));
    filtrosAtivos.modulos.forEach(m => params.append('modulos[]', m));
    
    fetch(`/api/producao-relatorios/dados?${params.toString()}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                dadosAtuais = data;
                atualizarFiltrosDisponiveis(data);
                atualizarGraficos();
                if (loadingMsg) loadingMsg.style.display = 'none';
            } else {
                throw new Error(data.error || 'Erro ao carregar dados');
            }
        })
        .catch(error => {
            console.error('Erro ao carregar dados:', error);
            if (loadingMsg) loadingMsg.style.display = 'none';
            if (errorMsg) {
                errorMsg.style.display = 'flex';
                if (errorText) errorText.textContent = error.message || 'Erro ao carregar dados';
            }
        });
}

/**
 * Atualiza os filtros disponíveis (usuários e módulos)
 */
function atualizarFiltrosDisponiveis(data) {
    // Atualizar select de usuários
    const selectUsuarios = document.getElementById('filtro-usuarios');
    if (selectUsuarios) {
        selectUsuarios.innerHTML = '';
        if (data.usuarios_disponiveis && data.usuarios_disponiveis.length > 0) {
            data.usuarios_disponiveis.forEach(usuario => {
                const option = document.createElement('option');
                option.value = usuario;
                option.textContent = usuario;
                if (filtrosAtivos.usuarios.includes(usuario)) {
                    option.selected = true;
                }
                selectUsuarios.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Nenhum usuário disponível';
            option.disabled = true;
            selectUsuarios.appendChild(option);
        }
    }
    
    // Atualizar select de módulos
    const selectModulos = document.getElementById('filtro-modulos');
    if (selectModulos) {
        selectModulos.innerHTML = '';
        if (data.modulos_disponiveis && data.modulos_disponiveis.length > 0) {
            data.modulos_disponiveis.forEach(modulo => {
                const option = document.createElement('option');
                option.value = modulo;
                option.textContent = modulo;
                if (filtrosAtivos.modulos.includes(modulo)) {
                    option.selected = true;
                }
                selectModulos.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Nenhum módulo disponível';
            option.disabled = true;
            selectModulos.appendChild(option);
        }
    }
}

/**
 * Aplica os filtros selecionados
 */
function aplicarFiltros() {
    const dataInicial = document.getElementById('filtro-data-inicial');
    const dataFinal = document.getElementById('filtro-data-final');
    const selectUsuarios = document.getElementById('filtro-usuarios');
    const selectModulos = document.getElementById('filtro-modulos');
    
    filtrosAtivos.data_inicial = dataInicial ? dataInicial.value : '';
    filtrosAtivos.data_final = dataFinal ? dataFinal.value : '';
    filtrosAtivos.usuarios = selectUsuarios ? Array.from(selectUsuarios.selectedOptions).map(o => o.value) : [];
    filtrosAtivos.modulos = selectModulos ? Array.from(selectModulos.selectedOptions).map(o => o.value) : [];
    
    // Esconder filtros após aplicar
    const filtrosSection = document.getElementById('filtros-section');
    const btnToggleFiltros = document.getElementById('btn-toggle-filtros');
    if (filtrosSection) filtrosSection.style.display = 'none';
    if (btnToggleFiltros) {
        btnToggleFiltros.innerHTML = '<i class="fas fa-filter"></i> Mostrar Filtros';
    }
    
    carregarDados();
}

/**
 * Limpa todos os filtros
 */
function limparFiltros() {
    filtrosAtivos = {
        data_inicial: '',
        data_final: '',
        usuarios: [],
        modulos: []
    };
    
    inicializarFiltros();
    
    const selectUsuarios = document.getElementById('filtro-usuarios');
    const selectModulos = document.getElementById('filtro-modulos');
    
    if (selectUsuarios) {
        Array.from(selectUsuarios.options).forEach(opt => opt.selected = false);
    }
    if (selectModulos) {
        Array.from(selectModulos.options).forEach(opt => opt.selected = false);
    }
    
    carregarDados();
}

/**
 * Atualiza todos os gráficos
 */
function atualizarGraficos() {
    if (!dadosAtuais) return;
    
    atualizarGraficoModulo();
    atualizarGraficoUsuario();
    atualizarGraficoPeriodo();
}

/**
 * Atualiza gráfico de produção por módulo
 */
function atualizarGraficoModulo() {
    const ctx = document.getElementById('grafico-modulo');
    if (!ctx || !dadosAtuais.dados_modulo) return;
    
    const dados = dadosAtuais.dados_modulo;
    
    if (graficoModulo) {
        graficoModulo.destroy();
    }
    
    graficoModulo = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dados.labels.map(d => `Dia ${d}`),
            datasets: dados.datasets.map((ds, idx) => ({
                label: ds.label,
                data: ds.data,
                backgroundColor: coresGraficos[idx % coresGraficos.length],
                borderColor: coresGraficos[idx % coresGraficos.length].replace('0.8', '1'),
                borderWidth: 1
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.9)',
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                y: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

/**
 * Atualiza gráfico de produção por usuário
 */
function atualizarGraficoUsuario() {
    const ctx = document.getElementById('grafico-usuario');
    if (!ctx || !dadosAtuais.dados_usuario) return;
    
    const dados = dadosAtuais.dados_usuario;
    
    if (graficoUsuario) {
        graficoUsuario.destroy();
    }
    
    graficoUsuario = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dados.labels.map(d => `Dia ${d}`),
            datasets: dados.datasets.map((ds, idx) => ({
                label: ds.label,
                data: ds.data,
                backgroundColor: coresGraficos[idx % coresGraficos.length],
                borderColor: coresGraficos[idx % coresGraficos.length].replace('0.8', '1'),
                borderWidth: 1
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.9)',
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                y: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

/**
 * Atualiza gráfico de produção por período
 */
function atualizarGraficoPeriodo() {
    const ctx = document.getElementById('grafico-periodo');
    if (!ctx || !dadosAtuais.dados_periodo) return;
    
    const dados = dadosAtuais.dados_periodo;
    
    if (graficoPeriodo) {
        graficoPeriodo.destroy();
    }
    
    graficoPeriodo = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dados.labels,
            datasets: dados.datasets.map((ds, idx) => ({
                label: ds.label,
                data: ds.data,
                backgroundColor: coresGraficos[idx % coresGraficos.length],
                borderColor: coresGraficos[idx % coresGraficos.length].replace('0.8', '1'),
                borderWidth: 1
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.9)',
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                y: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

/**
 * Filtra dados para mostrar apenas dias/colunas com produção
 */
function filtrarDadosComProducao(dados) {
    if (!dados || !dados.datasets || dados.datasets.length === 0) {
        return dados;
    }
    
    // Encontrar índices de colunas que têm pelo menos um valor não-zero
    const indicesComDados = [];
    const numColunas = dados.labels.length;
    
    for (let i = 0; i < numColunas; i++) {
        let temDados = false;
        for (const dataset of dados.datasets) {
            if (dataset.data[i] && dataset.data[i] > 0) {
                temDados = true;
                break;
            }
        }
        if (temDados) {
            indicesComDados.push(i);
        }
    }
    
    // Se não há dados, retornar vazio
    if (indicesComDados.length === 0) {
        return {
            labels: [],
            datasets: dados.datasets.map(ds => ({ ...ds, data: [] }))
        };
    }
    
    // Filtrar labels e dados
    const labelsFiltrados = indicesComDados.map(idx => dados.labels[idx]);
    const datasetsFiltrados = dados.datasets.map(ds => ({
        ...ds,
        data: indicesComDados.map(idx => ds.data[idx])
    }));
    
    return {
        labels: labelsFiltrados,
        datasets: datasetsFiltrados
    };
}

/**
 * Cria um gráfico temporário para PDF
 */
function criarGraficoPDF(tipo, dados, titulo, width = 1000, height = 500) {
    return new Promise((resolve) => {
        // Ajustar largura baseado no número de labels para evitar compressão
        const numLabels = dados.labels.length;
        const larguraMinima = 1000;
        const larguraPorLabel = 35; // pixels por label
        const larguraCalculada = Math.max(larguraMinima, numLabels * larguraPorLabel);
        
        // Criar canvas temporário
        const canvas = document.createElement('canvas');
        canvas.width = larguraCalculada;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Preencher fundo branco
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        
        // Criar gráfico com tema branco
        const chart = new Chart(ctx, {
            type: tipo,
            data: dados,
            options: {
                responsive: false,
                maintainAspectRatio: false,
                backgroundColor: '#ffffff',
                animation: {
                    duration: 0 // Desabilitar animação para renderização mais rápida
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#333333',
                            font: {
                                size: 12,
                                family: 'Arial',
                                weight: 'bold'
                            },
                            padding: 15
                        }
                    },
                    title: {
                        display: true,
                        text: titulo,
                        font: {
                            size: 16,
                            family: 'Arial',
                            weight: 'bold'
                        },
                        color: '#333333',
                        padding: 20
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#333',
                        borderWidth: 1,
                        padding: 10
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#333333',
                            font: {
                                size: 10,
                                family: 'Arial'
                            },
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            color: '#e0e0e0',
                            lineWidth: 1
                        }
                    },
                    y: {
                        ticks: {
                            color: '#333333',
                            font: {
                                size: 11,
                                family: 'Arial'
                            }
                        },
                        grid: {
                            color: '#e0e0e0',
                            lineWidth: 1
                        }
                    }
                }
            }
        });
        
        // Aguardar renderização completa
        setTimeout(() => {
            try {
                const imageData = canvas.toDataURL('image/png', 1.0);
                chart.destroy();
                resolve(imageData);
            } catch (e) {
                console.error('Erro ao converter gráfico:', e);
                chart.destroy();
                resolve(null);
            }
        }, 1000);
    });
}

/**
 * Gera PDF do relatório com gráficos específicos e tabelas
 */
async function gerarPDF() {
    if (!dadosAtuais) {
        alert('Não há dados para gerar o relatório. Carregue os dados primeiro.');
        return;
    }
    
    // Verificar se as bibliotecas estão carregadas
    if (typeof window.jspdf === 'undefined') {
        alert('Biblioteca jsPDF não carregada. Por favor, recarregue a página.');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    
    // Obter botão de imprimir
    const btnImprimir = document.getElementById('btn-imprimir-relatorio');
    let estadoOriginal = null;
    
    // Salvar estado original e aplicar estado de loading
    if (btnImprimir) {
        estadoOriginal = {
            innerHTML: btnImprimir.innerHTML,
            disabled: btnImprimir.disabled,
            style: {
                backgroundColor: btnImprimir.style.backgroundColor,
                opacity: btnImprimir.style.opacity,
                cursor: btnImprimir.style.cursor
            }
        };
        
        // Aplicar estado de loading
        btnImprimir.disabled = true;
        btnImprimir.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
        btnImprimir.style.backgroundColor = '#9e9e9e';
        btnImprimir.style.opacity = '0.7';
        btnImprimir.style.cursor = 'not-allowed';
    }
    
    // Função para restaurar estado original
    const restaurarEstado = () => {
        if (btnImprimir && estadoOriginal) {
            btnImprimir.disabled = estadoOriginal.disabled;
            btnImprimir.innerHTML = estadoOriginal.innerHTML;
            btnImprimir.style.backgroundColor = estadoOriginal.style.backgroundColor || '';
            btnImprimir.style.opacity = estadoOriginal.style.opacity || '';
            btnImprimir.style.cursor = estadoOriginal.style.cursor || '';
        }
    };
    
    try {
        const pdf = new jsPDF('portrait', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        let yPos = 20;
        
        // Carregar logo usando fetch
        let logoData = null;
        try {
            const logoPaths = [
                '/static/logo.png',
                window.location.origin + '/static/logo.png'
            ];
            
            for (const logoPath of logoPaths) {
                try {
                    const response = await fetch(logoPath);
                    if (response.ok) {
                        const blob = await response.blob();
                        logoData = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = () => resolve(null);
                            reader.readAsDataURL(blob);
                        });
                        if (logoData) break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!logoData) {
                console.warn('Logo não encontrado, continuando sem logo');
            }
        } catch (e) {
            console.warn('Erro ao carregar logo:', e);
        }
        
        // Cabeçalho com logo
        let logoWidth = 0;
        if (logoData) {
            try {
                logoWidth = 30;
                const logoHeight = 30; // Altura fixa
                pdf.addImage(logoData, 'PNG', 10, yPos, logoWidth, logoHeight);
            } catch (e) {
                console.warn('Erro ao adicionar logo:', e);
                logoWidth = 0;
            }
        }
        
        // Título
        pdf.setFontSize(22);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text('AUTOREG', logoWidth > 0 ? 45 : 10, yPos + 10);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Produção e Relatórios', logoWidth > 0 ? 45 : 10, yPos + 17);
        
        yPos += 35;
        
        // Linha separadora
        pdf.setDrawColor(200, 200, 200);
        pdf.line(10, yPos, pageWidth - 10, yPos);
        yPos += 8;
        
        // Informações de filtros
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text('Filtros Aplicados:', 10, yPos);
        yPos += 7;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        if (filtrosAtivos.data_inicial && filtrosAtivos.data_final) {
            pdf.text(`Período: ${filtrosAtivos.data_inicial} até ${filtrosAtivos.data_final}`, 15, yPos);
            yPos += 6;
        }
        if (filtrosAtivos.usuarios.length > 0) {
            const usuariosTexto = filtrosAtivos.usuarios.join(', ');
            pdf.text(`Usuários: ${usuariosTexto}`, 15, yPos);
            yPos += 6;
        }
        if (filtrosAtivos.modulos.length > 0) {
            const modulosTexto = filtrosAtivos.modulos.join(', ');
            pdf.text(`Módulos: ${modulosTexto}`, 15, yPos);
            yPos += 6;
        }
        
        yPos += 5;
        
        // Gráfico 1: Produção por Módulo
        if (dadosAtuais.dados_modulo && dadosAtuais.dados_modulo.datasets.length > 0) {
            // Filtrar dados para mostrar apenas dias com produção
            const dadosModuloFiltrados = filtrarDadosComProducao(dadosAtuais.dados_modulo);
            
            if (dadosModuloFiltrados.labels.length > 0) {
                const dadosModuloPDF = {
                    labels: dadosModuloFiltrados.labels.map(d => `Dia ${d}`),
                    datasets: dadosModuloFiltrados.datasets.map((ds, idx) => ({
                        label: ds.label,
                        data: ds.data,
                        backgroundColor: coresPDF[idx % coresPDF.length],
                        borderColor: coresPDF[idx % coresPDF.length],
                        borderWidth: 2
                    }))
                };
                
                const imgModulo = await criarGraficoPDF('bar', dadosModuloPDF, 'Produção por Módulo');
                
                if (imgModulo) {
                    if (yPos + 100 > pageHeight - 30) {
                        pdf.addPage();
                        yPos = 20;
                    }
                    
                    // Calcular altura do gráfico baseado no número de labels
                    const numLabels = dadosModuloFiltrados.labels.length;
                    const graficoHeight = Math.max(80, Math.min(120, 60 + (numLabels * 2)));
                    
                    // Ajustar largura se necessário (mas manter dentro da página)
                    const larguraGrafico = pageWidth - 20;
                    pdf.addImage(imgModulo, 'PNG', 10, yPos, larguraGrafico, graficoHeight);
                    yPos += graficoHeight + 10;
                }
                
                // Tabela de dados por módulo (apenas dias com produção)
                yPos = adicionarTabelaModulo(pdf, dadosModuloFiltrados, yPos, pageWidth, pageHeight);
            }
        }
        
        // Gráfico 2: Produção por Usuário
        if (dadosAtuais.dados_usuario && dadosAtuais.dados_usuario.datasets.length > 0) {
            // Filtrar dados para mostrar apenas dias com produção
            const dadosUsuarioFiltrados = filtrarDadosComProducao(dadosAtuais.dados_usuario);
            
            if (dadosUsuarioFiltrados.labels.length > 0) {
                if (yPos + 100 > pageHeight - 30) {
                    pdf.addPage();
                    yPos = 20;
                }
                
                const dadosUsuarioPDF = {
                    labels: dadosUsuarioFiltrados.labels.map(d => `Dia ${d}`),
                    datasets: dadosUsuarioFiltrados.datasets.map((ds, idx) => ({
                        label: ds.label,
                        data: ds.data,
                        backgroundColor: coresPDF[idx % coresPDF.length],
                        borderColor: coresPDF[idx % coresPDF.length],
                        borderWidth: 2
                    }))
                };
                
                const imgUsuario = await criarGraficoPDF('bar', dadosUsuarioPDF, 'Produção por Usuário');
                if (imgUsuario) {
                    if (yPos + 100 > pageHeight - 30) {
                        pdf.addPage();
                        yPos = 20;
                    }
                    // Calcular altura do gráfico baseado no número de labels
                    const numLabels = dadosUsuarioFiltrados.labels.length;
                    const graficoHeight = Math.max(80, Math.min(120, 60 + (numLabels * 2)));
                    const larguraGrafico = pageWidth - 20;
                    pdf.addImage(imgUsuario, 'PNG', 10, yPos, larguraGrafico, graficoHeight);
                    yPos += graficoHeight + 10;
                }
                
                // Tabela de dados por usuário (apenas dias com produção)
                yPos = adicionarTabelaUsuario(pdf, dadosUsuarioFiltrados, yPos, pageWidth, pageHeight);
            }
        }
        
        // Gráfico 3: Produção por Período
        if (dadosAtuais.dados_periodo && dadosAtuais.dados_periodo.datasets.length > 0) {
            // Filtrar dados para mostrar apenas meses com produção
            const dadosPeriodoFiltrados = filtrarDadosComProducao(dadosAtuais.dados_periodo);
            
            if (dadosPeriodoFiltrados.labels.length > 0) {
                if (yPos + 100 > pageHeight - 30) {
                    pdf.addPage();
                    yPos = 20;
                }
                
                const dadosPeriodoPDF = {
                    labels: dadosPeriodoFiltrados.labels,
                    datasets: dadosPeriodoFiltrados.datasets.map((ds, idx) => ({
                        label: ds.label,
                        data: ds.data,
                        backgroundColor: coresPDF[idx % coresPDF.length],
                        borderColor: coresPDF[idx % coresPDF.length],
                        borderWidth: 2
                    }))
                };
                
                const imgPeriodo = await criarGraficoPDF('bar', dadosPeriodoPDF, 'Produção por Período');
                if (imgPeriodo) {
                    if (yPos + 100 > pageHeight - 30) {
                        pdf.addPage();
                        yPos = 20;
                    }
                    // Calcular altura do gráfico baseado no número de labels
                    const numLabels = dadosPeriodoFiltrados.labels.length;
                    const graficoHeight = Math.max(80, Math.min(120, 60 + (numLabels * 2)));
                    const larguraGrafico = pageWidth - 20;
                    pdf.addImage(imgPeriodo, 'PNG', 10, yPos, larguraGrafico, graficoHeight);
                    yPos += graficoHeight + 10;
                }
                
                // Tabela de dados por período (apenas meses com produção)
                yPos = adicionarTabelaPeriodo(pdf, dadosPeriodoFiltrados, yPos, pageWidth, pageHeight);
            }
        }
        
        // Adicionar rodapé em todas as páginas
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(100, 100, 100);
            const pageHeightFooter = pdf.internal.pageSize.getHeight();
            pdf.text('AUTOREG - Sistema Automatizado de operações G-HOSP e SISREG', 10, pageHeightFooter - 15);
            pdf.text('Copyright © 2025 por Michel Ribeiro Paes - www.michelpaes.adv.br', 10, pageHeightFooter - 10);
            pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 10, pageHeightFooter - 5);
            pdf.text(`Página ${i} de ${totalPages}`, pageWidth - 30, pageHeightFooter - 5);
        }
        
        // Salvar PDF
        pdf.save(`relatorio-producao-${new Date().toISOString().split('T')[0]}.pdf`);
        
        // Restaurar estado do botão após sucesso
        restaurarEstado();
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert('Erro ao gerar PDF: ' + error.message);
        
        // Restaurar estado do botão após erro
        restaurarEstado();
    }
}

/**
 * Adiciona tabela de dados por módulo ao PDF
 */
function adicionarTabelaModulo(pdf, dados, yPos, pageWidth, pageHeight) {
    // Verificar se há dados para mostrar
    if (!dados || !dados.labels || dados.labels.length === 0) {
        return yPos;
    }
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    
    if (yPos + 30 > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
    }
    
    pdf.text('Tabela - Produção por Módulo', 10, yPos);
    yPos += 7;
    
    // Salvar tamanho de fonte original
    const tamanhoFonteOriginal = pdf.getFontSize();
    
    // Calcular largura das colunas (mínimo para não ficar muito estreito)
    const numColunas = dados.labels.length;
    const margemEsquerda = 10;
    const margemDireita = 10;
    const larguraTotalDisponivel = pageWidth - margemEsquerda - margemDireita;
    let larguraColunaRotulo = Math.max(50, larguraTotalDisponivel * 0.3); // Aumentado para 30%
    const larguraRestanteParaDados = larguraTotalDisponivel - larguraColunaRotulo;
    let larguraColunaDados = Math.max(
        15, // Largura mínima reduzida para caber melhor
        larguraRestanteParaDados / numColunas
    );
    
    // Garantir que a largura total não ultrapasse os limites
    const larguraTotalCalculada = larguraColunaRotulo + (larguraColunaDados * numColunas);
    if (larguraTotalCalculada > larguraTotalDisponivel) {
        // Ajustar proporcionalmente se ultrapassar
        const fatorAjuste = larguraTotalDisponivel / larguraTotalCalculada;
        const larguraColunaDadosAjustada = larguraColunaDados * fatorAjuste;
        const larguraColunaDadosFinal = Math.max(12, larguraColunaDadosAjustada);
        const larguraColunaRotuloFinal = larguraTotalDisponivel - (larguraColunaDadosFinal * numColunas);
        
        larguraColunaRotulo = Math.max(40, larguraColunaRotuloFinal);
        larguraColunaDados = larguraColunaDadosFinal;
    }
    
    let xPos = margemEsquerda;
    
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(70, 130, 180); // Azul aço
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text('Módulo', xPos + 2, yPos + 5);
    xPos += larguraColunaRotulo;
    
    dados.labels.forEach((dia, diaIdx) => {
        // Verificar se não ultrapassa a margem direita na última coluna
        const larguraColunaAtual = (diaIdx === dados.labels.length - 1) 
            ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos)
            : larguraColunaDados;
        
        pdf.setFillColor(70, 130, 180); // Azul aço
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'F');
        // Ajustar tamanho do texto se coluna muito estreita
        if (larguraColunaAtual < 15) {
            pdf.setFontSize(7);
        }
        pdf.text(`Dia ${dia}`, xPos + 2, yPos + 5);
        if (larguraColunaAtual < 15) {
            pdf.setFontSize(8); // Restaurar
        }
        xPos += larguraColunaAtual;
    });
    
    yPos += 8;
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(tamanhoFonteOriginal); // Restaurar tamanho original
    
        // Dados da tabela
        dados.datasets.forEach((dataset, idx) => {
            if (yPos + 8 > pageHeight - 30) {
                pdf.addPage();
                yPos = 20;
            }
            
            xPos = margemEsquerda;
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(0, 0, 0);
            // Alternar cor de fundo para melhor legibilidade
            const larguraTotalLinha = larguraColunaRotulo + (larguraColunaDados * numColunas);
            if (idx % 2 === 0) {
                pdf.setFillColor(245, 245, 245);
                pdf.rect(xPos, yPos, larguraTotalLinha, 7, 'F');
            }
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(xPos, yPos, larguraColunaRotulo, 7, 'S');
            // Ajustar tamanho do texto se necessário
            let tamanhoTexto = 8;
            if (larguraColunaRotulo < 40) {
                tamanhoTexto = 7;
            }
            pdf.setFontSize(tamanhoTexto);
            pdf.text(dataset.label.substring(0, Math.floor(larguraColunaRotulo / 2.5)), xPos + 2, yPos + 5);
            xPos += larguraColunaRotulo;
            
            dataset.data.forEach((valor, colIdx) => {
                // Verificar se não ultrapassa a margem direita
                const larguraColunaAtual = (colIdx === dataset.data.length - 1) 
                    ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos)
                    : larguraColunaDados;
                
                if (idx % 2 === 0) {
                    pdf.setFillColor(245, 245, 245);
                    pdf.rect(xPos, yPos, larguraColunaAtual, 7, 'F');
                }
                pdf.setDrawColor(200, 200, 200);
                pdf.rect(xPos, yPos, larguraColunaAtual, 7, 'S');
                pdf.setTextColor(0, 0, 0);
                // Ajustar tamanho do texto se coluna muito estreita
                if (larguraColunaAtual < 15) {
                    pdf.setFontSize(7);
                }
                pdf.text(valor.toString(), xPos + 2, yPos + 5);
                if (larguraColunaAtual < 15) {
                    pdf.setFontSize(8); // Restaurar
                }
                xPos += larguraColunaAtual;
            });
            
            yPos += 7;
        });
    
    return yPos + 5;
}

/**
 * Adiciona tabela de dados por usuário ao PDF
 */
function adicionarTabelaUsuario(pdf, dados, yPos, pageWidth, pageHeight) {
    // Verificar se há dados para mostrar
    if (!dados || !dados.labels || dados.labels.length === 0) {
        return yPos;
    }
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    
    if (yPos + 30 > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
    }
    
    pdf.text('Tabela - Produção por Usuário', 10, yPos);
    yPos += 7;
    
    // Salvar tamanho de fonte original
    const tamanhoFonteOriginalUsuario = pdf.getFontSize();
    
    // Calcular largura das colunas
    const numColunas = dados.labels.length;
    const margemEsquerda = 10;
    const margemDireita = 10;
    const larguraTotalDisponivel = pageWidth - margemEsquerda - margemDireita;
    let larguraColunaRotulo = Math.max(50, larguraTotalDisponivel * 0.3); // Aumentado para 30%
    const larguraRestanteParaDados = larguraTotalDisponivel - larguraColunaRotulo;
    let larguraColunaDados = Math.max(
        15, // Largura mínima reduzida
        larguraRestanteParaDados / numColunas
    );
    
    // Garantir que a largura total não ultrapasse os limites
    const larguraTotalCalculada = larguraColunaRotulo + (larguraColunaDados * numColunas);
    if (larguraTotalCalculada > larguraTotalDisponivel) {
        // Ajustar proporcionalmente se ultrapassar
        const fatorAjuste = larguraTotalDisponivel / larguraTotalCalculada;
        const larguraColunaDadosAjustada = larguraColunaDados * fatorAjuste;
        const larguraColunaDadosFinal = Math.max(12, larguraColunaDadosAjustada);
        const larguraColunaRotuloFinal = larguraTotalDisponivel - (larguraColunaDadosFinal * numColunas);
        
        larguraColunaRotulo = Math.max(40, larguraColunaRotuloFinal);
        larguraColunaDados = larguraColunaDadosFinal;
    }
    
    let xPos = margemEsquerda;
    
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(70, 130, 180); // Azul aço
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text('Usuário', xPos + 2, yPos + 5);
    xPos += larguraColunaRotulo;
    
    dados.labels.forEach((dia, diaIdx) => {
        // Verificar se não ultrapassa a margem direita na última coluna
        const larguraColunaAtual = (diaIdx === dados.labels.length - 1) 
            ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos)
            : larguraColunaDados;
        
        pdf.setFillColor(70, 130, 180); // Azul aço
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'F');
        // Ajustar tamanho do texto se coluna muito estreita
        if (larguraColunaAtual < 15) {
            pdf.setFontSize(7);
        }
        pdf.text(`Dia ${dia}`, xPos + 2, yPos + 5);
        if (larguraColunaAtual < 15) {
            pdf.setFontSize(8); // Restaurar
        }
        xPos += larguraColunaAtual;
    });
    
    yPos += 8;
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(tamanhoFonteOriginalUsuario); // Restaurar tamanho original
    
    let idx = 0;
    dados.datasets.forEach((dataset) => {
        if (yPos + 8 > pageHeight - 30) {
            pdf.addPage();
            yPos = 20;
        }
        
        xPos = margemEsquerda;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(0, 0, 0);
        // Alternar cor de fundo
        const larguraTotalLinhaUsuario = larguraColunaRotulo + (larguraColunaDados * numColunas);
        if (idx % 2 === 0) {
            pdf.setFillColor(245, 245, 245);
            pdf.rect(xPos, yPos, larguraTotalLinhaUsuario, 7, 'F');
        }
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(xPos, yPos, larguraColunaRotulo, 7, 'S');
        // Ajustar tamanho do texto se necessário
        let tamanhoTextoUsuario = 8;
        if (larguraColunaRotulo < 40) {
            tamanhoTextoUsuario = 7;
        }
        pdf.setFontSize(tamanhoTextoUsuario);
        pdf.text(dataset.label.substring(0, Math.floor(larguraColunaRotulo / 2.5)), xPos + 2, yPos + 5);
        xPos += larguraColunaRotulo;
        
        dataset.data.forEach(valor => {
            if (idx % 2 === 0) {
                pdf.setFillColor(245, 245, 245);
                pdf.rect(xPos, yPos, larguraColunaDados, 7, 'F');
            }
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(xPos, yPos, larguraColunaDados, 7, 'S');
            pdf.setTextColor(0, 0, 0);
            pdf.text(valor.toString(), xPos + 2, yPos + 5);
            xPos += larguraColunaDados;
        });
        
        yPos += 7;
        idx++;
    });
    
    return yPos + 5;
}

/**
 * Adiciona tabela de dados por período ao PDF
 */
function adicionarTabelaPeriodo(pdf, dados, yPos, pageWidth, pageHeight) {
    // Verificar se há dados para mostrar
    if (!dados || !dados.labels || dados.labels.length === 0) {
        return yPos;
    }
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    
    if (yPos + 30 > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
    }
    
    pdf.text('Tabela - Produção por Período', 10, yPos);
    yPos += 7;
    
    // Salvar tamanho de fonte original
    const tamanhoFonteOriginalPeriodo = pdf.getFontSize();
    
    // Calcular largura das colunas
    const numColunas = dados.labels.length;
    const margemEsquerda = 10;
    const margemDireita = 10;
    const larguraTotalDisponivel = pageWidth - margemEsquerda - margemDireita;
    let larguraColunaRotulo = Math.max(40, larguraTotalDisponivel * 0.25);
    const larguraRestanteParaDados = larguraTotalDisponivel - larguraColunaRotulo;
    let larguraColunaDados = Math.max(
        12, // Largura mínima para meses
        larguraRestanteParaDados / numColunas
    );
    
    // Garantir que a largura total não ultrapasse os limites
    const larguraTotalCalculada = larguraColunaRotulo + (larguraColunaDados * numColunas);
    if (larguraTotalCalculada > larguraTotalDisponivel) {
        // Ajustar proporcionalmente se ultrapassar
        const fatorAjuste = larguraTotalDisponivel / larguraTotalCalculada;
        const larguraColunaDadosAjustada = larguraColunaDados * fatorAjuste;
        const larguraColunaDadosFinal = Math.max(10, larguraColunaDadosAjustada);
        const larguraColunaRotuloFinal = larguraTotalDisponivel - (larguraColunaDadosFinal * numColunas);
        
        larguraColunaRotulo = Math.max(30, larguraColunaRotuloFinal);
        larguraColunaDados = larguraColunaDadosFinal;
    }
    
    let xPos = margemEsquerda;
    
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(70, 130, 180); // Azul aço
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text('Ano', xPos + 2, yPos + 5);
    xPos += larguraColunaRotulo;
    
    dados.labels.forEach((mes, mesIdx) => {
        // Verificar se não ultrapassa a margem direita na última coluna
        const larguraColunaAtual = (mesIdx === dados.labels.length - 1) 
            ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos)
            : larguraColunaDados;
        
        pdf.setFillColor(70, 130, 180); // Azul aço
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'F');
        // Ajustar tamanho do texto se coluna muito estreita
        if (larguraColunaAtual < 12) {
            pdf.setFontSize(7);
        }
        pdf.text(mes, xPos + 2, yPos + 5);
        if (larguraColunaAtual < 12) {
            pdf.setFontSize(8); // Restaurar
        }
        xPos += larguraColunaAtual;
    });
    
    yPos += 8;
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(tamanhoFonteOriginalPeriodo); // Restaurar tamanho original
    
    let idx = 0;
    dados.datasets.forEach((dataset) => {
        if (yPos + 8 > pageHeight - 30) {
            pdf.addPage();
            yPos = 20;
        }
        
        xPos = margemEsquerda;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(0, 0, 0);
        // Alternar cor de fundo
        const larguraTotalLinhaPeriodo = larguraColunaRotulo + (larguraColunaDados * numColunas);
        if (idx % 2 === 0) {
            pdf.setFillColor(245, 245, 245);
            pdf.rect(xPos, yPos, larguraTotalLinhaPeriodo, 7, 'F');
        }
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(xPos, yPos, larguraColunaRotulo, 7, 'S');
        // Ajustar tamanho do texto se necessário
        let tamanhoTextoPeriodo = 8;
        if (larguraColunaRotulo < 35) {
            tamanhoTextoPeriodo = 7;
        }
        pdf.setFontSize(tamanhoTextoPeriodo);
        pdf.text(dataset.label, xPos + 2, yPos + 5);
        xPos += larguraColunaRotulo;
        
        dataset.data.forEach((valor, colIdx) => {
            // Verificar se não ultrapassa a margem direita
            const larguraColunaAtual = (colIdx === dataset.data.length - 1) 
                ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos)
                : larguraColunaDados;
            
            if (idx % 2 === 0) {
                pdf.setFillColor(245, 245, 245);
                pdf.rect(xPos, yPos, larguraColunaAtual, 7, 'F');
            }
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(xPos, yPos, larguraColunaAtual, 7, 'S');
            pdf.setTextColor(0, 0, 0);
            // Ajustar tamanho do texto se coluna muito estreita
            if (larguraColunaAtual < 12) {
                pdf.setFontSize(7);
            }
            pdf.text(valor.toString(), xPos + 2, yPos + 5);
            if (larguraColunaAtual < 12) {
                pdf.setFontSize(8); // Restaurar
            }
            xPos += larguraColunaAtual;
        });
        
        yPos += 7;
        idx++;
    });
    
    return yPos + 5;
}

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProducaoRelatoriosModal);
} else {
    initProducaoRelatoriosModal();
}
