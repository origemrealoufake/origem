# Origem

Projeto para o HackaNav com duas analises separadas:

- `Imagem`: envia uma imagem e a IA avalia se ela parece feita por IA ou se parece real
- `Fonte`: envia um link e a IA analisa o conteudo da pagina para indicar se a noticia parece verdadeira, falsa ou inconclusiva

## Estrutura

- `index.html`: pagina principal
- `styles.css`: estilos da interface
- `script.js`: interacao do front-end
- `config.js`: URL da API publica
- `worker/index.js`: backend no Cloudflare Worker
- `wrangler.jsonc`: configuracao do Worker
- `.dev.vars.example`: exemplo de variaveis locais

## Publicacao

### Front-end

O site estatico pode ser publicado no GitHub Pages com estes arquivos:

- `index.html`
- `styles.css`
- `script.js`
- `config.js`
- `.nojekyll`

### Backend

A API publica configurada hoje e:

- `https://origem-api.realoufake.workers.dev`

O `config.js` ja aponta para essa URL em producao.

## Desenvolvimento local

1. Copie `.dev.vars.example` para `.dev.vars`
2. Defina `GEMINI_API_KEY`
3. Opcionalmente ajuste:
   - `GEMINI_IMAGE_MODEL`
   - `GEMINI_SOURCE_MODEL`
   - `IMAGE_DAILY_LIMIT`
   - `SOURCE_DAILY_LIMIT`
4. Rode o Worker com Wrangler

## Observacoes

- A chave da API nao deve ir para o GitHub Pages
- O limite diario do Gemini continua valendo mesmo com o site publico
- O limitador por IP esta no backend

## HackaNav

- https://www.naveavela.com.br/hackanav/
