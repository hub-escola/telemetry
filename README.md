# @hubescola/telemetry

Pacote compartilhado da Hub Escola para logs com OpenTelemetry. Envia logs para o VictoriaLogs da VPS quando configurado, e fica inerte (só stdout) quando não está.

## Uso

```ts
import { iniciarTelemetria } from '@hubescola/telemetry';

const telemetria = iniciarTelemetria({ servico: 'portal-api', versao: '1.0.0' });
telemetria.logger.info('Servidor no ar');
telemetria.logger.error('Falha ao consultar', { codigo: 'DB_TIMEOUT' }, { stdout: false });
await telemetria.fechar();
```

- `logger.info | warn | error (mensagem, atributos?, opcoes?)`. Com `{ stdout: false }` o log vai só para o OTel.
- `tracer` é exposto, mas nenhum span é exportado hoje.
- `fechar()` encerra o SDK. Chame no shutdown do processo.

## Configuração

| Variável | Efeito |
|---|---|
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Ativa o envio de logs. Em produção: `http://victorialogs:9428/insert/opentelemetry/v1/logs`. |
| `OTEL_EXPORTER_OTLP_LOGS_HEADERS` | Ex.: `VL-Stream-Fields=service.name`. Obrigatório com o VictoriaLogs, senão cada atributo de recurso vira dimensão do stream. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Se definido, habilita o exportador de traces. |

Sem `OTEL_EXPORTER_OTLP_ENDPOINT` nem `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, nenhuma conexão é aberta.

Métricas ficam desligadas. Só `service.name` e `service.version` vão no recurso: detectores de host, usuário e linha de comando estão desligados de propósito.

## Instalação

Por tag, como dependência Git:

```json
"@hubescola/telemetry": "git+https://github.com/hub-escola/telemetry.git#v1.0.0"
```

O `prepare` compila o `dist/` na instalação. Não há build manual.

## Desenvolvimento

```bash
npm ci
npm run typecheck
npm test
```

Versões: cada uso em produção fixa uma tag. Mudança de API exige nova versão maior.
