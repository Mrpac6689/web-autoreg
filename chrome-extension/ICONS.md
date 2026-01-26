# Ícones da Extensão

A extensão requer ícones nos seguintes tamanhos:
- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

## Como Criar os Ícones

### Opção 1: Converter SVG para PNG

Um arquivo `icon.svg` está disponível na pasta `icons/`. Você pode convertê-lo para PNG usando:

**Online:**
- https://cloudconvert.com/svg-to-png
- https://convertio.co/svg-png/

**Linha de comando (se tiver ImageMagick instalado):**
```bash
convert -background none -resize 16x16 icon.svg icon16.png
convert -background none -resize 48x48 icon.svg icon48.png
convert -background none -resize 128x128 icon.svg icon128.png
```

### Opção 2: Criar Manualmente

Crie ícones simples com:
- Fundo: Gradiente azul (#4a90e2 para #357abd)
- Elementos: Círculos e linhas brancas representando um robô/automação
- Formato: PNG com fundo transparente ou sólido

### Opção 3: Usar Gerador Online

- https://www.favicon-generator.org/
- https://realfavicongenerator.net/

## Nota Temporária

Se os ícones não estiverem disponíveis, a extensão ainda funcionará, mas mostrará um ícone padrão do Chrome. Os ícones podem ser adicionados posteriormente.
