# Chess Assistant

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
- contrato pronto para a futura camada de explicações via API.

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

Defina o caminho do motor copiando `backend/.env.example` para `backend/.env` e
ajustando `STOCKFISH_PATH`.

## Instalação

```powershell
npm install

cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
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
- `POST /api/classify` — reconstrói e classifica a jogada entre dois snapshots;
- `GET /api/opening?fen=...` — identifica uma posição no catálogo local;
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

1. explicações estruturadas via API com evidências do motor;
2. classificadores determinísticos de tática, estrutura de peões,
   segurança do rei e final;
3. adaptadores de tabuleiro mais robustos, começando por Lichess Analysis;
4. persistência de sessões e histórico de posições;
5. empacotamento do backend e Stockfish com o app desktop.

## Documentação de engenharia

- [Arquitetura](docs/ARCHITECTURE.md)
- [Classificação de lances](docs/CLASSIFICATION.md)
- [Base local de aberturas](docs/OPENINGS.md)
- [Testes, logs e definição de pronto](docs/ENGINEERING.md)
