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

## Estrutura
```
server/index.js     API HTTP (Express) e entrega de mídia com suporte a Range
server/library.js   varredura da pasta, cache por data de modificação, zips
server/ios.js       leitor do ChatStorage.sqlite (iOS)
server/parser.js    parser das exportações .txt (Android e iOS)
src/                interface React + Tailwind CSS v4 + lucide-react
exemplos/           conversas de exemplo (Android em pasta, iPhone em .zip)
```
