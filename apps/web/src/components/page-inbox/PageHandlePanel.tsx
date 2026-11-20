import { useState, type FormEvent } from 'react'
import styled from 'styled-components'
import type { OrgType } from '../../hooks/useOrgMemberships'
import { pageErrorMessage, useSetPageHandle } from '../../hooks/usePageInbox'
import { ErrorLine, SendButton } from './PageInboxUi'

const Panel = styled.form`
  margin-top: 24px;
  padding: 20px 24px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
`
const Label = styled.label`
  display: block;
  margin-bottom: 8px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`
const Line = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`
const Input = styled.input`
  flex: 1;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.mono};
`
const Hint = styled.p`
  margin: 8px 0 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

/** Define o @nome da página. Único em todo o Votz, como no Instagram. */
export function PageHandlePanel({ orgType, orgId, current }: { orgType: OrgType; orgId: string; current: string | null | undefined }) {
  const [value, setValue] = useState(current ?? '')
  const save = useSetPageHandle(orgType, orgId)
  const clean = value.trim().replace(/^@+/, '').toLowerCase()
  const valid = /^[a-z0-9_]{3,30}$/.test(clean)
  function submit(e: FormEvent) {
    e.preventDefault()
    if (valid && clean !== (current ?? '')) save.mutate(clean)
  }
  return (
    <Panel onSubmit={submit}>
      <Label htmlFor="page-handle">Nome de usuário da página</Label>
      <Line>
        <span aria-hidden="true">@</span>
        <Input id="page-handle" value={value} onChange={(e) => setValue(e.target.value)} maxLength={31} autoComplete="off" />
        <SendButton type="submit" disabled={!valid || clean === (current ?? '') || save.isPending}>
          Salvar
        </SendButton>
      </Line>
      <Hint>De 3 a 30 letras minúsculas, números ou _. Nenhuma outra pessoa ou página pode ter o mesmo nome.</Hint>
      {save.isError && <ErrorLine role="alert">{pageErrorMessage(save.error)}</ErrorLine>}
      {save.isSuccess && <Hint role="status">Nome salvo.</Hint>}
    </Panel>
  )
}
