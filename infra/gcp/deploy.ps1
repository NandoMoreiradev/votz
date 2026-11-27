<#
  Publica o Votz no ambiente de teste do Google Cloud (projeto votz-prod).
  Constrói a imagem com a pasta LOCAL (inclui trabalho sem commit), envia ao Artifact Registry
  (São Paulo) e manda o Cloud Run (us-central1) usar a imagem nova. Variáveis e segredos dos
  serviços ficam como estão. As migrations do banco rodam sozinhas quando a API sobe.

  Uso (na raiz do repositório):
    powershell -ExecutionPolicy Bypass -File infra\gcp\deploy.ps1               # site e API
    powershell -ExecutionPolicy Bypass -File infra\gcp\deploy.ps1 -Apps web     # só o site
    powershell -ExecutionPolicy Bypass -File infra\gcp\deploy.ps1 -Apps api,web,ads
    powershell -ExecutionPolicy Bypass -File infra\gcp\deploy.ps1 -Apps api,worker   # API + serviço de trabalho de fundo

  O serviço "worker" (votz-worker) roda a MESMA imagem da API só com RUN_JOBS=true: processa as filas
  e as tarefas agendadas, para o votz-api poder ter várias instâncias sem repetir esse trabalho.
  Ele NÃO entra no padrão (-Apps api,web) porque fica ligado o tempo todo e tem custo próprio.
  Passo a passo e custo: docs/dev/infra-worker-separado-2026-11-27.md
#>
param(
  [ValidateSet('api', 'web', 'ads', 'worker')]
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
  api = @{ Dockerfile = 'apps/api/Dockerfile';        Image = 'api';        Service = 'votz-api'; BuildArgs = @() }
  web = @{ Dockerfile = 'apps/web/Dockerfile';        Image = 'web';        Service = 'votz-web'; BuildArgs = @('--build-arg', "VITE_API_URL=$apiUrl") }
  ads = @{ Dockerfile = 'apps/ads-server/Dockerfile'; Image = 'ads-server'; Service = 'votz-ads'; BuildArgs = @() }
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
$order = @('api', 'worker', 'ads', 'web') | Where-Object { $Apps -contains $_ }
$workerService = 'votz-worker'
$apiImage = "$registry/api:$tag"
$apiImageBuilt = $false

foreach ($app in $order) {
  if ($app -eq 'worker') {
    Write-Host "`n== worker ==" -ForegroundColor Cyan
    if (-not $apiImageBuilt) {
      Write-Host "1/2 construindo e enviando $apiImage ao Artifact Registry (mesma imagem da API)"
      docker build --push -f $targets['api'].Dockerfile -t $apiImage .
      if ($LASTEXITCODE -ne 0) { Write-Host 'FALHOU o build/envio da imagem do worker' -ForegroundColor Red; exit 1 }
    }
    Write-Host "2/2 publicando no Cloud Run ($workerService)"
    $jaExiste = (& $gcloud run services describe $workerService --region $region --project $project --format 'value(metadata.name)' 2>$null | Out-String).Trim()
    if ($jaExiste) {
      # Serviço já existe: só troca a imagem; variáveis, segredos e tamanho ficam como estão.
      & $gcloud run deploy $workerService --image $apiImage --region $region --project $project --quiet
    } else {
      # Primeira vez: copia variáveis, segredos e conta de serviço do votz-api e cria o worker
      # sempre ligado (CPU o tempo todo, 1 instância), sem acesso público.
      Write-Host 'Criando o votz-worker (primeira vez): copiando a configuração do votz-api'
      $api = (& $gcloud run services describe 'votz-api' --region $region --project $project --format json | Out-String) | ConvertFrom-Json
      $container = $api.spec.template.spec.containers[0]
      $envLines = @('RUN_JOBS: "true"', 'RUN_MIGRATIONS: "false"')
      $secretArgs = @()
      foreach ($e in $container.env) {
        if ($e.name -in @('RUN_JOBS', 'RUN_MIGRATIONS')) { continue }
        if ($e.valueFrom -and $e.valueFrom.secretKeyRef) {
          $secretArgs += "$($e.name)=$($e.valueFrom.secretKeyRef.name):$($e.valueFrom.secretKeyRef.key)"
        } else {
          $envLines += "$($e.name): $(ConvertTo-Json -InputObject ([string]$e.value) -Compress)"
        }
      }
      $envFile = Join-Path $env:TEMP 'votz-worker-env.yaml'
      [System.IO.File]::WriteAllLines($envFile, $envLines)
      $createArgs = @(
        '--no-allow-unauthenticated', '--no-cpu-throttling', '--cpu', '1', '--memory', '1Gi',
        '--min-instances', '1', '--max-instances', '1',
        '--network', 'default', '--subnet', 'default', '--vpc-egress', 'private-ranges-only',
        '--env-vars-file', $envFile
      )
      if ($secretArgs.Count -gt 0) { $createArgs += @('--set-secrets', ($secretArgs -join ',')) }
      if ($api.spec.template.spec.serviceAccountName) { $createArgs += @('--service-account', $api.spec.template.spec.serviceAccountName) }
      & $gcloud run deploy $workerService --image $apiImage --region $region --project $project --quiet @createArgs
      Remove-Item $envFile -ErrorAction SilentlyContinue
    }
    if ($LASTEXITCODE -ne 0) { Write-Host 'FALHOU o deploy do worker' -ForegroundColor Red; exit 1 }
    Write-Host "worker publicado com a imagem $tag" -ForegroundColor Green
    Write-Host "Lembrete: enquanto o votz-api estiver com RUN_JOBS ligado (padrão), ele TAMBÉM processa filas e tarefas. Para passar o trabalho só ao worker:" -ForegroundColor Yellow
    Write-Host "  gcloud run services update votz-api --region $region --project $project --update-env-vars RUN_JOBS=false" -ForegroundColor Yellow
    continue
  }

  $t = $targets[$app]
  $image = "$registry/$($t.Image):$tag"
  Write-Host "`n== $app ==" -ForegroundColor Cyan

  Write-Host "1/2 construindo e enviando $image ao Artifact Registry"
  docker build --push -f $t.Dockerfile @($t.BuildArgs) -t $image .
  if ($LASTEXITCODE -ne 0) { Write-Host "FALHOU o build/envio de $app (se for erro de auth, rode: gcloud auth configure-docker southamerica-east1-docker.pkg.dev)" -ForegroundColor Red; exit 1 }

  Write-Host "2/2 publicando no Cloud Run ($($t.Service))"
  & $gcloud run deploy $t.Service --image $image --region $region --project $project --quiet
  if ($LASTEXITCODE -ne 0) { Write-Host "FALHOU o deploy de $app" -ForegroundColor Red; exit 1 }
  Write-Host "$app publicado com a imagem $tag" -ForegroundColor Green
  if ($app -eq 'api') { $apiImage = $image; $apiImageBuilt = $true }
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
