import { Pressable, ScrollView } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Avatar, Button, Card, ErrorText, Heading, Label, State, styles } from '../../../components/ui'
import { PostCard, statusLabels } from '../../../components/content-card'
import { useDetail, useFollowing, useToggleFollow } from '../../../hooks/use-content'
import { api, errorMessage } from '../../../lib/api'
import { useSession } from '../../../lib/session'
import type { Page, PostDto, ProfileKind, PublicProfile, ReportSummary } from '../../../lib/types'
import { useQuery } from '@tanstack/react-query'
import { formatCount } from '../../../lib/format'

export default function Profile() {
  const { kind: rawKind, id } = useLocalSearchParams<{ kind: string; id: string }>()
  const valid = ['users', 'politicians', 'entities'].includes(rawKind)
  const kind = (valid ? rawKind : 'users') as ProfileKind
  const profile = useDetail<PublicProfile>(kind, valid ? id : '')
  const user = useSession((s) => s.user)
  const following = useFollowing(kind, id, !!user && !(kind === 'users' && user.id === id))
  const toggle = useToggleFollow(kind, id)
  const reports = useQuery({ queryKey: [kind, id, 'reports'], queryFn: () => api<Page<ReportSummary>>(`/${kind}/${id}/reports?limit=10`), enabled: valid })
  const posts = useQuery({ queryKey: ['posts', kind, id], queryFn: () => api<Page<PostDto>>(`/posts?${kind === 'users' ? 'authorUserId' : 'authorOrgId'}=${id}&limit=10`), enabled: valid })
  if (!valid) return <State title="Perfil não encontrado" />
  if (!profile.data) return <State loading={profile.isPending} title={profile.isPending ? 'Abrindo perfil' : 'Não foi possível abrir'} description={profile.isError ? errorMessage(profile.error) : undefined} retry={() => { void profile.refetch() }} />
  const name = profile.data.name || profile.data.legalName || 'Perfil público'
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Card><Avatar name={name} uri={profile.data.avatarUrl || profile.data.logoUrl} size={76} /><Heading>{name}</Heading><Label muted>{[profile.data.office, profile.data.city, profile.data.state].filter(Boolean).join(' · ') || 'Comunidade Votz'}</Label>
      {!!(profile.data.bio || profile.data.description) && <Label>{profile.data.bio || profile.data.description}</Label>}
      {!(kind === 'users' && user?.id === id) && <Button title={following.data?.following ? 'Deixar de seguir' : 'Seguir perfil'} loading={toggle.isPending || following.isLoading} disabled={!!user && following.isError} onPress={() => user ? toggle.mutate() : router.push('/login')} />}
      <ErrorText message={toggle.isError ? errorMessage(toggle.error) : undefined} />
      {following.isError && <Button title="Consultar acompanhamento" secondary onPress={() => { void following.refetch() }} />}
    </Card>
    <Heading>Publicações</Heading>
    {posts.data?.data.map((post) => <PostCard key={post.id} post={post} />)}
    {!posts.data?.data.length && <Label muted>{posts.isPending ? 'Carregando publicações…' : posts.isError ? 'Não foi possível carregar as publicações.' : 'Nenhuma publicação por aqui ainda.'}</Label>}
    <Heading>{kind === 'users' ? 'Relatos publicados' : 'Relatos direcionados'}</Heading>
    {reports.data?.data.map((report) => <Pressable key={report.id} accessibilityRole="button" accessibilityLabel={`Abrir relato: ${report.title}`} onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id } })}><Card><Label>{report.title}</Label><Label muted>{statusLabels[report.status]} · {formatCount(report._count.votes, 'apoio', 'apoios')}</Label></Card></Pressable>)}
    {!reports.data?.data.length && <Label muted>{reports.isPending ? 'Carregando relatos…' : reports.isError ? 'Não foi possível carregar os relatos.' : 'Nenhum relato por aqui ainda.'}</Label>}
  </ScrollView>
}
