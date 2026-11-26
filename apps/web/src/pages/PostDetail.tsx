import { Link, useNavigate, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { ArrowLeft, CheckCircle, Fire, UserCheck, UserPlus } from '@phosphor-icons/react'
import { UserType } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { PostCard } from '../components/posts/PostCard'
import { PostCommentsSection } from '../components/posts/PostCommentsSection'
import { usePost } from '../hooks/usePosts'
import { useTrendingTopics } from '../hooks/useTopics'
import { useIsFollowingTarget, useToggleFollowTarget } from '../hooks/useFollow'
import { useAuthStore } from '../store/auth.store'
import { SkeletonBlock } from '../components/ui/Skeleton'
import type { PostAuthorInfo, PostDto } from '../types/api'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.white};
`

const Shell = styled.div`
  max-width: 1020px;
  margin: 0 auto;
  padding: 0 16px;
  display: grid;
  grid-template-columns: minmax(0, 620px) 340px;
  gap: 28px;
  align-items: start;
  justify-content: center;

  @media (max-width: 1024px) {
    grid-template-columns: minmax(0, 620px);
    padding: 0;
  }
`

const Content = styled.main`
  min-width: 0;
  padding-bottom: 80px;
  min-height: calc(100vh - 56px);
  background: ${({ theme }) => theme.colors.white};
  border-inline: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 640px) {
    border-inline: none;
  }
`

const PageHeader = styled.header`
  position: sticky;
  top: 56px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 16px;
  height: 53px;
  padding: 0 16px;
  background: ${({ theme }) =>
    theme.mode === 'dark' ? 'rgba(23, 26, 38, 0.85)' : 'rgba(255, 255, 255, 0.85)'};
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  h1 {
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: 19px;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.text};
  }
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: ${({ theme }) => theme.colors.text};
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.action};
  }
`

const StateCard = styled.div`
  margin: 24px 16px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 16px;
  padding: 36px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
`

const RightRail = styled.aside`
  position: sticky;
  top: 72px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0 32px;

  @media (max-width: 1024px) {
    display: none;
  }
`

const RailCard = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 16px;
  overflow: hidden;
`

const RailHead = styled.div`
  padding: 14px 16px 10px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  display: flex;
  align-items: center;
  gap: 8px;
`

const AuthorRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 16px 14px;
`

const AuthorAvatar = styled(Link)<{ $src: string | null; $org?: boolean }>`
  width: 44px;
  height: 44px;
  border-radius: ${({ $org }) => ($org ? '10px' : '50%')};
  flex-shrink: 0;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.onAccent};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

const AuthorMeta = styled.div`
  flex: 1;
  min-width: 0;
`

const AuthorNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`

const AuthorNameLink = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    text-decoration: underline;
  }
`

const AuthorSub = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const AuthorLocation = styled.div`
  padding: 0 16px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`

const FollowPill = styled.button<{ $following?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $following, theme }) => ($following ? theme.colors.border : theme.colors.text)};
  background: ${({ $following, theme }) => ($following ? theme.colors.white : theme.colors.text)};
  color: ${({ $following, theme }) => ($following ? theme.colors.text : theme.colors.white)};
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.88;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const TopicLinkRow = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const TopicTag = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`

const TopicMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  font-variant-numeric: tabular-nums;
`

const RailFooter = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 0 8px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};

  a {
    color: inherit;
    &:hover {
      text-decoration: underline;
    }
  }
`

function resolveRailAuthor(a: PostAuthorInfo) {
  const name = a.orgName ?? a.name
  const avatar = a.orgAvatarUrl ?? a.avatarUrl
  const verified = a.orgType ? a.orgVerified : a.verified
  const isOrg = a.orgType === 'ENTITY' || a.orgType === 'COMPANY'
  const href =
    a.orgType === 'POLITICIAN' && a.orgId
      ? `/politico/${a.orgId}`
      : a.orgType === 'ENTITY' && a.orgId
        ? `/entidade/${a.orgId}`
        : a.orgType === 'COMPANY' && a.orgId
          ? `/empresa/${a.orgId}`
          : `/perfil/${a.userId}`
  const subtitle = a.orgSubtitle
    ?? (!a.orgName && a.username ? `@${a.username}` : null)
    ?? (a.userType === UserType.PRESS ? 'Imprensa' : null)
  const followTargetType: 'USER' | 'POLITICIAN' | 'ENTITY' =
    a.orgType === 'POLITICIAN'
      ? 'POLITICIAN'
      : a.orgType === 'ENTITY'
        ? 'ENTITY'
        : 'USER'
  const followTargetId =
    a.orgType === 'POLITICIAN' || a.orgType === 'ENTITY' ? a.orgId ?? undefined : a.userId
  return { name, avatar, verified, isOrg, href, subtitle, followTargetType, followTargetId }
}

function AuthorRailCard({ post }: { post: PostDto }) {
  const user = useAuthStore((s) => s.user)
  const author = resolveRailAuthor(post.author)
  const { data: followState } = useIsFollowingTarget(author.followTargetType, author.followTargetId)
  const toggleFollow = useToggleFollowTarget(author.followTargetType, author.followTargetId)
  const canFollow =
    !!user &&
    !!author.followTargetId &&
    (author.followTargetType !== 'USER' || user.id !== post.author.userId)
  const location = [post.city, post.state].filter(Boolean).join(' · ')

  return (
    <RailCard aria-label="Sobre o autor">
      <RailHead>Sobre o autor</RailHead>
      <AuthorRow>
        <AuthorAvatar to={author.href} $src={author.avatar} $org={author.isOrg}>
          {!author.avatar && author.name.charAt(0).toUpperCase()}
        </AuthorAvatar>
        <AuthorMeta>
          <AuthorNameRow>
            <AuthorNameLink to={author.href}>{author.name}</AuthorNameLink>
            {author.verified && <CheckCircle size={14} weight="fill" color="#2DC653" />}
          </AuthorNameRow>
          {author.subtitle && <AuthorSub>{author.subtitle}</AuthorSub>}
        </AuthorMeta>
        {canFollow && (
          <FollowPill
            type="button"
            $following={followState?.following}
            disabled={toggleFollow.isPending}
            onClick={() => toggleFollow.mutate()}
          >
            {followState?.following ? (
              <>
                <UserCheck size={14} /> Seguindo
              </>
            ) : (
              <>
                <UserPlus size={14} /> Seguir
              </>
            )}
          </FollowPill>
        )}
      </AuthorRow>
      {location && <AuthorLocation>{location}</AuthorLocation>}
    </RailCard>
  )
}

export function PostDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: post, isLoading, isError } = usePost(id)
  const { data: trendingTopics } = useTrendingTopics({ limit: 5 })

  return (
    <Page>
      <Navbar />
      <Shell>
        <Content>
          <PageHeader>
            <BackLink to="/?tab=publicacoes" aria-label="Voltar para Publicações" title="Voltar para Publicações">
              <ArrowLeft size={20} />
            </BackLink>
            <h1>Publicação</h1>
          </PageHeader>

          {isLoading && (
            <div style={{ padding: 16 }}>
              <SkeletonBlock $h={280} $radius="12px" role="status" aria-label="Carregando publicação" />
            </div>
          )}
          {isError && <StateCard>Publicação não encontrada ou removida.</StateCard>}
          {post && (
            <>
              <PostCard
                post={post}
                detail
                onQuote={(p) => navigate('/?tab=publicacoes', { state: { quotePost: p } })}
              />
              <PostCommentsSection
                key={post.id}
                postId={post.id}
                canCommentWithAudio={post.canCommentWithAudio}
                commentsCount={post.commentsCount}
              />
            </>
          )}
        </Content>

        <RightRail>
          {post && <AuthorRailCard post={post} />}

          {trendingTopics && trendingTopics.length > 0 && (
            <RailCard aria-label="Pautas em alta">
              <RailHead>
                <Fire size={16} weight="fill" color="#E63946" />
                Em alta no Votz
              </RailHead>
              {trendingTopics.map((t) => (
                <TopicLinkRow key={t.id} to={`/pautas/${t.slug}`}>
                  <TopicTag>{t.displayTag}</TopicTag>
                  <TopicMeta>{t.postsCount + t.reportsCount} menções</TopicMeta>
                </TopicLinkRow>
              ))}
            </RailCard>
          )}

          <RailFooter aria-label="Links institucionais">
            <Link to="/sobre">Sobre</Link>
            <Link to="/diretrizes">Diretrizes</Link>
            <Link to="/termos">Termos</Link>
            <Link to="/privacidade">Privacidade</Link>
            <Link to="/cookies">Cookies</Link>
            <span>© {new Date().getFullYear()} Votz</span>
          </RailFooter>
        </RightRail>
      </Shell>
    </Page>
  )
}
