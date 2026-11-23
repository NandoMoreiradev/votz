import { useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import {
  CONTEXT_NOTE_KIND_LABELS,
  CONTEXT_NOTE_RATING_LABELS,
  CONTEXT_NOTE_RATING_REASONS,
  CONTEXT_NOTE_WRITING_RULES,
  CONTEXT_NOTES_BRAND,
  ContextNoteRatingValue,
  ContextNoteTargetType,
} from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { WriteContextNoteModal } from '../components/context-notes/WriteContextNoteModal'
import {
  errorText,
  useContextNotesEnabled,
  useContextQueue,
  useContributorStatus,
  useJoinContributor,
  useRateContextNote,
  type QueueNote,
  type QueueTarget,
} from '../hooks/useContextNotes'
import { useAuthStore } from '../store/auth.store'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
  display: flex;
  flex-direction: column;
`
const Content = styled.main`
  max-width: 760px;
  width: 100%;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing[8]} ${({ theme }) => theme.spacing[4]} ${({ theme }) => theme.spacing[12]};
  flex: 1;
`
const Panel = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[6]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`
const H1 = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing[2]};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.primary};
`
const H2 = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing[3]};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.text};
`
const P = styled.p`
  margin: 0 0 ${({ theme }) => theme.spacing[3]};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.text};
`
const Muted = styled(P)`
  color: ${({ theme }) => theme.colors.muted};
`
const List = styled.ul`
  margin: 0 0 ${({ theme }) => theme.spacing[3]};
  padding-left: ${({ theme }) => theme.spacing[5]};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.6;
`
const Notice = styled.p`
  margin: 0 0 ${({ theme }) => theme.spacing[3]};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]};
  background: ${({ theme }) => `${theme.colors.action}12`};
  border: 1px solid ${({ theme }) => `${theme.colors.action}33`};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
`
const Check = styled.label`
  display: flex;
  gap: ${({ theme }) => theme.spacing[2]};
  align-items: flex-start;
  margin: ${({ theme }) => theme.spacing[3]} 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  cursor: pointer;
  input {
    margin-top: 3px;
    accent-color: ${({ theme }) => theme.colors.primary};
  }
`
const Item = styled.article`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[4]};
  margin-bottom: ${({ theme }) => theme.spacing[3]};
`
const Target = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing[3]};
  padding: ${({ theme }) => theme.spacing[2]} ${({ theme }) => theme.spacing[3]};
  background: ${({ theme }) => theme.colors.neutral};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
  a {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }
  p {
    margin: 4px 0 0;
    color: ${({ theme }) => theme.colors.text};
  }
`
const Kind = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.muted};
`
const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[2]};
  margin: ${({ theme }) => theme.spacing[2]} 0;
`
const Chip = styled.button<{ $on: boolean }>`
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ theme, $on }) => ($on ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $on }) => ($on ? theme.colors.primary : theme.colors.white)};
  color: ${({ theme, $on }) => ($on ? theme.colors.white : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  cursor: pointer;
`
const Err = styled.p`
  margin: ${({ theme }) => theme.spacing[2]} 0 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.action};
`

function TargetBox({ target }: { target: QueueTarget }) {
  return (
    <Target>
      <Link to={target.link}>{target.title}</Link>
      <p>{target.excerpt}</p>
    </Target>
  )
}

function Sources({ sources }: { sources: string[] }) {
  return (
    <List>
      {sources.map((s) => (
        <li key={s}>
          <a href={s} target="_blank" rel="noopener noreferrer nofollow ugc">{s}</a>
        </li>
      ))}
    </List>
  )
}

function RateItem({ item }: { item: QueueNote }) {
  const [value, setValue] = useState<ContextNoteRatingValue | null>(null)
  const [reasons, setReasons] = useState<string[]>([])
  const rate = useRateContextNote()
  const side = value === ContextNoteRatingValue.NOT_HELPFUL ? 'not_helpful' : 'helpful'
  const options = CONTEXT_NOTE_RATING_REASONS.filter((r) => r.side === side)

  function pick(next: ContextNoteRatingValue) {
    setValue(next)
    setReasons([])
  }
  function toggle(reason: string) {
    setReasons((prev) => (prev.includes(reason) ? prev.filter((r) => r !== reason) : prev.length < 3 ? [...prev, reason] : prev))
  }

  return (
    <Item>
      <TargetBox target={item.target} />
      <Kind>{CONTEXT_NOTE_KIND_LABELS[item.note.kind].label}</Kind>
      <P style={{ marginTop: 4 }}>{item.note.text}</P>
      <Sources sources={item.note.sources} />
      <P><strong>A nota ajuda a entender melhor?</strong> Abra a fonte antes de responder.</P>
      <Row>
        {Object.values(ContextNoteRatingValue).map((v) => (
          <Chip key={v} type="button" $on={value === v} onClick={() => pick(v)}>
            {CONTEXT_NOTE_RATING_LABELS[v]}
          </Chip>
        ))}
      </Row>
      {value && (
        <>
          <Muted style={{ margin: '4px 0' }}>Por quê? (opcional, até 3)</Muted>
          <Row>
            {options.map((o) => (
              <Chip key={o.value} type="button" $on={reasons.includes(o.value)} onClick={() => toggle(o.value)}>
                {o.label}
              </Chip>
            ))}
          </Row>
          <Button type="button" disabled={rate.isPending} onClick={() => rate.mutate({ noteId: item.note.id, value, reasons })}>
            {rate.isPending ? 'Enviando...' : 'Enviar avaliação'}
          </Button>
        </>
      )}
      {rate.isError && <Err role="alert">{errorText(rate.error)}</Err>}
    </Item>
  )
}

export function ContextoDaComunidade() {
  const user = useAuthStore((s) => s.user)
  const enabled = useContextNotesEnabled()
  const { data: status, isLoading } = useContributorStatus()
  const join = useJoinContributor()
  const [accepted, setAccepted] = useState(false)
  const [writeTarget, setWriteTarget] = useState<QueueTarget | null>(null)
  const active = !!status?.canRate
  const { data: queue } = useContextQueue(active)

  return (
    <Page>
      <Navbar />
      <Content>
        <Panel>
          <H1>{CONTEXT_NOTES_BRAND.feature}</H1>
          <P>
            Às vezes uma publicação ou um relato precisa de um complemento: uma informação que falta, uma correção com fonte, uma prova a mais.
            Aqui, pessoas do Votz escrevem esse complemento, sempre com link de fonte, e outras pessoas avaliam se ele ajuda.
          </P>
          <List>
            <li>A nota <strong>só aparece para todo mundo</strong> depois que várias pessoas avaliam como útil.</li>
            <li>A nota <strong>não tira nada do ar</strong>. Se o conteúdo quebra as regras, use "Denunciar".</li>
            <li>Em <strong>relato</strong>, a nota só pode trazer prova a mais, novidade sobre o caso ou aviso de relato repetido. Nunca "isso é falso".</li>
            <li>Quem escreveu o conteúdo, ou é do órgão a que ele se refere, não escreve nem avalia nota sobre ele.</li>
          </List>
        </Panel>

        {!enabled && (
          <Panel>
            <Muted style={{ margin: 0 }}>Este recurso ainda não está aberto. Em breve.</Muted>
          </Panel>
        )}

        {enabled && !user && (
          <Panel>
            <P>Para colaborar, <Link to="/entrar">entre na sua conta</Link>.</P>
          </Panel>
        )}

        {enabled && user && isLoading && <Panel><Muted style={{ margin: 0 }}>Carregando...</Muted></Panel>}

        {enabled && user && status?.blockedReason && (
          <Panel>
            <Notice>{status.blockedReason}</Notice>
          </Panel>
        )}

        {enabled && user && status && !status.blockedReason && !status.joined && (
          <Panel>
            <H2>Quero colaborar</H2>
            <P>Para escrever e avaliar notas, leia as regras e aceite o termo do colaborador:</P>
            <List>
              <li>Tenho <strong>18 anos ou mais</strong>.</li>
              {CONTEXT_NOTE_WRITING_RULES.map((rule) => <li key={rule}>{rule}</li>)}
              <li>Minhas avaliações podem ser usadas para medir se eu avalio com atenção, e só isso.</li>
              <li>Meu nome <strong>não aparece</strong> nas notas, mas o Votz guarda quem escreveu, para responder a ordem judicial.</li>
            </List>
            <Check>
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span>Li e aceito o termo do colaborador.</span>
            </Check>
            <Button type="button" disabled={!accepted || join.isPending} onClick={() => join.mutate(status.termsVersion)}>
              {join.isPending ? 'Entrando...' : 'Entrar como colaborador'}
            </Button>
            {join.isError && <Err role="alert">{errorText(join.error)}</Err>}
          </Panel>
        )}

        {enabled && user && status?.joined && (
          <>
            {status.suspended && <Panel><Notice>Sua participação como colaborador está suspensa.</Notice></Panel>}
            {active && (
              <Panel>
                <H2>Seu andamento</H2>
                <P>
                  Você avaliou <strong>{status.progress.ratingsGiven}</strong> notas.{' '}
                  {status.canWrite
                    ? 'Você já pode escrever notas pelo menu "⋯" de uma publicação ou relato.'
                    : `Avalie pelo menos ${status.progress.ratingsNeededToWrite} para liberar a escrita de notas.`}
                </P>
              </Panel>
            )}

            {active && (
              <Panel>
                <H2>Notas para avaliar</H2>
                {queue && queue.toRate.length === 0 && <Muted style={{ margin: 0 }}>Nenhuma nota esperando você agora.</Muted>}
                {queue?.toRate.map((item) => <RateItem key={item.note.id} item={item} />)}
              </Panel>
            )}

            {active && status.canWrite && queue && queue.requested.length > 0 && (
              <Panel>
                <H2>Pedidos de contexto</H2>
                <Muted>Conteúdos que pessoas pediram contexto e ainda não têm nota.</Muted>
                {queue.requested.map(({ count, target }) => (
                  <Item key={`${target.type}-${target.id}`}>
                    <TargetBox target={target} />
                    <Muted style={{ margin: '0 0 8px' }}>{count} {count === 1 ? 'pessoa pediu' : 'pessoas pediram'} contexto.</Muted>
                    <Button type="button" onClick={() => setWriteTarget(target)}>Escrever nota</Button>
                  </Item>
                ))}
              </Panel>
            )}
          </>
        )}
      </Content>
      {writeTarget && (
        <WriteContextNoteModal
          isOpen
          targetType={writeTarget.type as ContextNoteTargetType}
          targetId={writeTarget.id}
          onClose={() => setWriteTarget(null)}
        />
      )}
    </Page>
  )
}
