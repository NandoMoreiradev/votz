import styled from 'styled-components'
import type { AdvocacyAuthor } from '../../types/api'

// ── SVG Icons ─────────────────────────────────────────────────────────────────

export function ShieldCheckIcon({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

function BuildingIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
      <path d="M6 13h2M6 17h2M13 13h2M13 17h2" />
    </svg>
  )
}

function PersonIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" />
    </svg>
  )
}

// ── Actor avatar ──────────────────────────────────────────────────────────────

const AvatarImg = styled.img<{ $size: number }>`
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid rgba(30, 64, 175, 0.18);
  flex-shrink: 0;
  display: block;
`

const AvatarFallback = styled.div<{ $size: number }>`
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 50%;
  border: 1.5px solid rgba(30, 64, 175, 0.25);
  background: rgba(30, 64, 175, 0.07);
  color: #1E40AF;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`

function ActorAvatar({
  author,
  isEntity,
  size,
}: {
  author: AdvocacyAuthor | null
  isEntity: boolean
  size: number
}) {
  const src = author?.avatarUrl ?? null

  if (src) {
    return <AvatarImg src={src} $size={size} alt={author?.name ?? ''} />
  }

  return (
    <AvatarFallback $size={size}>
      {isEntity
        ? <BuildingIcon size={Math.round(size * 0.52)} />
        : <PersonIcon size={Math.round(size * 0.52)} />
      }
    </AvatarFallback>
  )
}

// ── Banner layout ─────────────────────────────────────────────────────────────

const Wrap = styled.div<{ $compact: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $compact }) => ($compact ? '6px' : '10px')};
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ $compact }) => ($compact ? '8px 12px' : '12px 16px')};
`

const AdvocateRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const BannerText = styled.p<{ $compact: boolean }>`
  font-size: ${({ $compact }) => ($compact ? '0.8125rem' : '0.875rem')};
  color: #1E40AF;
  line-height: 1.5;
  margin: 0;
  b { font-weight: 600; }
`

const MultiHeader = styled.p`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #1E40AF;
  margin: 0 0 6px;
  display: flex;
  align-items: center;
  gap: 6px;
`

const MultiList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

// ── Public component ──────────────────────────────────────────────────────────

export interface AdvocateEntry {
  author: AdvocacyAuthor | null
  isEntity: boolean
}

interface AdvocacyBannerProps {
  /** Modo múltiplo (página de detalhe) */
  advocates?: AdvocateEntry[]
  /** Modo legado single (feed cards) */
  author?: AdvocacyAuthor | null
  recipientType?: string | null
  compact?: boolean
}

export function AdvocacyBanner({ advocates, author, recipientType, compact = false }: AdvocacyBannerProps) {
  const size = compact ? 30 : 40

  // Modo múltiplo
  if (advocates && advocates.length > 0) {
    if (advocates.length === 1) {
      const { author: a, isEntity } = advocates[0]
      const displayName = a?.name ?? (isEntity ? 'Entidade' : 'Político')
      return (
        <Wrap $compact={compact}>
          <AdvocateRow>
            <ActorAvatar author={a} isEntity={isEntity} size={size} />
            <BannerText $compact={compact}>
              <b>{displayName}</b>{' '}
              {compact
                ? 'avocou este relato'
                : 'avocou este relato e assumiu o compromisso de acompanhá-lo.'}
            </BannerText>
          </AdvocateRow>
        </Wrap>
      )
    }

    return (
      <Wrap $compact={compact}>
        <MultiHeader>
          <ShieldCheckIcon size={14} />
          {advocates.length} atores avocaram este relato
        </MultiHeader>
        <MultiList>
          {advocates.map((adv, i) => {
            const displayName = adv.author?.name ?? (adv.isEntity ? 'Entidade' : 'Político')
            return (
              <AdvocateRow key={i}>
                <ActorAvatar author={adv.author} isEntity={adv.isEntity} size={size} />
                <BannerText $compact={compact}>
                  <b>{displayName}</b>
                </BannerText>
              </AdvocateRow>
            )
          })}
        </MultiList>
      </Wrap>
    )
  }

  // Modo legado (single author)
  const isEntity = recipientType === 'ENTITY'
  const displayName = author?.name ?? (isEntity ? 'Entidade' : 'Político')

  return (
    <Wrap $compact={compact}>
      <AdvocateRow>
        <ActorAvatar author={author ?? null} isEntity={isEntity} size={size} />
        <BannerText $compact={compact}>
          <b>{displayName}</b>{' '}
          {compact
            ? 'avocou este relato'
            : 'avocou este relato e assumiu o compromisso de acompanhá-lo.'}
        </BannerText>
      </AdvocateRow>
    </Wrap>
  )
}
