# API Externa - Registro de Relatórios

Esta documentação descreve como utilizar a API externa para registrar produção de rotinas no sistema AUTOREG.

## Endpoint

```
POST /api/externa/relatorio/registrar
```

## Autenticação

A API utiliza autenticação por chave de API (API Key). A chave deve ser enviada de uma das seguintes formas:

1. **Header HTTP** (recomendado):
   ```
   X-API-Key: sua-chave-api-aqui
   ```

2. **Body JSON** (alternativo):
   ```json
   {
     "api_key": "sua-chave-api-aqui",
     "rotina": "Nome da Rotina",
     "registros": 10
   }
   ```

## Obtenção da Chave de API

Cada usuário possui uma chave de API única, gerada automaticamente no momento da criação da conta. A chave está armazenada no arquivo `users.json` no campo `api_key` de cada usuário.

**Nota**: Usuários criados antes da implementação desta funcionalidade terão suas chaves geradas automaticamente na primeira inicialização do sistema.

## Parâmetros

### Headers (opcional)
- `X-API-Key` (string, obrigatório se não enviado no body): Chave de API do usuário
- `Content-Type`: `application/json`

### Body (JSON)
- `api_key` (string, obrigatório se não enviado no header): Chave de API do usuário
- `rotina` (string, obrigatório): Nome da rotina/módulo executado (ex: "Solicitar Internações", "Altas", "Internar Pacientes")
- `registros` (integer, obrigatório): Número de registros processados (deve ser >= 0)

## Resposta

### Sucesso (200 OK)
```json
{
  "success": true,
  "message": "Relatório registrado com sucesso",
  "data": {
    "rotina": "Solicitar Internações",
    "registros": 10,
    "usuario": "admin"
  }
}
```

### Erros

#### 401 Unauthorized - Chave de API não fornecida
```json
{
  "success": false,
  "error": "Chave de API não fornecida. Use o header X-API-Key ou o campo api_key no body."
}
```

#### 401 Unauthorized - Chave de API inválida
```json
{
  "success": false,
  "error": "Chave de API inválida ou usuário inativo"
}
```

#### 400 Bad Request - Campo obrigatório ausente
```json
{
  "success": false,
  "error": "Campo \"rotina\" é obrigatório"
}
```

#### 400 Bad Request - Registros inválidos
```json
{
  "success": false,
  "error": "Campo \"registros\" deve ser um número inteiro"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Erro ao registrar relatório"
}
```

## CORS

A API aceita requisições de qualquer origem (`Access-Control-Allow-Origin: *`), permitindo integração de sistemas externos.

## Exemplos de Uso

### Exemplo 1: Usando curl com header X-API-Key

```bash
curl -X POST https://seu-dominio.com/api/externa/relatorio/registrar \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sua-chave-api-aqui" \
  -d '{
    "rotina": "Solicitar Internações",
    "registros": 25
  }'
```

### Exemplo 2: Usando curl com api_key no body

```bash
curl -X POST https://seu-dominio.com/api/externa/relatorio/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sua-chave-api-aqui",
    "rotina": "Altas",
    "registros": 15
  }'
```

### Exemplo 3: Usando Python requests

```python
import requests

url = "https://seu-dominio.com/api/externa/relatorio/registrar"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "sua-chave-api-aqui"
}
data = {
    "rotina": "Internar Pacientes",
    "registros": 8
}

response = requests.post(url, json=data, headers=headers)
print(response.json())
```

### Exemplo 4: Usando JavaScript (fetch)

```javascript
fetch('https://seu-dominio.com/api/externa/relatorio/registrar', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'sua-chave-api-aqui'
  },
  body: JSON.stringify({
    rotina: 'Solicitar Tomografias',
    registros: 42
  })
})
.then(response => response.json())
.then(data => {
  console.log('Sucesso:', data);
})
.catch(error => {
  console.error('Erro:', error);
});
```

### Exemplo 5: Usando Node.js (axios)

```javascript
const axios = require('axios');

axios.post('https://seu-dominio.com/api/externa/relatorio/registrar', {
  rotina: 'Altas',
  registros: 20
}, {
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'sua-chave-api-aqui'
  }
})
.then(response => {
  console.log('Sucesso:', response.data);
})
.catch(error => {
  console.error('Erro:', error.response.data);
});
```

### Exemplo 6: Usando PHP (cURL)

```php
<?php
$url = 'https://seu-dominio.com/api/externa/relatorio/registrar';
$data = [
    'rotina' => 'Internar Pacientes',
    'registros' => 12
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'X-API-Key: sua-chave-api-aqui'
]);

$response = curl_exec($ch);
curl_close($ch);

$result = json_decode($response, true);
print_r($result);
?>
```

## Módulos Disponíveis

Os módulos são registrados dinamicamente conforme aparecem no sistema. Alguns exemplos de módulos comuns:

- `Solicitar Internações`
- `Solicitar Tomografias`
- `Altas`
- `Internar Pacientes`

Você pode usar qualquer nome de módulo. O sistema registrará automaticamente no relatório.

## Observações Importantes

1. **Data e Hora**: A data e hora do registro são automaticamente definidas como o momento do recebimento da requisição.

2. **Usuário**: O usuário associado ao registro é determinado automaticamente pela chave de API fornecida.

3. **Validação**: 
   - O campo `rotina` não pode estar vazio
   - O campo `registros` deve ser um número inteiro não negativo (>= 0)

4. **Segurança**: 
   - Mantenha sua chave de API em segurança
   - Não compartilhe chaves de API publicamente
   - Use HTTPS em produção para proteger as chaves em trânsito

5. **Rate Limiting**: Atualmente não há limite de requisições, mas recomenda-se implementar rate limiting em produção.

## Troubleshooting

### Erro: "Chave de API não fornecida"
- Verifique se está enviando a chave no header `X-API-Key` ou no campo `api_key` do body
- Certifique-se de que o header está sendo enviado corretamente

### Erro: "Chave de API inválida ou usuário inativo"
- Verifique se a chave está correta
- Verifique se o usuário está ativo no sistema
- Consulte o administrador do sistema para obter uma nova chave se necessário

### Erro: "Campo 'rotina' é obrigatório"
- Certifique-se de enviar o campo `rotina` no body da requisição
- O campo não pode estar vazio ou conter apenas espaços

### Erro: "Campo 'registros' deve ser um número inteiro"
- O campo `registros` deve ser um número inteiro (ex: 0, 10, 25)
- Não use números decimais ou strings
