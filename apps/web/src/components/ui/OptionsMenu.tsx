import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import styled from 'styled-components'
import { DotsThree } from '@phosphor-icons/react'

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  danger?: boolean
  /** Devolva um texto curto para avisar o resultado (ex.: "Link copiado"). O menu fecha logo depois. */
  onSelect: () => void | string
}

const Wrap = styled.div`
  position: relative;
  flex-shrink: 0;
  margin-left: auto;
`
const Trigger = styled.button`
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  &:hover,
  &[aria-expanded='true'] {
    background: ${({ theme }) => theme.colors.neutral};
    color: ${({ theme }) => theme.colors.text};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.action};
    outline-offset: 2px;
  }
`
const Menu = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 60;
  min-width: 220px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadows.md};
`
const Item = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.text)};
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  svg { flex-shrink: 0; }
  /* Cartões podem ter regras de "span" (cor apagada); o texto do menu mantém a cor do item. */
  span { color: inherit; }
  &:hover,
  &:focus-visible {
    outline: none;
    background: ${({ theme }) => theme.colors.neutral};
  }
`

/** Menu de três pontinhos (⋯), no estilo dos aplicativos de rede social. */
export function OptionsMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function close(restoreFocus = false) {
    setOpen(false)
    setNotice(null)
    if (restoreFocus) triggerRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close(true)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const nodes = Array.from(wrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const at = nodes.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'ArrowDown' ? (at + 1) % nodes.length : (at - 1 + nodes.length) % nodes.length
    nodes[next]?.focus()
  }

  function select(item: MenuItem) {
    const result = item.onSelect()
    if (typeof result === 'string') {
      setNotice({ key: item.key, text: result })
      window.setTimeout(() => close(), 900)
    } else {
      close()
    }
  }

  if (items.length === 0) return null

  return (
    <Wrap ref={wrapRef} onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <DotsThree size={22} weight="bold" aria-hidden="true" />
      </Trigger>
      {open && (
        <Menu role="menu" aria-label={label}>
          {items.map((item) => (
            <Item key={item.key} type="button" role="menuitem" $danger={item.danger} onClick={() => select(item)}>
              {item.icon}
              <span aria-live="polite">{notice?.key === item.key ? notice.text : item.label}</span>
            </Item>
          ))}
        </Menu>
      )}
    </Wrap>
  )
}

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(13, 13, 13, 0.55);
`
const Dialog = styled.div`
  width: 100%;
  max-width: 400px;
  padding: 20px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.white};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  h2 {
    margin: 0 0 8px;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: 18px;
  }
  p {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.5;
    color: ${({ theme }) => theme.colors.muted};
  }
`
const Buttons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`
const DialogBtn = styled.button<{ $danger?: boolean }>`
  min-height: 40px;
  padding: 0 18px;
  border-radius: 9999px;
  border: 1px solid ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.border)};
  background: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.white)};
  color: ${({ $danger, theme }) => ($danger ? theme.colors.white : theme.colors.text)};
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: default; }
`

/** Pergunta antes de uma ação que não dá para desfazer. */
export function ConfirmDialog({ title, text, confirmLabel, onConfirm, onCancel }: {
  title: string
  text: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <Backdrop onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }} onClick={(event) => event.stopPropagation()}>
      <Dialog role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <p>{text}</p>
        <Buttons>
          <DialogBtn type="button" onClick={onCancel}>Cancelar</DialogBtn>
          <DialogBtn type="button" $danger autoFocus onClick={onConfirm}>{confirmLabel}</DialogBtn>
        </Buttons>
      </Dialog>
    </Backdrop>
  )
}

/** Copia o endereço para a área de transferência e devolve o aviso para o menu. */
export function copyLink(path: string): string {
  const url = `${window.location.origin}${path}`
  void navigator.clipboard?.writeText(url).catch(() => {})
  return 'Link copiado'
}
