# Chess Assistant

[![CI](https://github.com/andrenv14/chess-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/andrenv14/chess-assistant/actions/workflows/ci.yml)

Assistente local de xadrez para posições de análise, partidas contra bots e outros
contextos em que assistência externa seja permitida. O projeto separa a leitura do
tabuleiro, a interface desktop e os motores nativos para que cada parte possa evoluir
sem depender das demais.

> O uso da extensão em partidas competitivas pode violar as regras da plataforma.
> A extensão começa deliberadamente restrita às páginas de análise.

## Primeiro marco

- app desktop em Electron + React com FEN, evalbar, variantes e respostas;
- backend FastAPI com Stockfish nativo;
- perfis independentes `user`, `opponent` e `evaluator`;
- alteração de Elo/Skill/tempo de análise sem reiniciar o app;
- extensão Manifest V3 que transmite snapshots FEN ao `localhost`;
- reconstrução e classificação do lance efetivamente jogado;
- catálogo local CC0 do Lichess com identificação automática de abertura;
- evidências determinísticas de posição e de cada candidato do Stockfish;
- explicações estruturadas e validadas via OpenRouter/OpenResponses.
- perfis e histórico recente persistidos localmente em SQLite.

## Arquitetura

```text
apps/extension  ──WebSocket──▶  backend/  ◀──HTTP/WebSocket──  apps/desktop
                                      │
                                      ├── Stockfish: user
                                      ├── Stockfish: opponent
                                      └── Stockfish: evaluator (opcional)

packages/contracts: mensagens compartilhadas entre TypeScript e a API
```

## Pré-requisitos

- Node.js 22 ou superior;
- Python 3.11 ou superior;
- executável nativo do Stockfish 17 ou superior.

No Windows, instale a versão oficial, fixada e verificada pelo checksum:

```powershell
.\scripts\install-stockfish.ps1
```

O backend descobre essa instalação automaticamente. Como alternativa, defina o
caminho de outro motor copiando `backend/.env.example` para `backend/.env` e
ajustando `STOCKFISH_PATH`.

As explicações usam uma API externa opcional. O exemplo configura o modelo
`google/gemini-3.8-flash` via OpenRouter; a chave permanece somente no arquivo
local ignorado pelo Git ou no ambiente do processo.

Maia-3 é opcional e mais pesado. Para instalar seu ambiente isolado sem baixar
o checkpoint antecipadamente:

```powershell
.\scripts\install-maia3.ps1
```

## Instalação

```powershell
npm install

cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

Os testes rápidos não dependem de um motor instalado. Para incluir a integração
real com o processo nativo:

```powershell
$env:STOCKFISH_PATH = "C:\caminho\para\stockfish.exe"
cd backend
.venv\Scripts\python.exe -m pytest -m integration
```

## Desenvolvimento

Em um terminal:

```powershell
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8765
```

Em outro terminal:

```powershell
npm run dev:desktop
```

Para gerar a extensão:

```powershell
npm run build:extension
```

Carregue `apps/extension/dist` como extensão descompactada no Chrome/Edge. Neste
marco ela só tem acesso a `lichess.org/analysis` e `chess.com/analysis`.

## API do primeiro marco

- `GET /health` — estado do backend e disponibilidade do Stockfish;
- `GET /api/settings` — perfis atuais;
- `PUT /api/settings/{role}` — muda força durante a sessão;
- `POST /api/analyze` — calcula melhores lances e respostas;
- `POST /api/evidence` — análise Stockfish enriquecida com planos verificáveis;
- `POST /api/explain` — explicação estruturada via API, quando configurada;
- `POST /api/classify` — reconstrói e classifica a jogada entre dois snapshots;
- `GET /api/opening?fen=...` — identifica uma posição no catálogo local;
- `POST /api/human-prediction` — candidatos humanos opcionais via Maia-3;
- `POST /api/features` — fatos determinísticos da posição para explicações;
- `GET /api/history` e `GET /api/history/{id}` — histórico local e restauração;
- `DELETE /api/history` — limpa somente o histórico de análises;
- `WS /ws/extension` — eventos vindos do navegador;
- `WS /ws/desktop` — eventos consumidos pelo app.

Exemplo de alteração de força:

```json
{
  "limit_strength": true,
  "elo": 1700,
  "skill_level": 8,
  "move_time_ms": 500,
  "depth": null,
  "multipv": 3
}
```

## Próximos marcos

1. validar a extensão compilada junto do desktop nas páginas de análise do
   Lichess e Chess.com;
2. ampliar os classificadores e a regressão de táticas, estratégia, finais e
   classificação pós-lance;
3. criar testes de interface e um fluxo curto de demonstração;
4. empacotar desktop, backend e Stockfish em uma instalação Windows
   reproduzível.

## Documentação de engenharia

- [Estado atual e critérios de prontidão](docs/STATUS.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Classificação de lances](docs/CLASSIFICATION.md)
- [Base local de aberturas](docs/OPENINGS.md)
- [Instalação e testes do Stockfish](docs/STOCKFISH.md)
- [Integração opcional com Maia-3](docs/MAIA3.md)
- [Evidências determinísticas da posição](docs/POSITION_FEATURES.md)
- [Evidências por candidato para explicações](docs/EXPLANATION_EVIDENCE.md)
- [Contrato seguro das explicações por LLM](docs/LLM_EXPLANATIONS.md)
- [Persistência local e histórico](docs/PERSISTENCE.md)
- [Adaptadores do Lichess e Chess.com](docs/SITE_ADAPTERS.md)
- [Testes, logs e definição de pronto](docs/ENGINEERING.md)
