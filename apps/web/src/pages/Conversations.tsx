import { useRef, useState, type FormEvent, type PropsWithChildren } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChatCircle, Plus, ShieldCheck, Users } from '@phosphor-icons/react'
import styled from 'styled-components'
import {
  conversationTitle,
  conversationMemberLabel,
  type ConversationPerson,
  type ConversationSummary,
} from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import {
  useConversation,
  useConversationAction,
  useConversationBlocks,
  useConversationCapabilities,
  useConversationContacts,
  useConversationList,
  useConversationScope,
  useCreateConversationGroup,
} from '../hooks/useConversations'
import { useAuthStore } from '../store/auth.store'
import { ChatPane } from '../components/conversations/ChatPane'

const Shell = styled.main`
  max-width: 760px;
  margin: auto;
  min-height: calc(100dvh - 56px);
  background: ${({ theme }) => theme.colors.white};
  border-inline: 1px solid ${({ theme }) => theme.colors.border};
  padding-bottom: 40px;
  &:has([data-chat-pane]) { padding-bottom: 0; height: calc(100dvh - 56px); min-height: 0; overflow: hidden; }
  &:has([data-chat-pane]) > header { display: none; }
  h1 {
    font-size: 21px;
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.heading};
  }
  h2 {
    font-size: 18px;
    margin: 0 0 12px;
  }
  p {
    line-height: 1.6;
  }
  button,
  input {
    font: inherit;
  }
  button,
  a {
    -webkit-tap-highlight-color: transparent;
  }
  button:focus-visible,
  a:focus-visible,
  input:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.action};
    outline-offset: 3px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
`
const Header = styled.header`
  height: 60px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  a {
    color: inherit;
  }
  h1 {
    flex: 1;
  }
`
const Section = styled.section`
  padding: 24px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`
const Muted = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  margin: 5px 0;
  font-size: 14px;
`
const Action = styled.button<{ $secondary?: boolean }>`
  border: 1px solid
    ${({ theme, $secondary }) => ($secondary ? theme.colors.border : theme.colors.action)};
  border-radius: 24px;
  background: ${({ theme, $secondary }) => ($secondary ? theme.colors.white : theme.colors.action)};
  color: ${({ theme, $secondary }) => ($secondary ? theme.colors.text : theme.colors.white)};
  min-height: 42px;
  padding: 8px 17px;
  cursor: pointer;
  font-weight: 600;
`
const Field = styled.input`
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  margin: 8px 0;
  background: ${({ theme }) => theme.colors.white};
  color: inherit;
`
const ListItem = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  a {
    color: inherit;
    text-decoration: none;
    display: block;
  }
  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`
const Face = styled.div`
  width: 46px;
  height: 46px;
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.primary};
  overflow: hidden;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`
const TabRow = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  button {
    flex: 1;
    min-height: 52px;
    background: transparent;
    border: 0;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.muted};
  }
  button[aria-selected='true'] {
    color: ${({ theme }) => theme.colors.text};
    border-bottom-color: ${({ theme }) => theme.colors.action};
  }
`
const Notice = styled.div`
  margin: 20px;
  padding: 18px;
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  line-height: 1.6;
  svg {
    flex-shrink: 0;
    margin-top: 2px;
  }
`
const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
`

function message(error: unknown) {
  const value = error as { response?: { data?: { message?: string | string[] } } }
  const text = value?.response?.data?.message
  return Array.isArray(text)
    ? text.join('. ')
    : text || 'Não foi possível concluir. Verifique sua conexão e tente novamente.'
}
function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Section role="alert">
      <p>{message(error)}</p>
      {retry && (
        <Action $secondary onClick={retry}>
          Tentar novamente
        </Action>
      )}
    </Section>
  )
}
function Portrait({ person, group }: { person?: ConversationPerson; group?: boolean }) {
  return (
    <Face>
      {person?.avatarUrl ? (
        <img src={person.avatarUrl} alt="" />
      ) : group ? (
        <Users size={23} />
      ) : (
        person?.name.charAt(0).toUpperCase() || <ChatCircle size={23} />
      )}
    </Face>
  )
}
export function ConversationGate({ children }: PropsWithChildren) {
  const scope = useConversationScope()
  const capability = useConversationCapabilities()
  if (!scope.user)
    return (
      <Section>
        <h2>Suas conversas começam aqui</h2>
        <p>Entre na sua conta para continuar.</p>
        <Link to="/entrar">Entrar no Votz</Link>
      </Section>
    )
  if (scope.activeContext)
    return (
      <Section>
        <h2>Use sua identidade pessoal</h2>
        <p>Selecione seu perfil pessoal no menu de contas para acessar suas conversas.</p>
      </Section>
    )
  if (!scope.user.emailVerified)
    return (
      <Section>
        <h2>Confirme seu e-mail</h2>
        <p>A confirmação protege você e as pessoas com quem conversa.</p>
      </Section>
    )
  if (capability.isPending) return <Section role="status">Carregando conversas…</Section>
  if (capability.isError)
    return (
      <Failure
        error={capability.error}
        retry={() => {
          void capability.refetch()
        }}
      />
    )
  if (!capability.data?.enabled)
    return (
      <Section>
        <h2>Conversas estão chegando</h2>
        <p>Este recurso ainda não foi liberado para sua conta.</p>
      </Section>
    )
  return <>{children}</>
}
export function Conversations() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const create = location.pathname === '/conversas/nova'
  const blocked = location.pathname === '/conversas/bloqueios'
  return (
    <>
      <Navbar />
      <Shell>
        <Header>
          <Link to={id || create ? '/conversas' : '/'} aria-label="Voltar">
            <ArrowLeft size={23} />
          </Link>
          <h1>{create ? 'Nova conversa' : id ? 'Detalhes da conversa' : 'Conversas'}</h1>
          {!id && !create && (
            <Link to="/conversas/nova" aria-label="Nova conversa">
              <Plus size={24} />
            </Link>
          )}
        </Header>
        <ConversationGate>
          {blocked ? (
            <BlockedPeople />
          ) : create ? (
            <CreateConversation />
          ) : id ? (
            <ConversationDetail key={id} id={id} />
          ) : (
            <ConversationInbox />
          )}
        </ConversationGate>
      </Shell>
    </>
  )
}
function ConversationInbox() {
  const [folder, setFolder] = useState<'active' | 'requests'>('active')
  const list = useConversationList(folder)
  const action = useConversationAction()
  const { user } = useConversationScope()
  const items = list.data?.pages.flatMap((page) => page.items) || []
  return (
    <>
      <TabRow role="tablist" aria-label="Caixas de conversas">
        {(['active', 'requests'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={folder === value}
            onClick={() => {
              setFolder(value)
              action.reset()
            }}
          >
            {value === 'active' ? 'Conversas' : 'Solicitações'}
          </button>
        ))}
      </TabRow>
      <Section style={{ paddingBlock: 12 }}>
        <Link to="/conversas/bloqueios">Pessoas bloqueadas</Link>
      </Section>
      {list.isError && (
        <Failure
          error={list.error}
          retry={() => {
            void list.refetch()
          }}
        />
      )}
      {action.isError && <Failure error={action.error} />}
      {list.isPending ? (
        <Section role="status">Carregando…</Section>
      ) : !items.length && !list.isError ? (
        <Section>
          <h2>{folder === 'requests' ? 'Você está em dia' : 'Uma conversa pode aproximar'}</h2>
          <Muted>
            {folder === 'requests'
              ? 'Seus convites e solicitações aparecerão aqui.'
              : 'Encontre uma pessoa ou crie um grupo para sua comunidade.'}
          </Muted>
          {folder === 'active' && <Link to="/conversas/nova">Começar uma conversa</Link>}
        </Section>
      ) : null}
      {items.map((item) => (
        <ListItem key={item.id}>
          <Row>
            <Portrait
              group={item.kind === 'GROUP'}
              person={item.members.find((m) => m.user.id !== user!.id)?.user}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              {folder === 'active' ? (
                <Link to={`/conversas/${item.id}`}>
                  <strong>{conversationTitle(item, user!.id)}</strong>
                  <Muted>
                    {item.archivedAt
                      ? 'Grupo encerrado'
                      : item.kind === 'GROUP'
                        ? conversationMemberLabel(item.memberCount)
                        : item.members.some((m) => m.state === 'INVITED')
                          ? 'Aguardando aceite'
                          : 'Conversa aceita'}
                  </Muted>
                </Link>
              ) : (
                <>
                  <strong>{conversationTitle(item, user!.id)}</strong>
                  <Muted>
                    {item.invitedBy?.name || 'Uma pessoa'}{' '}
                    {item.kind === 'GROUP'
                      ? 'convidou você para um grupo'
                      : 'quer conversar com você'}
                    .
                  </Muted>
                </>
              )}
            </div>
          </Row>
          {folder === 'requests' && (
            <Buttons>
              <Action
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ path: `/${item.id}/respond`, body: { accept: true } })
                }
              >
                Aceitar
              </Action>
              <Action
                $secondary
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ path: `/${item.id}/respond`, body: { accept: false } })
                }
              >
                Recusar
              </Action>
            </Buttons>
          )}
        </ListItem>
      ))}
      {list.hasNextPage && (
        <Section>
          <Action
            $secondary
            disabled={list.isFetchingNextPage}
            onClick={() => {
              void list.fetchNextPage()
            }}
          >
            Carregar mais
          </Action>
        </Section>
      )}
    </>
  )
}
function BlockedPeople() {
  const list = useConversationBlocks()
  const action = useConversationAction()
  const items = list.data?.pages.flatMap((page) => page.items) || []
  return (
    <>
      <Section>
        <h2>Pessoas bloqueadas</h2>
        <Muted>Você pode permitir novas interações ao desbloquear uma pessoa.</Muted>
      </Section>
      {list.isError && (
        <Failure
          error={list.error}
          retry={() => {
            void list.refetch()
          }}
        />
      )}
      {action.isError && <Failure error={action.error} />}
      {list.isPending && <Section role="status">Carregando…</Section>}
      {list.isSuccess && !items.length && <Section>Nenhuma pessoa bloqueada.</Section>}
      {items.map((item) => (
        <ListItem key={item.blockedId}>
          <Row>
            <Portrait person={item.blocked} />
            <strong style={{ flex: 1 }}>{item.blocked.name}</strong>
            <Action
              $secondary
              disabled={action.isPending}
              onClick={() => {
                if (window.confirm(`Desbloquear ${item.blocked.name}?`))
                  action.mutate({ path: `/blocks/${item.blockedId}`, method: 'DELETE' })
              }}
            >
              Desbloquear
            </Action>
          </Row>
        </ListItem>
      ))}
      {list.hasNextPage && (
        <Section>
          <Action
            $secondary
            disabled={list.isFetchingNextPage}
            onClick={() => {
              void list.fetchNextPage()
            }}
          >
            Carregar mais
          </Action>
        </Section>
      )}
    </>
  )
}
function PersonPicker({
  selected,
  onChange,
  exclude = [],
}: {
  selected: ConversationPerson[]
  onChange: (people: ConversationPerson[]) => void
  exclude?: string[]
}) {
  const [search, setSearch] = useState('')
  const contacts = useConversationContacts(search)
  return (
    <div>
      <label htmlFor="conversation-person-search">Buscar pessoas</label>
      <Field
        id="conversation-person-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        maxLength={60}
        placeholder="Nome ou @usuário"
        autoComplete="off"
      />
      {selected.length > 0 && (
        <Buttons>
          {selected.map((person) => (
            <Action
              key={person.id}
              $secondary
              type="button"
              aria-label={`Remover ${person.name}`}
              onClick={() => onChange(selected.filter((p) => p.id !== person.id))}
            >
              {person.name} ×
            </Action>
          ))}
        </Buttons>
      )}
      {contacts.isFetching && <Muted role="status">Buscando…</Muted>}
      {contacts.isError && (
        <Failure
          error={contacts.error}
          retry={() => {
            void contacts.refetch()
          }}
        />
      )}
      {search.trim().length < 2 && <Muted>Digite pelo menos 2 caracteres.</Muted>}
      {contacts.data
        ?.filter((person) => !exclude.includes(person.id))
        .map((person) => (
          <ListItem key={person.id}>
            <Row>
              <Portrait person={person} />
              <div style={{ flex: 1 }}>
                <strong>{person.name}</strong>
                {person.username && <Muted>@{person.username}</Muted>}
              </div>
              <Action
                type="button"
                $secondary
                disabled={selected.some((p) => p.id === person.id) || selected.length >= 99}
                onClick={() => onChange([...selected, person])}
              >
                {selected.some((p) => p.id === person.id) ? 'Selecionado' : 'Selecionar'}
              </Action>
            </Row>
          </ListItem>
        ))}
      {contacts.isSuccess && !contacts.data.length && <Muted>Nenhuma pessoa encontrada.</Muted>}
    </div>
  )
}
function CreateConversation() {
  const [group, setGroup] = useState(false)
  const [title, setTitle] = useState('')
  const [people, setPeople] = useState<ConversationPerson[]>([])
  const submission = useRef<{ signature: string; id: string } | null>(null)
  const action = useCreateConversationGroup()
  const navigate = useNavigate()
  const actorId = useConversationScope().user!.id
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (action.isPending || !people.length || (group && !title.trim())) return
    const signature = JSON.stringify([title.trim(), people.map((p) => p.id).sort()])
    if (!submission.current || submission.current.signature !== signature)
      submission.current = { signature, id: crypto.randomUUID() }
    try {
      const result = group
        ? await action.create({
            clientRequestId: submission.current.id,
            title: title.trim(),
            memberIds: people.map((p) => p.id),
          })
        : await action.mutateAsync({ path: '/direct', body: { targetUserId: people[0].id } })
      if (currentConversationActorId() === actorId)
        navigate(`/conversas/${result.id}`, { replace: true })
    } catch {
      /* Mutation renders its error without clearing the draft or retry key. */
    }
  }
  return (
    <Section>
      <TabRow role="tablist" aria-label="Tipo de conversa">
        <button
          role="tab"
          aria-selected={!group}
          onClick={() => {
            setGroup(false)
            setPeople([])
            action.reset()
          }}
        >
          Uma pessoa
        </button>
        <button
          role="tab"
          aria-selected={group}
          onClick={() => {
            setGroup(true)
            setPeople([])
            action.reset()
          }}
        >
          Criar grupo
        </button>
      </TabRow>
      <form onSubmit={submit}>
        <fieldset disabled={action.isPending} style={{ border: 0, padding: '20px 0', minWidth: 0 }}>
          {group && (
            <>
              <label htmlFor="conversation-title">Nome do grupo</label>
              <Field
                id="conversation-title"
                value={title}
                maxLength={100}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Comunidade do Centro"
                required
              />
            </>
          )}
          <PersonPicker
            selected={people}
            onChange={(value) => setPeople(group ? value : value.slice(-1))}
          />
          <Muted>
            {group
              ? 'As pessoas recebem um convite e escolhem se querem participar.'
              : 'A pessoa receberá uma solicitação de conversa.'}
          </Muted>
          <Buttons>
            <Action
              type="submit"
              disabled={!people.length || (group && !title.trim()) || action.isPending}
            >
              {action.isPending ? 'Preparando…' : group ? 'Criar grupo' : 'Continuar'}
            </Action>
          </Buttons>
        </fieldset>
      </form>
      {action.isError && <Failure error={action.error} />}
    </Section>
  )
}
// Check the current identity after async mutations, never navigate into a prior user's result.
function currentConversationActorId() {
  const state = useAuthStore.getState()
  return state.activeContext ? undefined : state.user?.id
}

function ConversationDetail({ id }: { id: string }) {
  const capabilities = useConversationCapabilities()
  const showDetails = new URLSearchParams(useLocation().search).get('detalhes') === '1'
  const detail = useConversation(id)
  const action = useConversationAction()
  const navigate = useNavigate()
  const [inviting, setInviting] = useState(false)
  const [people, setPeople] = useState<ConversationPerson[]>([])
  const { user } = useConversationScope()
  if (detail.isPending) return <Section role="status">Carregando conversa…</Section>
  if (detail.isError)
    return (
      <Failure
        error={detail.error}
        retry={() => {
          void detail.refetch()
        }}
      />
    )
  const conversation = detail.data
  if (conversation.kind === 'DIRECT' && conversation.members.every(member => member.state === 'ACTIVE') && capabilities.data?.messagingEnabled && !showDetails) return <ChatPane key={`${user!.id}:${id}`} conversation={conversation} />
  const owner = conversation.myRole === 'OWNER'
  const admin = owner || conversation.myRole === 'ADMIN'
  const closed = !!conversation.archivedAt
  async function run(
    path: string,
    body?: unknown,
    method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
    leave = false,
  ) {
    try {
      await action.mutateAsync({ path, body, method })
      if (currentConversationActorId() !== user!.id) return
      if (leave) navigate('/conversas', { replace: true })
      setInviting(false)
      setPeople([])
    } catch {
      /* Keep context and show API authorization failures. */
    }
  }
  const other = conversation.members.find((member) => member.user.id !== user!.id)?.user
  return (
    <>
      <Section>
        <Row>
          <Portrait person={other} group={conversation.kind === 'GROUP'} />
          <div>
            <h2>{conversationTitle(conversation, user!.id)}</h2>
            <Muted>
              {closed
                ? 'Grupo encerrado'
                : conversation.kind === 'GROUP'
                  ? conversationMemberLabel(conversation.memberCount)
                  : 'Conversa pessoal'}
            </Muted>
          </div>
        </Row>
      </Section>
      <Notice>
        <ShieldCheck size={23} />
        <span>
          {closed
            ? 'Este grupo foi encerrado. Não é possível convidar ou alterar participantes.'
            : 'Você já pode organizar suas conversas e grupos. O envio de mensagens será liberado em breve.'}
        </span>
      </Notice>
      {action.isError && <Failure error={action.error} />}
      <Section>
        <h2>{conversation.kind === 'GROUP' ? 'Participantes' : 'Pessoas nesta conversa'}</h2>
        {conversation.members.map((member) => (
          <ListItem key={member.user.id}>
            <Row>
              <Portrait person={member.user} />
              <div style={{ flex: 1 }}>
                <strong>
                  {member.user.name}
                  {member.user.id === user!.id ? ' (você)' : ''}
                </strong>
                <Muted>
                  {member.state === 'INVITED'
                    ? 'Convite pendente'
                    : member.role === 'OWNER'
                      ? 'Responsável pelo grupo'
                      : member.role === 'ADMIN'
                        ? 'Administrador'
                        : 'Participante'}
                </Muted>
              </div>
            </Row>
            {!closed && conversation.kind === 'GROUP' && member.user.id !== user!.id && (
              <Buttons>
                {owner && member.state === 'ACTIVE' && (
                  <>
                    <Action
                      $secondary
                      disabled={action.isPending}
                      onClick={() => {
                        void run(
                          `/${id}/members/${member.user.id}/role`,
                          { role: member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN' },
                          'PATCH',
                        )
                      }}
                    >
                      {member.role === 'ADMIN' ? 'Retirar administração' : 'Tornar administrador'}
                    </Action>
                    <Action
                      $secondary
                      disabled={action.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Transferir a responsabilidade do grupo para ${member.user.name}?`,
                          )
                        )
                          void run(`/${id}/owner/${member.user.id}`)
                      }}
                    >
                      Transferir grupo
                    </Action>
                  </>
                )}
                {admin && member.role !== 'OWNER' && (owner || member.role !== 'ADMIN') && (
                  <Action
                    $secondary
                    disabled={action.isPending}
                    onClick={() => {
                      if (window.confirm(`Remover ${member.user.name} do grupo?`))
                        void run(`/${id}/members/${member.user.id}`, undefined, 'DELETE')
                    }}
                  >
                    Remover
                  </Action>
                )}
              </Buttons>
            )}
          </ListItem>
        ))}
      </Section>
      {!closed && (
        <Section>
          <Buttons>
            {conversation.kind === 'GROUP' && admin && (
              <Action $secondary onClick={() => setInviting(!inviting)}>
                Convidar pessoas
              </Action>
            )}
            {conversation.kind === 'GROUP' && !owner && (
              <Action
                $secondary
                disabled={action.isPending}
                onClick={() => {
                  if (window.confirm('Sair deste grupo?'))
                    void run(`/${id}/leave`, undefined, 'POST', true)
                }}
              >
                Sair do grupo
              </Action>
            )}
            {conversation.kind === 'GROUP' && owner && (
              <Action
                $secondary
                disabled={action.isPending}
                onClick={() => {
                  if (window.confirm('Encerrar este grupo? Esta ação não pode ser desfeita.'))
                    void run(`/${id}/archive`)
                }}
              >
                Encerrar grupo
              </Action>
            )}
            {conversation.kind === 'DIRECT' && other && (
              <Action
                $secondary
                disabled={action.isPending}
                onClick={() => {
                  if (window.confirm(`Bloquear novas interações com ${other.name}?`))
                    void run(`/blocks/${other.id}`, undefined, 'POST', true)
                }}
              >
                Bloquear pessoa
              </Action>
            )}
          </Buttons>
          {inviting && (
            <div style={{ marginTop: 24 }}>
              <PersonPicker
                selected={people}
                onChange={(value) => setPeople(value.slice(0, 20))}
                exclude={conversation.members.map((m) => m.user.id)}
              />
              <Buttons>
                <Action
                  disabled={!people.length || action.isPending}
                  onClick={() => {
                    void run(`/${id}/invitations`, { memberIds: people.map((p) => p.id) })
                  }}
                >
                  Enviar convites
                </Action>
              </Buttons>
            </div>
          )}
        </Section>
      )}
    </>
  )
}
