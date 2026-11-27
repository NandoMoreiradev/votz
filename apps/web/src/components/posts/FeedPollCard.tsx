import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { ChartBar } from '@phosphor-icons/react'
import type { PostDto } from '@votz/shared-types'
import { usePostsFeed, useVotePostPoll } from '../../hooks/usePosts'
import { useAuthStore } from '../../store/auth.store'

interface FeedPollCardProps {
  city?: string
  uf?: string
}

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 16px;
  overflow: hidden;
`

const Title = styled.h2`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 14px 16px 6px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.text};
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 16px 14px;
`

const Author = styled(Link)`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};

  &:hover {
    text-decoration: underline;
  }
`

const Question = styled.p`
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`

const Option = styled.button<{ $voted: boolean; $mine: boolean; $pct: number }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid ${({ $mine, theme }) => ($mine ? theme.colors.action : theme.colors.border)};
  background: ${({ $voted, $pct, theme }) =>
    $voted
      ? `linear-gradient(90deg, ${theme.colors.surfaceHover} ${$pct}%, transparent ${$pct}%)`
      : theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 13.5px;
  font-weight: ${({ $mine }) => ($mine ? 700 : 500)};
  text-align: left;
  cursor: ${({ $voted }) => ($voted ? 'default' : 'pointer')};
  transition: background 0.15s, border-color 0.15s;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.action};
  }

  &:disabled {
    cursor: default;
  }

  strong {
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 12px;
  }
`

const Meta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`

const LoginHint = styled(Link)`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.action};

  &:hover {
    text-decoration: underline;
  }
`

function PollBody({ post }: { post: PostDto }) {
  const user = useAuthStore((s) => s.user)
  const vote = useVotePostPoll(post.id)
  const poll = post.poll!
  const showResults = !!poll.myVoteOptionId || poll.expired
  const authorName = post.author.orgName ?? post.author.name

  return (
    <Body>
      <Author to={`/publicacoes/${post.id}`}>Enquete de {authorName}</Author>
      {poll.question && <Question>{poll.question}</Question>}
      {poll.options.map((opt) => {
        const pct = poll.totalVotes > 0 ? Math.round((opt.votesCount / poll.totalVotes) * 100) : 0
        return (
          <Option
            key={opt.id}
            type="button"
            $voted={showResults}
            $mine={poll.myVoteOptionId === opt.id}
            $pct={pct}
            disabled={showResults || vote.isPending || !user}
            onClick={() => vote.mutate(opt.id)}
          >
            <span>{opt.text}</span>
            {showResults && <strong>{pct}%</strong>}
          </Option>
        )
      })}
      <Meta>
        {poll.totalVotes.toLocaleString('pt-BR')} {poll.totalVotes === 1 ? 'voto' : 'votos'} ·{' '}
        {poll.expired ? 'Encerrada' : 'Aberta'}
      </Meta>
      {!user && <LoginHint to="/entrar">Entre para votar</LoginHint>}
    </Body>
  )
}

/**
 * Enquete em alta para votar direto na lateral. Prefere uma enquete aberta que a pessoa ainda não votou;
 * se não houver, mostra uma aberta já votada (com o resultado). Sem enquete aberta, o card some.
 */
export function FeedPollCard({ city, uf }: FeedPollCardProps) {
  const { data } = usePostsFeed({ sort: 'trending', hasPoll: true, city, state: uf, limit: 6 })
  const open = (data?.data ?? []).filter((p) => p.poll && !p.poll.expired)
  const post = open.find((p) => !p.poll!.myVoteOptionId) ?? open[0]
  if (!post) return null

  return (
    <Card aria-label="Enquete em alta">
      <Title>
        <ChartBar size={18} weight="bold" />
        Enquete em alta
      </Title>
      <PollBody key={post.id} post={post} />
    </Card>
  )
}
