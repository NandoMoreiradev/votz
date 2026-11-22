import type { Icon } from '@phosphor-icons/react'
import {
  ArrowsLeftRight,
  Bank,
  ChartBar,
  ChatCircle,
  Clock,
  CreditCard,
  FileText,
  Gavel,
  Lightning,
  EnvelopeSimple,
  Megaphone,
  Microphone,
  Plugs,
  PencilSimple,
  Receipt,
  Scroll,
  SquaresFour,
  Target,
  UsersThree,
  Storefront,
  Tray,
  UserCircle,
} from '@phosphor-icons/react'
import type { OrgContextType } from '@votz/shared-types'

export interface StudioNavItem {
  to: string
  label: string
  hint?: string
  icon: Icon
  /** Só marca o item ativo quando o endereço é exatamente este. */
  end?: boolean
}

export interface StudioNavGroup {
  title: string
  items: StudioNavItem[]
}

/** Nome do tipo de perfil, em português simples. */
export const ORG_TYPE_LABEL: Record<OrgContextType, string> = {
  POLITICIAN: 'Político',
  ENTITY: 'Entidade pública',
  COMPANY: 'Empresa',
}

export const ORG_TYPE_ICON: Record<OrgContextType, Icon> = {
  POLITICIAN: Bank,
  ENTITY: Gavel,
  COMPANY: Storefront,
}

/** Página pública do perfil. */
export function publicProfilePath(type: OrgContextType, id: string): string {
  return type === 'POLITICIAN' ? `/politico/${id}` : type === 'ENTITY' ? `/entidade/${id}` : `/empresa/${id}`
}

/** Menu lateral do Estúdio, de acordo com o tipo de perfil. */
export function studioNav(type: OrgContextType, id: string): StudioNavGroup[] {
  const overview: StudioNavItem = { to: '/estudio', label: 'Visão geral', icon: SquaresFour, end: true }
  const publicPage: StudioNavItem = { to: publicProfilePath(type, id), label: 'Página pública', hint: 'Como os cidadãos veem você', icon: UserCircle, end: true }
  const messages: StudioNavItem = { to: '/conversas', label: 'Mensagens', icon: ChatCircle }
  const team: StudioNavItem = { to: '/estudio/equipe', label: 'Equipe e acesso', hint: 'Quem pode agir pela página', icon: UsersThree }
  const editProfile: StudioNavItem = { to: `/${type === 'POLITICIAN' ? 'politico' : 'entidade'}/${id}/editar`, label: 'Editar perfil', hint: 'Foto, dados e contatos', icon: PencilSimple }
  const plans: StudioNavItem = { to: '/estudio/planos', label: 'Planos e assinatura', icon: CreditCard }

  if (type === 'POLITICIAN') {
    return [
      { title: '', items: [overview, publicPage, editProfile, team] },
      {
        title: 'Mandato',
        items: [
          { to: '/mandato', label: 'Caixa do mandato', hint: 'Relatos do seu território', icon: Tray, end: true },
          { to: '/mandato/alertas', label: 'Alertas', icon: Lightning },
          { to: '/mandato/modelos', label: 'Modelos de resposta', icon: FileText },
          { to: '/mandato/prestacao', label: 'Prestação de contas', icon: Scroll },
          { to: '/mandato/cartoes', label: 'Cartões para redes', icon: ArrowsLeftRight },
          { to: '/mandato/webhooks', label: 'Webhooks', icon: Plugs },
          { to: '/mandato/resumo', label: 'Resumo semanal', icon: EnvelopeSimple },
        ],
      },
      {
        title: 'Conteúdo',
        items: [
          { to: '/estudio/propostas', label: 'Propostas', icon: Scroll },
          { to: '/estudio/debates', label: 'Debates', icon: Microphone },
        ],
      },
      {
        title: 'Dados e conta',
        items: [{ to: '/painel-dados', label: 'Painel de dados', icon: ChartBar }, messages, plans],
      },
    ]
  }

  if (type === 'ENTITY') {
    return [
      { title: '', items: [overview, publicPage, editProfile, team] },
      {
        title: 'Atendimento',
        items: [
          { to: '/entidade/prazos', label: 'Prazos e fila', hint: 'O que está para vencer', icon: Clock },
          messages,
        ],
      },
      { title: 'Conteúdo', items: [{ to: '/estudio/debates', label: 'Debates', icon: Microphone }] },
      { title: 'Dados e conta', items: [{ to: '/painel-dados', label: 'Painel de dados', icon: ChartBar }, plans] },
    ]
  }

  return [
    { title: '', items: [overview, publicPage, team] },
    { title: 'Atendimento', items: [messages] },
    {
      title: 'Anúncios',
      items: [
        { to: '/estudio/anuncios', label: 'Campanhas', hint: 'Contas, campanhas e saldo', icon: Megaphone, end: true },
        { to: '/estudio/anuncios/nova', label: 'Criar campanha', icon: PencilSimple },
        { to: '/estudio/anuncios/faturamento', label: 'Faturamento', hint: 'Saldo, recarga e extrato', icon: Receipt },
        { to: '/estudio/anuncios/relatorio', label: 'Relatório', hint: 'Exibições, cliques e gasto', icon: ChartBar },
        { to: '/estudio/anuncios/conversoes', label: 'Conversões', hint: 'Compras e contatos vindos dos anúncios', icon: Target },
      ],
    },
    { title: 'Conta', items: [plans] },
  ]
}

/** Atalhos grandes da Visão geral (os mais usados de cada tipo). */
export function studioShortcuts(type: OrgContextType, id: string): StudioNavItem[] {
  const groups = studioNav(type, id)
  const wanted: Record<OrgContextType, string[]> = {
    POLITICIAN: ['/mandato', '/proposta/nova', '/painel-dados', '/conversas'],
    ENTITY: ['/entidade/prazos', '/painel-dados', '/conversas', '/estudio/debates'],
    COMPANY: [publicProfilePath('COMPANY', id), '/conversas', '/estudio/planos'],
  }
  const newProposal: StudioNavItem = { to: '/proposta/nova', label: 'Nova proposta', hint: 'Publique uma ideia para o seu mandato', icon: PencilSimple }
  const all = [...groups.flatMap((g) => g.items), newProposal]
  return wanted[type]
    .map((to) => all.find((i) => i.to === to))
    .filter((i): i is StudioNavItem => !!i)
}
