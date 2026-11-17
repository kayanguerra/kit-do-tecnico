<#
  Kit do Técnico — backup do banco D1 de produção.

  Uso (na raiz do projeto, PowerShell normal):
    powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1
    powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1 -Destino "D:\Backups\kit" -Manter 20

  Gera dois arquivos na pasta de destino:
    kit-do-tecnico-AAAA-MM-DD_HHMM.json  SEMPRE. Mesmo formato do "Exportar backup" do site;
                                         restaura pelo site em Menu > Importar backup.
    kit-do-tecnico-AAAA-MM-DD_HHMM.sql   Quando a rede permite (wrangler d1 export).
                                         Restaura um banco vazio com "wrangler d1 execute --file".
  Mantém os últimos $Manter de cada tipo. Precisa do "npx wrangler login" feito neste usuário.
#>
param(
  [string]$Destino = $(if ($env:OneDrive) { Join-Path $env:OneDrive 'Kayan\Backups-Kit-do-Tecnico' } else { Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Backups-Kit-do-Tecnico' }),
  [int]$Manter = 12,
  [switch]$SemSql
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$base = 'kit-do-tecnico-{0}' -f (Get-Date -Format 'yyyy-MM-dd_HHmm')
$log = Join-Path $Destino 'backup.log'
function Registrar($texto) { Add-Content $log ('{0}  {1}' -f (Get-Date -Format 's'), $texto) }

function Consultar([string]$sql) {
  # Windows PowerShell trata avisos do wrangler (stderr) como erro fatal com 'Stop'.
  $ErrorActionPreference = 'Continue'
  $saida = & npx --yes wrangler d1 execute kit-do-tecnico --remote --json --command $sql 2>$null
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) { throw "wrangler falhou (codigo $LASTEXITCODE) ao consultar: $sql" }
  $texto = ($saida | Out-String)
  $inicio = $texto.IndexOf('[')
  if ($inicio -lt 0) { throw "Resposta inesperada do wrangler: $texto" }
  $dados = $texto.Substring($inicio) | ConvertFrom-Json
  return @($dados[0].results)
}

function Lista($valor) {
  if ([string]::IsNullOrWhiteSpace($valor)) { return ,@() }
  try { return ,@(($valor | ConvertFrom-Json) | Where-Object { $_ -is [string] }) } catch { return ,@() }
}

# ---------- 1. JSON (sempre) ----------
try {
  Write-Host 'Lendo categorias e itens do banco de produção ...'
  $cats  = Consultar 'SELECT nome, ordem FROM categorias ORDER BY ordem, nome COLLATE NOCASE'
  $linhas = Consultar 'SELECT * FROM itens ORDER BY criado_em'

  $itens = foreach ($l in $linhas) {
    [ordered]@{
      id = $l.id; tipo = $l.tipo; titulo = $l.titulo; categoria = $l.categoria
      conteudo = $l.conteudo; descricao = $l.descricao; prerequisitos = $l.prerequisitos
      requer_admin = ($l.requer_admin -eq 1)
      sintoma = $l.sintoma; causa = $l.causa; solucao = $l.solucao; observacoes = $l.observacoes
      relacionados = (Lista $l.relacionados); tags = (Lista $l.tags)
      favorito = ($l.favorito -eq 1); usos = $l.usos; ultimo_uso = $l.ultimo_uso
      criado_em = $l.criado_em; atualizado_em = $l.atualizado_em
    }
  }
  $backup = [ordered]@{
    app = 'kit-do-tecnico'; versao = 1
    exportado_em = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")
    categorias = @($cats | ForEach-Object { [ordered]@{ nome = $_.nome; ordem = $_.ordem } })
    itens = @($itens)
  }
  $arqJson = Join-Path $Destino "$base.json"
  $texto = $backup | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText($arqJson, $texto, (New-Object Text.UTF8Encoding $false))
  $resumo = '{0} itens, {1} categorias' -f $backup.itens.Count, $backup.categorias.Count
  Registrar "OK  JSON  $base.json  $resumo"
  Write-Host "JSON OK: $arqJson ($resumo)" -ForegroundColor Green
} catch {
  Registrar "FALHOU  JSON  $($_.Exception.Message)"
  Write-Error "Backup JSON falhou: $($_.Exception.Message). Log em $log"
  exit 1
}

# ---------- 2. SQL (extra; algumas redes bloqueiam o download) ----------
if (-not $SemSql) {
  $tempDir = Join-Path $env:SystemDrive 'Temp\kit-backup'
  New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
  $temp = Join-Path $tempDir "$base.sql"
  Write-Host 'Tentando também o export .sql ...'
  $ErrorActionPreference = 'Continue'
  & npx --yes wrangler d1 export kit-do-tecnico --remote --output $temp *> $null
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -eq 0 -and (Test-Path $temp) -and (Get-Item $temp).Length -gt 500) {
    Move-Item -Force $temp (Join-Path $Destino "$base.sql")
    Registrar "OK  SQL   $base.sql"
    Write-Host 'SQL OK.' -ForegroundColor Green
  } else {
    Registrar 'AVISO  SQL não gerado (rede bloqueou o download do export). O JSON foi salvo.'
    Write-Warning 'O .sql não foi gerado (a rede bloqueou o download do export). O backup .json está salvo e basta.'
  }
}

# ---------- 3. Limpeza ----------
foreach ($ext in 'json', 'sql') {
  Get-ChildItem $Destino -Filter "kit-do-tecnico-*.$ext" |
    Sort-Object LastWriteTime -Descending | Select-Object -Skip $Manter | Remove-Item -Force
}
Write-Host "Pronto. Pasta: $Destino"
