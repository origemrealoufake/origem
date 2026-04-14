# Origem

Projeto para o HackaNav com analises separadas por tipo:

- `Imagem`: envia uma imagem e a IA avalia se ela parece feita por IA ou se parece real
- `Fonte`: envia um link e a IA analisa o conteudo da pagina para indicar se a noticia parece verdadeira, falsa ou inconclusiva
- `Bot`: envia um perfil, handle ou link e a IA estima se parece humano ou bot
- `Musica`: envia um audio e a IA estima se parece autentico ou gerado
- `Video`: envia um video e a IA estima se parece autentico ou gerado

## Estrutura

- `index.html`: pagina principal
- `verificacao.html`: pagina com as abas de analise
- `styles.css`: estilos da interface
- `script.js`: interacao do front-end
- `config.js`: URL da API publica
- `index.js`: backend no Cloudflare Worker
- `wrangler.jsonc`: configuracao do Worker
- `.dev.vars.example`: exemplo de variaveis locais

## Publicacao

### Front-end

O site estatico pode ser publicado no GitHub Pages com estes arquivos:

- `index.html`
- `verificacao.html`
- `styles.css`
- `script.js`
- `config.js`
- `.nojekyll`

### Backend

A API publica configurada hoje e:

- `https://origem-api.contageometrydash144.workers.dev`

O `config.js` ja aponta para essa URL em producao.

## Desenvolvimento local

1. Copie `.dev.vars.example` para `.dev.vars`
2. Defina `GEMINI_API_KEYS` com uma ou mais chaves
   - Exemplo: `GEMINI_API_KEYS=key1,key2,key3`
   - O worker tenta a proxima chave automaticamente quando a atual bate cota ou falha por permissao
   - Quando o modelo principal entra em alta demanda, o worker tenta automaticamente um fallback menos concorrido
   - `GEMINI_API_KEY` unica continua funcionando como fallback legado
3. Opcionalmente ajuste os modelos:
   - `GEMINI_MODELS`
   - `GEMINI_IMAGE_MODELS`
   - `GEMINI_AUDIO_MODELS`
   - `GEMINI_VIDEO_MODELS`
   - `GEMINI_BOT_MODELS`
   - `GEMINI_SOURCE_MODELS`
   - As variaveis `..._MODEL` antigas continuam funcionando como modelo preferido
4. Opcionalmente ajuste:
   - `GEMINI_IMAGE_MODEL`
   - `GEMINI_AUDIO_MODEL`
   - `GEMINI_VIDEO_MODEL`
   - `GEMINI_BOT_MODEL`
   - `GEMINI_SOURCE_MODEL`
   - `IMAGE_DAILY_LIMIT`
   - `AUDIO_DAILY_LIMIT`
   - `VIDEO_DAILY_LIMIT`
   - `BOT_DAILY_LIMIT`
   - `SOURCE_DAILY_LIMIT`
5. Rode o Worker com Wrangler

## Observacoes

- As chaves da API nao devem ir para o GitHub Pages
- O limite diario do Gemini continua valendo mesmo com o site publico
- O limitador por IP esta no backend
- A rotacao automatica agora cobre chave e modelo

## HackaNav

- https://www.naveavela.com.br/hackanav/
