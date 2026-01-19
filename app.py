"""
AUTOREG - Sistema Automatizado de operações G-HOSP e SISREG
Aplicação Flask principal
"""

from flask import Flask, render_template, request, jsonify, Response, send_file, session, redirect, url_for
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from datetime import datetime
import csv
import os
import json
import re
import subprocess
import threading
from pathlib import Path
import requests
from urllib3.exceptions import InsecureRequestWarning
import warnings
import websocket
import base64
from urllib.parse import urlparse, urljoin, quote as url_quote, unquote
from config import WORKDIR, PYTHONPATH, AUTOREGPATH, DOCKER_CONTAINER, USE_DOCKER
from auth import autenticar, listar_usuarios, adicionar_usuario, remover_usuario, alterar_senha, usuario_existe

# Desabilitar avisos de SSL não verificado
warnings.filterwarnings('ignore', category=InsecureRequestWarning)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'autoreg-secret-key-change-in-production'

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
import threading
processos_lock = threading.Lock()


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
        login_user(user, remember=True)
        return jsonify({'success': True, 'username': usuario['username'], 'nome': usuario['nome']})
    else:
        return jsonify({'success': False, 'error': 'Usuário ou senha inválidos'}), 401


@app.route('/api/logout', methods=['POST'])
@login_required
def api_logout():
    """API para logout"""
    logout_user()
    return jsonify({'success': True, 'message': 'Logout realizado com sucesso'})


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


@app.route('/api/exames-solicitar/load', methods=['GET'])
@login_required
def load_exames_csv():
    """Carrega o conteúdo do arquivo CSV de exames para solicitar"""
    csv_path = Path(WORKDIR) / 'exames_solicitar.csv'
    
    # Cabeçalho padrão do CSV
    CABECALHO_PADRAO = ['ra', 'hora', 'cns', 'procedimento', 'chave', 'solicitacao']
    
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
        CABECALHO_PADRAO = ['ra', 'hora', 'cns', 'procedimento', 'chave', 'solicitacao']
        
        # Garantir que o diretório existe
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Garantir que a primeira linha sempre seja o cabeçalho correto
        if len(data) > 0:
            # Forçar cabeçalho na primeira posição
            data[0] = CABECALHO_PADRAO
        else:
            # Se não houver dados, criar apenas com cabeçalho
            data = [CABECALHO_PADRAO]
        
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


@app.route('/api/internacoes-solicitar/load', methods=['GET'])
@login_required
def load_internacoes_csv():
    """Carrega o conteúdo do arquivo CSV de internações para solicitar"""
    csv_path = Path(WORKDIR) / 'solicita_inf_aih.csv'
    
    # Cabeçalho padrão do CSV (ajustar conforme necessário)
    CABECALHO_PADRAO = ['ra', 'data', 'hora', 'cns', 'procedimento', 'chave']
    
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


@app.route('/api/internacoes-solicitar/save', methods=['POST'])
@login_required
def save_internacoes_csv():
    """Salva o conteúdo editado no arquivo CSV"""
    try:
        data = request.json.get('data', [])
        csv_path = Path(WORKDIR) / 'solicita_inf_aih.csv'
        
        # Cabeçalho padrão que DEVE ser preservado
        CABECALHO_PADRAO = ['ra', 'data', 'hora', 'cns', 'procedimento', 'chave']
        
        # Garantir que o diretório existe
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Garantir que a primeira linha sempre seja o cabeçalho correto
        if len(data) > 0:
            # Forçar cabeçalho na primeira posição
            data[0] = CABECALHO_PADRAO
        else:
            # Se não houver dados, criar apenas com cabeçalho
            data = [CABECALHO_PADRAO]
        
        # Salvar o CSV
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
            
            # Remover processo da lista de ativos
            with processos_lock:
                if session_id in processos_ativos:
                    del processos_ativos[session_id]
            
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
                    
                    return jsonify({
                        'success': True,
                        'mensagem': 'Processo interrompido com sucesso'
                    })
                except ProcessLookupError:
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


if __name__ == '__main__':
    # Modo produção - escutar no IP do Tailscale
    app.run(debug=False, host='100.99.180.78', port=5000)

