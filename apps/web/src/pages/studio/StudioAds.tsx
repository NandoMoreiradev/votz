import { useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import {
  AD_EDIT_COPY,
  AD_INTERESTS,
  AD_OBJECTIVE_LABELS,
  AD_REVIEW_STATUS_LABELS,
  AD_STATUS_LABELS,
  USER_GENDER_LABELS,
  type AdCampaignView,
  type AdReviewStatus,
  type AdSetView,
  type AdStatus,
} from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import { AdEditForm, AdSetEditForm } from '../../components/ads/AdEditForms'
import { AdMedia } from '../../components/ads/AdMedia'
import {
  adsErrorMessage,
  formatBRL,
  useAdAccounts,
  useAdCampaigns,
  useCreateAdAccount,
  useDuplicateAdCampaign,
  useSetAdCampaignStatus,
  useSubmitAd,
} from '../../hooks/useAds'
import {
  Badge,
  Card,
  CardTitle,
  ErrorMsg,
  Field,
  Head,
  Hint,
  Input,
  Label,
  Mono,
  PrimaryButton,
  Row,
  SecondaryButton,
  Select,
  Sub,
  Title,
} from '../../components/ads/ads-ui'

const CampaignHead = styled.button`
  all: unset;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  width: 100%;
  cursor: pointer;
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 4px; border-radius: 4px; }
`

const CampaignName = styled.span`
  display: block;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`

const Level = styled.div`
  margin-top: 14px;
  padding: 14px 0 0 14px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 3px solid ${({ theme }) => theme.colors.neutral};
`

const LevelTitle = styled.p`
  margin: 0 0 4px;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.muted};
`

const AdBox = styled.div`
  margin-top: 10px;
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surfaceHover};
`

const AdHeadline = styled.p`
  margin: 0 0 2px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

type Tone = 'positive' | 'action' | 'muted'
const statusTone = (status: AdStatus): Tone => (status === 'ACTIVE' ? 'positive' : 'muted')
const reviewTone = (status: AdReviewStatus): Tone => (status === 'APPROVED' ? 'positive' : status === 'REJECTED' ? 'action' : 'muted')
const interestLabel = (id: string) => AD_INTERESTS.find((interest) => interest.id === id)?.label ?? id
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

function audienceSummary(set: AdSetView): string {
  const where = set.cities.length ? set.cities.join(', ') : set.states.length ? set.states.join(', ') : 'Brasil todo'
  if (set.automaticAudience) return `${where} · público automático (a IA encontra quem tem mais chance de se interessar)`
  const parts = [
    where,
    set.ageBands.length ? `${set.ageBands.join(', ')} anos` : 'todas as idades',
    set.genders.length ? set.genders.map((gender) => USER_GENDER_LABELS[gender]).join(', ') : null,
    set.interests.length ? set.interests.map(interestLabel).join(', ') : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** Estúdio › Anúncios › Campanhas: contas, campanhas em três níveis (campanha → público → anúncio). */
export function StudioAds() {
  const activeContext = useAuthStore((s) => s.activeContext)
  const companyId = activeContext?.type === 'COMPANY' ? activeContext.id : ''
  const canManage = !!activeContext?.permissions.includes('MANAGE_ADS')
  const canView = canManage || !!activeContext?.permissions.includes('VIEW_ADS')

  const accounts = useAdAccounts(canView ? companyId : '')
  const [chosenAccount, setChosenAccount] = useState<string>()
  const accountId = chosenAccount ?? accounts.data?.[0]?.id
  const account = accounts.data?.find((item) => item.id === accountId)

  if (!activeContext || activeContext.type !== 'COMPANY') {
    return <Card><CardTitle>Anúncios são para empresas</CardTitle><Hint>Troque para o perfil de uma empresa para anunciar no Votz.</Hint></Card>
  }
  if (!canView) {
    return <Card><CardTitle>Sem acesso aos anúncios</CardTitle><Hint>Peça a quem administra a empresa a permissão de ver ou criar anúncios em Equipe e acesso.</Hint></Card>
  }

  return (
    <>
      <Head>
        <div>
          <Title>Anúncios</Title>
          <Sub>Campanhas da {activeContext.name}. Todo anúncio aparece como "Patrocinado" e passa por revisão antes de rodar.</Sub>
        </div>
        {canManage && account && <PrimaryButton as={Link} to={`/estudio/anuncios/nova?conta=${account.id}`}>Criar campanha</PrimaryButton>}
      </Head>

      {accounts.isLoading ? <Hint>Carregando…</Hint>
        : accounts.isError ? <ErrorMsg role="alert">{adsErrorMessage(accounts.error)}</ErrorMsg>
        : !accounts.data?.length ? <NewAccount companyId={companyId} canManage={canManage} />
        : (
          <>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <div>
                  {accounts.data.length > 1 ? (
                    <Field style={{ marginBottom: 0 }}>
                      <Label htmlFor="ad-account">Conta de anúncios</Label>
                      <Select id="ad-account" value={accountId} onChange={(event) => setChosenAccount(event.target.value)}>
                        {accounts.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </Select>
                    </Field>
                  ) : <CardTitle>{account?.name}</CardTitle>}
                  <Hint>Moeda: real · Fuso: horário de Brasília</Hint>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Hint>Saldo</Hint>
                  <CardTitle as="p"><Mono>{formatBRL(account?.balanceCents ?? 0)}</Mono></CardTitle>
                  <Hint><Link to="/estudio/anuncios/faturamento">Recarregar saldo</Link></Hint>
                </div>
              </Row>
            </Card>
            {accountId && <Campaigns companyId={companyId} accountId={accountId} canManage={canManage} />}
          </>
        )}
    </>
  )
}

function NewAccount({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const [name, setName] = useState('Conta principal')
  const create = useCreateAdAccount(companyId)
  if (!canManage) return <Card><CardTitle>Nenhuma conta de anúncios</CardTitle><Hint>Quem administra os anúncios da empresa ainda não criou uma conta.</Hint></Card>
  return (
    <Card>
      <CardTitle>Crie sua conta de anúncios</CardTitle>
      <Hint style={{ marginBottom: 14 }}>É onde ficam suas campanhas e seu saldo. Só empresas verificadas podem anunciar.</Hint>
      <form onSubmit={(event) => { event.preventDefault(); create.mutate(name) }}>
        <Field>
          <Label htmlFor="ad-account-name">Nome da conta</Label>
          <Input id="ad-account-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </Field>
        <PrimaryButton type="submit" disabled={create.isPending || name.trim().length < 2}>{create.isPending ? 'Criando…' : 'Criar conta'}</PrimaryButton>
        {create.isError && <ErrorMsg role="alert">{adsErrorMessage(create.error)}</ErrorMsg>}
      </form>
    </Card>
  )
}

function Campaigns({ companyId, accountId, canManage }: { companyId: string; accountId: string; canManage: boolean }) {
  const campaigns = useAdCampaigns(companyId, accountId)
  if (campaigns.isLoading) return <Hint>Carregando campanhas…</Hint>
  if (campaigns.isError) return <ErrorMsg role="alert">{adsErrorMessage(campaigns.error)}</ErrorMsg>
  if (!campaigns.data?.length) {
    return (
      <Card>
        <CardTitle>Nenhuma campanha ainda</CardTitle>
        <Hint style={{ marginBottom: canManage ? 14 : 0 }}>Uma campanha tem um objetivo, um público com orçamento e um anúncio.</Hint>
        {canManage && <PrimaryButton as={Link} to={`/estudio/anuncios/nova?conta=${accountId}`}>Criar a primeira campanha</PrimaryButton>}
      </Card>
    )
  }
  return <>{campaigns.data.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} companyId={companyId} accountId={accountId} canManage={canManage} />)}</>
}

function CampaignCard({ campaign, companyId, accountId, canManage }: { campaign: AdCampaignView; companyId: string; accountId: string; canManage: boolean }) {
  const [open, setOpen] = useState(false)
  const setStatus = useSetAdCampaignStatus(companyId, accountId)
  const submit = useSubmitAd(companyId, accountId)
  const duplicate = useDuplicateAdCampaign(companyId, accountId)
  const [editingSet, setEditingSet] = useState<string | null>(null)
  const [editingAd, setEditingAd] = useState<string | null>(null)
  const budget = campaign.adSets.reduce((sum, set) => sum + set.dailyBudgetCents, 0)
  const archived = campaign.status === 'ARCHIVED'

  return (
    <Card>
      <CampaignHead type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          <CampaignName>{campaign.name}</CampaignName>
          <Hint>{AD_OBJECTIVE_LABELS[campaign.objective].label} · {formatBRL(budget)} por dia · {AD_OBJECTIVE_LABELS[campaign.objective].billing.toLowerCase()}</Hint>
        </span>
        <span><Badge $tone={statusTone(campaign.status)}>{AD_STATUS_LABELS[campaign.status]}</Badge></span>
      </CampaignHead>

      {canManage && (
        <Row style={{ marginTop: 12 }}>
          {!archived && (campaign.status === 'ACTIVE'
            ? <SecondaryButton type="button" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ campaignId: campaign.id, status: 'PAUSED' })}>Pausar</SecondaryButton>
            : <SecondaryButton type="button" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ campaignId: campaign.id, status: 'ACTIVE' })}>Ligar</SecondaryButton>)}
          <SecondaryButton type="button" disabled={duplicate.isPending} onClick={() => { if (window.confirm(`Criar uma cópia desta campanha como rascunho? ${AD_EDIT_COPY.DUPLICATE_NO_MEDIA}`)) duplicate.mutate(campaign.id) }}>{duplicate.isPending ? 'Copiando…' : 'Duplicar'}</SecondaryButton>
          {!archived && <SecondaryButton type="button" disabled={setStatus.isPending} onClick={() => { if (window.confirm('Arquivar esta campanha? Ela não poderá ser ligada de novo.')) setStatus.mutate({ campaignId: campaign.id, status: 'ARCHIVED' }) }}>Arquivar</SecondaryButton>}
        </Row>
      )}
      {duplicate.isError && <ErrorMsg role="alert">{adsErrorMessage(duplicate.error)}</ErrorMsg>}
      {setStatus.isError && <ErrorMsg role="alert">{adsErrorMessage(setStatus.error)}</ErrorMsg>}

      {open && campaign.adSets.map((set) => (
        <Level key={set.id}>
          <LevelTitle>Público e orçamento</LevelTitle>
          <CampaignName as="p">{set.name}</CampaignName>
          <Hint>{audienceSummary(set)}</Hint>
          <Hint>{formatBRL(set.dailyBudgetCents)} por dia · de {day(set.startAt)}{set.endAt ? ` até ${day(set.endAt)}` : ' sem data para acabar'}</Hint>
          {canManage && !archived && editingSet !== set.id && (
            <Row style={{ marginTop: 8 }}><SecondaryButton type="button" onClick={() => setEditingSet(set.id)}>Editar público e orçamento</SecondaryButton></Row>
          )}
          {editingSet === set.id && <AdSetEditForm set={set} companyId={companyId} accountId={accountId} onDone={() => setEditingSet(null)} />}

          {set.ads.map((ad) => (
            <AdBox key={ad.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <LevelTitle style={{ margin: 0 }}>Anúncio</LevelTitle>
                <Badge $tone={reviewTone(ad.reviewStatus)}>{AD_REVIEW_STATUS_LABELS[ad.reviewStatus]}</Badge>
              </Row>
              <AdHeadline>{ad.creative.headline}</AdHeadline>
              <Hint>{ad.creative.body}</Hint>
              <AdMedia media={ad.creative.media} maxWidth={240} />
              <Hint>Botão "{ad.creative.ctaLabel}" → {ad.creative.destinationUrl}</Hint>
              {ad.reviewNote && <ErrorMsg>Motivo: {ad.reviewNote}</ErrorMsg>}
              {canManage && !archived && editingAd !== ad.id && (
                <Row style={{ marginTop: 10 }}><SecondaryButton type="button" onClick={() => setEditingAd(ad.id)}>Editar anúncio</SecondaryButton></Row>
              )}
              {editingAd === ad.id && <AdEditForm ad={ad} companyId={companyId} accountId={accountId} onDone={() => setEditingAd(null)} />}
              {canManage && !archived && (ad.reviewStatus === 'NOT_SUBMITTED' || ad.reviewStatus === 'REJECTED') && (
                <Row style={{ marginTop: 10 }}>
                  <SecondaryButton type="button" disabled={submit.isPending} onClick={() => submit.mutate(ad.id)}>
                    {ad.reviewStatus === 'REJECTED' ? 'Corrigi, enviar de novo' : 'Enviar para revisão'}
                  </SecondaryButton>
                </Row>
              )}
            </AdBox>
          ))}
        </Level>
      ))}
      {submit.isError && <ErrorMsg role="alert">{adsErrorMessage(submit.error)}</ErrorMsg>}
    </Card>
  )
}
