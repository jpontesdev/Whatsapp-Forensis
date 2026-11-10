# Visualizador de WhatsApp

Visualizador **local e somente leitura** de backups do WhatsApp, com interface no estilo do WhatsApp Web (tema claro e escuro).

## Como rodar

Requer **Node.js 22.5+** (usa o `node:sqlite` embutido; testado no Node 24).

```bash
npm install
npm start          # compila a interface e abre o servidor em http://localhost:3001
```

Para desenvolver com recarga automática: `npm run dev` (interface em http://localhost:5173).
Para ver as conversas de exemplo: `npm run exemplos`.

O servidor escuta apenas em `127.0.0.1`. Nenhum dado sai do seu computador.

## Adicionar conversas (arrastar e soltar)
Arraste arquivos ou **pastas inteiras** para qualquer ponto da janela, ou use a área tracejada na barra lateral ("Escolher arquivos" / "Escolher pasta"):

- **iPhone:** `ChatStorage.sqlite` (+ `Contacts.sqlite`, opcional) e a pasta `Media`. Solte tudo junto, ou a pasta do backup inteira.
- **Exportações:** o `.txt` com as mídias, ou o `.zip`.

Os arquivos são **copiados** para a pasta de dados, mantendo as subpastas, e a lista de conversas é atualizada ao final. Nada é sobrescrito: um arquivo idêntico (mesmo nome e tamanho) é ignorado, e um arquivo diferente com o mesmo nome vira `nome (1).ext`.

## Levar para outro computador

1. Instale o **Node.js 22.5 ou mais novo** (recomendado: versão LTS em https://nodejs.org). Confira com `node -v`.
2. Copie a pasta do projeto **sem** `node_modules`, `dist` e `.cache` (essas pastas são recriadas). Use pendrive, zip ou `git clone`.
3. Copie os dados para `resources/`: os arquivos `.sqlite` e a pasta `Media/`, ou as exportações `.txt`/`.zip`. Essa pasta fica fora do git (`.gitignore`), então precisa ser copiada à parte.
4. Na pasta do projeto, rode:
   ```bash
   npm install
   npm start
   ```
5. Abra http://localhost:3001.

Dados em outra pasta: `node server/index.js --dir "D:\backup-whatsapp"` (rode `npm run build` antes, uma vez).
Para abrir de outro aparelho na mesma rede (celular, por exemplo), use `$env:HOST="0.0.0.0"; npm start` no PowerShell e acesse `http://<IP-do-PC>:3001`. Atenção: assim, qualquer pessoa na rede consegue ver as mensagens.

## Formatos suportados (pasta `resources/`)

O servidor varre `resources/` recursivamente (ou a pasta indicada com `--dir <pasta>` ou `WA_DIR=<pasta>`):

| Fonte | Como é detectada |
| --- | --- |
| **Banco do iPhone**: `ChatStorage.sqlite` (+ `Contacts.sqlite` opcional) e pasta `Media/` | Qualquer `.sqlite` com a tabela `ZWAMESSAGE` |
| **"Exportar conversa"** (Android ou iPhone, vários idiomas): `.txt` + arquivos de mídia | Pastas com `.txt` no formato do WhatsApp |
| Exportação compactada `.zip` | Extraída automaticamente em `.cache/` |

### Banco do iPhone
- As mídias são localizadas pelo caminho de `ZWAMEDIAITEM.ZMEDIALOCALPATH` e, se não estiverem lá, pelo **nome do arquivo** em qualquer subpasta (por exemplo `Media/files/Image/<hash>.jpg`).
- Mídias que não vieram no backup aparecem como "não incluída no backup", com o tamanho e a duração originais.
- Os status de envio vêm de `ZMESSAGESTATUS`: relógio, ✓, ✓✓ cinza e ✓✓ azul.
- **Bancos anonimizados:** muitas datas vêm truncadas (`ZMESSAGEDATE/10000`). O visualizador as reconstrói dentro da janela de cerca de 2,8 h, usando a ordem real (`ZSORT`) e os vizinhos com data exata. Esses horários aparecem com `~` na frente (ex.: `~14:29`).

### Exportações `.txt`
O arquivo exportado não diz quem é você. O visualizador tenta adivinhar (nome presente em várias conversas, ou o outro lado de uma conversa 1:1). Para corrigir, use **Dados do contato → "Quem é você nesta conversa?"**, ou crie `visualizador.config.json`:

```json
{ "me": ["João", "João Pontes"] }
```

## Recursos
- Lista de conversas com foto, prévia (ícones de foto, áudio, documento), horário, ✓✓, não lidas, filtros (Tudo, Não lidas, Grupos) e arquivadas.
- Balões enviados e recebidos com "rabicho", nomes coloridos em grupos, separadores de data fixos no topo, formatação `*negrito*`, `_itálico_`, `~tachado~` e ```` ```mono``` ````, links clicáveis e emojis grandes.
- Fotos (tela cheia com navegação ← →, miniaturas e download), vídeos e GIFs, figurinhas.
- Mensagens de voz com play/pause, forma de onda clicável, velocidade 1×, 1,5× e 2×, e duração.
- Documentos (ícone por tipo, tamanho, abrir e baixar), contatos (vCard), localização, enquetes, prévias de link, mensagens apagadas e editadas e eventos de grupo.
- Painel de dados com mídia, docs e links e lista de participantes, além de busca de mensagens com salto até o resultado.
- Link direto: `http://localhost:3001/?chat=<id>&msg=<índice>&theme=dark`.

## Busca forense (botão **R**)
O botão **R** no trilho lateral (ou no topo da lista, em telas menores) abre a varredura por expressões regulares em **todas** as conversas:

- **Filtros rápidos:** CPF, CNPJ, Telefone, RG, Datas, E-mail e Valores R$.
- **"Validar dígitos"** (ligado por padrão) descarta CPF/CNPJ com dígito verificador inválido, telefones com DDD inexistente e datas impossíveis (ex.: 31/02). Desligue para ver todos os candidatos.
- **Termo livre:** sem diferenciar acentos nem maiúsculas. O botão `.*` ativa regex (sintaxe JavaScript) e `Aa` diferencia maiúsculas.
- **Escopo:** todas as conversas, a conversa aberta ou uma conversa específica.
- **Resultados:** conversa, autor, data/hora e trecho com o valor destacado. Clicar abre a conversa rolada até a mensagem, com o valor marcado.
- **Valores únicos:** cada valor distinto com o número de ocorrências e de conversas. Clicar filtra as ocorrências daquele valor.
- **CSV:** exporta os resultados (abre direto no Excel).
- A regex roda numa thread separada com limite de 15 s, então uma expressão lenta não trava o servidor.

## Estrutura
```
server/index.js     API HTTP (Express) e entrega de mídia com suporte a Range
server/library.js   varredura da pasta, cache por data de modificação, zips
server/ios.js       leitor do ChatStorage.sqlite (iOS)
server/parser.js    parser das exportações .txt (Android e iOS)
server/forensic*.js padrões/validadores da busca forense e worker de regex
src/                interface React + Tailwind CSS v4 + lucide-react
exemplos/           conversas de exemplo (Android em pasta, iPhone em .zip)
```
