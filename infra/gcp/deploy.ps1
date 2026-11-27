<#
  Publica o Votz no ambiente de teste do Google Cloud (projeto votz-prod).
  Constrói a imagem com a pasta LOCAL (inclui trabalho sem commit), envia ao Artifact Registry
  (São Paulo) e manda o Cloud Run (us-central1) usar a imagem nova. Variáveis e segredos dos
  serviços ficam como estão. As migrations do banco rodam sozinhas quando a API sobe.

  Uso (na raiz do repositório):
    powershell -ExecutionPolicy Bypass -File infra\gcp\deploy.ps1               # site e API
    powershell -ExecutionPolicy Bypass -File infra\gcp\deploy.ps1 -Apps web     # só o site
    powershell -ExecutionPolicy Bypass -File infra\gcp\deploy.ps1 -Apps api,web,ads
#>
param(
  [ValidateSet('api', 'web', 'ads')]
  [string[]]$Apps = @('api', 'web')
)

# "Continue" de propósito: no PowerShell 5.1 o gcloud escreve no stderr mesmo quando dá certo.
# O resultado de cada passo é conferido por $LASTEXITCODE.
$ErrorActionPreference = 'Continue'
$sdkBin = Join-Path $env:LOCALAPPDATA 'Google\CloudSDK\google-cloud-sdk\bin'
$gcloud = Join-Path $sdkBin 'gcloud.cmd'
$env:Path = "$sdkBin;$env:Path"   # o docker precisa do docker-credential-gcloud no PATH
$env:CLOUDSDK_CONFIG = Join-Path $env:APPDATA 'gcloud'

$project = 'votz-prod-515716'
$region = 'us-central1'
$registry = "southamerica-east1-docker.pkg.dev/$project/votz"
$apiUrl = 'https://votz-api-742542852298.us-central1.run.app/api/v1'
$tag = Get-Date -Format 'yyyy-MM-dd-HHmm'

$targets = @{
  api = @{ Dockerfile = 'apps/api/Dockerfile';        Image = 'api';        Service = 'votz-api'; BuildArgs = @(); RunArgs = @('--timeout', '3600') }
  web = @{ Dockerfile = 'apps/web/Dockerfile';        Image = 'web';        Service = 'votz-web'; BuildArgs = @('--build-arg', "VITE_API_URL=$apiUrl"); RunArgs = @() }
  ads = @{ Dockerfile = 'apps/ads-server/Dockerfile'; Image = 'ads-server'; Service = 'votz-ads'; BuildArgs = @(); RunArgs = @() }
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

$account = (& $gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>$null | Out-String).Trim()
if (-not $account) {
  Write-Host 'O gcloud não tem conta ativa. Rode antes:  gcloud auth login' -ForegroundColor Yellow
  exit 1
}
Write-Host "Conta: $account | projeto: $project | tag: $tag"

$dirty = (git status --porcelain | Measure-Object).Count
if ($dirty -gt 0) {
  Write-Host "Aviso: $dirty arquivo(s) sem commit vão junto na imagem." -ForegroundColor Yellow
}

# Site por último: se a API falhar, o site não sobe pedindo coisa que a API ainda não tem.
$order = @('api', 'ads', 'web') | Where-Object { $Apps -contains $_ }

foreach ($app in $order) {
  $t = $targets[$app]
  $image = "$registry/$($t.Image):$tag"
  Write-Host "`n== $app ==" -ForegroundColor Cyan

  Write-Host "1/2 construindo e enviando $image ao Artifact Registry"
  docker build --push -f $t.Dockerfile @($t.BuildArgs) -t $image .
  if ($LASTEXITCODE -ne 0) { Write-Host "FALHOU o build/envio de $app (se for erro de auth, rode: gcloud auth configure-docker southamerica-east1-docker.pkg.dev)" -ForegroundColor Red; exit 1 }

  Write-Host "2/2 publicando no Cloud Run ($($t.Service))"
  # RunArgs (só a API): --timeout 3600 deixa o WebSocket aberto até 1 hora (o padrão do Cloud Run é 5 minutos)
  & $gcloud run deploy $t.Service --image $image --region $region --project $project --quiet @($t.RunArgs)
  if ($LASTEXITCODE -ne 0) { Write-Host "FALHOU o deploy de $app" -ForegroundColor Red; exit 1 }
  Write-Host "$app publicado com a imagem $tag" -ForegroundColor Green
}

if ($order -contains 'api') {
  try {
    $h = Invoke-RestMethod -Uri "$apiUrl/health" -TimeoutSec 60
    Write-Host "`nSaúde da API: $($h | ConvertTo-Json -Compress)"
  } catch {
    Write-Host "`nA API não respondeu /health: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}
Write-Host "`nPronto. Site: https://votz-web-742542852298.us-central1.run.app" -ForegroundColor Green
