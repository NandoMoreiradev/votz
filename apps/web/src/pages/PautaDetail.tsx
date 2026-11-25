import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { ArrowLeft, Broadcast, Fire, MapPin, Megaphone, Plus } from '@phosphor-icons/react'
import { Navbar } from '../components/layout/Navbar'
import { PostCard } from '../components/posts/PostCard'
import { PostComposer } from '../components/posts/PostComposer'
import { ReportCard } from '../components/reports/ReportCard'
import { usePostsFeed } from '../hooks/usePosts'
import { useFollowTopic, useTopicDetail } from '../hooks/useTopics'
import { useAuthStore } from '../store/auth.store'
import { SkeletonBlock, SkeletonRows } from '../components/ui/Skeleton'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px 20px 64px;
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 16px;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

const HeroCard = styled.div`
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 24px;
  margin-bottom: 24px;
`

const HeroTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
`

const Kicker = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.7);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
`

const Title = styled.h1`
  margin: 0 0 8px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  color: ${({ theme }) => theme.colors.white};
`

const StatsRow = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: rgba(255, 255, 255, 0.85);
`

const HeroActions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`

const ActionBtn = styled.button<{ $accent?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: ${({ $accent, theme }) => ($accent ? theme.colors.action : 'rgba(255,255,255,0.12)')};
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: 700;
  cursor: pointer;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const Tabs = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`

const TabBtn = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  padding: 8px 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.white)};
  color: ${({ $active, theme }) => ($active ? theme.colors.white : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: 600;
  cursor: pointer;
`

const SideCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 16px;
  margin-bottom: 16px;

  h3 {
    margin: 0 0 12px;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: ${({ theme }) => theme.fontSizes.md};
    color: ${({ theme }) => theme.colors.text};
  }
`

const CityRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border-bottom: 1px dashed ${({ theme }) => theme.colors.border};

  &:last-child { border-bottom: none; }
  span.ct {
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 11px;
    color: ${({ theme }) => theme.colors.muted};
  }
`

export function PautaDetail() {
  const { slug = '' } = useParams<{ slug: string }>()
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<'posts' | 'reports' | 'debates'>('posts')

  const { data: topicData, isLoading: loadingTopic } = useTopicDetail(slug)
  const { data: postsData, isLoading: loadingPosts } = usePostsFeed({
    topic: slug,
    sort: 'trending',
    limit: 30,
  })
  const followTopic = useFollowTopic(slug)

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/?tab=publicacoes">
          <ArrowLeft size={16} /> Voltar para o feed
        </BackLink>

        {loadingTopic ? (
          <SkeletonBlock $h={220} $radius="12px" role="status" aria-label="Carregando pauta" />
        ) : !topicData ? (
          <SideCard>Pauta cívica não encontrada ainda.</SideCard>
        ) : (
          <>
            <HeroCard>
              <HeroTop>
                <div>
                  <Kicker>
                    <Fire size={14} weight="fill" /> Pauta Cívica · Tração {topicData.topic.tractionScore.toFixed(1)}
                  </Kicker>
                  <Title>{topicData.topic.displayTag}</Title>
                  <StatsRow>
                    <span>
                      {topicData.topic.postsCount}{' '}
                      {topicData.topic.postsCount === 1 ? 'publicação' : 'publicações'}
                    </span>
                    <span>
                      {topicData.topic.reportsCount}{' '}
                      {topicData.topic.reportsCount === 1 ? 'relato formal' : 'relatos formais'}
                    </span>
                    <span>
                      {topicData.topic.debatesCount}{' '}
                      {topicData.topic.debatesCount === 1 ? 'debate' : 'debates'}
                    </span>
                  </StatsRow>
                </div>

                <HeroActions>
                  {user && (
                    <ActionBtn
                      type="button"
                      disabled={followTopic.isPending}
                      onClick={() => followTopic.mutate()}
                    >
                      {topicData.following ? 'Seguindo pauta' : '+ Seguir pauta'}
                    </ActionBtn>
                  )}
                  <ActionBtn as={Link as any} to="/novo" $accent>
                    <Plus size={14} weight="bold" /> Abrir Relato sobre esta pauta
                  </ActionBtn>
                </HeroActions>
              </HeroTop>
            </HeroCard>

            <Grid>
              <div>
                <Tabs>
                  <TabBtn type="button" $active={tab === 'posts'} onClick={() => setTab('posts')}>
                    Publicações ({topicData.topic.postsCount})
                  </TabBtn>
                  <TabBtn type="button" $active={tab === 'reports'} onClick={() => setTab('reports')}>
                    <Megaphone size={14} style={{ marginRight: 4 }} />
                    Relatos ({topicData.reports.length})
                  </TabBtn>
                  <TabBtn type="button" $active={tab === 'debates'} onClick={() => setTab('debates')}>
                    <Broadcast size={14} style={{ marginRight: 4 }} />
                    Debates ({topicData.debates.length})
                  </TabBtn>
                </Tabs>

                {tab === 'posts' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <PostComposer initialTopic={topicData.topic.slug} />
                    {loadingPosts ? (
                      <SkeletonRows rows={3} height={140} label="Carregando publicações" />
                    ) : (postsData?.data ?? []).length === 0 ? (
                      <SideCard>Nenhuma publicação nesta pauta ainda.</SideCard>
                    ) : (
                      (postsData?.data ?? []).map((p) => <PostCard key={p.id} post={p} />)
                    )}
                  </div>
                )}

                {tab === 'reports' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topicData.reports.length === 0 ? (
                      <SideCard>Nenhum relato formal marcado com {topicData.topic.displayTag} ainda.</SideCard>
                    ) : (
                      topicData.reports.map((r) => (
                        <ReportCard
                          key={r.id}
                          report={{
                            ...r,
                            description: r.description,
                            anonymous: false,
                            latitude: null,
                            longitude: null,
                            normalizedAddress: null,
                            neighborhood: null,
                            recipientType: null,
                            recipientId: null,
                            updatedAt: r.createdAt,
                            author: null,
                            _count: { ...r._count, meTooVotes: 0 },
                          }}
                        />
                      ))
                    )}
                  </div>
                )}

                {tab === 'debates' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topicData.debates.length === 0 ? (
                      <SideCard>Nenhum debate vinculado a {topicData.topic.displayTag} ainda.</SideCard>
                    ) : (
                      topicData.debates.map((d) => (
                        <SideCard key={d.id} as={Link as any} to={`/debates/${d.id}`} style={{ display: 'block' }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.title}</div>
                          <div style={{ fontSize: '0.8125rem', color: '#6B7280' }}>
                            {d.status} · por {d.creator?.name ?? d.hostEntity?.legalName ?? 'Votz'}
                          </div>
                        </SideCard>
                      ))
                    )}
                  </div>
                )}
              </div>

              <aside>
                <SideCard>
                  <h3>Cidades mobilizadas</h3>
                  {topicData.topCities.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#6B7280' }}>
                      Ainda sem recortes municipais registrados.
                    </p>
                  ) : (
                    topicData.topCities.map((c) => (
                      <CityRow key={c.name}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <MapPin size={14} /> {c.name}
                        </span>
                        <span className="ct">{c.count} registros</span>
                      </CityRow>
                    ))
                  )}
                </SideCard>
              </aside>
            </Grid>
          </>
        )}
      </Content>
    </Page>
  )
}
