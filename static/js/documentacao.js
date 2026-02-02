/**
 * Modal de Documentação - exibe README.md do Autoreg-Web e Core Autoreg
 * Renderiza Markdown com visualização profissional (marked.js)
 */

(function() {
    'use strict';

    const MODAL_ID = 'modal-documentacao';
    const TAB_WEB = 'web';
    const TAB_CORE = 'core';
    /** README do AutoReg core - raw do GitHub (público) */
    const README_CORE_URL = 'https://raw.githubusercontent.com/Mrpac6689/AutoReg/main/README.md';

    let currentTab = TAB_WEB;
    let cacheWeb = null;
    let cacheCore = null;

    function getEl(id) {
        return document.getElementById(id);
    }

    function showLoading(show) {
        const el = getEl('doc-loading');
        if (el) el.style.display = show ? 'flex' : 'none';
    }

    function showError(show, message) {
        const wrap = getEl('doc-error');
        const text = getEl('doc-error-text');
        if (wrap) wrap.style.display = show ? 'flex' : 'none';
        if (text && message) text.textContent = message;
    }

    function showView(show) {
        const el = getEl('doc-view');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    function renderMarkdown(md) {
        if (typeof marked === 'undefined') {
            return '<pre>' + (md || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
        }
        try {
            marked.setOptions({
                gfm: true,
                breaks: true
            });
            return marked.parse(md || '');
        } catch (e) {
            return '<p>Erro ao renderizar Markdown.</p><pre>' + (md || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
        }
    }

    function loadReadme(source) {
        const cache = source === TAB_WEB ? cacheWeb : cacheCore;
        if (cache !== null) {
            const view = getEl('doc-view');
            if (view) {
                view.innerHTML = renderMarkdown(cache);
                showLoading(false);
                showError(false);
                showView(true);
            }
            return;
        }

        showView(false);
        showError(false);
        showLoading(true);

        if (source === TAB_CORE) {
            fetch(README_CORE_URL)
                .then(function(res) {
                    if (!res.ok) throw new Error('Erro ao carregar README do GitHub');
                    return res.text();
                })
                .then(function(text) {
                    cacheCore = text;
                    const view = getEl('doc-view');
                    if (view) view.innerHTML = renderMarkdown(text);
                    showLoading(false);
                    showError(false);
                    showView(true);
                })
                .catch(function(err) {
                    showLoading(false);
                    showError(true, err.message || 'Erro ao carregar documentação do AutoReg core.');
                    showView(false);
                });
            return;
        }

        fetch('/api/docs/readme?source=' + encodeURIComponent(source))
            .then(function(res) {
                if (!res.ok) {
                    return res.json().then(function(data) {
                        throw new Error(data.error || 'Erro ao carregar');
                    });
                }
                return res.json();
            })
            .then(function(data) {
                if (data.error || data.content === undefined) {
                    throw new Error(data.error || 'Conteúdo não disponível');
                }
                cacheWeb = data.content;

                const view = getEl('doc-view');
                if (view) view.innerHTML = renderMarkdown(data.content);
                showLoading(false);
                showError(false);
                showView(true);
            })
            .catch(function(err) {
                showLoading(false);
                showError(true, err.message || 'Erro ao carregar documentação.');
                showView(false);
            });
    }

    function switchTab(tab) {
        currentTab = tab;
        const tabs = document.querySelectorAll('.doc-tab');
        tabs.forEach(function(t) {
            t.classList.toggle('active', t.getAttribute('data-tab') === tab);
        });
        loadReadme(tab);
    }

    function init() {
        const btnAbrir = getEl('btn-documentacao');
        const modal = getEl(MODAL_ID);
        const btnFechar = getEl('btn-fechar-documentacao');
        const btnClose = getEl('close-modal-documentacao');
        const tabWeb = getEl('doc-tab-web');
        const tabCore = getEl('doc-tab-core');

        if (btnAbrir && modal) {
            btnAbrir.addEventListener('click', function() {
                openModal(MODAL_ID);
                currentTab = TAB_WEB;
                switchTab(TAB_WEB);
            });
        }

        if (btnFechar && modal) {
            btnFechar.addEventListener('click', function() {
                closeModal(MODAL_ID);
            });
        }
        if (btnClose && modal) {
            btnClose.addEventListener('click', function() {
                closeModal(MODAL_ID);
            });
        }

        if (tabWeb) {
            tabWeb.addEventListener('click', function() {
                switchTab(TAB_WEB);
            });
        }
        if (tabCore) {
            tabCore.addEventListener('click', function() {
                switchTab(TAB_CORE);
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
                closeModal(MODAL_ID);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
