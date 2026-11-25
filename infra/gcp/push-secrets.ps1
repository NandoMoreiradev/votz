<#
  Envia as chaves de terceiros do seu .env local para o Secret Manager do projeto votz-prod.
  Quem roda é o dono: o valor das chaves nunca passa pelo Claude e o script só imprime NOMES.

  Uso:
    powershell -ExecutionPolicy Bypass -File infra\gcp\push-secrets.ps1          # SMTP, Gemini, Groq, LiveKit, Stripe, YouTube (do .env)
    powershell -ExecutionPolicy Bypass -File infra\gcp\push-secrets.ps1 -R2      # pergunta a chave do Cloudflare R2 (digitada, oculta)

  Regras de segurança:
    - chave "sk_live..." da Stripe NÃO é enviada (o site de teste é aberto; use chave de teste "sk_test...");
    - valor vazio ou de exemplo é ignorado;
    - as chaves do R2 do .env NÃO são lidas (no .env local elas são do MinIO, não do Cloudflare).
#>
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot '..\..\.env'),
  [switch]$R2
)

# "Continue" de propósito: no PowerShell 5.1, "Stop" faz qualquer linha de erro do gcloud virar exceção.
# O resultado de cada comando é conferido por $LASTEXITCODE.
$ErrorActionPreference = 'Continue'
$gcloud = Join-Path $env:LOCALAPPDATA 'Google\CloudSDK\google-cloud-sdk\bin\gcloud.cmd'
$project = 'votz-prod-515716'
$runtimeSa = '742542852298-compute@developer.gserviceaccount.com'

# Usa a pasta padrão de credenciais do gcloud, mesmo que o terminal tenha outra configurada.
$env:CLOUDSDK_CONFIG = Join-Path $env:APPDATA 'gcloud'

$account = (& $gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>$null | Out-String).Trim()
if (-not $account) {
  Write-Host 'O gcloud não tem conta ativa nesta pasta. Rode antes:  gcloud auth login' -ForegroundColor Yellow
  Write-Host "(caminho: $gcloud)"
  exit 1
}
Write-Host "Conta do Google Cloud: $account | projeto: $project"

function Set-Secret([string]$name, [string]$value) {
  $tmp = New-TemporaryFile
  try {
    [System.IO.File]::WriteAllText($tmp.FullName, $value)
    & $gcloud secrets describe $name --project=$project *> $null
    if ($LASTEXITCODE -eq 0) {
      $msg = & $gcloud secrets versions add $name --project=$project --data-file=$tmp.FullName 2>&1 | Out-String
    } else {
      $msg = & $gcloud secrets create $name --project=$project --replication-policy=automatic --data-file=$tmp.FullName 2>&1 | Out-String
    }
    # A mensagem do gcloud não contém o valor da chave; é seguro mostrar quando falha.
    if ($LASTEXITCODE -ne 0) { Write-Host "FALHOU  $name" -ForegroundColor Red; Write-Host ($msg.Trim() -split "`n" | Select-Object -First 6 | Out-String); return }
    $msg = & $gcloud secrets add-iam-policy-binding $name --project=$project --member="serviceAccount:$runtimeSa" --role=roles/secretmanager.secretAccessor 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { Write-Host "ok  $name (gravado, mas falhou liberar a leitura para a API)" -ForegroundColor Yellow; Write-Host ($msg.Trim() -split "`n" | Select-Object -First 4 | Out-String); return }
    Write-Host "ok  $name"
  } finally { Remove-Item $tmp.FullName -Force -ErrorAction SilentlyContinue }
}

if ($R2) {
  Write-Host 'Cole as chaves do R2 (Cloudflare > R2 > Gerenciar tokens de API). Nada aparece na tela.'
  $id = Read-Host 'Access Key ID' -AsSecureString
  $secret = Read-Host 'Secret Access Key' -AsSecureString
  $plain = { param($s) [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
  $idText = & $plain $id; $secretText = & $plain $secret
  if (-not $idText -or -not $secretText) { throw 'chave vazia' }
  Set-Secret 'r2-access-key' $idText
  Set-Secret 'r2-secret-key' $secretText
  return
}

$map = [ordered]@{
  SMTP_HOST = 'smtp-host'; SMTP_USER = 'smtp-user'; SMTP_PASS = 'smtp-pass'
  GOOGLE_AI_API_KEY = 'google-ai-api-key'; GROQ_API_KEY = 'groq-api-key'
  LIVEKIT_URL = 'livekit-url'; LIVEKIT_API_KEY = 'livekit-api-key'; LIVEKIT_API_SECRET = 'livekit-api-secret'
  STRIPE_SECRET_KEY = 'stripe-secret-key'; STRIPE_WEBHOOK_SECRET = 'stripe-webhook-secret'
  YOUTUBE_API_KEY = 'youtube-api-key'
}
if (-not (Test-Path $EnvFile)) { throw "não achei $EnvFile" }
$values = @{}
foreach ($line in Get-Content $EnvFile) {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") }
}
foreach ($key in $map.Keys) {
  $v = $values[$key]
  if (-not $v -or $v -match 'nao-configurado|sua_app_password|seu@gmail|GERE_') { Write-Host "pulou  $key (vazio ou exemplo)"; continue }
  if ($key -eq 'STRIPE_SECRET_KEY' -and $v -like 'sk_live*') { Write-Host "PULOU  $key (é chave de produção da Stripe; use uma sk_test)"; continue }
  Set-Secret $map[$key] $v
}
