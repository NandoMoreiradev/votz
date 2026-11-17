import { Link, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { ArrowLeft } from '@phosphor-icons/react'
import { Navbar } from '../components/layout/Navbar'
import { PostCard } from '../components/posts/PostCard'
import { PostCommentsSection } from '../components/posts/PostCommentsSection'
import { usePost } from '../hooks/usePosts'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.main`
  max-width: 680px;
  margin: 0 auto;
  padding-bottom: 64px;
  min-height: calc(100vh - 56px);
  background: ${({ theme }) => theme.colors.white};
  border-inline: 1px solid ${({ theme }) => theme.colors.border};
`

const PageHeader = styled.header`
  position: sticky;
  top: 56px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 16px;
  height: 56px;
  padding: 0 16px;
  background: ${({ theme }) => theme.colors.white};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  h1 { margin: 0; font-family: ${({ theme }) => theme.fonts.heading}; font-size: 19px; font-weight: 700; }
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: ${({ theme }) => theme.colors.text};
  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.action}; }
`

const StateCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 36px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
`

export function PostDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const { data: post, isLoading, isError } = usePost(id)

  return (
    <Page>
      <Navbar />
      <Content>
        <PageHeader>
          <BackLink to="/?tab=publicacoes" aria-label="Voltar para Publicações" title="Voltar para Publicações"><ArrowLeft size={21} /></BackLink>
          <h1>Publicação</h1>
        </PageHeader>

        {isLoading && <StateCard>Carregando publicação...</StateCard>}
        {isError && <StateCard>Publicação não encontrada ou removida.</StateCard>}
        {post && <>
          <PostCard post={post} detail />
          <PostCommentsSection key={post.id} postId={post.id} canCommentWithAudio={post.canCommentWithAudio} commentsCount={post.commentsCount} />
        </>}
      </Content>
    </Page>
  )
}
