# @hubescola/telemetry

Pacote compartilhado de logs com OpenTelemetry da Hub Escola. Envia logs ao VictoriaLogs quando configurado; fica inerte (só stdout) quando não. Repositório PÚBLICO. Uso e API no `README.md`.

## Stack
TypeScript, Node, OpenTelemetry (logs), Fastify (plugin de correlação), Vitest.

## Como rodar
- Instalar: `npm ci` (roda o build)
- Tipos: `npm run typecheck`
- Testes: `npm test`
- Build: `npm run build`

## Onde está cada coisa
- `src/iniciar.ts`: `iniciarTelemetria`; `src/logador.ts`: logger; `src/correlacao.ts`: correlação; `src/fastify.ts`: plugin Fastify
- `tests/`: um teste por módulo

## Regras que nunca quebram
- Repo público: nunca colocar segredo, endereço interno, IP ou dado real em código, teste, README ou exemplo.
- Nunca ler nem alterar `.env`.
- Nunca logar dado sensível (senha, token, CPF, telefone). Erro vai por `atributosDoErro`, nunca o objeto inteiro (a mensagem de um driver pode trazer URL com senha).
- Mensagem de log fixa; o dado variável vai em atributo.
- Mudança na API pública (exports de `src/index.ts`) pede versão nova no `package.json` e aviso aos consumidores. Eles fixam por hash de commit, não por tag.
- Antes de criar arquivo ou módulo novo: listar o que existe e esperar aprovação.

## Como trabalhar
- Plano curto antes de mexer em código; tarefas pequenas.
- Dizer quando não tiver certeza e quando o pedido for má ideia.
- Não dizer "pronto" sem rodar `npm run typecheck` e `npm test`.
- PR: título e commits em inglês, descrição em português, sem rodapé de ferramenta.
