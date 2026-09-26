# Centro de conhecimento

O desktop separa duas tarefas que exigem densidades diferentes de informação:

- **Análise** concentra avaliação do Stockfish, melhores lances, respostas do
  adversário, variantes, histórico e configuração dos motores;
- **Conhecimento** mantém o tabuleiro visível e distribui a leitura da posição
  entre as páginas Panorama, Tática, Estratégia e Final.

Essa divisão evita reduzir dezenas de fatos a pequenos cartões numa única tela.
O estado analisado é compartilhado entre as páginas: trocar a orientação do
tabuleiro ou navegar pelos tópicos não dispara outra análise nem altera a FEN.

## Autoridade dos dados

Há três níveis deliberadamente distintos:

1. **Stockfish** é a autoridade para avaliação, ordem dos candidatos,
   variantes principais e resposta crítica do adversário.
2. **Analisador determinístico** reconhece fatos auditáveis do tabuleiro:
   capturas, xeques, mates em um, peças soltas, arquivos, casas fracas,
   outposts, bispos, espaço, peões passados, oposição e tipos estritos de final.
3. **Indicadores da interface** resumem desenvolvimento, segurança do rei e
   saúde da estrutura numa escala de 0 a 100. Eles são fórmulas explicáveis para
   comparação visual e nunca substituem nem modificam a avaliação do motor.

## Indicadores visuais

### Desenvolvimento

Conta cavalos e bispos sobreviventes fora das casas iniciais, ocupação do
centro e roque reconhecido. Uma casa inicial vazia não conta sozinha como peça
desenvolvida, pois ela também poderia indicar uma troca.

### Segurança do rei

Combina escudo de peões, posição roqueada, linhas sem peão amigo ao redor do
rei e atacantes inimigos identificados na zona real. O resultado é rotulado
como `Protegido`, `Atenção` ou `Exposto`.

### Estrutura de peões

Penaliza ilhas adicionais, peões isolados e dobrados e reconhece conexões e
passados conectados. O rótulo é `Coesa`, `Jogável` ou `Fragmentada`.

Todos os cálculos ficam em `apps/desktop/src/renderer/knowledge.ts`, têm testes
unitários e operam somente sobre a FEN e as evidências retornadas pelo backend.
Isso torna cada valor reproduzível e impede que a prosa da LLM invente ou
reordene conclusões do Stockfish.

## Comportamento responsivo

Em telas largas, o tabuleiro permanece fixo ao lado do conteúdo. Em larguras
menores, ele passa para cima e os cartões viram uma coluna. A navegação entre
tópicos continua disponível por botões reais, com foco de teclado, e respeita
`prefers-reduced-motion`.
