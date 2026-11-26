import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import styled from 'styled-components'
import { AD_LIBRARY, type AdLibraryItem, type AdLibraryResponse } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { AdMedia, adMediaItems } from '../components/ads/AdMedia'
import { api } from '../lib/api'
import { SkeletonRows } from '../components/ui/Skeleton'

const Page = styled.main`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
  padding-bottom: ${({ theme }) => theme.spacing[10]};
`

const Container = styled.div`
  max-width: 1480px;
  margin: 0 auto;
  padding: 24px 32px 64px;

  @media (max-width: 720px) { padding: 16px 16px 48px; }
`

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing[2]};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.primary};
`

const Intro = styled.p`
  margin: 0 0 ${({ theme }) => theme.spacing[4]};
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.55;
`

const Filters = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[2]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const Input = styled.input`
  flex: 1 1 220px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font: inherit;
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
`

const Select = styled.select`
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font: inherit;
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
`

const Button = styled.button`
  padding: 10px 16px;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font: inherit;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  &:disabled { opacity: 0.6; cursor: default; }
`

const Card = styled.article`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[4]};
  margin-bottom: ${({ theme }) => theme.spacing[3]};
`

const Top = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[3]};
  margin-bottom: ${({ theme }) => theme.spacing[2]};
`

const Logo = styled.div<{ $src: string | null }>`
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : `${theme.colors.primary}14`)};
  color: ${({ theme }) => theme.colors.primary};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

const Who = styled.div`
  min-width: 0;
  flex: 1;
  small { display: block; color: ${({ theme }) => theme.colors.muted}; font-size: ${({ theme }) => theme.fontSizes.xs}; }
  a { color: ${({ theme }) => theme.colors.primary}; font-weight: ${({ theme }) => theme.fontWeights.semibold}; text-decoration: none; }
  a:hover { text-decoration: underline; }
`

const State = styled.span<{ $active: boolean }>`
  flex: none;
  padding: 3px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.muted)};
  background: ${({ $active, theme }) => ($active ? `${theme.colors.positive}33` : theme.colors.neutral)};
`

const Headline = styled.h2`
  margin: ${({ theme }) => theme.spacing[2]} 0 ${({ theme }) => theme.spacing[1]};
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.text};
`

const Body = styled.p`
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};
`

const Facts = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: ${({ theme }) => theme.spacing[3]};
  margin: ${({ theme }) => theme.spacing[4]} 0 0;
  padding-top: ${({ theme }) => theme.spacing[3]};
  border-top: 1px solid ${({ theme }) => theme.colors.border};

  dt { font-size: ${({ theme }) => theme.fontSizes.xs}; color: ${({ theme }) => theme.colors.muted}; }
  dd { margin: 2px 0 0; font-size: ${({ theme }) => theme.fontSizes.sm}; color: ${({ theme }) => theme.colors.text}; overflow-wrap: anywhere; }
`

const Empty = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  padding: ${({ theme }) => theme.spacing[8]} 0;
`

const Note = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  line-height: 1.5;
  margin-top: ${({ theme }) => theme.spacing[6]};
`

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
const formatDay = (day: string) => dateFormatter.format(new Date(`${day}T00:00:00.000Z`))

function period(item: AdLibraryItem): string {
  if (!item.endsOn) return item.active ? `Desde ${formatDay(item.startedOn)}, sem data para acabar` : `Desde ${formatDay(item.startedOn)}`
  return `${formatDay(item.startedOn)} até ${formatDay(item.endsOn)}`
}

function regions(item: AdLibraryItem): string {
  const parts = [...item.cities, ...item.states]
  return parts.length ? parts.join(', ') : 'Todo o Brasil'
}

function AdLibraryCard({ item }: { item: AdLibraryItem }) {
  const { advertiser } = item
  return (
    <Card>
      <Top>
        <Logo $src={advertiser.logoUrl} aria-hidden="true">{advertiser.logoUrl ? null : advertiser.name.slice(0, 1).toUpperCase()}</Logo>
        <Who>
          <small>Quem pagou</small>
          <Link to={`/empresa/${encodeURIComponent(advertiser.id)}`}>{advertiser.name}</Link>
        </Who>
        <State $active={item.active}>{item.active ? 'Rodando agora' : 'Parou de rodar'}</State>
      </Top>
      <Headline>{item.headline}</Headline>
      <Body>{item.body}</Body>
      <AdMedia items={adMediaItems(item)} maxWidth={480} />
      <Facts>
        <div><dt>Período</dt><dd>{period(item)}</dd></div>
        <div><dt>Onde foi mostrado</dt><dd>{regions(item)}</dd></div>
        <div><dt>Gasto (faixa)</dt><dd>{item.spend.label}</dd></div>
        <div><dt>Exibições (faixa)</dt><dd>{item.impressions.label}</dd></div>
        {item.destinationHost && <div><dt>Leva para o site</dt><dd>{item.destinationHost}</dd></div>}
        {item.destinationKind === 'PAGE_MESSAGE' && <div><dt>Leva para</dt><dd>Conversa com a empresa no Votz</dd></div>}
        {item.destinationKind === 'WHATSAPP' && <div><dt>Leva para</dt><dd>Conversa no WhatsApp</dd></div>}
        <div><dt>Da mesma empresa</dt><dd><Link to={`/anuncios/biblioteca?empresa=${encodeURIComponent(advertiser.id)}`}>Ver todos os anúncios</Link></dd></div>
      </Facts>
    </Card>
  )
}

export function AdLibrary() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') === 'active' ? 'active' : 'all'
  const company = params.get('empresa') ?? ''
  const [draft, setDraft] = useState(q)

  const query = useInfiniteQuery({
    queryKey: ['ad-library', q, status, company],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<AdLibraryResponse>('/ads/library', { params: { q: q || undefined, status, company: company || undefined, page: pageParam, limit: AD_LIBRARY.PAGE_SIZE } })
      return data
    },
    getNextPageParam: (last) => (last.meta.hasMore ? last.meta.page + 1 : undefined),
  })

  const items = query.data?.pages.flatMap((page) => page.data) ?? []

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }

  return (
    <Page>
      <Navbar />
      <Container>
        <Title>Biblioteca de anúncios</Title>
        <Intro>
          Todo anúncio que está rodando no Votz, ou que rodou nos últimos {AD_LIBRARY.RETENTION_MONTHS} meses, fica aqui para qualquer pessoa ver: quem pagou, o que
          diz, por quanto tempo e onde foi mostrado. O gasto e as exibições aparecem em faixas, não em número exato. Não mostramos para quem o anúncio foi
          direcionado, e anunciar no Votz não muda a nota nem a posição de ninguém.
        </Intro>

        <Filters
          onSubmit={(event) => {
            event.preventDefault()
            update({ q: draft.trim() })
          }}
          role="search"
        >
          <Input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Buscar por empresa ou texto do anúncio" aria-label="Buscar anúncios" maxLength={AD_LIBRARY.SEARCH_MAX} />
          <Select value={status} onChange={(event) => update({ status: event.target.value === 'active' ? 'active' : '' })} aria-label="Quais anúncios mostrar">
            <option value="all">Rodando e que já pararam</option>
            <option value="active">Só os que estão rodando</option>
          </Select>
          <Button type="submit">Buscar</Button>
        </Filters>

        {company && (
          <Intro>
            Mostrando só os anúncios de uma empresa. <Link to="/anuncios/biblioteca" onClick={() => update({ empresa: '' })}>Ver todas</Link>
          </Intro>
        )}

        {query.isLoading && <SkeletonRows rows={3} height={160} label="Carregando anúncios" />}
        {query.isError && <Empty>Não deu para carregar a biblioteca agora. Tente de novo em instantes.</Empty>}
        {!query.isLoading && !query.isError && items.length === 0 && <Empty>Nenhum anúncio encontrado.</Empty>}
        {items.map((item) => <AdLibraryCard key={item.adId} item={item} />)}

        {query.hasNextPage && (
          <div style={{ textAlign: 'center' }}>
            <Button type="button" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? 'Carregando…' : 'Ver mais anúncios'}
            </Button>
          </div>
        )}

        <Note>Gasto e exibições somam os últimos {AD_LIBRARY.RETENTION_MONTHS} meses. A lista atualiza a cada minuto.</Note>
      </Container>
    </Page>
  )
}
