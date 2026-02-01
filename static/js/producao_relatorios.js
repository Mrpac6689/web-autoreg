/**
 * Gerenciamento do Módulo de Produção e Relatórios
 */

// Variáveis globais
let graficoModuloResumo = null;
let graficoModulo = null;
let graficoUsuario = null;
let graficoUsuarioDetalhado = null;
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
    
    atualizarGraficoModuloResumo();
    atualizarGraficoModulo();
    atualizarGraficoUsuario();
    atualizarGraficoUsuarioDetalhado();
    atualizarGraficoPeriodo();
    atualizarTextosInfoGraficos();
}

/**
 * Atualiza os textos informativos dos gráficos conforme tipo de eixo (dia vs mês)
 */
function atualizarTextosInfoGraficos() {
    const infoModulo = document.getElementById('info-text-modulo');
    const infoUsuario = document.getElementById('info-text-usuario');
    if (dadosAtuais && dadosAtuais.dados_modulo) {
        const tipo = dadosAtuais.dados_modulo.tipo_eixo || 'dia';
        if (infoModulo) {
            infoModulo.textContent = tipo === 'mes'
                ? 'Eixo X: Meses (ex: Fev/2026) | Eixo Y: Registros por módulo'
                : 'Eixo X: Dias do mês | Eixo Y: Registros por módulo';
        }
    }
    if (dadosAtuais && dadosAtuais.dados_usuario) {
        const tipo = dadosAtuais.dados_usuario.tipo_eixo || 'dia';
        if (infoUsuario) {
            infoUsuario.textContent = tipo === 'mes'
                ? 'Eixo X: Meses (ex: Fev/2026) | Eixo Y: Registros por usuário'
                : 'Eixo X: Dias do mês | Eixo Y: Registros por usuário';
        }
    }
    const infoUsuarioDetalhado = document.getElementById('info-text-usuario-detalhado');
    if (dadosAtuais && dadosAtuais.dados_usuario_detalhado) {
        const tipo = dadosAtuais.dados_usuario_detalhado.tipo_eixo || 'dia';
        if (infoUsuarioDetalhado) {
            infoUsuarioDetalhado.textContent = tipo === 'mes'
                ? 'Eixo X: Meses (ex: Fev/2026) | Módulo — Usuário'
                : 'Eixo X: Dias do mês | Módulo — Usuário';
        }
    }
}

/**
 * Formata label do eixo X: dia (número) ou mês (ex: Fev/2026)
 */
function formatarLabelEixoX(labels, tipoEixo) {
    if (tipoEixo === 'mes') {
        return labels; // já vem "Fev/2026", "Mar/2026", etc.
    }
    return labels.map(d => `Dia ${d}`);
}

/**
 * Atualiza gráfico de produção por módulo (resumo: total por módulo, sem usuário)
 */
function atualizarGraficoModuloResumo() {
    const ctx = document.getElementById('grafico-modulo-resumo');
    if (!ctx || !dadosAtuais.dados_modulo_resumo) return;
    
    const dados = dadosAtuais.dados_modulo_resumo;
    if (!dados.labels || dados.labels.length === 0) return;
    
    if (graficoModuloResumo) {
        graficoModuloResumo.destroy();
    }
    
    graficoModuloResumo = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dados.labels,
            datasets: [{
                label: 'Total no período',
                data: dados.data,
                backgroundColor: dados.data.map((_, i) => coresGraficos[i % coresGraficos.length]),
                borderColor: dados.data.map((_, i) => coresGraficos[i % coresGraficos.length].replace('0.8', '1')),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
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
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y: {
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        }
    });
}

/**
 * Atualiza gráfico de produção por módulo (detalhada: dia/mês x módulo)
 */
function atualizarGraficoModulo() {
    const ctx = document.getElementById('grafico-modulo');
    if (!ctx || !dadosAtuais.dados_modulo) return;
    
    const dados = dadosAtuais.dados_modulo;
    const tipoEixo = dados.tipo_eixo || 'dia';
    const labelsFormatados = formatarLabelEixoX(dados.labels, tipoEixo);
    
    if (graficoModulo) {
        graficoModulo.destroy();
    }
    
    graficoModulo = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsFormatados,
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
    const tipoEixo = dados.tipo_eixo || 'dia';
    const labelsFormatados = formatarLabelEixoX(dados.labels, tipoEixo);
    
    if (graficoUsuario) {
        graficoUsuario.destroy();
    }
    
    graficoUsuario = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsFormatados,
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
 * Atualiza gráfico de produção detalhada por usuário (módulo x usuário, eixo X = dias/meses)
 */
function atualizarGraficoUsuarioDetalhado() {
    const ctx = document.getElementById('grafico-usuario-detalhado');
    if (!ctx || !dadosAtuais.dados_usuario_detalhado) return;
    
    const dados = dadosAtuais.dados_usuario_detalhado;
    const tipoEixo = dados.tipo_eixo || 'dia';
    const labelsFormatados = formatarLabelEixoX(dados.labels, tipoEixo);
    
    if (graficoUsuarioDetalhado) {
        graficoUsuarioDetalhado.destroy();
    }
    
    graficoUsuarioDetalhado = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsFormatados,
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
                        font: { size: 11 }
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
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y: {
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
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
 * Cria um gráfico temporário para PDF.
 * Retorna { imageData, width, height } em pixels para preservar proporção ao inserir no PDF.
 */
function criarGraficoPDF(tipo, dados, titulo, width = 1000, height = 500) {
    return new Promise((resolve) => {
        const numLabels = dados.labels.length;
        const larguraMinima = 800;
        const larguraPorLabel = 28;
        const larguraCalculada = Math.max(larguraMinima, Math.min(1200, numLabels * larguraPorLabel));
        const alturaCanvas = 420;
        
        const canvas = document.createElement('canvas');
        canvas.width = larguraCalculada;
        canvas.height = alturaCanvas;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, larguraCalculada, alturaCanvas);
        
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
        
        setTimeout(() => {
            try {
                const imageData = canvas.toDataURL('image/png', 1.0);
                chart.destroy();
                resolve({
                    imageData,
                    width: larguraCalculada,
                    height: alturaCanvas
                });
            } catch (e) {
                console.error('Erro ao converter gráfico:', e);
                chart.destroy();
                resolve(null);
            }
        }, 1000);
    });
}

/** Largura útil da página em mm (A4). */
const PDF_PAGE_WIDTH_MM = 210;
/** Altura máxima para um gráfico no PDF (mm) para caber na página. */
const PDF_GRAFICO_ALTURA_MAX_MM = 95;

/**
 * Insere imagem do gráfico no PDF preservando proporção (evita esticado/achatado).
 */
function inserirGraficoNoPDF(pdf, resultado, yPos, pageWidth, pageHeight) {
    if (!resultado || !resultado.imageData) return yPos;
    const larguraPdf = pageWidth - 20;
    const aspect = resultado.width / resultado.height;
    let alturaPdf = larguraPdf / aspect;
    if (alturaPdf > PDF_GRAFICO_ALTURA_MAX_MM) alturaPdf = PDF_GRAFICO_ALTURA_MAX_MM;
    if (yPos + alturaPdf > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
    }
    pdf.addImage(resultado.imageData, 'PNG', 10, yPos, larguraPdf, alturaPdf);
    return yPos + alturaPdf + 10;
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
        
        // Gráfico 1: Produção por Módulo (resumo: total por módulo)
        if (dadosAtuais.dados_modulo_resumo && dadosAtuais.dados_modulo_resumo.labels.length > 0) {
            const resumo = dadosAtuais.dados_modulo_resumo;
            const dadosResumoPDF = {
                labels: resumo.labels,
                datasets: [{
                    label: 'Total',
                    data: resumo.data,
                    backgroundColor: resumo.data.map((_, i) => coresPDF[i % coresPDF.length]),
                    borderColor: resumo.data.map((_, i) => coresPDF[i % coresPDF.length]),
                    borderWidth: 2
                }]
            };
            const resultadoResumo = await criarGraficoPDF('bar', dadosResumoPDF, 'Produção por Módulo');
            if (resultadoResumo) {
                yPos = inserirGraficoNoPDF(pdf, resultadoResumo, yPos, pageWidth, pageHeight);
            }
            yPos = adicionarTabelaModuloResumo(pdf, resumo, yPos, pageWidth, pageHeight);
        }
        
        // Gráfico 2: Produção Detalhada por Módulo
        if (dadosAtuais.dados_modulo && dadosAtuais.dados_modulo.datasets.length > 0) {
            const dadosModuloFiltrados = filtrarDadosComProducao(dadosAtuais.dados_modulo);
            
            if (dadosModuloFiltrados.labels.length > 0) {
                const tipoEixoMod = dadosAtuais.dados_modulo.tipo_eixo || 'dia';
                const dadosModuloPDF = {
                    labels: formatarLabelEixoX(dadosModuloFiltrados.labels, tipoEixoMod),
                    datasets: dadosModuloFiltrados.datasets.map((ds, idx) => ({
                        label: ds.label,
                        data: ds.data,
                        backgroundColor: coresPDF[idx % coresPDF.length],
                        borderColor: coresPDF[idx % coresPDF.length],
                        borderWidth: 2
                    }))
                };
                
                const resultadoModulo = await criarGraficoPDF('bar', dadosModuloPDF, 'Produção Detalhada por Módulo');
                if (resultadoModulo) {
                    yPos = inserirGraficoNoPDF(pdf, resultadoModulo, yPos, pageWidth, pageHeight);
                }
                yPos = adicionarTabelaModulo(pdf, dadosModuloFiltrados, yPos, pageWidth, pageHeight);
            }
        }
        
        // Gráfico 3: Produção por Usuário
        if (dadosAtuais.dados_usuario && dadosAtuais.dados_usuario.datasets.length > 0) {
            // Filtrar dados para mostrar apenas dias com produção
            const dadosUsuarioFiltrados = filtrarDadosComProducao(dadosAtuais.dados_usuario);
            
            if (dadosUsuarioFiltrados.labels.length > 0) {
                if (yPos + 100 > pageHeight - 30) {
                    pdf.addPage();
                    yPos = 20;
                }
                
                const tipoEixoUsr = dadosAtuais.dados_usuario.tipo_eixo || 'dia';
                const dadosUsuarioPDF = {
                    labels: formatarLabelEixoX(dadosUsuarioFiltrados.labels, tipoEixoUsr),
                    datasets: dadosUsuarioFiltrados.datasets.map((ds, idx) => ({
                        label: ds.label,
                        data: ds.data,
                        backgroundColor: coresPDF[idx % coresPDF.length],
                        borderColor: coresPDF[idx % coresPDF.length],
                        borderWidth: 2
                    }))
                };
                
                const resultadoUsuario = await criarGraficoPDF('bar', dadosUsuarioPDF, 'Produção por Usuário');
                if (resultadoUsuario) {
                    yPos = inserirGraficoNoPDF(pdf, resultadoUsuario, yPos, pageWidth, pageHeight);
                }
                
                // Tabela de dados por usuário (apenas dias com produção)
                yPos = adicionarTabelaUsuario(pdf, dadosUsuarioFiltrados, yPos, pageWidth, pageHeight);
            }
        }
        
        // Gráfico 4: Produção Detalhada por Usuário (módulo x usuário, eixo X = dias/meses)
        if (dadosAtuais.dados_usuario_detalhado && dadosAtuais.dados_usuario_detalhado.datasets.length > 0) {
            const dadosUsuarioDetFiltrados = filtrarDadosComProducao(dadosAtuais.dados_usuario_detalhado);
            if (dadosUsuarioDetFiltrados.labels.length > 0) {
                if (yPos + 100 > pageHeight - 30) {
                    pdf.addPage();
                    yPos = 20;
                }
                const tipoEixoDet = dadosAtuais.dados_usuario_detalhado.tipo_eixo || 'dia';
                const dadosUsuarioDetPDF = {
                    labels: formatarLabelEixoX(dadosUsuarioDetFiltrados.labels, tipoEixoDet),
                    datasets: dadosUsuarioDetFiltrados.datasets.map((ds, idx) => ({
                        label: ds.label,
                        data: ds.data,
                        backgroundColor: coresPDF[idx % coresPDF.length],
                        borderColor: coresPDF[idx % coresPDF.length],
                        borderWidth: 2
                    }))
                };
                const resultadoUsuarioDet = await criarGraficoPDF('bar', dadosUsuarioDetPDF, 'Produção Detalhada por Usuário');
                if (resultadoUsuarioDet) {
                    yPos = inserirGraficoNoPDF(pdf, resultadoUsuarioDet, yPos, pageWidth, pageHeight);
                }
                yPos = adicionarTabelaUsuarioDetalhado(pdf, dadosUsuarioDetFiltrados, yPos, pageWidth, pageHeight);
            }
        }
        
        // Gráfico 5: Produção por Período
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
                
                const resultadoPeriodo = await criarGraficoPDF('bar', dadosPeriodoPDF, 'Produção por Período');
                if (resultadoPeriodo) {
                    yPos = inserirGraficoNoPDF(pdf, resultadoPeriodo, yPos, pageWidth, pageHeight);
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
 * Adiciona tabela resumo Módulo | Total ao PDF (Produção por Módulo)
 */
function adicionarTabelaModuloResumo(pdf, dados, yPos, pageWidth, pageHeight) {
    if (!dados || !dados.labels || dados.labels.length === 0) return yPos;
    
    if (yPos + 40 > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
    }
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Tabela - Produção por Módulo', 10, yPos);
    yPos += 7;
    
    const margemEsquerda = 10;
    const margemDireita = 10;
    const larguraTotalDisponivel = pageWidth - margemEsquerda - margemDireita;
    const larguraColunaRotulo = Math.max(80, larguraTotalDisponivel * 0.6);
    const larguraColunaTotal = larguraTotalDisponivel - larguraColunaRotulo;
    let xPos = margemEsquerda;
    
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(70, 130, 180);
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'F');
    pdf.rect(xPos + larguraColunaRotulo, yPos, larguraColunaTotal, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text('Módulo', xPos + 2, yPos + 5);
    pdf.text('Total', xPos + larguraColunaRotulo + 2, yPos + 5);
    yPos += 8;
    pdf.setTextColor(0, 0, 0);
    
    const totalGeral = dados.data.reduce((a, b) => a + b, 0);
    dados.labels.forEach((label, idx) => {
        if (yPos + 8 > pageHeight - 30) {
            pdf.addPage();
            yPos = 20;
        }
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);
        if (idx % 2 === 0) {
            pdf.setFillColor(248, 248, 248);
            pdf.rect(xPos, yPos, larguraColunaRotulo + larguraColunaTotal, 7, 'F');
        }
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(xPos, yPos, larguraColunaRotulo, 7, 'S');
        pdf.rect(xPos + larguraColunaRotulo, yPos, larguraColunaTotal, 7, 'S');
        pdf.text(label.substring(0, Math.floor(larguraColunaRotulo / 2.5)), xPos + 2, yPos + 5);
        pdf.text(String(dados.data[idx]), xPos + larguraColunaRotulo + 2, yPos + 5);
        yPos += 7;
    });
    
    if (yPos + 8 > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(240, 240, 240);
    pdf.rect(xPos, yPos, larguraColunaRotulo + larguraColunaTotal, 8, 'F');
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'S');
    pdf.rect(xPos + larguraColunaRotulo, yPos, larguraColunaTotal, 8, 'S');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Total', xPos + 2, yPos + 5);
    pdf.text(String(totalGeral), xPos + larguraColunaRotulo + 2, yPos + 5);
    yPos += 8 + 5;
    
    return yPos;
}

/**
 * Adiciona tabela de dados por módulo (detalhada) ao PDF, com totais de linhas e colunas
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
    
    pdf.text('Tabela - Produção Detalhada por Módulo', 10, yPos);
    yPos += 7;
    
    // Salvar tamanho de fonte original
    const tamanhoFonteOriginal = pdf.getFontSize();
    
    // Coluna extra para Total da linha
    const numColunas = dados.labels.length;
    const numColunasComTotal = numColunas + 1;
    const margemEsquerda = 10;
    const margemDireita = 10;
    const larguraTotalDisponivel = pageWidth - margemEsquerda - margemDireita;
    let larguraColunaRotulo = Math.max(50, larguraTotalDisponivel * 0.28);
    const larguraRestanteParaDados = larguraTotalDisponivel - larguraColunaRotulo;
    let larguraColunaDados = Math.max(
        12,
        larguraRestanteParaDados / numColunasComTotal
    );
    const larguraColunaTotalLinha = larguraColunaDados;
    let larguraTotalCalculada = larguraColunaRotulo + (larguraColunaDados * numColunasComTotal);
    if (larguraTotalCalculada > larguraTotalDisponivel) {
        const fatorAjuste = larguraTotalDisponivel / larguraTotalCalculada;
        larguraColunaDados = Math.max(10, larguraColunaDados * fatorAjuste);
        larguraColunaRotulo = Math.max(40, larguraTotalDisponivel - (larguraColunaDados * numColunasComTotal));
    }
    
    const totaisColunas = dados.labels.map((_, j) => dados.datasets.reduce((s, ds) => s + (ds.data[j] || 0), 0));
    const totalGeralMod = dados.datasets.reduce((s, ds) => s + ds.data.reduce((a, b) => a + b, 0), 0);
    
    let xPos = margemEsquerda;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(70, 130, 180);
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text('Módulo', xPos + 2, yPos + 5);
    xPos += larguraColunaRotulo;
    
    dados.labels.forEach((dia, diaIdx) => {
        const larguraColunaAtual = (diaIdx === dados.labels.length - 1)
            ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos - larguraColunaTotalLinha)
            : larguraColunaDados;
        pdf.setFillColor(70, 130, 180);
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'F');
        const labelTexto = typeof dia === 'number' ? `Dia ${dia}` : dia;
        pdf.text(labelTexto.length > 8 ? labelTexto.substring(0, 8) : labelTexto, xPos + 2, yPos + 5);
        xPos += larguraColunaAtual;
    });
    pdf.setFillColor(70, 130, 180);
    pdf.rect(xPos, yPos, larguraColunaTotalLinha, 8, 'F');
    pdf.text('Total', xPos + 2, yPos + 5);
    xPos += larguraColunaTotalLinha;
    yPos += 8;
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(tamanhoFonteOriginal);
    
    dados.datasets.forEach((dataset, idx) => {
        if (yPos + 8 > pageHeight - 30) {
            pdf.addPage();
            yPos = 20;
        }
        xPos = margemEsquerda;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(0, 0, 0);
        const rowTotal = dataset.data.reduce((a, b) => a + b, 0);
        const larguraTotalLinha = larguraColunaRotulo + (larguraColunaDados * numColunas) + larguraColunaTotalLinha;
        if (idx % 2 === 0) {
            pdf.setFillColor(248, 248, 248);
            pdf.rect(xPos, yPos, larguraTotalLinha, 7, 'F');
        }
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(xPos, yPos, larguraColunaRotulo, 7, 'S');
        pdf.text(dataset.label.substring(0, Math.floor(larguraColunaRotulo / 2.5)), xPos + 2, yPos + 5);
        xPos += larguraColunaRotulo;
        
        dataset.data.forEach((valor, colIdx) => {
            const larguraColunaAtual = (colIdx === dataset.data.length - 1)
                ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos - larguraColunaTotalLinha)
                : larguraColunaDados;
            if (idx % 2 === 0) {
                pdf.setFillColor(248, 248, 248);
                pdf.rect(xPos, yPos, larguraColunaAtual, 7, 'F');
            }
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(xPos, yPos, larguraColunaAtual, 7, 'S');
            pdf.setTextColor(0, 0, 0);
            pdf.text(valor.toString(), xPos + 2, yPos + 5);
            xPos += larguraColunaAtual;
        });
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(xPos, yPos, larguraColunaTotalLinha, 7, 'S');
        if (idx % 2 === 0) {
            pdf.setFillColor(248, 248, 248);
            pdf.rect(xPos, yPos, larguraColunaTotalLinha, 7, 'F');
        }
        pdf.setTextColor(0, 0, 0);
        pdf.text(rowTotal.toString(), xPos + 2, yPos + 5);
        yPos += 7;
    });
    
    if (yPos + 8 > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
    }
    pdf.setFont('helvetica', 'bold');
    xPos = margemEsquerda;
    pdf.setFillColor(240, 240, 240);
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'F');
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'S');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Total', xPos + 2, yPos + 5);
    xPos += larguraColunaRotulo;
    totaisColunas.forEach((tc, colIdx) => {
        const larguraColunaAtual = (colIdx === totaisColunas.length - 1)
            ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos - larguraColunaTotalLinha)
            : larguraColunaDados;
        pdf.setFillColor(240, 240, 240);
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'F');
        pdf.setDrawColor(180, 180, 180);
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'S');
        pdf.setTextColor(0, 0, 0);
        pdf.text(tc.toString(), xPos + 2, yPos + 5);
        xPos += larguraColunaAtual;
    });
    pdf.setFillColor(240, 240, 240);
    pdf.rect(xPos, yPos, larguraColunaTotalLinha, 8, 'F');
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(xPos, yPos, larguraColunaTotalLinha, 8, 'S');
    pdf.setTextColor(0, 0, 0);
    pdf.text(totalGeralMod.toString(), xPos + 2, yPos + 5);
    yPos += 8 + 5;
    
    return yPos;
}

/**
 * Adiciona tabela de dados por usuário ao PDF, com totais de linhas e colunas.
 * Opcional: titulo e rotuloColuna para reutilizar na tabela "Detalhada por Usuário".
 */
function adicionarTabelaUsuario(pdf, dados, yPos, pageWidth, pageHeight, titulo, rotuloColuna) {
    if (!dados || !dados.labels || dados.labels.length === 0) return yPos;
    if (titulo === undefined) titulo = 'Tabela - Produção por Usuário';
    if (rotuloColuna === undefined) rotuloColuna = 'Usuário';
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    if (yPos + 30 > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
    }
    pdf.text(titulo, 10, yPos);
    yPos += 7;
    
    const tamanhoFonteOriginalUsuario = pdf.getFontSize();
    const numColunas = dados.labels.length;
    const numColunasComTotal = numColunas + 1;
    const margemEsquerda = 10;
    const margemDireita = 10;
    const larguraTotalDisponivel = pageWidth - margemEsquerda - margemDireita;
    let larguraColunaRotulo = Math.max(50, larguraTotalDisponivel * 0.28);
    const larguraRestanteParaDados = larguraTotalDisponivel - larguraColunaRotulo;
    let larguraColunaDados = Math.max(12, larguraRestanteParaDados / numColunasComTotal);
    const larguraColunaTotalLinha = larguraColunaDados;
    let larguraTotalCalculada = larguraColunaRotulo + (larguraColunaDados * numColunasComTotal);
    if (larguraTotalCalculada > larguraTotalDisponivel) {
        const fatorAjuste = larguraTotalDisponivel / larguraTotalCalculada;
        larguraColunaDados = Math.max(10, larguraColunaDados * fatorAjuste);
        larguraColunaRotulo = Math.max(40, larguraTotalDisponivel - (larguraColunaDados * numColunasComTotal));
    }
    
    const totaisColunasUsr = dados.labels.map((_, j) => dados.datasets.reduce((s, ds) => s + (ds.data[j] || 0), 0));
    const totalGeralUsr = dados.datasets.reduce((s, ds) => s + ds.data.reduce((a, b) => a + b, 0), 0);
    
    let xPos = margemEsquerda;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(70, 130, 180);
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text(rotuloColuna, xPos + 2, yPos + 5);
    xPos += larguraColunaRotulo;
    
    dados.labels.forEach((dia, diaIdx) => {
        const larguraColunaAtual = (diaIdx === dados.labels.length - 1)
            ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos - larguraColunaTotalLinha)
            : larguraColunaDados;
        pdf.setFillColor(70, 130, 180);
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'F');
        const labelTexto = typeof dia === 'number' ? `Dia ${dia}` : dia;
        pdf.text((labelTexto + '').length > 8 ? (labelTexto + '').substring(0, 8) : labelTexto, xPos + 2, yPos + 5);
        xPos += larguraColunaAtual;
    });
    pdf.setFillColor(70, 130, 180);
    pdf.rect(xPos, yPos, larguraColunaTotalLinha, 8, 'F');
    pdf.text('Total', xPos + 2, yPos + 5);
    xPos += larguraColunaTotalLinha;
    yPos += 8;
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(tamanhoFonteOriginalUsuario);
    
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
        const rowTotal = dataset.data.reduce((a, b) => a + b, 0);
        const larguraTotalLinhaUsuario = larguraColunaRotulo + (larguraColunaDados * numColunas) + larguraColunaTotalLinha;
        if (idx % 2 === 0) {
            pdf.setFillColor(248, 248, 248);
            pdf.rect(xPos, yPos, larguraTotalLinhaUsuario, 7, 'F');
        }
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(xPos, yPos, larguraColunaRotulo, 7, 'S');
        pdf.text(dataset.label.substring(0, Math.floor(larguraColunaRotulo / 2.5)), xPos + 2, yPos + 5);
        xPos += larguraColunaRotulo;
        
        dataset.data.forEach((valor, colIdx) => {
            const larguraColunaAtual = (colIdx === dataset.data.length - 1)
                ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos - larguraColunaTotalLinha)
                : larguraColunaDados;
            if (idx % 2 === 0) {
                pdf.setFillColor(248, 248, 248);
                pdf.rect(xPos, yPos, larguraColunaAtual, 7, 'F');
            }
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(xPos, yPos, larguraColunaAtual, 7, 'S');
            pdf.setTextColor(0, 0, 0);
            pdf.text(valor.toString(), xPos + 2, yPos + 5);
            xPos += larguraColunaAtual;
        });
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(xPos, yPos, larguraColunaTotalLinha, 7, 'S');
        if (idx % 2 === 0) {
            pdf.setFillColor(248, 248, 248);
            pdf.rect(xPos, yPos, larguraColunaTotalLinha, 7, 'F');
        }
        pdf.setTextColor(0, 0, 0);
        pdf.text(rowTotal.toString(), xPos + 2, yPos + 5);
        yPos += 7;
        idx++;
    });
    
    if (yPos + 8 > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
    }
    pdf.setFont('helvetica', 'bold');
    xPos = margemEsquerda;
    pdf.setFillColor(240, 240, 240);
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'F');
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'S');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Total', xPos + 2, yPos + 5);
    xPos += larguraColunaRotulo;
    totaisColunasUsr.forEach((tc, colIdx) => {
        const larguraColunaAtual = (colIdx === totaisColunasUsr.length - 1)
            ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos - larguraColunaTotalLinha)
            : larguraColunaDados;
        pdf.setFillColor(240, 240, 240);
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'F');
        pdf.setDrawColor(180, 180, 180);
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'S');
        pdf.setTextColor(0, 0, 0);
        pdf.text(tc.toString(), xPos + 2, yPos + 5);
        xPos += larguraColunaAtual;
    });
    pdf.setFillColor(240, 240, 240);
    pdf.rect(xPos, yPos, larguraColunaTotalLinha, 8, 'F');
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(xPos, yPos, larguraColunaTotalLinha, 8, 'S');
    pdf.setTextColor(0, 0, 0);
    pdf.text(totalGeralUsr.toString(), xPos + 2, yPos + 5);
    yPos += 8 + 5;
    
    return yPos;
}

/**
 * Adiciona tabela de Produção Detalhada por Usuário (módulo x usuário, dias no eixo)
 */
function adicionarTabelaUsuarioDetalhado(pdf, dados, yPos, pageWidth, pageHeight) {
    return adicionarTabelaUsuario(
        pdf, dados, yPos, pageWidth, pageHeight,
        'Tabela - Produção Detalhada por Usuário',
        'Módulo — Usuário'
    );
}

/**
 * Adiciona tabela de dados por período ao PDF, com totais de linhas e colunas
 */
function adicionarTabelaPeriodo(pdf, dados, yPos, pageWidth, pageHeight) {
    if (!dados || !dados.labels || dados.labels.length === 0) return yPos;
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    if (yPos + 30 > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
    }
    pdf.text('Tabela - Produção por Período', 10, yPos);
    yPos += 7;
    
    const tamanhoFonteOriginalPeriodo = pdf.getFontSize();
    const numColunas = dados.labels.length;
    const numColunasComTotal = numColunas + 1;
    const margemEsquerda = 10;
    const margemDireita = 10;
    const larguraTotalDisponivel = pageWidth - margemEsquerda - margemDireita;
    let larguraColunaRotulo = Math.max(40, larguraTotalDisponivel * 0.22);
    const larguraRestanteParaDados = larguraTotalDisponivel - larguraColunaRotulo;
    let larguraColunaDados = Math.max(10, larguraRestanteParaDados / numColunasComTotal);
    const larguraColunaTotalLinha = larguraColunaDados;
    let larguraTotalCalculada = larguraColunaRotulo + (larguraColunaDados * numColunasComTotal);
    if (larguraTotalCalculada > larguraTotalDisponivel) {
        const fatorAjuste = larguraTotalDisponivel / larguraTotalCalculada;
        larguraColunaDados = Math.max(8, larguraColunaDados * fatorAjuste);
        larguraColunaRotulo = Math.max(30, larguraTotalDisponivel - (larguraColunaDados * numColunasComTotal));
    }
    
    const totaisColunasPeriodo = dados.labels.map((_, j) => dados.datasets.reduce((s, ds) => s + (ds.data[j] || 0), 0));
    const totalGeralPeriodo = dados.datasets.reduce((s, ds) => s + ds.data.reduce((a, b) => a + b, 0), 0);
    
    let xPos = margemEsquerda;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(70, 130, 180);
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text('Série', xPos + 2, yPos + 5);
    xPos += larguraColunaRotulo;
    
    dados.labels.forEach((mes, mesIdx) => {
        const larguraColunaAtual = (mesIdx === dados.labels.length - 1)
            ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos - larguraColunaTotalLinha)
            : larguraColunaDados;
        pdf.setFillColor(70, 130, 180);
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'F');
        pdf.text((mes + '').length > 10 ? (mes + '').substring(0, 10) : mes, xPos + 2, yPos + 5);
        xPos += larguraColunaAtual;
    });
    pdf.setFillColor(70, 130, 180);
    pdf.rect(xPos, yPos, larguraColunaTotalLinha, 8, 'F');
    pdf.text('Total', xPos + 2, yPos + 5);
    xPos += larguraColunaTotalLinha;
    yPos += 8;
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(tamanhoFonteOriginalPeriodo);
    
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
        const rowTotal = dataset.data.reduce((a, b) => a + b, 0);
        const larguraTotalLinhaPeriodo = larguraColunaRotulo + (larguraColunaDados * numColunas) + larguraColunaTotalLinha;
        if (idx % 2 === 0) {
            pdf.setFillColor(248, 248, 248);
            pdf.rect(xPos, yPos, larguraTotalLinhaPeriodo, 7, 'F');
        }
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(xPos, yPos, larguraColunaRotulo, 7, 'S');
        pdf.text(dataset.label, xPos + 2, yPos + 5);
        xPos += larguraColunaRotulo;
        
        dataset.data.forEach((valor, colIdx) => {
            const larguraColunaAtual = (colIdx === dataset.data.length - 1)
                ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos - larguraColunaTotalLinha)
                : larguraColunaDados;
            if (idx % 2 === 0) {
                pdf.setFillColor(248, 248, 248);
                pdf.rect(xPos, yPos, larguraColunaAtual, 7, 'F');
            }
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(xPos, yPos, larguraColunaAtual, 7, 'S');
            pdf.setTextColor(0, 0, 0);
            pdf.text(valor.toString(), xPos + 2, yPos + 5);
            xPos += larguraColunaAtual;
        });
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(xPos, yPos, larguraColunaTotalLinha, 7, 'S');
        if (idx % 2 === 0) {
            pdf.setFillColor(248, 248, 248);
            pdf.rect(xPos, yPos, larguraColunaTotalLinha, 7, 'F');
        }
        pdf.setTextColor(0, 0, 0);
        pdf.text(rowTotal.toString(), xPos + 2, yPos + 5);
        yPos += 7;
        idx++;
    });
    
    if (yPos + 8 > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
    }
    pdf.setFont('helvetica', 'bold');
    xPos = margemEsquerda;
    pdf.setFillColor(240, 240, 240);
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'F');
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(xPos, yPos, larguraColunaRotulo, 8, 'S');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Total', xPos + 2, yPos + 5);
    xPos += larguraColunaRotulo;
    totaisColunasPeriodo.forEach((tc, colIdx) => {
        const larguraColunaAtual = (colIdx === totaisColunasPeriodo.length - 1)
            ? Math.min(larguraColunaDados, pageWidth - margemDireita - xPos - larguraColunaTotalLinha)
            : larguraColunaDados;
        pdf.setFillColor(240, 240, 240);
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'F');
        pdf.setDrawColor(180, 180, 180);
        pdf.rect(xPos, yPos, larguraColunaAtual, 8, 'S');
        pdf.setTextColor(0, 0, 0);
        pdf.text(tc.toString(), xPos + 2, yPos + 5);
        xPos += larguraColunaAtual;
    });
    pdf.setFillColor(240, 240, 240);
    pdf.rect(xPos, yPos, larguraColunaTotalLinha, 8, 'F');
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(xPos, yPos, larguraColunaTotalLinha, 8, 'S');
    pdf.setTextColor(0, 0, 0);
    pdf.text(totalGeralPeriodo.toString(), xPos + 2, yPos + 5);
    yPos += 8 + 5;
    
    return yPos;
}

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProducaoRelatoriosModal);
} else {
    initProducaoRelatoriosModal();
}
