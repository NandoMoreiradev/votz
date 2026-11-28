# Synapse (chat) numa VM do Google Cloud

Plano completo: documento "Plano: Synapse no Google Cloud" (28/11/2026). Aprovado pelo dono: **A** (a API fala com o Synapse pela rede privada, `http://10.x.x.x:8008`) e **A2** (VM única, Synapse e Postgres em contêineres, sem IP público).

**Estado:** nada foi criado no Google Cloud. Os arquivos desta pasta **não foram executados** (sem `gcloud` e sem VM aqui). Teste cada passo e corrija o que falhar.

Antes: o PR que aceita `http://10.x.x.x:porta` em `CHAT_MATRIX_URL` (`apps/api/src/config/matrix-url.ts`) precisa estar na versão da API que vai rodar.

Variáveis usadas abaixo (ajuste): `PROJECT=votz-prod-515716`, `REGION` e `ZONE` iguais às da API e do Redis (hoje `us-central1` / `us-central1-a`; se o dono mudar para São Paulo, `southamerica-east1` / `southamerica-east1-a`), `REGISTRY=southamerica-east1-docker.pkg.dev/$PROJECT/votz`.

## 1. Imagens no Artifact Registry
A VM não tem internet pública, então as duas imagens têm de estar no nosso registro.

```bash
# Synapse com a nossa configuração (infra/synapse): o Cloud Build monta e envia
gcloud builds submit infra/synapse --project $PROJECT --tag $REGISTRY/synapse:v1.165.0

# Postgres: copiar a imagem pública para o nosso registro (num computador com Docker)
docker pull postgres:16-alpine
docker tag postgres:16-alpine $REGISTRY/postgres:16-alpine
docker push $REGISTRY/postgres:16-alpine
```

## 2. Segredos (valores aleatórios; nunca colar em chat)
Quatro segredos novos. O `matrix-jwt-secret` e o `matrix-registration-secret` **são os mesmos** que a API usa em `CHAT_MATRIX_JWT_SECRET` e `CHAT_MATRIX_REGISTRATION_SECRET` (cada um com 32 caracteres ou mais, e o JWT diferente do `JWT_SECRET` da API).

```bash
for s in matrix-pg-admin-password matrix-db-password matrix-jwt-secret matrix-registration-secret; do
  openssl rand -hex 32 | gcloud secrets create $s --project $PROJECT --data-file=-
done
```
Dar leitura à conta de serviço da VM (a padrão do Compute) em cada um (`roles/secretmanager.secretAccessor`).

## 3. A VM
Sem IP público, Container-Optimized OS, 2 vCPU e 4 GB (`e2-medium`) e disco de 30 GB.

```bash
gcloud compute instances create votz-synapse --project $PROJECT --zone $ZONE \
  --machine-type e2-medium --no-address \
  --image-family cos-stable --image-project cos-cloud \
  --boot-disk-size 30GB --boot-disk-type pd-balanced \
  --scopes cloud-platform \
  --metadata-from-file startup-script=infra/gcp/synapse/startup-script.sh \
  --metadata SYNAPSE_IMAGE=$REGISTRY/synapse:v1.165.0,POSTGRES_IMAGE=$REGISTRY/postgres:16-alpine,MATRIX_SERVER_NAME=<NOME_PERMANENTE>
```
`MATRIX_SERVER_NAME` é o nome permanente do servidor de chat (por exemplo `chat.votz.app`). Depois que existirem contas, **não dá para trocar**.

Firewall: liberar a porta 8008 **só** para a sub-rede do Cloud Run (saída VPC direta). Conferir o intervalo da sub-rede `default` da região (`gcloud compute networks subnets describe default --region $REGION`).

## 4. Conferir
```bash
gcloud compute instances get-serial-port-output votz-synapse --zone $ZONE --project $PROJECT | tail -40
```
Esperado: "Configuração do Synapse escrita." e o Synapse ouvindo na 8008. Depois, de um lugar da mesma rede: `curl http://<IP_INTERNO>:8008/health` deve responder `OK`.

## 5. API
No serviço `votz-api` (variáveis e segredos): `CONVERSATIONS_ENABLED`, `CHAT_TEXT_ENABLED`, `CHAT_MATRIX_SERVER_NAME` (o mesmo nome), `CHAT_MATRIX_URL=http://<IP_INTERNO>:8008`, `CHAT_MATRIX_JWT_SECRET`, `CHAT_MATRIX_REGISTRATION_SECRET`, `CHAT_TOKEN_ENCRYPTION_KEY` (64 hex, distinto dos outros). **Só ligar o chat depois do piloto estável** (decisão do dono).

## 6. Backup
Antes de ligar: snapshot agendado do disco da VM (o disco guarda o banco do chat e a **chave de assinatura**, que não pode ser perdida) e um teste de restauração.

## Reverter
`CONVERSATIONS_ENABLED=false` na API. A VM pode ficar desligada sem afetar o resto do Votz.

## Não verificado
Este roteiro, o script e o comportamento do `bootstrap.py` contra um Postgres de contêiner (lido, não executado: ele já cria papel e banco usando o usuário `postgres`, então não precisou de variante). Uso real de memória do Synapse. Preços da região escolhida.
