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
import subprocess
import threading
from pathlib import Path
from config import WORKDIR, PYTHONPATH, AUTOREGPATH, DOCKER_CONTAINER, USE_DOCKER
from auth import autenticar, listar_usuarios, adicionar_usuario, remover_usuario, alterar_senha, usuario_existe

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


if __name__ == '__main__':
    # Modo produção - escutar no IP do Tailscale
    app.run(debug=False, host='100.99.180.78', port=5000)

