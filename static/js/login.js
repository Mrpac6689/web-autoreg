/**
 * Gerenciamento de login
 */

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    const errorDiv = document.getElementById('login-error');
    
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            
            // Limpar erro anterior
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
            
            // Validação básica
            if (!username || !password) {
                mostrarErro('Por favor, preencha todos os campos.');
                return;
            }
            
            // Desabilitar botão durante o login
            const submitButton = loginForm.querySelector('button[type="submit"]');
            const originalText = submitButton.innerHTML;
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
            
            // Enviar requisição de login
            fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Redirecionar para a página principal
                    window.location.href = '/';
                } else {
                    mostrarErro(data.error || 'Usuário ou senha inválidos.');
                    submitButton.disabled = false;
                    submitButton.innerHTML = originalText;
                }
            })
            .catch(error => {
                console.error('Erro:', error);
                mostrarErro('Erro ao conectar com o servidor. Tente novamente.');
                submitButton.disabled = false;
                submitButton.innerHTML = originalText;
            });
        });
        
        // Focar no campo de usuário ao carregar
        document.getElementById('username').focus();
    }
});

function mostrarErro(mensagem) {
    const errorDiv = document.getElementById('login-error');
    errorDiv.textContent = mensagem;
    errorDiv.style.display = 'block';
    
    // Adicionar animação de shake
    const loginCard = document.querySelector('.login-card');
    loginCard.classList.add('shake');
    setTimeout(() => {
        loginCard.classList.remove('shake');
    }, 500);
}
