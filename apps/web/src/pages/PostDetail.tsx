import { Link, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { ArrowLeft } from '@phosphor-icons/react'
import { Navbar } from '../components/layout/Navbar'
import { PostCard } from '../components/posts/PostCard'
import { usePost } from '../hooks/usePosts'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 64px;
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
        <BackLink to="/?tab=publicacoes">
          <ArrowLeft size={16} /> Voltar para Publicações
        </BackLink>

        {isLoading && <StateCard>Carregando publicação...</StateCard>}
        {isError && <StateCard>Publicação não encontrada ou removida.</StateCard>}
        {post && <PostCard post={post} showCommentsInline />}
      </Content>
    </Page>
  )
}
