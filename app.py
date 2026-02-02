"""
AUTOREG - Sistema Automatizado de operações G-HOSP e SISREG
Aplicação Flask principal
"""

from flask import Flask, render_template, request, jsonify, Response, send_file, session, redirect, url_for, make_response
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from datetime import datetime
import csv
import os
import json
import re
import subprocess
import threading
import time
import select
from pathlib import Path
import requests
from urllib3.exceptions import InsecureRequestWarning
import warnings
import websocket
import base64
from urllib.parse import urlparse, urljoin, quote as url_quote, unquote
import zipfile
import tempfile
import calendar
from config import WORKDIR, PYTHONPATH, AUTOREGPATH, CORE_README_PATH, DOCKER_CONTAINER, USE_DOCKER, SECRET_KEY
from auth import autenticar, listar_usuarios, adicionar_usuario, remover_usuario, alterar_senha, usuario_existe, obter_usuario_por_chave_api, gerar_chaves_para_usuarios_existentes

# Desabilitar avisos de SSL não verificado
warnings.filterwarnings('ignore', category=InsecureRequestWarning)

app = Flask(__name__)
# Carregar SECRET_KEY do arquivo env (gerado automaticamente ou definido manualmente)
# Se não estiver definido, usa uma chave padrão (NÃO RECOMENDADO PARA PRODUÇÃO)
if SECRET_KEY:
    app.config['SECRET_KEY'] = SECRET_KEY
else:
    import warnings
    warnings.warn("SECRET_KEY não definido no arquivo env! Usando chave padrão insegura. Configure SECRET_KEY no arquivo env para produção.")
    app.config['SECRET_KEY'] = 'autoreg-secret-key-change-in-production'
# Configurar cookie de sessão para compartilhar entre subdomínios
app.config['SESSION_COOKIE_DOMAIN'] = '.michelpaes.com.br'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True  # Apenas HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
# Cookie de sessão expira quando o navegador é fechado (session cookie, sem max_age)

# Função para adicionar headers CORS
def adicionar_cors_headers(response):
    """Adiciona headers CORS para permitir requisições de extensões Chrome"""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Cookie'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

# Função auxiliar para criar resposta JSON com CORS
def jsonify_with_cors(data, status_code=200):
    """Cria resposta JSON com headers CORS"""
    response = jsonify(data)
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response, status_code

# Aplicar CORS a todas as respostas
app.after_request(adicionar_cors_headers)

# Gerar chaves de API para usuários existentes na inicialização
# Isso garante que todos os usuários tenham chaves, mesmo os criados antes desta funcionalidade
try:
    resultado = gerar_chaves_para_usuarios_existentes()
    if resultado['geradas'] > 0:
        print(f"[INFO] Geradas {resultado['geradas']} chaves de API para usuários existentes")
except Exception as e:
    print(f"[AVISO] Erro ao gerar chaves de API: {e}")

# Configurar Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Por favor, faça login para acessar esta página.'
login_manager.login_message_category = 'info'


# Classe de usuário para Flask-Login
class User(UserMixin):
    def __init__(self, username, nome):
        self.id = username
        self.username = username
        self.nome = nome


@login_manager.user_loader
def load_user(username):
    """Carrega usuário para Flask-Login"""
    usuarios = listar_usuarios()
    for user_data in usuarios:
        if user_data['username'] == username and user_data.get('ativo', True):
            return User(user_data['username'], user_data.get('nome', user_data['username']))
    return None

# Configurações de caminho do arquivo env
app.config['WORKDIR'] = WORKDIR
app.config['PYTHONPATH'] = PYTHONPATH
app.config['AUTOREGPATH'] = AUTOREGPATH
app.config['DOCKER_CONTAINER'] = DOCKER_CONTAINER
app.config['USE_DOCKER'] = USE_DOCKER

# Armazenar processos em execução (usando thread-safe dict)
processos_ativos = {}
# Armazenar stdin dos processos para permitir interação
processos_stdin = {}
# Armazenar queues para comunicação entre threads de leitura de stdout
processos_queues = {}
# Armazenar informações sobre os processos (comando, tipo, etc)
processos_info = {}
import threading
import queue
processos_lock = threading.Lock()


def limpar_processos_finalizados():
    """Remove processos que realmente terminaram do dicionário"""
    with processos_lock:
        processos_para_remover = []
        for session_id, processo in processos_ativos.items():
            try:
                if processo.poll() is not None:
                    # Processo realmente terminou
                    processos_para_remover.append(session_id)
            except (ProcessLookupError, AttributeError):
                # Processo não existe mais
                processos_para_remover.append(session_id)
        
        for session_id in processos_para_remover:
            print(f"[DEBUG] Removendo processo finalizado: {session_id}")
            if session_id in processos_ativos:
                del processos_ativos[session_id]
            if session_id in processos_stdin:
                del processos_stdin[session_id]
            if session_id in processos_queues:
                del processos_queues[session_id]
            if session_id in processos_info:
                del processos_info[session_id]


def verificar_container_docker():
    """Verifica se o container Docker está acessível"""
    if not DOCKER_CONTAINER:
        return False, "Container Docker não configurado"
    
    try:
        resultado = subprocess.run(
            ['docker', 'ps', '--filter', f'name={DOCKER_CONTAINER}', '--format', '{{.Names}}'],
            capture_output=True,
            text=True,
            timeout=5
        )
        container_rodando = DOCKER_CONTAINER in resultado.stdout
        return container_rodando, "Container acessível" if container_rodando else "Container não está rodando"
    except Exception as e:
        return False, f"Erro ao verificar container: {str(e)}"


def obter_ip_container():
    """Obtém o IP do container Docker"""
    if not DOCKER_CONTAINER:
        return None
    
    try:
        resultado = subprocess.run(
            ['docker', 'inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', DOCKER_CONTAINER],
            capture_output=True,
            text=True,
            timeout=5
        )
        if resultado.returncode == 0 and resultado.stdout.strip():
            return resultado.stdout.strip()
    except Exception as e:
        print(f"Erro ao obter IP do container: {e}")
    
    return None


def construir_comando_docker(comando_original):
    """
    Constrói comando para executar dentro do container Docker
    
    Args:
        comando_original: Lista com o comando original [python, script.py, args...]
    
    Returns:
        Lista com comando Docker: ['docker', 'exec', container, 'python', 'script.py', args...]
        ou comando original se Docker estiver desabilitado
    """
    if not USE_DOCKER or not DOCKER_CONTAINER:
        # Se Docker está desabilitado ou não há container configurado, retorna comando original
        return comando_original
    
    # Comando Docker: docker exec <container> <comando>
    # Nota: O caminho do AUTOREGPATH dentro do container pode ser diferente
    # Se necessário, ajustar o caminho aqui
    comando_docker = ['docker', 'exec', DOCKER_CONTAINER] + comando_original
    return comando_docker


# Verificar container Docker na inicialização (apenas se USE_DOCKER estiver ativado)
if USE_DOCKER and DOCKER_CONTAINER:
    container_ok, mensagem = verificar_container_docker()
    if container_ok:
        print(f"✓ Container Docker '{DOCKER_CONTAINER}' está acessível")
    else:
        print(f"⚠ Aviso: Container Docker '{DOCKER_CONTAINER}' não está acessível: {mensagem}")
        print("   Os comandos podem falhar se o container não estiver rodando.")
elif USE_DOCKER and not DOCKER_CONTAINER:
    print("⚠ Aviso: USE_DOCKER está ativado mas DOCKER_CONTAINER não foi configurado corretamente")
elif not USE_DOCKER:
    print("ℹ Modo Docker desabilitado - comandos serão executados diretamente no host")


@app.route('/login')
def login():
    """Página de login"""
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/api/login', methods=['POST'])
def api_login():
    """API para autenticação"""
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Usuário e senha são obrigatórios'}), 400
    
    usuario = autenticar(username, password)
    
    if usuario:
        user = User(usuario['username'], usuario['nome'])
        login_user(user, remember=False)  # Sessão expira ao fechar o navegador
        
        # Criar resposta JSON e adicionar cookie para nginx
        response = jsonify({'success': True, 'username': usuario['username'], 'nome': usuario['nome']})
        try:
            # Cookie sem max_age = session cookie (expira ao fechar navegador)
            response.set_cookie('autoreg_auth', 'authenticated', domain='.michelpaes.com.br', secure=True)
        except Exception as e:
            # Se houver erro ao definir cookie, apenas logar e continuar
            print(f"Erro ao definir cookie: {e}")
        return response
    else:
        return jsonify({'success': False, 'error': 'Usuário ou senha inválidos'}), 401


@app.route('/api/logout', methods=['POST'])
@login_required
def api_logout():
    """API para logout"""
    logout_user()
    
    # Remover cookie de autenticação
    response = jsonify({'success': True, 'message': 'Logout realizado com sucesso'})
    try:
        response.set_cookie('autoreg_auth', '', domain='.michelpaes.com.br', expires=0)
    except Exception as e:
        print(f"Erro ao remover cookie: {e}")
    return response

@app.route('/')
@login_required
def index():
    """Página inicial do sistema AUTOREG"""
    return render_template('index.html')


@app.route('/api/docker/status')
@login_required
def docker_status():
    """Verifica o status do container Docker"""
    if not USE_DOCKER:
        return jsonify({
            'use_docker': False,
            'mensagem': 'Modo Docker desabilitado',
            'container': None
        })
    
    container_ok, mensagem = verificar_container_docker()
    return jsonify({
        'use_docker': True,
        'container_ok': container_ok,
        'mensagem': mensagem,
        'container': DOCKER_CONTAINER
    })


@app.route('/api/current-time')
@login_required
def current_time():
    """API endpoint para retornar data e hora atual"""
    now = datetime.now()
    return jsonify({
        'date': now.strftime('%d/%m/%Y'),
        'time': now.strftime('%H:%M:%S')
    })


@app.route('/api/docs/readme', methods=['GET'])
@login_required
def api_docs_readme():
    """Retorna o conteúdo do README em Markdown. source=web (Autoreg-web) ou source=core (core Autoreg)."""
    source = request.args.get('source', 'web').strip().lower()
    if source not in ('web', 'core'):
        return jsonify({'error': 'source inválido. Use web ou core.'}), 400
    path_str = ''
    try:
        if source == 'web':
            readme_path = Path(__file__).parent / 'README.md'
            path_str = str(readme_path)
            with open(readme_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({'content': content, 'error': None})
        # Core: tentar CORE_README_PATH, depois dirname(AUTOREGPATH)/README.md, depois README_core.md no projeto
        core_candidates = []
        if CORE_README_PATH:
            core_candidates.append(Path(os.path.abspath(os.path.expanduser(CORE_README_PATH))))
        core_candidates.append(Path(os.path.abspath(os.path.expanduser(str(Path(AUTOREGPATH).parent)))) / 'README.md')
        core_candidates.append(Path(__file__).parent / 'README_core.md')
        for candidate in core_candidates:
            path_str = str(candidate)
            try:
                with open(candidate, 'r', encoding='utf-8') as f:
                    content = f.read()
                return jsonify({'content': content, 'error': None})
            except (FileNotFoundError, PermissionError):
                continue
        return jsonify({
            'error': f'Arquivo não encontrado ou sem permissão. Tente: (1) Definir CORE_README_PATH no env ou (2) Copiar o README do core para README_core.md na raiz do Autoreg-web.',
            'content': None
        }), 404
    except FileNotFoundError:
        return jsonify({
            'error': f'Arquivo não encontrado: {path_str}. Para o core, defina CORE_README_PATH no env ou coloque uma cópia em README_core.md no projeto.',
            'content': None
        }), 404
    except PermissionError:
        return jsonify({
            'error': 'Sem permissão de leitura. Defina CORE_README_PATH no env com um caminho acessível ou use README_core.md na raiz do projeto.',
            'content': None
        }), 403
    except Exception as e:
        return jsonify({'error': str(e), 'content': None}), 500


@app.route('/api/exames-solicitar/load', methods=['GET'])
@login_required
def load_exames_csv():
    """Carrega o conteúdo do arquivo CSV de exames para solicitar"""
    csv_path = Path(WORKDIR) / 'exames_solicitar.csv'
    
    # Cabeçalho padrão do CSV
    CABECALHO_PADRAO = ['ra', 'hora', 'contraste', 'dividir', 'cns', 'procedimento', 'chave', 'solicitacao']
    
    try:
        # Garantir que o diretório existe
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Se o arquivo não existir, criar com cabeçalho padrão
        arquivo_criado = False
        if not csv_path.exists():
            with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(CABECALHO_PADRAO)
            arquivo_criado = True
        
        # Ler o CSV
        data = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            for row in reader:
                data.append(row)
        
        # Se o arquivo estava vazio ou só tinha cabeçalho, garantir que tem pelo menos o cabeçalho
        if not data or len(data) == 0:
            data = [CABECALHO_PADRAO]
            # Salvar o cabeçalho
            with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(CABECALHO_PADRAO)
            arquivo_criado = True
        
        # Verificar se a primeira linha é o cabeçalho válido
        if len(data) > 0:
            # Se a primeira linha estiver vazia ou não tiver o número correto de colunas, substituir pelo cabeçalho
            if len(data[0]) == 0 or len(data[0]) != len(CABECALHO_PADRAO):
                data[0] = CABECALHO_PADRAO
                with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                    writer = csv.writer(f)
                    writer.writerows(data)
                arquivo_criado = True
        
        return jsonify({
            'success': True, 
            'data': data,
            'arquivo_criado': arquivo_criado
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/exames-solicitar/save', methods=['POST'])
@login_required
def save_exames_csv():
    """Salva o conteúdo editado no arquivo CSV"""
    try:
        data = request.json.get('data', [])
        csv_path = Path(WORKDIR) / 'exames_solicitar.csv'
        
        # Cabeçalho padrão que DEVE ser preservado
        CABECALHO_PADRAO = ['ra', 'hora', 'contraste', 'dividir', 'cns', 'procedimento', 'chave', 'solicitacao']
        
        # Garantir que o diretório existe
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Garantir que a primeira linha sempre seja o cabeçalho correto
        if len(data) > 0:
            # Usar o cabeçalho recebido do frontend (que já está correto)
            # Mas garantir que tem o número correto de colunas
            if len(data[0]) != len(CABECALHO_PADRAO):
                # Se o cabeçalho recebido não tiver o número correto de colunas, usar o padrão
                data[0] = CABECALHO_PADRAO
            else:
                # Usar o cabeçalho recebido, mas garantir que está correto
                data[0] = CABECALHO_PADRAO
        else:
            # Se não houver dados, criar apenas com cabeçalho
            data = [CABECALHO_PADRAO]
        
        # Garantir que todas as linhas de dados tenham o número correto de colunas
        num_cols = len(CABECALHO_PADRAO)
        for i in range(1, len(data)):
            if len(data[i]) < num_cols:
                # Adicionar colunas vazias se necessário
                data[i].extend([''] * (num_cols - len(data[i])))
            elif len(data[i]) > num_cols:
                # Remover colunas extras se necessário
                data[i] = data[i][:num_cols]
        
        # Debug: verificar o que está sendo recebido
        print(f"Recebido {len(data)} linhas para salvar")
        print(f"Primeira linha (cabeçalho): {data[0]}")
        if len(data) > 1:
            print(f"Primeira linha de dados: {data[1]}")
        if len(data) > 2:
            print(f"Segunda linha de dados: {data[2]}")
        
        # Salvar o CSV
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerows(data)
        
        print(f"CSV salvo com {len(data)} linhas")
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/exames-solicitar/count', methods=['GET'])
@login_required
def count_exames_csv():
    """Conta o número de registros no arquivo CSV (linhas - cabeçalho)"""
    csv_path = Path(WORKDIR) / 'exames_solicitar.csv'
    
    try:
        # Verificar se o arquivo existe
        if not csv_path.exists():
            return jsonify({
                'success': True,
                'registros': 0,
                'total_linhas': 0
            })
        
        # Contar linhas no arquivo
        total_linhas = 0
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            for row in reader:
                total_linhas += 1
        
        # Número de registros = total de linhas - 1 (cabeçalho)
        registros = max(0, total_linhas - 1)
        
        return jsonify({
            'success': True,
            'registros': registros,
            'total_linhas': total_linhas
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/solicitar-tcs/executar', methods=['POST'])
@login_required
def executar_solicitacao_tcs():
    """Executa os comandos sequenciais para solicitar tomografias com streaming em tempo real"""
    # Capturar dados da requisição ANTES da função geradora
    data = request.json or {}
    comando_index = data.get('comando_index', 0)
    session_id = data.get('session_id', str(threading.current_thread().ident))
    
    def gerar():
        nonlocal session_id
        try:
            # Comandos a serem executados sequencialmente
            comandos = [
                ['-eae'],  # Executar comando -eae
                ['-eas'],  # Executar comando -eas
                ['-ear']   # Executar comando -ear
            ]
            
            if comando_index >= len(comandos):
                yield f"data: {json.dumps({'tipo': 'completo', 'mensagem': 'Todos os comandos foram executados com sucesso!'})}\n\n"
                return
            
            # Construir comando completo
            # Adicionar -u para unbuffered output se for Python
            if 'python' in PYTHONPATH.lower():
                comando_original = [PYTHONPATH, '-u', AUTOREGPATH] + comandos[comando_index]
            else:
                comando_original = [PYTHONPATH, AUTOREGPATH] + comandos[comando_index]
            
            # Verificar container antes de executar (apenas se USE_DOCKER estiver ativado)
            if USE_DOCKER and DOCKER_CONTAINER:
                container_ok, mensagem = verificar_container_docker()
                if not container_ok:
                    yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': f'Container Docker não acessível: {mensagem}'})}\n\n"
                    return
            
            # Construir comando com Docker se necessário
            comando = construir_comando_docker(comando_original)
            
            # Enviar início do comando
            yield f"data: {json.dumps({'tipo': 'inicio', 'comando_index': comando_index, 'total': len(comandos), 'comando': ' '.join(comando)})}\n\n"
            
            # Executar comando com streaming
            # Usar env para desabilitar buffering do Python
            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'
            
            # Se estiver usando Docker, não precisa de cwd (o container já tem seu próprio filesystem)
            cwd_exec = None if (USE_DOCKER and DOCKER_CONTAINER) else WORKDIR
            
            processo = subprocess.Popen(
                comando,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=0,  # Unbuffered para streaming imediato
                universal_newlines=True,
                cwd=cwd_exec,
                env=env
            )
            
            # Armazenar processo para permitir interrupção
            with processos_lock:
                processos_ativos[session_id] = processo
                processos_info[session_id] = {
                    'comando': ' '.join(comando),
                    'tipo': 'solicitar-tcs'
                }
            
            # Ler saída caractere por caractere para streaming verdadeiro
            # Isso permite ver a saída mesmo antes de uma linha completa
            buffer_linha = ''
            while True:
                char = processo.stdout.read(1)
                if not char:
                    # Verificar se processo ainda está rodando
                    if processo.poll() is not None:
                        # Processo terminou, enviar buffer restante se houver
                        if buffer_linha.strip():
                            yield f"data: {json.dumps({'tipo': 'output', 'linha': buffer_linha.rstrip()})}\n\n"
                        break
                    continue
                
                buffer_linha += char
                
                # Quando encontrar nova linha, enviar
                if char == '\n':
                    linha_limpa = buffer_linha.rstrip()
                    if linha_limpa:
                        yield f"data: {json.dumps({'tipo': 'output', 'linha': linha_limpa})}\n\n"
                    buffer_linha = ''
            
            # Aguardar término do processo
            processo.wait()
            
            # Remover processo da lista de ativos
            with processos_lock:
                if session_id in processos_ativos:
                    del processos_ativos[session_id]
            
            # Calcular progresso
            progresso = int(((comando_index + 1) / len(comandos)) * 100)
            
            # Enviar resultado
            if processo.returncode == 0:
                yield f"data: {json.dumps({'tipo': 'sucesso', 'comando_index': comando_index, 'progresso': progresso, 'completo': comando_index + 1 >= len(comandos)})}\n\n"
            else:
                yield f"data: {json.dumps({'tipo': 'erro', 'codigo': processo.returncode, 'mensagem': 'Comando retornou código de erro'})}\n\n"
                
        except Exception as e:
            # Remover processo da lista de ativos em caso de erro
            with processos_lock:
                if session_id in processos_ativos:
                    del processos_ativos[session_id]
            yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': str(e)})}\n\n"
    
    response = Response(gerar(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response


@app.route('/api/solicitar-tcs/interromper', methods=['POST'])
@login_required
def interromper_solicitacao_tcs():
    """Interrompe o processo Python do autoreg em execução"""
    try:
        data = request.json or {}
        session_id = data.get('session_id', str(threading.current_thread().ident))
        
        with processos_lock:
            if session_id in processos_ativos:
                processo = processos_ativos[session_id]
                
                # Tentar terminar o processo de forma suave primeiro
                try:
                    processo.terminate()
                    # Aguardar até 5 segundos para terminação suave
                    try:
                        processo.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        # Se não terminar suavemente, forçar kill
                        processo.kill()
                        processo.wait()
                    
                    del processos_ativos[session_id]
                    
                    return jsonify({
                        'success': True,
                        'mensagem': 'Processo interrompido com sucesso'
                    })
                except ProcessLookupError:
                    # Processo já terminou
                    if session_id in processos_ativos:
                        del processos_ativos[session_id]
                    return jsonify({
                        'success': True,
                        'mensagem': 'Processo já havia terminado'
                    })
            else:
                return jsonify({
                    'success': False,
                    'mensagem': 'Nenhum processo em execução encontrado'
                }), 404
                
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def encontrar_pdf_mais_recente():
    """Encontra o PDF mais recente com padrão solicitacoes_exames_imprimir*.pdf"""
    workdir = Path(WORKDIR)
    if not workdir.exists():
        return None
    
    # Buscar todos os PDFs que começam com o padrão (com ou sem timestamp)
    padrao = 'solicitacoes_exames_imprimir*.pdf'
    pdfs = list(workdir.glob(padrao))
    
    if not pdfs:
        return None
    
    # Ordenar por data de modificação (mais recente primeiro)
    pdfs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return pdfs[0]


def listar_pdfs_disponiveis():
    """Lista todos os PDFs disponíveis ordenados por data (mais recente primeiro)"""
    workdir = Path(WORKDIR)
    if not workdir.exists():
        return []
    
    # Buscar todos os PDFs que começam com o padrão (com ou sem timestamp)
    padrao = 'solicitacoes_exames_imprimir*.pdf'
    pdfs = list(workdir.glob(padrao))
    
    if not pdfs:
        return []
    
    # Ordenar por data de modificação (mais recente primeiro)
    pdfs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    
    # Filtrar apenas PDFs dos últimos 30 dias
    from datetime import datetime, timedelta
    limite_data = datetime.now() - timedelta(days=30)
    
    pdfs_filtrados = []
    for pdf in pdfs:
        data_modificacao = datetime.fromtimestamp(pdf.stat().st_mtime)
        if data_modificacao >= limite_data:
            # Extrair timestamp do nome do arquivo se houver
            nome = pdf.stem
            timestamp = None
            # Tentar extrair timestamp de diferentes formatos
            # Formato 1: solicitacoes_exames_imprimir_YYYYMMDD_HHMMSS
            # Formato 2: solicitacoes_exames_imprimir_YYYYMMDDHHMMSS
            # Formato 3: solicitacoes_exames_imprimir_YYYY-MM-DD_HH-MM-SS
            if '_' in nome or nome.replace('solicitacoes_exames_imprimir', '').strip():
                # Tentar identificar padrão de timestamp
                sufixo = nome.replace('solicitacoes_exames_imprimir', '').strip('_')
                if sufixo:
                    timestamp = sufixo
            
            pdfs_filtrados.append({
                'nome': pdf.name,
                'caminho': str(pdf),
                'data_modificacao': data_modificacao.strftime('%d/%m/%Y %H:%M:%S'),
                'timestamp': timestamp,
                'tamanho': pdf.stat().st_size
            })
    
    return pdfs_filtrados


@app.route('/api/imprimir-tcs/pdf')
@login_required
def api_imprimir_tcs_pdf():
    """Serve o PDF mais recente de solicitações de exames para impressão"""
    pdf_path = encontrar_pdf_mais_recente()
    
    if not pdf_path or not pdf_path.exists():
        return jsonify({'error': 'Nenhum arquivo PDF encontrado'}), 404
    
    return send_file(
        str(pdf_path),
        mimetype='application/pdf',
        as_attachment=False,
        download_name=pdf_path.name
    )


@app.route('/api/imprimir-tcs/pdf/<nome_arquivo>')
@login_required
def api_imprimir_tcs_pdf_especifico(nome_arquivo):
    """Serve um PDF específico pelo nome do arquivo"""
    # Validar nome do arquivo para evitar path traversal
    if '..' in nome_arquivo or '/' in nome_arquivo or '\\' in nome_arquivo:
        return jsonify({'error': 'Nome de arquivo inválido'}), 400
    
    pdf_path = Path(WORKDIR) / nome_arquivo
    
    # Verificar se o arquivo existe e está no diretório correto
    if not pdf_path.exists() or not pdf_path.is_file():
        return jsonify({'error': 'Arquivo PDF não encontrado'}), 404
    
    # Verificar se o arquivo está dentro do WORKDIR (segurança)
    try:
        pdf_path.resolve().relative_to(Path(WORKDIR).resolve())
    except ValueError:
        return jsonify({'error': 'Acesso negado'}), 403
    
    # Verificar se é um PDF válido (deve começar com o padrão e ter extensão .pdf)
    if not pdf_path.name.startswith('solicitacoes_exames_imprimir') or pdf_path.suffix != '.pdf':
        return jsonify({'error': 'Arquivo inválido'}), 400
    
    return send_file(
        str(pdf_path),
        mimetype='application/pdf',
        as_attachment=False,
        download_name=pdf_path.name
    )


@app.route('/api/imprimir-tcs/historico', methods=['GET'])
@login_required
def api_imprimir_tcs_historico():
    """Lista todos os PDFs disponíveis para impressão"""
    try:
        pdfs = listar_pdfs_disponiveis()
        return jsonify({
            'success': True,
            'pdfs': pdfs,
            'total': len(pdfs)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/robo-proxy')
@app.route('/api/robo-proxy/<path:path>')
@login_required
def robo_proxy(path=None):
    """
    Proxy simples para contornar bloqueios de X-Frame-Options
    Remove headers de segurança e reescreve URLs relativas no HTML
    Conecta diretamente ao servidor VNC do container Docker
    """
    # URL base do serviço do robô - sempre usar 127.0.0.1:6901
    base_url = request.args.get('url', 'https://127.0.0.1:6901')
    if base_url.startswith('http://'):
        base_url = base_url.replace('http://', 'https://', 1)
    
    # Construir URL completa
    if path:
        # Se há path, construir URL completa
        from urllib.parse import urljoin
        target_url = urljoin(base_url.rstrip('/') + '/', path)
    else:
        target_url = base_url
    
    # Adicionar query string se houver (exceto o parâmetro 'url')
    query_params = {k: v for k, v in request.args.items() if k != 'url'}
    if query_params:
        from urllib.parse import urlencode
        target_url += '?' + urlencode(query_params)
    
    try:
        # Preparar headers para a requisição
        headers = {
            'User-Agent': request.headers.get('User-Agent', 'Mozilla/5.0'),
        }
        
        # Passar cookies do cliente para o servidor de destino (se necessário)
        # Nota: Para KasmVNC em 127.0.0.1, geralmente não precisa de cookies
        cookies = {}
        if request.cookies:
            # Passar cookies relevantes se necessário
            for name, value in request.cookies.items():
                # Passar apenas cookies que podem ser relevantes para o KasmVNC
                if name in ['username', 'token', 'session_id']:
                    cookies[name] = value
        
        # Fazer requisição ao site de destino
        response = requests.get(
            target_url,
            verify=False,  # Desabilitar verificação SSL para certificado auto-assinado
            timeout=30,
            allow_redirects=True,
            headers=headers,
            cookies=cookies if cookies else None
        )
        
        # Obter o conteúdo
        content = response.content
        content_type = response.headers.get('content-type', '').lower()
        
        # Processar diferentes tipos de conteúdo
        if 'text/html' in content_type:
            try:
                # Detectar encoding
                encoding = 'utf-8'
                if 'charset=' in content_type:
                    try:
                        encoding = content_type.split('charset=')[1].split(';')[0].strip()
                    except:
                        pass
                
                html_content = content.decode(encoding, errors='ignore')
                
                # Não usar <base> pois está causando problemas com resolução de URLs relativas
                # O navegador resolve URLs relativas baseado no <base>, o que interfere com nosso proxy
                # Em vez disso, vamos processar todas as URLs no HTML/JS/CSS antes de servir
                base_href = request.url.split('?')[0]  # URL atual sem query string (para referência)
                if base_href.startswith('http://'):
                    base_href = base_href.replace('http://', 'https://', 1)
                
                # Remover qualquer tag <base> existente no HTML para evitar interferência
                html_content = re.sub(r'<base[^>]*>', '', html_content, flags=re.IGNORECASE)
                
                # IMPORTANTE: O navegador resolve URLs relativas baseado no caminho do arquivo atual
                # Se o CSS está em /api/robo-proxy?url=.../assets/file.css e tem url(splash.jpg),
                # o navegador tenta /api/robo-proxy?url=.../assets/file.css/splash.jpg
                # Por isso, precisamos reescrever TODAS as URLs relativas no CSS para URLs absolutas
                
                # Calcular base path para URLs relativas
                if path:
                    # Se há path, o base é o diretório do path
                    base_path = '/' + '/'.join(path.split('/')[:-1]) if '/' in path else '/'
                    if not base_path.endswith('/'):
                        base_path += '/'
                else:
                    base_path = '/'
                
                # Função para reescrever URLs
                def rewrite_url(match):
                    attr = match.group(1)  # href, src, etc.
                    quote = match.group(2)  # " ou '
                    url = match.group(3).strip()
                    
                    # Se já é URL absoluta externa, manter
                    if url.startswith(('http://', 'https://', '//', 'data:', 'javascript:', 'mailto:', 'tel:', '#')):
                        return match.group(0)
                    
                    # Se já passa pelo proxy, manter
                    if url.startswith('/api/robo-proxy'):
                        return match.group(0)
                    
                    # Construir URL completa no servidor original
                    from urllib.parse import quote as url_quote
                    if url.startswith('/'):
                        # URL absoluta relativa ao servidor
                        original_url = base_url.rstrip('/') + url
                    elif url.startswith('./'):
                        # URL relativa ao diretório atual
                        original_url = base_url.rstrip('/') + base_path.rstrip('/') + '/' + url[2:]
                    elif url.startswith('../'):
                        # URL relativa ao diretório pai (simplificar usando base_path)
                        original_url = base_url.rstrip('/') + base_path.rstrip('/') + '/' + url
                    else:
                        # URL relativa ao diretório atual
                        original_url = base_url.rstrip('/') + base_path.rstrip('/') + '/' + url
                    
                    # Codificar a URL para o parâmetro
                    encoded_url = url_quote(original_url, safe='')
                    new_url = f'/api/robo-proxy?url={encoded_url}'
                    
                    return f'{attr}={quote}{new_url}{quote}'
                
                # Reescrever URLs em atributos: href, src, action, etc.
                html_content = re.sub(
                    r'\b(href|src|action|formaction|data|background|cite|codebase|longdesc|usemap|profile|manifest)\s*=\s*(["\'])([^"\']+)\2',
                    rewrite_url,
                    html_content,
                    flags=re.IGNORECASE
                )
                
                # Reescrever URLs em CSS: url(...)
                def rewrite_css_url(match):
                    quote = match.group(1)  # " ou ' ou nada
                    url = match.group(2).strip()
                    
                    if url.startswith(('http://', 'https://', '//', 'data:', '#')):
                        return match.group(0)
                    
                    if url.startswith('/api/robo-proxy'):
                        return match.group(0)
                    
                    from urllib.parse import quote as url_quote
                    if url.startswith('/'):
                        original_url = base_url.rstrip('/') + url
                    elif url.startswith('./'):
                        original_url = base_url.rstrip('/') + base_path.rstrip('/') + '/' + url[2:]
                    elif url.startswith('../'):
                        original_url = base_url.rstrip('/') + base_path.rstrip('/') + '/' + url
                    else:
                        original_url = base_url.rstrip('/') + base_path.rstrip('/') + '/' + url
                    
                    encoded_url = url_quote(original_url, safe='')
                    new_url = f'/api/robo-proxy?url={encoded_url}'
                    
                    return f'url({quote}{new_url}{quote})'
                
                html_content = re.sub(
                    r'url\s*\(\s*(["\']?)([^"\'()]+)\1\s*\)',
                    rewrite_css_url,
                    html_content,
                    flags=re.IGNORECASE
                )
                
                # Garantir que base_url seja HTTPS antes de injetar script
                if base_url.startswith('http://'):
                    base_url_https = base_url.replace('http://', 'https://', 1)
                else:
                    base_url_https = base_url
                
                # Injetar script para reescrever WebSocket connections em tempo de execução
                html_content = inject_websocket_rewrite_script(html_content, base_url_https)
                
                content = html_content.encode(encoding)
            except Exception as e:
                # Se houver erro ao processar HTML, usar conteúdo original
                print(f"Erro ao processar HTML: {e}")
                pass
        elif 'javascript' in content_type or content_type.endswith('/javascript') or 'application/javascript' in content_type:
            # Processar arquivos JavaScript para reescrever URLs
            try:
                encoding = 'utf-8'
                js_content = content.decode(encoding, errors='ignore')
                
                # Garantir que base_url seja HTTPS
                if base_url.startswith('http://'):
                    base_url_https = base_url.replace('http://', 'https://', 1)
                else:
                    base_url_https = base_url
                
                # Função auxiliar para construir URL do proxy
                def build_proxy_url(url_path):
                    """
                    Constrói URL do proxy para um caminho
                    IMPORTANTE: URLs relativas são resolvidas pelo navegador baseado no arquivo atual
                    Por isso, sempre convertemos para URL absoluta na raiz
                    """
                    if url_path.startswith('/'):
                        # URL absoluta - usar diretamente
                        original_url = base_url_https.rstrip('/') + url_path
                    elif url_path.startswith('./'):
                        # URL relativa ao diretório atual
                        # PROBLEMA: Se JS está em /main.bundle.js e URL é ./assets/file.js
                        # O navegador tenta /main.bundle.js/assets/file.js (ERRADO!)
                        # SOLUÇÃO: Converter para URL absoluta na raiz
                        original_url = base_url_https.rstrip('/') + '/' + url_path[2:]
                    elif url_path.startswith('../'):
                        # URL relativa ao diretório pai
                        # Simplificar: assumir que está na raiz
                        url_clean = url_path.lstrip('../').lstrip('/')
                        original_url = base_url_https.rstrip('/') + '/' + url_clean
                    else:
                        # URL relativa sem prefixo
                        # PROBLEMA: Se JS está em /main.bundle.js e URL é assets/file.js
                        # O navegador tenta /main.bundle.js/assets/file.js (ERRADO!)
                        # SOLUÇÃO: Converter para URL absoluta na raiz
                        original_url = base_url_https.rstrip('/') + '/' + url_path
                    encoded_url = url_quote(original_url, safe='')
                    return f'/api/robo-proxy?url={encoded_url}'
                
                # Reescrever import() dinâmico
                def rewrite_js_import(match):
                    import_path = match.group(1).strip().strip('"\'')
                    if import_path.startswith(('http://', 'https://', '//', '/api/robo-proxy', 'data:', 'blob:')):
                        return match.group(0)
                    new_url = build_proxy_url(import_path)
                    return f'import("{new_url}")'
                
                js_content = re.sub(
                    r'import\s*\(\s*["\']([^"\']+)["\']\s*\)',
                    rewrite_js_import,
                    js_content
                )
                
                # Reescrever new WebSocket()
                def rewrite_websocket(match):
                    ws_url = match.group(1).strip().strip('"\'')
                    if ws_url.startswith(('ws://', 'wss://', '/api/robo-ws')):
                        # Se já é WebSocket, converter para nosso proxy WebSocket
                        if ws_url.startswith(('ws://', 'wss://')):
                            # Converter ws:// ou wss:// para nosso proxy
                            ws_url_clean = ws_url.replace('ws://', '').replace('wss://', '')
                            if '://' in ws_url_clean:
                                parsed = urlparse(ws_url_clean if '://' in ws_url_clean else 'https://' + ws_url_clean)
                                path = parsed.path or '/'
                                original_url = f'https://{parsed.netloc}{path}'
                            else:
                                original_url = base_url_https.rstrip('/') + (ws_url_clean if ws_url_clean.startswith('/') else '/' + ws_url_clean)
                            encoded_url = url_quote(original_url, safe='')
                            return f'new WebSocket("/api/robo-ws?url={encoded_url}")'
                        return match.group(0)
                    # URL relativa - converter para WebSocket proxy
                    original_url = base_url_https.rstrip('/') + (ws_url if ws_url.startswith('/') else '/' + ws_url)
                    encoded_url = url_quote(original_url, safe='')
                    return f'new WebSocket("/api/robo-ws?url={encoded_url}")'
                
                js_content = re.sub(
                    r'new\s+WebSocket\s*\(\s*["\']([^"\']+)["\']\s*\)',
                    rewrite_websocket,
                    js_content,
                    flags=re.IGNORECASE
                )
                
                # Reescrever fetch()
                def rewrite_fetch(match):
                    fetch_url = match.group(1).strip().strip('"\'')
                    if fetch_url.startswith(('http://', 'https://', '//', 'data:', 'blob:', '/api/robo-proxy')):
                        # Se já é HTTP/HTTPS absoluto, garantir HTTPS
                        if fetch_url.startswith('http://'):
                            fetch_url = fetch_url.replace('http://', 'https://', 1)
                        return match.group(0).replace(match.group(1), fetch_url)
                    new_url = build_proxy_url(fetch_url)
                    return match.group(0).replace(match.group(1), new_url)
                
                js_content = re.sub(
                    r'fetch\s*\(\s*["\']([^"\']+)["\']',
                    rewrite_fetch,
                    js_content,
                    flags=re.IGNORECASE
                )
                
                # Reescrever XMLHttpRequest.open()
                def rewrite_xhr_open(match):
                    method = match.group(1)
                    xhr_url = match.group(2).strip().strip('"\'')
                    if xhr_url.startswith(('http://', 'https://', '//', 'data:', 'blob:', '/api/robo-proxy')):
                        if xhr_url.startswith('http://'):
                            xhr_url = xhr_url.replace('http://', 'https://', 1)
                        return f'.open({method}, "{xhr_url}"'
                    new_url = build_proxy_url(xhr_url)
                    return f'.open({method}, "{new_url}"'
                
                js_content = re.sub(
                    r'\.open\s*\(\s*(["\']?\w+["\']?)\s*,\s*["\']([^"\']+)["\']',
                    rewrite_xhr_open,
                    js_content,
                    flags=re.IGNORECASE
                )
                
                # Reescrever URLs em strings genéricas (para recursos estáticos)
                def rewrite_js_url_string(match):
                    full_match = match.group(0)
                    url = match.group(1)
                    quote = match.group(2)  # " ou '
                    
                    if url.startswith(('http://', 'https://', '//', 'data:', 'blob:', 'javascript:', 'mailto:', 'tel:', '#', '/api/robo-proxy', '/api/robo-ws')):
                        # Se já é absoluto, garantir HTTPS
                        if url.startswith('http://'):
                            url = url.replace('http://', 'https://', 1)
                        return f'{quote}{url}{quote}'
                    
                    # URL relativa - converter para proxy
                    new_url = build_proxy_url(url)
                    return f'{quote}{new_url}{quote}'
                
                # Padrão mais abrangente para capturar URLs em strings
                js_content = re.sub(
                    r'(["\'])((?:\./|\.\./|/)?[^"\']*(?:\.js|\.css|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.woff|\.woff2|\.ttf|\.eot|\.ico|\.mp3|\.oga|\.mp4|\.webm)[^"\']*)\1',
                    rewrite_js_url_string,
                    js_content
                )
                
                # Reescrever import.meta.url se existir
                js_content = re.sub(
                    r'import\.meta\.url',
                    f'"{base_href}"',
                    js_content
                )
                
                content = js_content.encode(encoding)
            except Exception as e:
                print(f"Erro ao processar JavaScript: {e}")
                import traceback
                traceback.print_exc()
                pass
        elif 'css' in content_type or 'text/css' in content_type:
            # Processar arquivos CSS para reescrever URLs
            try:
                encoding = 'utf-8'
                css_content = content.decode(encoding, errors='ignore')
                
                # Determinar o diretório base do arquivo CSS
                # Se o path é /assets/webutil-Dix4qgyj.css, o base_path é /assets/
                css_base_path = '/'
                if path:
                    # Extrair diretório do path
                    if '/' in path:
                        css_base_path = '/' + '/'.join(path.split('/')[:-1]) + '/'
                    else:
                        css_base_path = '/'
                else:
                    # Se não há path, assumir que está na raiz
                    css_base_path = '/'
                
                # Reescrever URLs em CSS
                def rewrite_css_url_in_file(match):
                    quote = match.group(1)  # " ou ' ou nada
                    url = match.group(2).strip()
                    
                    if url.startswith(('http://', 'https://', '//', 'data:', '/api/robo-proxy')):
                        return match.group(0)
                    
                    from urllib.parse import quote as url_quote
                    
                    # Resolver URL relativa considerando o contexto do arquivo CSS
                    if url.startswith('/'):
                        # URL absoluta - usar diretamente
                        original_url = base_url.rstrip('/') + url
                    elif url.startswith('../'):
                        # URL relativa ao diretório pai
                        # Simplificar: assumir que está na raiz
                        url_clean = url.lstrip('../').lstrip('/')
                        original_url = base_url.rstrip('/') + '/' + url_clean
                    elif url.startswith('./'):
                        # URL relativa ao diretório atual do CSS
                        # PROBLEMA: Se CSS está em /assets/file.css e URL é ./splash.jpg
                        # O navegador tenta /assets/file.css/splash.jpg (ERRADO!)
                        # SOLUÇÃO: Converter para URL absoluta na raiz
                        url_clean = url[2:]  # Remove ./
                        # Assumir que recursos estão na raiz (mais comum)
                        original_url = base_url.rstrip('/') + '/' + url_clean
                    else:
                        # URL relativa sem prefixo - o navegador resolve baseado no arquivo CSS atual
                        # PROBLEMA: Se CSS está em /assets/file.css e URL é splash.jpg
                        # O navegador tenta /assets/file.css/splash.jpg (ERRADO!)
                        # SOLUÇÃO: Converter para URL absoluta na raiz
                        original_url = base_url.rstrip('/') + '/' + url
                    
                    encoded_url = url_quote(original_url, safe='')
                    new_url = f'/api/robo-proxy?url={encoded_url}'
                    return f'url({quote}{new_url}{quote})'
                
                # Reescrever URLs em CSS - usar padrão mais abrangente
                # Capturar url() com ou sem aspas, incluindo espaços
                css_content = re.sub(
                    r'url\s*\(\s*(["\']?)([^"\'()]+?)\1\s*\)',
                    rewrite_css_url_in_file,
                    css_content,
                    flags=re.IGNORECASE
                )
                
                # Também reescrever @import
                def rewrite_css_import(match):
                    import_url = match.group(1).strip().strip('"\'')
                    if import_url.startswith(('http://', 'https://', '//', 'data:', '/api/robo-proxy')):
                        return match.group(0)
                    from urllib.parse import quote as url_quote
                    if import_url.startswith('/'):
                        original_url = base_url.rstrip('/') + import_url
                    else:
                        original_url = base_url.rstrip('/') + '/' + import_url
                    encoded_url = url_quote(original_url, safe='')
                    new_url = f'/api/robo-proxy?url={encoded_url}'
                    return f'@import "{new_url}"'
                
                css_content = re.sub(
                    r'@import\s+["\']([^"\']+)["\']',
                    rewrite_css_import,
                    css_content,
                    flags=re.IGNORECASE
                )
                
                content = css_content.encode(encoding)
            except Exception as e:
                print(f"Erro ao processar CSS: {e}")
                import traceback
                traceback.print_exc()
                pass
        
        # Criar resposta Flask
        flask_response = Response(
            content,
            status=response.status_code
        )
        
        # Preservar content-type
        if 'content-type' in response.headers:
            flask_response.content_type = response.headers['content-type']
        
        # Remover headers de segurança que bloqueiam iframe
        excluded_headers = [
            'x-frame-options',
            'content-security-policy',
            'x-content-type-options',
            'strict-transport-security',
            'content-encoding',
            'content-length',
            'transfer-encoding',
            'connection'
        ]
        
        # Repassar outros headers úteis
        for header_name, header_value in response.headers.items():
            if header_name.lower() not in excluded_headers:
                flask_response.headers[header_name] = header_value
        
        return flask_response
        
    except requests.exceptions.ConnectionError:
        return jsonify({
            'success': False,
            'error': f'Não foi possível conectar a {target_url}'
        }), 503
    except requests.exceptions.Timeout:
        return jsonify({
            'success': False,
            'error': 'Timeout ao conectar'
        }), 504
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Erro no proxy: {str(e)}'
        }), 500


# Função auxiliar para injetar script que reescreve WebSocket connections e corrige URLs
def inject_websocket_rewrite_script(html_content, base_url_https):
    """Injeta script JavaScript para reescrever conexões WebSocket e corrigir URLs em tempo de execução"""
    # Extrair host e porta do base_url
    try:
        from urllib.parse import urlparse
        parsed = urlparse(base_url_https)
        ws_host = parsed.netloc
        ws_protocol = 'wss' if parsed.scheme == 'https' else 'ws'
    except:
        # Fallback: sempre usar 127.0.0.1:6901
        ws_host = '127.0.0.1:6901'
        ws_protocol = 'wss'
    
    script = f"""
    <script>
    (function() {{
        console.log('[Proxy] Script de interceptação WebSocket carregado');
        const originalWebSocket = window.WebSocket;
        const wsBaseUrl = '{ws_protocol}://{ws_host}';
        const proxyBase = '/api/robo-proxy';
        const baseUrl = '{base_url_https}';
        
        // EXECUTAR IMEDIATAMENTE - antes de qualquer outro script
        // Interceptar recursos ANTES que sejam carregados pelo CSS
        // Isso é crítico porque o CSS pode carregar recursos antes que nosso script execute completamente
        
        // Função auxiliar para corrigir URLs
        // DEFINIR PRIMEIRO para que possa ser usada imediatamente
        function fixUrl(url) {{
            if (!url || typeof url !== 'string') return url;
            
            const originalUrl = url;
            
            // Se já é uma URL absoluta válida e passa pelo proxy, manter
            if (url.startsWith('/api/robo-proxy')) {{
                // Verificar se a URL está malformada (contém .css/ ou .js/ no path)
                // Exemplo: /api/robo-proxy?url=https%3A%2F%2F127.0.0.1%3A6901%2Fassets%2Fwebutil-Dix4qgyj.css%2Fsplash-D03O8R4K.jpg
                if (url.includes('.css/') || url.includes('.js/')) {{
                    // Extrair a parte após url=
                    const match = url.match(/url=([^&]+)/);
                    if (match) {{
                        try {{
                            const decodedUrl = decodeURIComponent(match[1]);
                            console.log('[Proxy] URL malformada detectada, decodificada:', decodedUrl);
                            
                            // Extrair o caminho do recurso após .css/ ou .js/
                            // Padrão: captura o nome do arquivo .css/.js e o caminho após
                            // Exemplo: /assets/webutil-Dix4qgyj.css/splash-D03O8R4K.jpg
                            const resourceMatch = decodedUrl.match(/([^/]+\\.(css|js))\\/([^?&#]+)/);
                            if (resourceMatch) {{
                                const resourcePath = resourceMatch[3];
                                // Limpar o caminho do recurso (remover query strings, etc.)
                                const cleanPath = resourcePath.split('?')[0].split('#')[0];
                                // Construir URL correta na raiz
                                // Se o recurso começa com /, usar diretamente, senão adicionar /
                                const correctedPath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
                                const correctedUrl = baseUrl + correctedPath;
                                const encodedUrl = encodeURIComponent(correctedUrl);
                                url = proxyBase + '?url=' + encodedUrl;
                                console.log('[Proxy] URL malformada corrigida:', originalUrl, '->', url);
                                return url;
                            }}
                            
                            // Tentar padrão alternativo: pode ser que o caminho esteja codificado de forma diferente
                            // Exemplo: assets%2Fwebutil-Dix4qgyj.css%2Fsplash-D03O8R4K.jpg
                            const altMatch = decodedUrl.match(/([^/]+\.(css|js))\\/([^?&#]+)/);
                            if (altMatch) {{
                                const resourcePath = altMatch[3];
                                const cleanPath = resourcePath.split('?')[0].split('#')[0];
                                const correctedPath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
                                const correctedUrl = baseUrl + correctedPath;
                                const encodedUrl = encodeURIComponent(correctedUrl);
                                url = proxyBase + '?url=' + encodedUrl;
                                console.log('[Proxy] URL malformada corrigida (padrão alternativo):', originalUrl, '->', url);
                                return url;
                            }}
                        }} catch (e) {{
                            console.warn('[Proxy] Erro ao decodificar URL:', e, 'URL original:', originalUrl);
                        }}
                    }}
                }}
                return url;
            }}
            
            // Se começa com /api/ mas não é /api/robo-proxy, reescrever
            if (url.startsWith('/api/') && !url.startsWith('/api/robo-proxy')) {{
                const resourcePath = url.replace('/api/', '');
                const correctedUrl = baseUrl + '/' + resourcePath;
                const encodedUrl = encodeURIComponent(correctedUrl);
                url = proxyBase + '?url=' + encodedUrl;
                console.log('[Proxy] URL /api/ reescrita:', originalUrl, '->', url);
                return url;
            }}
            
            // Se é URL absoluta externa, manter
            if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//') || 
                url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:') || 
                url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {{
                return url;
            }}
            
            // Se é URL relativa, converter para proxy
            const absoluteUrl = url.startsWith('/') ? baseUrl + url : baseUrl + '/' + url;
            const encodedUrl = encodeURIComponent(absoluteUrl);
            url = proxyBase + '?url=' + encodedUrl;
            console.log('[Proxy] URL relativa reescrita:', originalUrl, '->', url);
            return url;
        }}
        
        // INTERCEPTAÇÃO PRECOCE - Executar ANTES de qualquer outro script
        // Interceptar fetch() e XMLHttpRequest IMEDIATAMENTE para capturar recursos carregados pelo CSS
        const originalFetch = window.fetch;
        window.fetch = function(input, init) {{
            let url = typeof input === 'string' ? input : (input.url || input);
            const fixedUrl = fixUrl(url);
            if (fixedUrl !== url) {{
                console.log('[Proxy] fetch() URL corrigida (precoce):', url, '->', fixedUrl);
            }}
            if (typeof input !== 'string' && input instanceof Request) {{
                return originalFetch.call(this, new Request(fixedUrl, init || {{}}));
            }}
            return originalFetch.call(this, fixedUrl, init);
        }};
        
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {{
            const fixedUrl = fixUrl(url);
            if (fixedUrl !== url) {{
                console.log('[Proxy] XMLHttpRequest URL corrigida (precoce):', url, '->', fixedUrl);
            }}
            return originalXHROpen.call(this, method, fixedUrl, async, user, password);
        }};
        
        // Interceptar WebSocket - DEVE ser executado antes de qualquer outro script
        window.WebSocket = function(url, protocols) {{
            console.log('[Proxy] WebSocket chamado com URL:', url);
            
            // Se já é uma URL absoluta wss://, usar diretamente (garantindo HTTPS)
            if (url.startsWith('wss://')) {{
                console.log('[Proxy] WebSocket wss:// detectado, usando diretamente');
                return new originalWebSocket(url, protocols);
            }}
            
            // Se é ws://, converter para wss://
            if (url.startsWith('ws://')) {{
                url = url.replace('ws://', 'wss://');
                console.log('[Proxy] WebSocket ws:// convertido para wss://:', url);
                return new originalWebSocket(url, protocols);
            }}
            
            // Se é URL relativa, construir URL completa com base
            let fullUrl;
            if (url.startsWith('/')) {{
                fullUrl = wsBaseUrl + url;
            }} else {{
                fullUrl = wsBaseUrl + '/' + url;
            }}
            
            console.log('[Proxy] WebSocket rewrite:', url, '->', fullUrl);
            return new originalWebSocket(fullUrl, protocols);
        }};
        
        // Preservar propriedades do WebSocket original
        Object.setPrototypeOf(window.WebSocket.prototype, originalWebSocket.prototype);
        Object.setPrototypeOf(window.WebSocket, originalWebSocket);
        
        // Preservar constantes
        window.WebSocket.CONNECTING = originalWebSocket.CONNECTING;
        window.WebSocket.OPEN = originalWebSocket.OPEN;
        window.WebSocket.CLOSING = originalWebSocket.CLOSING;
        window.WebSocket.CLOSED = originalWebSocket.CLOSED;
        
        // Interceptar fetch() para corrigir URLs
        const originalFetch = window.fetch;
        window.fetch = function(input, init) {{
            let url = typeof input === 'string' ? input : (input.url || input);
            const fixedUrl = fixUrl(url);
            if (fixedUrl !== url) {{
                console.log('[Proxy] fetch() URL corrigida:', url, '->', fixedUrl);
            }}
            
            // Se input é um objeto Request, criar novo Request com URL corrigida
            if (typeof input !== 'string' && input instanceof Request) {{
                return originalFetch.call(this, new Request(fixedUrl, init || {{}}));
            }}
            
            return originalFetch.call(this, fixedUrl, init);
        }};
        
        
        // Interceptar todas as requisições de recursos ANTES que sejam feitas
        // Isso é crítico para recursos carregados pelo CSS
        const originalCreateElementNS = document.createElementNS;
        document.createElementNS = function(namespace, tagName, options) {{
            const element = originalCreateElementNS.call(this, namespace, tagName, options);
            if (tagName.toLowerCase() === 'style') {{
                // Interceptar quando CSS é adicionado via <style>
                const originalTextContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
                Object.defineProperty(element, 'textContent', {{
                    set: function(value) {{
                        if (value) {{
                            // Reescrever URLs no CSS inline
                            value = value.replace(/url\s*\(\s*(["\']?)([^"\'()]+?)\1\s*\)/gi, function(match, quote, url) {{
                                const fixedUrl = fixUrl(url.trim());
                                return 'url(' + quote + fixedUrl + quote + ')';
                            }});
                        }}
                        if (originalTextContent && originalTextContent.set) {{
                            originalTextContent.set.call(this, value);
                        }} else {{
                            element.innerHTML = value;
                        }}
                    }},
                    get: function() {{
                        return originalTextContent && originalTextContent.get ? originalTextContent.get.call(this) : element.innerHTML;
                    }},
                    configurable: true
                }});
            }}
            return element;
        }};
        
        // Interceptar todas as requisições de recursos usando Resource Timing API
        // Mas mais importante: interceptar quando o CSS tenta carregar recursos
        // Isso é feito interceptando o carregamento de imagens, fontes, etc.
        
        // Interceptar Image constructor para capturar imagens carregadas pelo CSS
        const originalImage = window.Image;
        window.Image = function(...args) {{
            const img = new originalImage(...args);
            const originalSrcSetter = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set;
            Object.defineProperty(img, 'src', {{
                set: function(value) {{
                    const fixedValue = fixUrl(value);
                    if (fixedValue !== value) {{
                        console.log('[Proxy] Image src corrigido:', value, '->', fixedValue);
                    }}
                    originalSrcSetter.call(this, fixedValue);
                }},
                get: function() {{
                    return this.getAttribute('src');
                }},
                configurable: true
            }});
            return img;
        }};
        
        // Interceptar FontFace para capturar fontes carregadas pelo CSS
        if (window.FontFace) {{
            const originalFontFace = window.FontFace;
            window.FontFace = function(family, source, descriptors) {{
                if (typeof source === 'string') {{
                    source = fixUrl(source);
                }}
                return new originalFontFace(family, source, descriptors);
            }};
        }}
        
        // Interceptar todas as requisições de recursos usando PerformanceObserver
        // Isso captura recursos carregados pelo CSS antes que sejam requisitados
        if (window.PerformanceObserver) {{
            try {{
                const resourceObserver = new PerformanceObserver(function(list) {{
                    list.getEntries().forEach(function(entry) {{
                        if (entry.initiatorType === 'css' || entry.name.includes('.css/') || entry.name.includes('.js/')) {{
                            const fixedUrl = fixUrl(entry.name);
                            if (fixedUrl !== entry.name) {{
                                console.log('[Proxy] Recurso CSS detectado e corrigido:', entry.name, '->', fixedUrl);
                                // Não podemos redirecionar aqui, mas podemos logar para debug
                            }}
                        }}
                    }});
                }});
                resourceObserver.observe({{entryTypes: ['resource']}});
            }} catch (e) {{
                console.warn('[Proxy] PerformanceObserver não disponível:', e);
            }}
        }}
        
        // Interceptar todas as tags <style> para reescrever URLs no CSS inline
        function rewriteInlineCSS(element) {{
            if (element.tagName === 'STYLE' && element.textContent) {{
                const originalContent = element.textContent;
                const rewritten = originalContent.replace(/url\s*\(\s*(["\']?)([^"\'()]+?)\1\s*\)/gi, function(match, quote, url) {{
                    const fixedUrl = fixUrl(url.trim());
                    return 'url(' + quote + fixedUrl + quote + ')';
                }});
                if (rewritten !== originalContent) {{
                    element.textContent = rewritten;
                    console.log('[Proxy] CSS inline reescrito');
                }}
            }}
        }}
        
        // Reescrever CSS inline em elementos existentes
        document.querySelectorAll('style').forEach(rewriteInlineCSS);
        
        // Interceptar quando novos elementos <style> são adicionados
        const styleObserver = new MutationObserver(function(mutations) {{
            mutations.forEach(function(mutation) {{
                mutation.addedNodes.forEach(function(node) {{
                    if (node.nodeType === 1 && node.tagName === 'STYLE') {{
                        rewriteInlineCSS(node);
                    }}
                }});
            }});
        }});
        styleObserver.observe(document.documentElement, {{
            childList: true,
            subtree: true
        }});
        
        // Interceptar recursos carregados pelo CSS usando um interceptor de recursos mais agressivo
        // Isso captura recursos que são carregados diretamente pelo CSS antes que possamos interceptá-los
        const originalInsertRule = CSSStyleSheet.prototype.insertRule;
        CSSStyleSheet.prototype.insertRule = function(rule, index) {{
            if (rule && typeof rule === 'string') {{
                const rewritten = rule.replace(/url\s*\(\s*(["\']?)([^"\'()]+?)\1\s*\)/gi, function(match, quote, url) {{
                    const fixedUrl = fixUrl(url.trim());
                    return 'url(' + quote + fixedUrl + quote + ')';
                }});
                if (rewritten !== rule) {{
                    console.log('[Proxy] CSS insertRule reescrito');
                    rule = rewritten;
                }}
            }}
            return originalInsertRule.call(this, rule, index);
        }};
        
        // Interceptar quando estilos são adicionados via CSSStyleSheet
        const originalAddRule = CSSStyleSheet.prototype.addRule;
        if (originalAddRule) {{
            CSSStyleSheet.prototype.addRule = function(selector, style, index) {{
                if (style && typeof style === 'string') {{
                    const rewritten = style.replace(/url\s*\(\s*(["\']?)([^"\'()]+?)\1\s*\)/gi, function(match, quote, url) {{
                        const fixedUrl = fixUrl(url.trim());
                        return 'url(' + quote + fixedUrl + quote + ')';
                    }});
                    if (rewritten !== style) {{
                        console.log('[Proxy] CSS addRule reescrito');
                        style = rewritten;
                    }}
                }}
                return originalAddRule.call(this, selector, style, index);
            }};
        }}
        
        // Interceptar getComputedStyle para corrigir URLs em background-image, etc.
        const originalGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = function(element, pseudoElement) {{
            const style = originalGetComputedStyle.call(this, element, pseudoElement);
            
            // Interceptar getPropertyValue para corrigir URLs
            const originalGetPropertyValue = style.getPropertyValue;
            style.getPropertyValue = function(property) {{
                const value = originalGetPropertyValue.call(this, property);
                if (value && (property === 'background-image' || property === 'background' || property === 'content')) {{
                    // Tentar corrigir URLs em valores CSS
                    const urlMatch = value.match(/url\\(["']?([^"')]+)["']?\\)/);
                    if (urlMatch) {{
                        const url = urlMatch[1];
                        const fixedUrl = fixUrl(url);
                        if (fixedUrl !== url) {{
                            return value.replace(url, fixedUrl);
                        }}
                    }}
                }}
                return value;
            }};
            
            return style;
        }};
        
        // Interceptar também o setter da propriedade 'src' de elementos para capturar recursos carregados pelo CSS
        // Isso é crítico porque o CSS pode carregar recursos antes que nosso script execute
        const originalDefineProperty = Object.defineProperty;
        const interceptedElements = new WeakSet();
        
        function interceptElementSrc(element) {{
            if (interceptedElements.has(element)) return;
            interceptedElements.add(element);
            
            // Interceptar src para img, script, link, etc.
            if (element.tagName === 'IMG' || element.tagName === 'SCRIPT' || element.tagName === 'LINK') {{
                const attrName = element.tagName === 'LINK' ? 'href' : 'src';
                const originalDescriptor = Object.getOwnPropertyDescriptor(element, attrName);
                
                if (!originalDescriptor || originalDescriptor.configurable) {{
                    Object.defineProperty(element, attrName, {{
                        get: function() {{
                            const value = this.getAttribute(attrName);
                            return value ? fixUrl(value) : value;
                        }},
                        set: function(value) {{
                            const fixedValue = fixUrl(value);
                            this.setAttribute(attrName, fixedValue);
                            if (fixedValue !== value) {{
                                console.log('[Proxy] ' + element.tagName + ' ' + attrName + ' corrigido:', value, '->', fixedValue);
                            }}
                        }},
                        configurable: true,
                        enumerable: true
                    }});
                }}
            }}
        }}
        
        // Interceptar todos os elementos existentes
        document.querySelectorAll('img, script, link').forEach(interceptElementSrc);
        
        // Interceptar TODAS as requisições de recursos usando um interceptor global
        // Isso captura recursos carregados pelo CSS que não passam por fetch/XMLHttpRequest
        const originalCreateElement = document.createElement;
        document.createElement = function(tagName, options) {{
            const element = originalCreateElement.call(this, tagName, options);
            
            // Interceptar elementos que podem carregar recursos
            if (tagName.toLowerCase() === 'link' || tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'img') {{
                const originalSetAttribute = element.setAttribute;
                element.setAttribute = function(name, value) {{
                    if ((name === 'href' || name === 'src') && value) {{
                        const fixedValue = fixUrl(value);
                        if (fixedValue !== value) {{
                            console.log('[Proxy] <' + tagName + '> ' + name + ' corrigido:', value, '->', fixedValue);
                        }}
                        return originalSetAttribute.call(this, name, fixedValue);
                    }}
                    return originalSetAttribute.call(this, name, value);
                }};
                
                // Interceptar também propriedades diretas
                if (tagName.toLowerCase() === 'link') {{
                    Object.defineProperty(element, 'href', {{
                        get: function() {{
                            return this.getAttribute('href');
                        }},
                        set: function(value) {{
                            const fixedValue = fixUrl(value);
                            this.setAttribute('href', fixedValue);
                        }},
                        configurable: true
                    }});
                }} else if (tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'img') {{
                    Object.defineProperty(element, 'src', {{
                        get: function() {{
                            return this.getAttribute('src');
                        }},
                        set: function(value) {{
                            const fixedValue = fixUrl(value);
                            this.setAttribute('src', fixedValue);
                        }},
                        configurable: true
                    }});
                }}
                
                // Interceptar este elemento também
                interceptElementSrc(element);
            }}
            
            return element;
        }};
        
        
        // Interceptar elementos já existentes no DOM
        function fixExistingElements() {{
            // Corrigir <link> tags
            document.querySelectorAll('link[href]').forEach(link => {{
                const href = link.getAttribute('href');
                if (href) {{
                    const fixedHref = fixUrl(href);
                    if (fixedHref !== href) {{
                        link.setAttribute('href', fixedHref);
                        console.log('[Proxy] <link> existente corrigido:', href, '->', fixedHref);
                    }}
                    // Interceptar este elemento
                    interceptElementSrc(link);
                }}
            }});
            
            // Corrigir <script> tags
            document.querySelectorAll('script[src]').forEach(script => {{
                const src = script.getAttribute('src');
                if (src) {{
                    const fixedSrc = fixUrl(src);
                    if (fixedSrc !== src) {{
                        script.setAttribute('src', fixedSrc);
                        console.log('[Proxy] <script> existente corrigido:', src, '->', fixedSrc);
                    }}
                    // Interceptar este elemento
                    interceptElementSrc(script);
                }}
            }});
            
            // Corrigir <img> tags
            document.querySelectorAll('img[src]').forEach(img => {{
                const src = img.getAttribute('src');
                if (src) {{
                    const fixedSrc = fixUrl(src);
                    if (fixedSrc !== src) {{
                        img.setAttribute('src', fixedSrc);
                        console.log('[Proxy] <img> existente corrigido:', src, '->', fixedSrc);
                    }}
                    // Interceptar este elemento
                    interceptElementSrc(img);
                }}
            }});
        }}
        
        // Executar imediatamente e também quando o DOM estiver pronto
        if (document.readyState === 'loading') {{
            document.addEventListener('DOMContentLoaded', fixExistingElements);
        }} else {{
            fixExistingElements();
        }}
        
        // Usar MutationObserver para interceptar elementos adicionados dinamicamente
        // Consolidar com o resourceObserver anterior
        const observer = new MutationObserver(function(mutations) {{
            mutations.forEach(function(mutation) {{
                mutation.addedNodes.forEach(function(node) {{
                    if (node.nodeType === 1) {{ // Element node
                        // Corrigir URLs em elementos que podem carregar recursos
                        if (node.tagName === 'LINK' && node.href) {{
                            const fixedHref = fixUrl(node.href);
                            if (fixedHref !== node.href) {{
                                node.setAttribute('href', fixedHref);
                                console.log('[Proxy] <link> dinâmico corrigido:', node.href, '->', fixedHref);
                            }}
                            interceptElementSrc(node);
                        }} else if (node.tagName === 'SCRIPT' && node.src) {{
                            const fixedSrc = fixUrl(node.src);
                            if (fixedSrc !== node.src) {{
                                node.setAttribute('src', fixedSrc);
                                console.log('[Proxy] <script> dinâmico corrigido:', node.src, '->', fixedSrc);
                            }}
                            interceptElementSrc(node);
                        }} else if (node.tagName === 'IMG' && node.src) {{
                            const fixedSrc = fixUrl(node.src);
                            if (fixedSrc !== node.src) {{
                                node.setAttribute('src', fixedSrc);
                                console.log('[Proxy] <img> dinâmico corrigido:', node.src, '->', fixedSrc);
                            }}
                            interceptElementSrc(node);
                        }}
                        
                        // Corrigir URLs em atributos style inline
                        if (node.hasAttribute('style')) {{
                            const originalStyle = node.getAttribute('style');
                            const fixedStyle = originalStyle.replace(/url\s*\(\s*(["\']?)([^"\'()]+?)\1\s*\)/gi, function(match, quote, url) {{
                                const fixedUrl = fixUrl(url.trim());
                                return 'url(' + quote + fixedUrl + quote + ')';
                            }});
                            if (fixedStyle !== originalStyle) {{
                                node.setAttribute('style', fixedStyle);
                                console.log('[Proxy] Estilo inline corrigido');
                            }}
                        }}
                    }}
                }});
                
                // Interceptar mudanças em atributos src/href
                if (mutation.type === 'attributes') {{
                    const target = mutation.target;
                    if (mutation.attributeName === 'src' || mutation.attributeName === 'href') {{
                        const originalValue = target.getAttribute(mutation.attributeName);
                        if (originalValue) {{
                            const fixedValue = fixUrl(originalValue);
                            if (fixedValue !== originalValue) {{
                                target.setAttribute(mutation.attributeName, fixedValue);
                                console.log('[Proxy] Atributo ' + mutation.attributeName + ' modificado corrigido:', originalValue, '->', fixedValue);
                            }}
                        }}
                    }}
                }}
            }});
        }});
        
        observer.observe(document.documentElement, {{
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'href', 'style']
        }});
    }})();
    </script>
    """
    
    # Injetar no início do <head> para garantir que seja executado antes de outros scripts
    if '<head>' in html_content:
        # Injetar logo após a tag <head>
        html_content = html_content.replace('<head>', '<head>' + script, 1)
    elif '</head>' in html_content:
        html_content = html_content.replace('</head>', script + '</head>', 1)
    elif '</body>' in html_content:
        html_content = html_content.replace('</body>', script + '</body>', 1)
    else:
        html_content = script + html_content
    
    return html_content


@app.route('/api/robo-ws')
@login_required
def robo_ws_proxy():
    """
    Proxy WebSocket para o KasmVNC
    Nota: Flask não suporta WebSocket nativamente.
    Este endpoint retorna informações para o cliente fazer upgrade manual.
    Para suporte completo, considere usar Flask-SocketIO ou um servidor WebSocket dedicado.
    """
    # URL do WebSocket de destino - tentar obter IP do container automaticamente
    # Sempre usar 127.0.0.1:6901
    default_ws_url = 'wss://127.0.0.1:6901/websockify'
    target_ws_url = request.args.get('url', default_ws_url)
    
    # Converter http/https para ws/wss se necessário
    if target_ws_url.startswith('http://'):
        target_ws_url = target_ws_url.replace('http://', 'ws://', 1)
    elif target_ws_url.startswith('https://'):
        target_ws_url = target_ws_url.replace('https://', 'wss://', 1)
    elif not target_ws_url.startswith(('ws://', 'wss://')):
        # Se não tem protocolo, assumir wss
        target_ws_url = 'wss://' + target_ws_url.lstrip('/')
    
    # Flask não suporta WebSocket upgrade nativamente
    # O script injetado no HTML fará a conexão WebSocket diretamente
    # Mas precisamos retornar uma resposta válida para requisições HTTP normais
    return jsonify({
        'success': False,
        'error': 'WebSocket upgrade requerido. Use o script injetado no HTML para conexão automática.',
        'target_url': target_ws_url,
        'note': 'O script JavaScript injetado no HTML reescreverá automaticamente as conexões WebSocket'
    }), 426  # 426 Upgrade Required


def registrar_relatorio(rotina: str, usuario: str, registros: int):
    """
    Registra uma execução de rotina no arquivo relatorio.csv
    
    Args:
        rotina: Nome da rotina executada
        usuario: Nome do usuário que executou
        registros: Número de registros processados
    """
    relatorio_path = Path(__file__).parent / 'relatorio.csv'
    
    # Cabeçalho do CSV
    CABECALHO = ['data', 'hora', 'rotina', 'usuario', 'registros']
    
    try:
        # Verificar se o arquivo existe
        arquivo_existe = relatorio_path.exists()
        
        # Obter data e hora atual
        agora = datetime.now()
        data = agora.strftime('%d/%m/%Y')
        hora = agora.strftime('%H:%M:%S')
        
        # Abrir arquivo em modo append (ou criar se não existir)
        with open(relatorio_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            
            # Se o arquivo não existe ou está vazio, escrever cabeçalho
            if not arquivo_existe or relatorio_path.stat().st_size == 0:
                writer.writerow(CABECALHO)
            
            # Escrever linha de dados
            writer.writerow([data, hora, rotina, usuario, registros])
        
        return True
    except Exception as e:
        print(f"Erro ao registrar relatório: {e}")
        return False


@app.route('/api/externa/relatorio/registrar', methods=['POST', 'OPTIONS'])
def api_externa_registrar_relatorio():
    """API externa para registrar execução de rotina no relatório CSV usando chave de API"""
    # Tratar CORS preflight
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-API-Key'
        return response
    
    try:
        # Obter chave de API do header ou do body
        chave_api = request.headers.get('X-API-Key') or request.json.get('api_key') if request.json else None
        
        if not chave_api:
            response = jsonify({
                'success': False,
                'error': 'Chave de API não fornecida. Use o header X-API-Key ou o campo api_key no body.'
            })
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 401
        
        # Validar chave de API e obter usuário
        usuario_data = obter_usuario_por_chave_api(chave_api)
        if not usuario_data:
            response = jsonify({
                'success': False,
                'error': 'Chave de API inválida ou usuário inativo'
            })
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 401
        
        # Obter dados do body
        data = request.json or {}
        rotina = data.get('rotina', '').strip()
        registros = data.get('registros', 0)
        
        # Validar dados
        if not rotina:
            response = jsonify({
                'success': False,
                'error': 'Campo "rotina" é obrigatório'
            })
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 400
        
        try:
            registros = int(registros)
            if registros < 0:
                response = jsonify({
                    'success': False,
                    'error': 'Número de registros deve ser positivo ou zero'
                })
                response.headers['Access-Control-Allow-Origin'] = '*'
                return response, 400
        except (ValueError, TypeError):
            response = jsonify({
                'success': False,
                'error': 'Campo "registros" deve ser um número inteiro'
            })
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 400
        
        # Registrar no CSV usando o username do usuário autenticado
        sucesso = registrar_relatorio(rotina, usuario_data['username'], registros)
        
        if sucesso:
            response = jsonify({
                'success': True,
                'message': 'Relatório registrado com sucesso',
                'data': {
                    'rotina': rotina,
                    'registros': registros,
                    'usuario': usuario_data['username']
                }
            })
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response
        else:
            response = jsonify({
                'success': False,
                'error': 'Erro ao registrar relatório'
            })
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 500
            
    except Exception as e:
        response = jsonify({
            'success': False,
            'error': str(e)
        })
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response, 500


@app.route('/api/relatorio/registrar', methods=['POST'])
@login_required
def api_registrar_relatorio():
    """API para registrar execução de rotina no relatório CSV"""
    try:
        data = request.json or {}
        rotina = data.get('rotina', '').strip()
        registros = data.get('registros', 0)
        
        # Validar dados
        if not rotina:
            return jsonify({'success': False, 'error': 'Rotina é obrigatória'}), 400
        
        try:
            registros = int(registros)
            if registros < 0:
                return jsonify({'success': False, 'error': 'Número de registros deve ser positivo'}), 400
        except (ValueError, TypeError):
            return jsonify({'success': False, 'error': 'Número de registros inválido'}), 400
        
        # Obter usuário atual
        usuario = current_user.username if current_user.is_authenticated else 'Desconhecido'
        
        # Registrar no CSV
        sucesso = registrar_relatorio(rotina, usuario, registros)
        
        if sucesso:
            return jsonify({
                'success': True,
                'message': 'Relatório registrado com sucesso'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Erro ao registrar relatório'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
            }), 500


@app.route('/api/producao-relatorios/dados', methods=['GET'])
@login_required
def get_producao_relatorios_dados():
    """API para obter dados processados do relatorio.csv para os gráficos"""
    try:
        relatorio_path = Path(__file__).parent / 'relatorio.csv'
        
        # Carregar mapeamento username -> nome
        usuarios_data = listar_usuarios()
        username_to_nome = {u['username']: u['nome'] for u in usuarios_data}
        nome_to_username = {u['nome']: u['username'] for u in usuarios_data}
        
        # Parâmetros de filtro
        data_inicial = request.args.get('data_inicial', '')
        data_final = request.args.get('data_final', '')
        usuarios_filtro = request.args.getlist('usuarios[]')  # Recebe nomes agora
        modulos = request.args.getlist('modulos[]')
        
        # Converter nomes de usuário para usernames para filtro
        usuarios_filtro_usernames = []
        for nome in usuarios_filtro:
            if nome in nome_to_username:
                usuarios_filtro_usernames.append(nome_to_username[nome])
            elif nome in username_to_nome:  # Se já for username, manter
                usuarios_filtro_usernames.append(nome)
        
        # Ler CSV
        dados_raw = []
        if relatorio_path.exists():
            with open(relatorio_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    dados_raw.append(row)
        
        # Processar e filtrar dados
        dados_filtrados = []
        usuarios_unicos = set()
        modulos_unicos = set()
        
        for registro in dados_raw:
            # Converter data de DD/MM/YYYY ou YYYY-MM-DD para datetime
            data_str = registro.get('data', '').strip()
            data_registro = None
            try:
                # Tentar formato DD/MM/YYYY primeiro (formato padrão)
                data_registro = datetime.strptime(data_str, '%d/%m/%Y')
            except:
                try:
                    # Tentar formato YYYY-MM-DD (formato alternativo)
                    data_registro = datetime.strptime(data_str, '%Y-%m-%d')
                except:
                    # Se nenhum formato funcionar, pular este registro
                    continue
            
            # Filtrar por período
            if data_inicial:
                try:
                    data_ini = datetime.strptime(data_inicial, '%Y-%m-%d')
                    if data_registro < data_ini:
                        continue
                except:
                    pass
            
            if data_final:
                try:
                    data_fim = datetime.strptime(data_final, '%Y-%m-%d')
                    if data_registro > data_fim:
                        continue
                except:
                    pass
            
            # Filtrar por usuários (usando username do CSV)
            usuario_username = registro.get('usuario', '').strip()
            if usuarios_filtro_usernames and usuario_username not in usuarios_filtro_usernames:
                continue
            
            # Filtrar por módulos
            rotina = registro.get('rotina', '').strip()
            if modulos and rotina not in modulos:
                continue
            
            # Coletar usuários (nomes) e módulos únicos
            if usuario_username and usuario_username in username_to_nome:
                usuarios_unicos.add(username_to_nome[usuario_username])
            elif usuario_username:
                usuarios_unicos.add(usuario_username)  # Fallback se não encontrar nome
            if rotina:
                modulos_unicos.add(rotina)
            
            dados_filtrados.append({
                'data': registro.get('data', ''),
                'hora': registro.get('hora', ''),
                'rotina': rotina,
                'usuario': usuario_username,  # Manter username para processamento interno
                'usuario_nome': username_to_nome.get(usuario_username, usuario_username),  # Nome para exibição
                'registros': int(registro.get('registros', 0) or 0)
            })
        
        # Período efetivo para os gráficos (usar filtro ou mês atual)
        hoje = datetime.now()
        if data_inicial and data_final:
            try:
                data_ini = datetime.strptime(data_inicial, '%Y-%m-%d')
                data_fim = datetime.strptime(data_final, '%Y-%m-%d')
                ano_ini, mes_ini = data_ini.year, data_ini.month
                ano_fim, mes_fim = data_fim.year, data_fim.month
            except Exception:
                ano_ini, mes_ini = hoje.year, hoje.month
                ano_fim, mes_fim = hoje.year, hoje.month
                data_ini = datetime(hoje.year, hoje.month, 1)
                data_fim = hoje
        else:
            ano_ini, mes_ini = hoje.year, hoje.month
            ano_fim, mes_fim = hoje.year, hoje.month
            data_ini = datetime(hoje.year, hoje.month, 1)
            data_fim = hoje

        # Período cobre um único mês ou múltiplos meses?
        um_mes_only = (ano_ini == ano_fim and mes_ini == mes_fim)
        meses_labels_pt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

        producao_modulo = {}
        producao_usuario = {}
        producao_modulo_usuario = {}  # (rotina, usuario_nome) -> dia ou (ano,mes) -> total
        producao_periodo = {}

        for registro in dados_filtrados:
            try:
                data_str = registro.get('data', '').strip()
                try:
                    data_reg = datetime.strptime(data_str, '%d/%m/%Y')
                except Exception:
                    try:
                        data_reg = datetime.strptime(data_str, '%Y-%m-%d')
                    except Exception:
                        continue

                rotina = registro['rotina']
                usuario_username = registro['usuario']
                usuario_nome = registro.get('usuario_nome', usuario_username)
                registros = registro['registros']
                ano, mes, dia = data_reg.year, data_reg.month, data_reg.day

                # Dentro do período filtrado?
                if data_reg < data_ini or data_reg > data_fim:
                    continue

                if um_mes_only:
                    # Um único mês: agrupar por dia
                    if rotina not in producao_modulo:
                        producao_modulo[rotina] = {}
                    producao_modulo[rotina][dia] = producao_modulo[rotina].get(dia, 0) + registros
                    if usuario_nome not in producao_usuario:
                        producao_usuario[usuario_nome] = {}
                    producao_usuario[usuario_nome][dia] = producao_usuario[usuario_nome].get(dia, 0) + registros
                    chave_mod_usr = (rotina, usuario_nome)
                    if chave_mod_usr not in producao_modulo_usuario:
                        producao_modulo_usuario[chave_mod_usr] = {}
                    producao_modulo_usuario[chave_mod_usr][dia] = producao_modulo_usuario[chave_mod_usr].get(dia, 0) + registros
                else:
                    # Múltiplos meses: agrupar por (ano, mes)
                    chave_mes = (ano, mes)
                    if rotina not in producao_modulo:
                        producao_modulo[rotina] = {}
                    producao_modulo[rotina][chave_mes] = producao_modulo[rotina].get(chave_mes, 0) + registros
                    if usuario_nome not in producao_usuario:
                        producao_usuario[usuario_nome] = {}
                    producao_usuario[usuario_nome][chave_mes] = producao_usuario[usuario_nome].get(chave_mes, 0) + registros
                    chave_mod_usr = (rotina, usuario_nome)
                    if chave_mod_usr not in producao_modulo_usuario:
                        producao_modulo_usuario[chave_mod_usr] = {}
                    producao_modulo_usuario[chave_mod_usr][chave_mes] = producao_modulo_usuario[chave_mod_usr].get(chave_mes, 0) + registros

                chave_periodo = f"{ano}-{mes:02d}"
                if chave_periodo not in producao_periodo:
                    producao_periodo[chave_periodo] = {'ano': ano, 'mes': mes, 'registros': 0}
                producao_periodo[chave_periodo]['registros'] += registros

            except Exception as e:
                print(f"Erro ao processar registro para gráficos: {e}")
                continue

        # Lista de (ano, mes) no intervalo para labels de múltiplos meses
        def meses_no_intervalo(ani, mi, anf, mf):
            out = []
            a, m = ani, mi
            while (a, m) <= (anf, mf):
                out.append((a, m))
                if m == 12:
                    a, m = a + 1, 1
                else:
                    m += 1
            return out

        if um_mes_only:
            ano_ref, mes_ref = ano_ini, mes_ini
            ultimo_dia_mes = calendar.monthrange(ano_ref, mes_ref)[1]
            labels_modulo = list(range(1, ultimo_dia_mes + 1))
            labels_usuario = list(range(1, ultimo_dia_mes + 1))
            tipo_eixo = 'dia'
        else:
            lista_meses = meses_no_intervalo(ano_ini, mes_ini, ano_fim, mes_fim)
            labels_modulo = [f"{meses_labels_pt[m - 1]}/{a}" for a, m in lista_meses]
            labels_usuario = [f"{meses_labels_pt[m - 1]}/{a}" for a, m in lista_meses]
            tipo_eixo = 'mes'
            chaves_ordenadas = lista_meses

        # Dados por módulo
        dados_modulo = {'labels': labels_modulo, 'datasets': [], 'tipo_eixo': tipo_eixo}
        if producao_modulo:
            if um_mes_only:
                for rotina in sorted(producao_modulo.keys()):
                    dados = [producao_modulo[rotina].get(dia, 0) for dia in labels_modulo]
                    dados_modulo['datasets'].append({'label': rotina, 'data': dados})
            else:
                for rotina in sorted(producao_modulo.keys()):
                    dados = [producao_modulo[rotina].get(chave, 0) for chave in chaves_ordenadas]
                    dados_modulo['datasets'].append({'label': rotina, 'data': dados})

        # Dados por usuário
        dados_usuario = {'labels': labels_usuario, 'datasets': [], 'tipo_eixo': tipo_eixo}
        if producao_usuario:
            if um_mes_only:
                for nome_usuario in sorted(producao_usuario.keys()):
                    dados = [producao_usuario[nome_usuario].get(dia, 0) for dia in labels_usuario]
                    dados_usuario['datasets'].append({'label': nome_usuario, 'data': dados})
            else:
                for nome_usuario in sorted(producao_usuario.keys()):
                    dados = [producao_usuario[nome_usuario].get(chave, 0) for chave in chaves_ordenadas]
                    dados_usuario['datasets'].append({'label': nome_usuario, 'data': dados})

        # Dados por período: eixo X = meses no intervalo (ex: fev/2026, mar/2026)
        if um_mes_only:
            lista_meses_periodo = [(ano_ini, mes_ini)]
        else:
            lista_meses_periodo = meses_no_intervalo(ano_ini, mes_ini, ano_fim, mes_fim)
        labels_periodo = [f"{meses_labels_pt[m - 1]}/{a}" for a, m in lista_meses_periodo]
        dados_periodo = {'labels': labels_periodo, 'datasets': []}
        # Um dataset "Total" com totais por mês no intervalo
        totais_por_mes = [producao_periodo.get(f"{a}-{m:02d}", {}).get('registros', 0) for a, m in lista_meses_periodo]
        dados_periodo['datasets'].append({'label': 'Total', 'data': totais_por_mes})

        # Resumo por módulo: total no período por módulo (dia x módulo, sem usuário)
        dados_modulo_resumo = {'labels': [], 'data': []}
        if producao_modulo:
            for rotina in sorted(producao_modulo.keys()):
                total = sum(producao_modulo[rotina].values())
                dados_modulo_resumo['labels'].append(rotina)
                dados_modulo_resumo['data'].append(total)

        # Detalhada por usuário: módulo x usuário, eixo X = dias (ou meses)
        dados_usuario_detalhado = {'labels': labels_modulo, 'datasets': [], 'tipo_eixo': tipo_eixo}
        if producao_modulo_usuario:
            if um_mes_only:
                for (rotina, nome_usr) in sorted(producao_modulo_usuario.keys()):
                    dados = [producao_modulo_usuario[(rotina, nome_usr)].get(d, 0) for d in labels_modulo]
                    dados_usuario_detalhado['datasets'].append({
                        'label': f"{rotina} — {nome_usr}",
                        'data': dados
                    })
            else:
                for (rotina, nome_usr) in sorted(producao_modulo_usuario.keys()):
                    dados = [producao_modulo_usuario[(rotina, nome_usr)].get(chave, 0) for chave in chaves_ordenadas]
                    dados_usuario_detalhado['datasets'].append({
                        'label': f"{rotina} — {nome_usr}",
                        'data': dados
                    })
        
        return jsonify({
            'success': True,
            'dados_modulo_resumo': dados_modulo_resumo,
            'dados_modulo': dados_modulo,
            'dados_usuario': dados_usuario,
            'dados_usuario_detalhado': dados_usuario_detalhado,
            'dados_periodo': dados_periodo,
            'usuarios_disponiveis': sorted(list(usuarios_unicos)),
            'modulos_disponiveis': sorted(list(modulos_unicos)),
            'total_registros': len(dados_filtrados)
        })
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Erro em get_producao_relatorios_dados: {e}")
        print(error_trace)
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': error_trace
        }), 500


@app.route('/api/internacoes-solicitar/load', methods=['GET'])
@login_required
def load_internacoes_csv():
    """Carrega o conteúdo do arquivo CSV de internações para solicitar"""
    csv_path = Path(WORKDIR) / 'internados_ghosp_avancado.csv'
    
    try:
        # Garantir que o diretório existe
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Se o arquivo não existir, criar com coluna 'ra'
        if not csv_path.exists():
            with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(['ra'])
        
        # Ler o CSV
        data = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            for row in reader:
                data.append(row)
        
        # Se o arquivo estava vazio, criar com coluna 'ra'
        if not data or len(data) == 0:
            data = [['ra']]
            # Salvar o cabeçalho no arquivo
            with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(['ra'])
        
        return jsonify({
            'success': True,
            'data': data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/pendencias-internacoes/load', methods=['GET'])
@login_required
def load_pendencias_csv():
    """Carrega o conteúdo do arquivo CSV de pendências de internações"""
    csv_path = Path(WORKDIR) / 'solicita_inf_aih.csv'
    
    try:
        # Garantir que o diretório existe
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Se o arquivo não existir, criar arquivo vazio
        if not csv_path.exists():
            with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                pass  # Arquivo vazio
        
        # Ler o CSV
        data = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            for row in reader:
                data.append(row)
        
        # Se o arquivo estava vazio, retornar array vazio (frontend tratará)
        if not data or len(data) == 0:
            data = []
        
        return jsonify({
            'success': True,
            'data': data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/pendencias-internacoes/save', methods=['POST'])
@login_required
def save_pendencias_csv():
    """Salva o conteúdo editado no arquivo CSV de pendências"""
    try:
        data = request.json.get('data', [])
        csv_path = Path(WORKDIR) / 'solicita_inf_aih.csv'
        
        # Garantir que o diretório existe
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Salvar o CSV exatamente como recebido (sem forçar cabeçalho padrão)
        # A primeira linha do data será salva como está (cabeçalho do CSV)
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            for row in data:
                writer.writerow(row)
        
        return jsonify({
            'success': True,
            'message': 'CSV salvo com sucesso'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/internacoes-solicitar/save', methods=['POST'])
@login_required
def save_internacoes_csv():
    """Salva o conteúdo editado no arquivo CSV"""
    try:
        data = request.json.get('data', [])
        csv_path = Path(WORKDIR) / 'internados_ghosp_avancado.csv'
        
        # Garantir que o diretório existe
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Salvar o CSV exatamente como recebido (sem forçar cabeçalho padrão)
        # A primeira linha do data será salva como está (cabeçalho do CSV)
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerows(data)
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/internacoes-solicitar/buscar-pendentes', methods=['POST'])
@login_required
def executar_buscar_pendentes():
    """Executa o comando -aihs do autoreg com streaming em tempo real"""
    data = request.json or {}
    session_id = data.get('session_id', str(threading.current_thread().ident))
    
    def gerar():
        nonlocal session_id
        try:
            # Construir comando completo
            # Adicionar -u para unbuffered output se for Python
            if 'python' in PYTHONPATH.lower():
                comando_original = [PYTHONPATH, '-u', AUTOREGPATH, '-aihs']
            else:
                comando_original = [PYTHONPATH, AUTOREGPATH, '-aihs']
            
            # Verificar container antes de executar (apenas se USE_DOCKER estiver ativado)
            if USE_DOCKER and DOCKER_CONTAINER:
                container_ok, mensagem = verificar_container_docker()
                if not container_ok:
                    yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': f'Container Docker não acessível: {mensagem}'})}\n\n"
                    return
            
            # Construir comando com Docker se necessário
            comando = construir_comando_docker(comando_original)
            
            # Enviar início do comando
            yield f"data: {json.dumps({'tipo': 'inicio', 'comando': ' '.join(comando)})}\n\n"
            
            # Executar comando com streaming
            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'
            
            cwd_exec = None if (USE_DOCKER and DOCKER_CONTAINER) else WORKDIR
            
            processo = subprocess.Popen(
                comando,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=0,
                universal_newlines=True,
                cwd=cwd_exec,
                env=env
            )
            
            # Armazenar processo para permitir interrupção
            with processos_lock:
                processos_ativos[session_id] = processo
                processos_info[session_id] = {
                    'comando': ' '.join(comando),
                    'tipo': 'solicitar-tcs'
                }
            
            # Ler saída caractere por caractere para streaming verdadeiro
            buffer_linha = ''
            while True:
                char = processo.stdout.read(1)
                if not char:
                    if processo.poll() is not None:
                        if buffer_linha.strip():
                            yield f"data: {json.dumps({'tipo': 'output', 'linha': buffer_linha.rstrip()})}\n\n"
                        break
                    continue
                
                buffer_linha += char
                
                if char == '\n':
                    linha_limpa = buffer_linha.rstrip()
                    if linha_limpa:
                        yield f"data: {json.dumps({'tipo': 'output', 'linha': linha_limpa})}\n\n"
                    buffer_linha = ''
            
            # Aguardar término do processo
            processo.wait()
            
            # Remover processo da lista de ativos apenas após realmente terminar
            with processos_lock:
                if session_id in processos_ativos:
                    del processos_ativos[session_id]
                    if session_id in processos_info:
                        del processos_info[session_id]
            
            # Enviar resultado
            if processo.returncode == 0:
                yield f"data: {json.dumps({'tipo': 'sucesso', 'mensagem': 'Comando executado com sucesso!'})}\n\n"
            else:
                yield f"data: {json.dumps({'tipo': 'erro', 'codigo': processo.returncode, 'mensagem': 'Comando retornou código de erro'})}\n\n"
                
        except Exception as e:
            with processos_lock:
                if session_id in processos_ativos:
                    del processos_ativos[session_id]
            yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': str(e)})}\n\n"
    
    response = Response(gerar(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response


@app.route('/api/internacoes-solicitar/interromper', methods=['POST'])
@login_required
def interromper_buscar_pendentes():
    """Interrompe o processo de busca de pendentes"""
    try:
        data = request.json or {}
        session_id = data.get('session_id', str(threading.current_thread().ident))
        
        with processos_lock:
            if session_id in processos_ativos:
                processo = processos_ativos[session_id]
                
                try:
                    processo.terminate()
                    try:
                        processo.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        processo.kill()
                        processo.wait()
                    
                    del processos_ativos[session_id]
                    if session_id in processos_stdin:
                        del processos_stdin[session_id]
                    
                    return jsonify({
                        'success': True,
                        'mensagem': 'Processo interrompido com sucesso'
                    })
                except ProcessLookupError:
                    if session_id in processos_ativos:
                        del processos_ativos[session_id]
                    if session_id in processos_stdin:
                        del processos_stdin[session_id]
                    return jsonify({
                        'success': True,
                        'mensagem': 'Processo já havia terminado'
                    })
            else:
                return jsonify({
                    'success': False,
                    'mensagem': 'Nenhum processo em execução encontrado'
                }), 404
                
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/internacoes-solicitar/executar', methods=['POST'])
@login_required
def executar_solicitar_internacoes():
    """Executa os comandos sequenciais para solicitar internações: -spa -sia -ssr -snt"""
    data = request.json or {}
    comando_index = data.get('comando_index', 0)
    session_id = data.get('session_id', str(threading.current_thread().ident))
    
    def gerar():
        nonlocal session_id
        try:
            # Comandos a serem executados sequencialmente
            comandos = [
                ['-spa'],  # Primeiro comando - requer interação manual
                ['-sia'],  # Segundo comando
                ['-ssr'],  # Terceiro comando
                ['-snt']   # Quarto comando
            ]
            
            if comando_index >= len(comandos):
                yield f"data: {json.dumps({'tipo': 'completo', 'mensagem': 'Todos os comandos foram executados com sucesso!'})}\n\n"
                return
            
            # Construir comando completo
            if 'python' in PYTHONPATH.lower():
                comando_original = [PYTHONPATH, '-u', AUTOREGPATH] + comandos[comando_index]
            else:
                comando_original = [PYTHONPATH, AUTOREGPATH] + comandos[comando_index]
            
            # Verificar container antes de executar
            if USE_DOCKER and DOCKER_CONTAINER:
                container_ok, mensagem = verificar_container_docker()
                if not container_ok:
                    yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': f'Container Docker não acessível: {mensagem}'})}\n\n"
                    return
            
            # Construir comando com Docker se necessário
            comando = construir_comando_docker(comando_original)
            
            # Se for o primeiro comando (-spa), criar flag de pausa antes de executar
            if comando_index == 0:
                try:
                    pause_flag_path = Path(WORKDIR) / 'pause.flag'
                    pause_flag_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(pause_flag_path, 'w', encoding='utf-8') as f:
                        f.write('pausar')
                    yield f"data: {json.dumps({'tipo': 'output', 'linha': 'Flag pause.flag criada - processo será pausado para interação'})}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': f'Erro ao criar flag de pausa: {str(e)}'})}\n\n"
                    return
            
            # Enviar início do comando
            yield f"data: {json.dumps({'tipo': 'inicio', 'comando_index': comando_index, 'total': len(comandos), 'comando': ' '.join(comando)})}\n\n"
            
            # Executar comando com streaming
            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'
            
            cwd_exec = None if (USE_DOCKER and DOCKER_CONTAINER) else WORKDIR
            
            # Para o primeiro comando (-spa), precisamos de stdin para interação
            # Para os outros comandos, não precisamos
            precisa_stdin = (comando_index == 0)
            
            processo = subprocess.Popen(
                comando,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE if precisa_stdin else None,
                text=True,
                bufsize=0,
                universal_newlines=True,
                cwd=cwd_exec,
                env=env
            )
            
            # Armazenar processo e stdin se necessário
            with processos_lock:
                processos_ativos[session_id] = processo
                processos_info[session_id] = {
                    'comando': ' '.join(comando),
                    'tipo': 'internacoes-solicitar',
                    'comando_index': comando_index
                }
                if precisa_stdin:
                    processos_stdin[session_id] = processo.stdin
            
            # Ler saída caractere por caractere usando thread para evitar bloqueio
            output_queue = queue.Queue()
            # Armazenar queue para permitir reconexão
            with processos_lock:
                processos_queues[session_id] = output_queue
            leitura_ativa = threading.Event()
            leitura_ativa.set()
            
            def ler_stdout_thread():
                """Thread para ler stdout sem bloquear o processo principal"""
                buffer_local = ''
                try:
                    while leitura_ativa.is_set():
                        char = processo.stdout.read(1)
                        if not char:
                            if processo.poll() is not None:
                                if buffer_local.strip():
                                    output_queue.put(('linha', buffer_local.rstrip()))
                                output_queue.put(('fim', None))
                                break
                            time.sleep(0.1)
                            continue
                        
                        buffer_local += char
                        if char == '\n':
                            linha_limpa = buffer_local.rstrip()
                            if linha_limpa:
                                output_queue.put(('linha', linha_limpa))
                            buffer_local = ''
                except Exception as e:
                    output_queue.put(('erro', str(e)))
            
            # Iniciar thread de leitura
            thread_leitura = threading.Thread(target=ler_stdout_thread, daemon=True)
            thread_leitura.start()
            
            # Processar saída da queue
            buffer_linha = ''
            ultima_linha_aguardando = None
            
            while True:
                try:
                    # Aguardar item da queue com timeout
                    try:
                        tipo_item, dados = output_queue.get(timeout=0.5)
                    except queue.Empty:
                        # Timeout - verificar se processo ainda está rodando
                        if processo.poll() is not None:
                            if buffer_linha.strip():
                                yield f"data: {json.dumps({'tipo': 'output', 'linha': buffer_linha.rstrip()})}\n\n"
                            break
                        continue
                    
                    if tipo_item == 'fim':
                        break
                    elif tipo_item == 'erro':
                        yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': dados})}\n\n"
                        break
                    elif tipo_item == 'linha':
                        linha_limpa = dados
                        yield f"data: {json.dumps({'tipo': 'output', 'linha': linha_limpa})}\n\n"
                        
                        # Detectar quando o processo está aguardando input do usuário
                        if precisa_stdin:
                            linha_lower = linha_limpa.lower().strip()
                            linha_sem_espacos = linha_limpa.strip()
                            
                            padrao_detectado = False
                            
                            # Padrão 1: "👉 Digite o comando (s/p):"
                            if '👉' in linha_sem_espacos and 'digite' in linha_lower and ('comando' in linha_lower or 's/p' in linha_lower):
                                padrao_detectado = True
                            
                            # Padrão 2: "Aguardando interação do usuário"
                            elif 'aguardando interação' in linha_lower and 'usuário' in linha_lower:
                                padrao_detectado = True
                            
                            # Padrão 3: "Digite 's' e pressione Enter" ou "Digite 'p' e pressione Enter"
                            elif ('digite' in linha_lower and 'pressione enter' in linha_lower) and \
                                 (("'s'" in linha_lower or "'p'" in linha_lower) or ('s' in linha_lower and 'p' in linha_lower)):
                                padrao_detectado = True
                            
                            if padrao_detectado:
                                if linha_sem_espacos != ultima_linha_aguardando:
                                    ultima_linha_aguardando = linha_sem_espacos
                                    time.sleep(0.3)
                                    yield f"data: {json.dumps({'tipo': 'aguardando_input', 'mensagem': 'Aguardando interação do usuário', 'linha': linha_limpa})}\n\n"
                                    
                                    # Aguardar até que o usuário envie um comando e o processo produza nova saída
                                    # A thread continua lendo, mas se não houver dados por um tempo,
                                    # sabemos que está aguardando input
                                    timeout_aguardando = 0
                                    sem_dados_count = 0
                                    while timeout_aguardando < 300:  # Timeout de 5 minutos
                                        if processo.poll() is not None:
                                            break
                                        # Verificar se há nova saída disponível
                                        try:
                                            tipo_item, dados = output_queue.get(timeout=1.0)
                                            sem_dados_count = 0
                                            if tipo_item == 'linha':
                                                # Nova saída após enviar comando - processar
                                                yield f"data: {json.dumps({'tipo': 'output', 'linha': dados})}\n\n"
                                                # Continuar processamento normal
                                                break
                                            elif tipo_item == 'fim':
                                                break
                                        except queue.Empty:
                                            sem_dados_count += 1
                                            timeout_aguardando += 1.0
                                            # Se não há dados por 2 segundos após detectar aguardando input,
                                            # assumimos que está realmente aguardando
                                            if sem_dados_count >= 2:
                                                # Continuar aguardando, mas não bloquear
                                                continue
                                        
                except Exception as e:
                    yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': str(e)})}\n\n"
                    break
            
            # Parar thread de leitura
            leitura_ativa.clear()
            thread_leitura.join(timeout=1)
            
            # Aguardar término do processo
            processo.wait()
            
            # Se foi o primeiro comando (-spa), remover flag de pausa
            if comando_index == 0:
                try:
                    pause_flag_path = Path(WORKDIR) / 'pause.flag'
                    if pause_flag_path.exists():
                        pause_flag_path.unlink()
                except Exception as e:
                    # Log erro mas não interromper execução
                    print(f"Erro ao remover pause.flag: {e}")
                
                # Após finalização do comando -spa, contar registros e gravar no relatório
                if processo.returncode == 0:
                    try:
                        csv_path = Path(WORKDIR) / 'solicita_inf_aih.csv'
                        registros = 0
                        
                        if csv_path.exists():
                            with open(csv_path, 'r', encoding='utf-8') as f:
                                reader = csv.reader(f)
                                linhas = list(reader)
                                # Contar linhas com informações (exceto a primeira que é cabeçalho)
                                if len(linhas) > 1:
                                    # Contar apenas linhas que não estão vazias ou têm pelo menos um campo preenchido
                                    registros = sum(1 for linha in linhas[1:] if linha and any(campo.strip() for campo in linha))
                        
                        # Obter usuário logado
                        usuario = current_user.username if current_user.is_authenticated else 'Desconhecido'
                        
                        # Registrar no relatório
                        registrar_relatorio('Solicitar Internações', usuario, registros)
                        
                        yield f"data: {json.dumps({'tipo': 'info', 'mensagem': f'Relatório registrado: {registros} registros encontrados em solicita_inf_aih.csv'})}\n\n"
                    except Exception as e:
                        # Log erro mas não interromper execução
                        print(f"Erro ao contar registros e gravar relatório: {e}")
                        yield f"data: {json.dumps({'tipo': 'aviso', 'mensagem': f'Aviso: Erro ao registrar relatório: {str(e)}'})}\n\n"
            
            # NÃO remover processo da lista de ativos aqui
            # O processo pode ainda estar rodando mesmo que o streaming tenha terminado
            # Ele será removido apenas quando realmente terminar (poll() != None)
            print(f"[DEBUG] Streaming terminou para executar {session_id}, mas processo pode ainda estar rodando")
            
            # Calcular progresso
            progresso = int(((comando_index + 1) / len(comandos)) * 100)
            
            # Enviar resultado
            if processo.returncode == 0:
                yield f"data: {json.dumps({'tipo': 'sucesso', 'comando_index': comando_index, 'progresso': progresso, 'completo': comando_index + 1 >= len(comandos), 'mensagem': f'Comando {comandos[comando_index][0]} executado com sucesso'})}\n\n"
            else:
                yield f"data: {json.dumps({'tipo': 'erro', 'codigo': processo.returncode, 'mensagem': f'Comando {comandos[comando_index][0]} retornou código de erro'})}\n\n"
                
        except Exception as e:
            with processos_lock:
                if session_id in processos_ativos:
                    del processos_ativos[session_id]
                if session_id in processos_stdin:
                    del processos_stdin[session_id]
            yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': str(e)})}\n\n"
    
    response = Response(gerar(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response


@app.route('/api/internacoes-solicitar/revisar-aih', methods=['POST'])
@login_required
def executar_revisar_aih():
    """Executa apenas o comando -spa e grava a produção no relatório"""
    data = request.json or {}
    session_id = data.get('session_id', str(threading.current_thread().ident))
    
    def gerar():
        nonlocal session_id
        try:
            # Comando -spa
            comando = ['-spa']
            
            # Construir comando completo
            if 'python' in PYTHONPATH.lower():
                comando_original = [PYTHONPATH, '-u', AUTOREGPATH] + comando
            else:
                comando_original = [PYTHONPATH, AUTOREGPATH] + comando
            
            # Verificar container antes de executar
            if USE_DOCKER and DOCKER_CONTAINER:
                container_ok, mensagem = verificar_container_docker()
                if not container_ok:
                    yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': f'Container Docker não acessível: {mensagem}'})}\n\n"
                    return
            
            # Construir comando com Docker se necessário
            comando_exec = construir_comando_docker(comando_original)
            
            # Criar flag de pausa antes de executar
            try:
                pause_flag_path = Path(WORKDIR) / 'pause.flag'
                pause_flag_path.parent.mkdir(parents=True, exist_ok=True)
                with open(pause_flag_path, 'w', encoding='utf-8') as f:
                    f.write('pausar')
                yield f"data: {json.dumps({'tipo': 'output', 'linha': 'Flag pause.flag criada - processo será pausado para interação'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': f'Erro ao criar flag de pausa: {str(e)}'})}\n\n"
                return
            
            # Enviar início do comando
            yield f"data: {json.dumps({'tipo': 'inicio', 'comando': ' '.join(comando_exec)})}\n\n"
            
            # Executar comando com streaming
            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'
            
            cwd_exec = None if (USE_DOCKER and DOCKER_CONTAINER) else WORKDIR
            
            # Precisamos de stdin para interação
            processo = subprocess.Popen(
                comando_exec,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE,
                text=True,
                bufsize=0,
                universal_newlines=True,
                cwd=cwd_exec,
                env=env
            )
            
            # Armazenar processo e stdin
            with processos_lock:
                processos_ativos[session_id] = processo
                processos_info[session_id] = {
                    'comando': ' '.join(comando_exec),
                    'tipo': 'revisar-aih'
                }
                processos_stdin[session_id] = processo.stdin
            
            # Ler saída caractere por caractere usando thread para evitar bloqueio
            output_queue = queue.Queue()
            # Armazenar queue para permitir reconexão
            with processos_lock:
                processos_queues[session_id] = output_queue
            leitura_ativa = threading.Event()
            leitura_ativa.set()
            
            def ler_stdout_thread():
                """Thread para ler stdout sem bloquear o processo principal"""
                buffer_local = ''
                try:
                    while leitura_ativa.is_set():
                        char = processo.stdout.read(1)
                        if not char:
                            if processo.poll() is not None:
                                if buffer_local.strip():
                                    output_queue.put(('linha', buffer_local.rstrip()))
                                output_queue.put(('fim', None))
                                break
                            time.sleep(0.1)
                            continue
                        
                        buffer_local += char
                        if char == '\n':
                            linha_limpa = buffer_local.rstrip()
                            if linha_limpa:
                                output_queue.put(('linha', linha_limpa))
                            buffer_local = ''
                except Exception as e:
                    output_queue.put(('erro', str(e)))
            
            # Iniciar thread de leitura
            thread_leitura = threading.Thread(target=ler_stdout_thread, daemon=True)
            thread_leitura.start()
            
            # Processar saída da queue
            buffer_linha = ''
            ultima_linha_aguardando = None
            
            while True:
                try:
                    # Aguardar item da queue com timeout
                    try:
                        tipo_item, dados = output_queue.get(timeout=0.5)
                    except queue.Empty:
                        # Timeout - verificar se processo ainda está rodando
                        if processo.poll() is not None:
                            if buffer_linha.strip():
                                yield f"data: {json.dumps({'tipo': 'output', 'linha': buffer_linha.rstrip()})}\n\n"
                            break
                        continue
                    
                    if tipo_item == 'fim':
                        break
                    elif tipo_item == 'erro':
                        yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': dados})}\n\n"
                        break
                    elif tipo_item == 'linha':
                        linha_limpa = dados
                        yield f"data: {json.dumps({'tipo': 'output', 'linha': linha_limpa})}\n\n"
                        
                        # Detectar quando o processo está aguardando input do usuário
                        linha_lower = linha_limpa.lower().strip()
                        linha_sem_espacos = linha_limpa.strip()
                        
                        padrao_detectado = False
                        
                        # Padrão 1: "👉 Digite o comando (s/p):"
                        if '👉' in linha_sem_espacos and 'digite' in linha_lower and ('comando' in linha_lower or 's/p' in linha_lower):
                            padrao_detectado = True
                        
                        # Padrão 2: "Aguardando interação do usuário"
                        elif 'aguardando interação' in linha_lower and 'usuário' in linha_lower:
                            padrao_detectado = True
                        
                        # Padrão 3: "Digite 's' e pressione Enter" ou "Digite 'p' e pressione Enter"
                        elif ('digite' in linha_lower and 'pressione enter' in linha_lower) and \
                             (("'s'" in linha_lower or "'p'" in linha_lower) or ('s' in linha_lower and 'p' in linha_lower)):
                            padrao_detectado = True
                        
                        if padrao_detectado:
                            if linha_sem_espacos != ultima_linha_aguardando:
                                ultima_linha_aguardando = linha_sem_espacos
                                time.sleep(0.3)
                                yield f"data: {json.dumps({'tipo': 'aguardando_input', 'mensagem': 'Aguardando interação do usuário', 'linha': linha_limpa})}\n\n"
                                
                                # Aguardar até que o usuário envie um comando e o processo produza nova saída
                                timeout_aguardando = 0
                                sem_dados_count = 0
                                while timeout_aguardando < 300:  # Timeout de 5 minutos
                                    if processo.poll() is not None:
                                        break
                                    # Verificar se há nova saída disponível
                                    try:
                                        tipo_item, dados = output_queue.get(timeout=1.0)
                                        sem_dados_count = 0
                                        if tipo_item == 'linha':
                                            # Nova saída após enviar comando - processar
                                            yield f"data: {json.dumps({'tipo': 'output', 'linha': dados})}\n\n"
                                            # Continuar processamento normal
                                            break
                                        elif tipo_item == 'fim':
                                            break
                                    except queue.Empty:
                                        sem_dados_count += 1
                                        timeout_aguardando += 1.0
                                        # Se não há dados por 2 segundos após detectar aguardando input,
                                        # assumimos que está realmente aguardando
                                        if sem_dados_count >= 2:
                                            # Continuar aguardando, mas não bloquear
                                            continue
                    
                except Exception as e:
                    yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': str(e)})}\n\n"
                    break
            
            # Parar thread de leitura
            leitura_ativa.clear()
            thread_leitura.join(timeout=1)
            
            # Aguardar término do processo
            processo.wait()
            
            # Remover flag de pausa
            try:
                pause_flag_path = Path(WORKDIR) / 'pause.flag'
                if pause_flag_path.exists():
                    pause_flag_path.unlink()
            except Exception as e:
                print(f"Erro ao remover pause.flag: {e}")
            
            # NÃO remover processo da lista de ativos aqui
            # O processo pode ainda estar rodando mesmo que o streaming tenha terminado
            # Ele será removido apenas quando realmente terminar (poll() != None)
            print(f"[DEBUG] Streaming terminou para revisar-aih {session_id}, mas processo pode ainda estar rodando")
            
            # Enviar resultado
            if processo.returncode == 0:
                yield f"data: {json.dumps({'tipo': 'sucesso', 'mensagem': 'Revisão de solicitações AIH concluída com sucesso!'})}\n\n"
            else:
                yield f"data: {json.dumps({'tipo': 'erro', 'codigo': processo.returncode, 'mensagem': 'Comando retornou código de erro'})}\n\n"
                
        except Exception as e:
            with processos_lock:
                if session_id in processos_ativos:
                    del processos_ativos[session_id]
                if session_id in processos_stdin:
                    del processos_stdin[session_id]
            yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': str(e)})}\n\n"
    
    response = Response(gerar(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response


@app.route('/api/internacoes-solicitar/gravar-producao', methods=['POST'])
@login_required
def gravar_producao_internacoes():
    """Conta os registros do CSV e grava no relatório"""
    try:
        csv_path = Path(WORKDIR) / 'solicita_inf_aih.csv'
        registros = 0
        
        if csv_path.exists():
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                linhas = list(reader)
                # Contar linhas com informações (exceto a primeira que é cabeçalho)
                if len(linhas) > 1:
                    # Contar apenas linhas que não estão vazias ou têm pelo menos um campo preenchido
                    registros = sum(1 for linha in linhas[1:] if linha and any(campo.strip() for campo in linha))
        
        # Obter usuário logado
        usuario = current_user.username if current_user.is_authenticated else 'Desconhecido'
        
        # Registrar no relatório
        sucesso = registrar_relatorio('Solicitar Internações', usuario, registros)
        
        if sucesso:
            return jsonify({
                'success': True,
                'registros': registros,
                'mensagem': f'Produção registrada: {registros} registros encontrados em solicita_inf_aih.csv'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Erro ao registrar no relatório'
            }), 500
            
    except Exception as e:
        print(f"Erro ao gravar produção: {e}")
        return jsonify({
            'success': False,
            'error': f'Erro ao gravar produção: {str(e)}'
        }), 500


@app.route('/api/internacoes/grava', methods=['GET', 'OPTIONS'])
def criar_flag_grava():
    """Cria a flag grava.flag no WORKDIR - endpoint simples GET"""
    if request.method == 'OPTIONS':
        # Responder preflight CORS
        response = make_response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Cookie'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Max-Age'] = '3600'
        return response
    
    # Verificar autenticação manualmente para GET
    if not current_user.is_authenticated:
        response = jsonify({'success': False, 'error': 'Não autenticado'})
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response, 401
    
    result = criar_flag_simples('grava.flag')
    # Garantir que headers CORS estão na resposta
    if isinstance(result, Response):
        result.headers['Access-Control-Allow-Origin'] = '*'
    return result

@app.route('/api/internacoes/pula', methods=['GET', 'OPTIONS'])
def criar_flag_pula():
    """Cria a flag pula.flag no WORKDIR - endpoint simples GET"""
    if request.method == 'OPTIONS':
        # Responder preflight CORS
        response = make_response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Cookie'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Max-Age'] = '3600'
        return response
    
    # Verificar autenticação manualmente para GET
    if not current_user.is_authenticated:
        response = jsonify({'success': False, 'error': 'Não autenticado'})
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response, 401
    
    result = criar_flag_simples('pula.flag')
    # Garantir que headers CORS estão na resposta
    if isinstance(result, Response):
        result.headers['Access-Control-Allow-Origin'] = '*'
    return result

def criar_flag_simples(nome_flag):
    """Função auxiliar para criar flags de forma simples"""
    try:
        # Validar nome da flag
        flags_permitidas = ['grava.flag', 'pula.flag']
        if nome_flag not in flags_permitidas:
            response = jsonify({'success': False, 'error': 'Flag não permitida'})
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 400
        
        # Verificar se WORKDIR está definido
        if not WORKDIR:
            response = jsonify({'success': False, 'error': 'WORKDIR não configurado'})
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 500
        
        # Criar arquivo flag no WORKDIR
        flag_path = Path(WORKDIR) / nome_flag
        
        # Garantir que o diretório existe
        try:
            flag_path.parent.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            response = jsonify({
                'success': False,
                'error': f'Erro ao criar diretório {flag_path.parent}: {str(e)}'
            })
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 500
        
        # NÃO remover flag se já existe - apenas criar/sobrescrever
        # A remoção será feita pelo processo Python que processa a flag
        
        # Criar arquivo flag (sobrescreve se já existir)
        conteudo = ''
        
        # Criar flag localmente (Docker ou não, sempre tentar criar localmente primeiro)
        # Se houver volume compartilhado, funcionará mesmo com Docker
        try:
            with open(flag_path, 'w', encoding='utf-8') as f:
                f.write(conteudo)
                f.flush()  # Forçar escrita imediata
                import os
                os.fsync(f.fileno())  # Sincronizar com disco
        except PermissionError as e:
            response = jsonify({
                'success': False,
                'error': f'Sem permissão para criar arquivo em {flag_path.parent}. WORKDIR: {WORKDIR}. Erro: {str(e)}'
            })
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 500
        except OSError as e:
            response = jsonify({
                'success': False,
                'error': f'Erro do sistema ao criar arquivo {flag_path}. WORKDIR: {WORKDIR}. Erro: {str(e)}'
            })
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 500
        except Exception as e:
            response = jsonify({
                'success': False,
                'error': f'Erro ao criar arquivo {flag_path}. WORKDIR: {WORKDIR}. Erro: {str(e)}'
            })
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 500
        
        # Pequeno delay para garantir que o sistema de arquivos processe a escrita
        import time
        time.sleep(0.1)
        
        # Verificar se a flag foi realmente criada
        if not flag_path.exists():
            response = jsonify({
                'success': False,
                'error': f'Não foi possível criar a flag em {flag_path}. Verifique permissões do diretório {WORKDIR}.'
            })
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response, 500
        
        response = jsonify({
            'success': True,
            'mensagem': f'Flag {nome_flag} criada com sucesso em {flag_path}'
        })
        # Adicionar headers CORS
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f'Erro ao criar flag {nome_flag}: {error_trace}')
        response = jsonify({
            'success': False,
            'error': f'Erro inesperado: {str(e)}'
        })
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response, 500

@app.route('/api/internacoes-solicitar/criar-flag', methods=['POST'])
@login_required
def criar_flag():
    """Cria uma flag no diretório WORKDIR"""
    try:
        data = request.json or {}
        nome_flag = data.get('flag', '').strip()
        
        if not nome_flag:
            return jsonify({'success': False, 'error': 'Nome da flag é obrigatório'}), 400
        
        # Validar nome da flag para evitar path traversal
        if '..' in nome_flag or '/' in nome_flag or '\\' in nome_flag:
            return jsonify({'success': False, 'error': 'Nome de flag inválido'}), 400
        
        # Criar arquivo flag no WORKDIR
        flag_path = Path(WORKDIR) / nome_flag
        
        # Garantir que o diretório existe
        flag_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Se a flag já existe, remover primeiro para garantir escrita limpa
        if flag_path.exists():
            try:
                flag_path.unlink()
            except Exception:
                pass  # Ignorar erro se não conseguir remover
        
        # Criar arquivo flag com conteúdo apropriado
        conteudo = 'pausar' if nome_flag == 'pause.flag' else ''
        
        # Se estiver usando Docker, criar flag dentro do container
        if USE_DOCKER and DOCKER_CONTAINER:
            try:
                # Executar comando dentro do container para criar a flag
                import subprocess
                comando_docker = [
                    'docker', 'exec', DOCKER_CONTAINER,
                    'sh', '-c', f'echo "{conteudo}" > {flag_path.name}'
                ]
                resultado = subprocess.run(
                    comando_docker,
                    cwd=WORKDIR,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if resultado.returncode != 0:
                    raise Exception(f'Erro ao criar flag no container: {resultado.stderr}')
            except Exception as e:
                # Se falhar no Docker, tentar criar localmente (pode funcionar se houver volume compartilhado)
                with open(flag_path, 'w', encoding='utf-8') as f:
                    f.write(conteudo)
        else:
            # Criar flag localmente
            with open(flag_path, 'w', encoding='utf-8') as f:
                f.write(conteudo)
                f.flush()  # Forçar escrita imediata
                import os
                os.fsync(f.fileno())  # Sincronizar com disco
        
        # Pequeno delay para garantir que o sistema de arquivos processe a escrita
        import time
        time.sleep(0.1)
        
        # Verificar se a flag foi realmente criada
        if not flag_path.exists():
            return jsonify({
                'success': False,
                'error': 'Não foi possível criar a flag'
            }), 500
        
        return jsonify({
            'success': True,
            'mensagem': f'Flag {nome_flag} criada com sucesso'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/internacoes-solicitar/remover-flag', methods=['POST'])
@login_required
def remover_flag():
    """Remove uma flag do diretório WORKDIR"""
    try:
        data = request.json or {}
        nome_flag = data.get('flag', '').strip()
        
        if not nome_flag:
            return jsonify({'success': False, 'error': 'Nome da flag é obrigatório'}), 400
        
        # Validar nome da flag para evitar path traversal
        if '..' in nome_flag or '/' in nome_flag or '\\' in nome_flag:
            return jsonify({'success': False, 'error': 'Nome de flag inválido'}), 400
        
        # NÃO remover flags grava.flag e pula.flag - elas serão removidas pelo processo Python
        flags_protegidas = ['grava.flag', 'pula.flag']
        if nome_flag in flags_protegidas:
            return jsonify({
                'success': False,
                'error': f'A flag {nome_flag} não pode ser removida via API. Ela será removida pelo processo que a processa.'
            }), 403
        
        # Remover arquivo flag do WORKDIR
        flag_path = Path(WORKDIR) / nome_flag
        
        if flag_path.exists():
            flag_path.unlink()
            return jsonify({
                'success': True,
                'mensagem': f'Flag {nome_flag} removida com sucesso'
            })
        else:
            return jsonify({
                'success': True,
                'mensagem': f'Flag {nome_flag} não existia'
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/internacoes-solicitar/enviar-comando', methods=['POST'])
@login_required
def enviar_comando_terminal():
    """Envia comando ao terminal do processo em execução (para interação durante -spa)"""
    try:
        data = request.json or {}
        session_id = data.get('session_id')
        comando = data.get('comando', '').strip()
        
        if not session_id:
            return jsonify({'success': False, 'error': 'session_id é obrigatório'}), 400
        
        if not comando:
            return jsonify({'success': False, 'error': 'comando é obrigatório'}), 400
        
        with processos_lock:
            if session_id not in processos_stdin:
                return jsonify({'success': False, 'error': 'Nenhum processo em execução com stdin disponível'}), 404
            
            stdin = processos_stdin[session_id]
            
            try:
                # Enviar comando + Enter
                stdin.write(comando + '\n')
                stdin.flush()
                
                return jsonify({
                    'success': True,
                    'mensagem': f'Comando "{comando}" enviado com sucesso'
                })
            except BrokenPipeError:
                # Processo já terminou
                if session_id in processos_stdin:
                    del processos_stdin[session_id]
                return jsonify({
                    'success': False,
                    'error': 'Processo já terminou'
                }), 404
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': f'Erro ao enviar comando: {str(e)}'
                }), 500
                
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/processos/listar', methods=['GET'])
@login_required
def listar_processos_ativos():
    """Lista todos os processos ativos no sistema"""
    try:
        # Limpar processos finalizados antes de listar
        limpar_processos_finalizados()
        
        processos_info_list = []
        
        with processos_lock:
            print(f"[DEBUG] Total de processos no dicionário: {len(processos_ativos)}")
            print(f"[DEBUG] Session IDs: {list(processos_ativos.keys())}")
            
            for session_id, processo in processos_ativos.items():
                try:
                    # Obter informações do processo
                    info = processos_info.get(session_id, {})
                    comando = info.get('comando', 'Desconhecido')
                    tipo = info.get('tipo', 'desconhecido')
                    
                    # Verificar status do processo
                    poll_result = processo.poll()
                    print(f"[DEBUG] Processo {session_id} (PID: {processo.pid}): poll() = {poll_result}")
                    
                    # Verificar se o processo ainda está rodando
                    if poll_result is None:
                        # Processo ainda está rodando
                        print(f"[DEBUG] Processo {session_id} está ATIVO")
                        processos_info_list.append({
                            'session_id': session_id,
                            'pid': processo.pid,
                            'status': 'ativo',
                            'comando': comando,
                            'tipo': tipo
                        })
                    else:
                        # Processo terminou, mas ainda está no dicionário
                        print(f"[DEBUG] Processo {session_id} está FINALIZADO (returncode: {poll_result})")
                        processos_info_list.append({
                            'session_id': session_id,
                            'pid': processo.pid,
                            'status': 'finalizado',
                            'comando': comando,
                            'tipo': tipo
                        })
                except (ProcessLookupError, AttributeError) as e:
                    # Processo não existe mais
                    print(f"[DEBUG] Erro ao processar processo {session_id}: {e}")
                    continue
        
        print(f"[DEBUG] Retornando {len(processos_info_list)} processo(s)")
        return jsonify({
            'success': True,
            'processos': processos_info_list,
            'total': len(processos_info_list),
            'debug': {
                'total_no_dict': len(processos_ativos),
                'session_ids': list(processos_ativos.keys())
            }
        })
    except Exception as e:
        print(f"[DEBUG] Erro ao listar processos: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Erro ao listar processos: {str(e)}'
        }), 500


@app.route('/api/processos/reconectar', methods=['POST'])
@login_required
def reconectar_processo():
    """Reconecta ao streaming de um processo específico"""
    data = request.json or {}
    session_id = data.get('session_id')
    
    if not session_id:
        return jsonify({
            'success': False,
            'error': 'session_id é obrigatório'
        }), 400
    
    def gerar():
        nonlocal session_id
        try:
            with processos_lock:
                if session_id not in processos_ativos:
                    yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': 'Processo não encontrado ou já finalizado'})}\n\n"
                    return
                
                processo = processos_ativos[session_id]
                
                # Verificar se o processo ainda está rodando
                if processo.poll() is not None:
                    yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': 'Processo já finalizado'})}\n\n"
                    return
            
            # Enviar mensagem de reconexão
            info = processos_info.get(session_id, {})
            comando_info = info.get('comando', 'Desconhecido')
            yield f"data: {json.dumps({'tipo': 'info', 'mensagem': f'Reconectado ao processo {session_id} (PID: {processo.pid})'})}\n\n"
            yield f"data: {json.dumps({'tipo': 'info', 'mensagem': f'Comando: {comando_info}'})}\n\n"
            
            # Verificar se o processo ainda tem stdout disponível
            # Para processos Docker, o stdout pode não estar mais disponível se o processo docker exec terminou
            # mas o processo dentro do container ainda está rodando
            stdout_disponivel = True
            try:
                # Tentar verificar se stdout está disponível
                if processo.stdout is None:
                    stdout_disponivel = False
                elif hasattr(processo.stdout, 'closed') and processo.stdout.closed:
                    stdout_disponivel = False
                elif processo.poll() is not None:
                    # Processo terminou
                    stdout_disponivel = False
            except Exception as e:
                print(f"[DEBUG] Erro ao verificar stdout: {e}")
                stdout_disponivel = False
            
            if not stdout_disponivel:
                # Para processos Docker, tentar verificar se o processo ainda está rodando dentro do container
                if USE_DOCKER and DOCKER_CONTAINER and 'docker exec' in comando_info:
                    yield f"data: {json.dumps({'tipo': 'aviso', 'mensagem': 'Stdout do comando docker exec não está mais disponível. Tentando verificar se o processo ainda está rodando dentro do container...'})}\n\n"
                    
                    # Tentar verificar processos Python rodando dentro do container
                    try:
                        # Extrair o comando Python do comando Docker
                        # Ex: "docker exec autoreg /usr/bin/python3 -u /home/kasm-user/.autoreg/autoreg.py -sia"
                        # Queremos: "/usr/bin/python3 -u /home/kasm-user/.autoreg/autoreg.py -sia"
                        partes_comando = comando_info.split()
                        if 'docker' in partes_comando and 'exec' in partes_comando:
                            # Encontrar o índice após o nome do container
                            try:
                                idx_container = partes_comando.index(DOCKER_CONTAINER)
                                comando_dentro_container = partes_comando[idx_container + 1:]
                                
                                # Verificar se há processo Python rodando com esse comando
                                comando_ps = ['docker', 'exec', DOCKER_CONTAINER, 'ps', 'aux']
                                resultado_ps = subprocess.run(
                                    comando_ps,
                                    capture_output=True,
                                    text=True,
                                    timeout=5
                                )
                                
                                if resultado_ps.returncode == 0:
                                    # Procurar por processos Python que correspondem ao comando
                                    linhas_ps = resultado_ps.stdout.split('\n')
                                    processos_encontrados = []
                                    for linha in linhas_ps:
                                        if 'python' in linha.lower() and any(arg in linha for arg in comando_dentro_container if arg.startswith('-')):
                                            processos_encontrados.append(linha)
                                    
                                    if processos_encontrados:
                                        yield f"data: {json.dumps({'tipo': 'info', 'mensagem': f'Processo ainda está rodando dentro do container. Encontrados {len(processos_encontrados)} processo(s) correspondente(s).'})}\n\n"
                                        for proc in processos_encontrados[:3]:  # Mostrar até 3
                                            yield f"data: {json.dumps({'tipo': 'output', 'linha': f'[Container] {proc[:100]}...'})}\n\n"
                                        
                                        yield f"data: {json.dumps({'tipo': 'aviso', 'mensagem': 'Não é possível reconectar ao stdout do processo Docker após o comando docker exec terminar. O processo continua rodando dentro do container, mas o stdout não está mais acessível.'})}\n\n"
                                        return
                                    else:
                                        yield f"data: {json.dumps({'tipo': 'info', 'mensagem': 'Nenhum processo correspondente encontrado dentro do container. O processo pode ter terminado.'})}\n\n"
                                else:
                                    yield f"data: {json.dumps({'tipo': 'aviso', 'mensagem': f'Não foi possível verificar processos dentro do container: {resultado_ps.stderr}'})}\n\n"
                            except (ValueError, IndexError):
                                yield f"data: {json.dumps({'tipo': 'aviso', 'mensagem': 'Não foi possível extrair informações do comando Docker'})}\n\n"
                    except Exception as e:
                        yield f"data: {json.dumps({'tipo': 'aviso', 'mensagem': f'Erro ao verificar container: {str(e)}'})}\n\n"
                
                yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': 'Stdout do processo não está mais disponível. O processo pode ter terminado ou o stdout foi fechado.'})}\n\n"
                return
            
            # Para reconexão, tentar usar queue compartilhada se existir
            # Se não existir e stdout estiver disponível, criar uma nova thread de leitura
            output_queue = None
            with processos_lock:
                if session_id in processos_queues:
                    output_queue = processos_queues[session_id]
                    yield f"data: {json.dumps({'tipo': 'info', 'mensagem': 'Usando queue compartilhada existente - pode conter dados anteriores'})}\n\n"
                elif stdout_disponivel:
                    # Criar nova queue e thread de leitura apenas se stdout estiver disponível
                    output_queue = queue.Queue()
                    processos_queues[session_id] = output_queue
                    yield f"data: {json.dumps({'tipo': 'info', 'mensagem': 'Criando nova thread de leitura do stdout'})}\n\n"
                    
                    def ler_stdout_thread():
                        """Thread para ler stdout sem bloquear"""
                        buffer_local = ''
                        try:
                            while True:
                                try:
                                    char = processo.stdout.read(1)
                                    if not char:
                                        if processo.poll() is not None:
                                            if buffer_local.strip():
                                                output_queue.put(('linha', buffer_local.rstrip()))
                                            output_queue.put(('fim', None))
                                            break
                                        time.sleep(0.1)
                                        continue
                                    
                                    buffer_local += char
                                    if char == '\n':
                                        linha_limpa = buffer_local.rstrip()
                                        if linha_limpa:
                                            output_queue.put(('linha', linha_limpa))
                                        buffer_local = ''
                                except (ValueError, OSError, AttributeError) as e:
                                    # Stdout pode ter sido fechado ou não estar mais disponível
                                    if buffer_local.strip():
                                        output_queue.put(('linha', buffer_local.rstrip()))
                                    output_queue.put(('aviso', f'Stdout não está mais disponível: {str(e)}. Processo pode ainda estar rodando dentro do Docker.'))
                                    # Não quebrar, continuar tentando verificar se processo terminou
                                    time.sleep(1)
                                    if processo.poll() is not None:
                                        output_queue.put(('fim', None))
                                        break
                        except Exception as e:
                            output_queue.put(('erro', str(e)))
                    
                    thread_leitura = threading.Thread(target=ler_stdout_thread, daemon=True)
                    thread_leitura.start()
            
            if output_queue is None:
                # Stdout não disponível e não há queue - não podemos reconectar
                yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': 'Não é possível reconectar: stdout não está disponível e não há queue compartilhada'})}\n\n"
                return
            
            # Processar saída da queue (output_queue foi definido acima)
            timeout_count = 0
            max_timeouts = 20  # 10 segundos sem dados (20 * 0.5s)
            
            while True:
                try:
                    tipo_item, dados = output_queue.get(timeout=0.5)
                    timeout_count = 0  # Resetar contador quando receber dados
                    
                    if tipo_item == 'fim':
                        yield f"data: {json.dumps({'tipo': 'info', 'mensagem': 'Processo finalizado'})}\n\n"
                        break
                    elif tipo_item == 'erro':
                        yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': dados})}\n\n"
                        # Se for erro de stdout fechado mas processo ainda rodando, informar mas não quebrar
                        if 'stdout' in dados.lower() and processo.poll() is None:
                            yield f"data: {json.dumps({'tipo': 'aviso', 'mensagem': 'Stdout não disponível, mas processo ainda está rodando. Para processos Docker, isso é normal após o comando docker exec terminar.'})}\n\n"
                            # Continuar tentando verificar se processo termina
                            continue
                        else:
                            break
                    elif tipo_item == 'aviso':
                        yield f"data: {json.dumps({'tipo': 'aviso', 'mensagem': dados})}\n\n"
                        # Continuar tentando verificar se processo termina
                        continue
                    elif tipo_item == 'linha':
                        yield f"data: {json.dumps({'tipo': 'output', 'linha': dados})}\n\n"
                    
                    # Verificar se processo terminou
                    if processo.poll() is not None:
                        yield f"data: {json.dumps({'tipo': 'info', 'mensagem': 'Processo finalizado'})}\n\n"
                        break
                        
                except queue.Empty:
                    timeout_count += 1
                    # Timeout - verificar se processo ainda está rodando
                    if processo.poll() is not None:
                        yield f"data: {json.dumps({'tipo': 'info', 'mensagem': 'Processo finalizado'})}\n\n"
                        break
                    
                    # Se muitos timeouts e processo ainda rodando, pode ser que stdout não esteja mais disponível
                    if timeout_count >= max_timeouts and processo.poll() is None:
                        yield f"data: {json.dumps({'tipo': 'aviso', 'mensagem': 'Não há mais saída disponível do processo. O processo pode ainda estar rodando dentro do Docker, mas o stdout do comando docker exec não está mais acessível.'})}\n\n"
                        
                        # Para processos Docker, tentar verificar se ainda está rodando dentro do container
                        if USE_DOCKER and DOCKER_CONTAINER and 'docker exec' in comando_info:
                            try:
                                partes_comando = comando_info.split()
                                if 'docker' in partes_comando and 'exec' in partes_comando:
                                    idx_container = partes_comando.index(DOCKER_CONTAINER)
                                    comando_dentro_container = partes_comando[idx_container + 1:]
                                    
                                    comando_ps = ['docker', 'exec', DOCKER_CONTAINER, 'ps', 'aux']
                                    resultado_ps = subprocess.run(
                                        comando_ps,
                                        capture_output=True,
                                        text=True,
                                        timeout=5
                                    )
                                    
                                    if resultado_ps.returncode == 0:
                                        linhas_ps = resultado_ps.stdout.split('\n')
                                        processos_encontrados = [l for l in linhas_ps if 'python' in l.lower() and any(arg in l for arg in comando_dentro_container if arg.startswith('-'))]
                                        
                                        if processos_encontrados:
                                            yield f"data: {json.dumps({'tipo': 'info', 'mensagem': f'Processo ainda está rodando dentro do container (encontrados {len(processos_encontrados)} processo(s))'})}\n\n"
                            except Exception:
                                pass  # Ignorar erros na verificação
                        
                        # Continuar tentando, mas informar o usuário
                        timeout_count = 0  # Resetar para não ficar repetindo a mensagem
                    
                    continue
                    
        except Exception as e:
            yield f"data: {json.dumps({'tipo': 'erro', 'mensagem': str(e)})}\n\n"
    
    response = Response(gerar(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response


@app.route('/api/internacoes-solicitar/interromper-execucao', methods=['POST'])
@login_required
def interromper_execucao_internacoes():
    """Interrompe a execução dos comandos de solicitar internações"""
    try:
        data = request.json or {}
        session_id = data.get('session_id', str(threading.current_thread().ident))
        
        with processos_lock:
            if session_id in processos_ativos:
                processo = processos_ativos[session_id]
                
                try:
                    processo.terminate()
                    try:
                        processo.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        processo.kill()
                        processo.wait()
                    
                    del processos_ativos[session_id]
                    if session_id in processos_stdin:
                        try:
                            processos_stdin[session_id].close()
                        except:
                            pass
                        del processos_stdin[session_id]
                    
                    return jsonify({
                        'success': True,
                        'mensagem': 'Processo interrompido com sucesso'
                    })
                except ProcessLookupError:
                    if session_id in processos_ativos:
                        del processos_ativos[session_id]
                    if session_id in processos_stdin:
                        del processos_stdin[session_id]
                    return jsonify({
                        'success': True,
                        'mensagem': 'Processo já havia terminado'
                    })
            else:
                return jsonify({
                    'success': False,
                    'mensagem': 'Nenhum processo em execução encontrado'
                }), 404
                
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/auth-check', methods=['GET'])
def auth_check():
    """
    Endpoint para verificação de autenticação via nginx auth_request
    Retorna 200 se autenticado, 401 se não autenticado
    """
    if current_user.is_authenticated:
        return '', 200
    else:
        return '', 401


@app.route('/api/extension/download', methods=['GET'])
@login_required
def download_extension():
    """
    Cria um ZIP da extensão Chrome. Se o arquivo .crx existir, ele será incluído no ZIP.
    Se não existir, cria um ZIP com todos os arquivos da pasta (exceto .pem).
    """
    try:
        extension_dir = Path(__file__).parent / 'chrome-extension'
        crx_file = extension_dir / 'chrome-extension.crx'
        
        # Criar um arquivo temporário para o ZIP
        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        temp_zip_path = temp_zip.name
        temp_zip.close()
        
        # Criar o ZIP
        with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Se o arquivo .crx existe, adicionar ele ao ZIP
            if crx_file.exists() and crx_file.is_file():
                zipf.write(crx_file, crx_file.name)
            else:
                # Se não existe .crx, adicionar todos os arquivos da pasta, exceto .pem
                for file_path in extension_dir.rglob('*'):
                    if file_path.is_file():
                        # Ignorar apenas arquivos .pem (chave privada)
                        if file_path.suffix != '.pem':
                            # Manter a estrutura de pastas relativa à pasta chrome-extension
                            arcname = file_path.relative_to(extension_dir)
                            zipf.write(file_path, arcname)
        
        # Servir o arquivo ZIP
        return send_file(
            temp_zip_path,
            mimetype='application/zip',
            as_attachment=True,
            download_name='chrome-extension.zip'
        )
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Erro ao preparar extensão: {str(e)}'
        }), 500


@app.route('/api/extension/check', methods=['GET'])
@login_required
def check_extension_type():
    """
    Verifica se o arquivo .crx existe e retorna o tipo de instalação
    """
    try:
        extension_dir = Path(__file__).parent / 'chrome-extension'
        crx_file = extension_dir / 'chrome-extension.crx'
        
        has_crx = crx_file.exists() and crx_file.is_file()
        
        return jsonify({
            'success': True,
            'has_crx': has_crx,
            'file_type': 'crx' if has_crx else 'zip'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Erro ao verificar extensão: {str(e)}'
        }), 500


if __name__ == '__main__':
    # Modo produção - escutar no IP do Tailscale
    app.run(debug=False, host='100.99.180.78', port=5000)

