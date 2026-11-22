# Túnel somente leitura para o VictoriaLogs da VPS.
# Uso: `just tunel`, `just tunel-status`, `just tunel-fechar`.

set shell := ["sh", "-cu"]
set windows-shell := ["C:/Program Files/Git/usr/bin/sh.exe", "-cu"]

host := "root@100.102.164.58"
porta := "19428"

default:
    @just --list

# Abre o túnel em segundo plano. Se já estiver aberto, não faz nada.
tunel:
    @case "$(curl -s -m 3 http://127.0.0.1:{{porta}}/health)" in OK*) echo "túnel já aberto em 127.0.0.1:{{porta}}"; exit 0;; esac; \
    ssh -f -N -o ExitOnForwardFailure=yes -o BatchMode=yes -o ConnectTimeout=20 -L {{porta}}:127.0.0.1:9428 {{host}} </dev/null >/dev/null 2>&1; sleep 2; \
    case "$(curl -s -m 5 http://127.0.0.1:{{porta}}/health)" in OK*) echo "túnel aberto em 127.0.0.1:{{porta}}";; *) echo "ssh subiu mas o VictoriaLogs não respondeu"; exit 1;; esac

# Diz se o túnel está respondendo.
tunel-status:
    @case "$(curl -s -m 3 http://127.0.0.1:{{porta}}/health)" in OK*) echo "túnel ok em 127.0.0.1:{{porta}}";; *) echo "túnel fechado";; esac

# Consulta o VictoriaLogs pelo túnel (abre o túnel se precisar).
# Uso: `just logs`, `just logs 'service.name:portal-api _time:1h'`, `just logs '_time:1h correlation_id:*' 200`.
logs query="_time:15m | sort by (_time desc) | fields _time, service.name, correlation_id, _msg" limite="50": tunel
    @curl -s -m 60 http://127.0.0.1:{{porta}}/select/logsql/query --data-urlencode "query={{query}}" -d limit={{limite}}

# Fecha o túnel: encerra só os ssh.exe cuja linha de comando tem este encaminhamento.
tunel-fechar:
    @powershell.exe -NoProfile -Command '$p = @(Get-CimInstance Win32_Process -Filter "Name=''ssh.exe''" | Where-Object { $_.CommandLine -like "*{{porta}}:127.0.0.1:9428*" }); if ($p.Count -eq 0) { "nenhum túnel na porta {{porta}}" } else { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; "túnel fechado (pids: " + (($p.ProcessId) -join ", ") + ")" }'
