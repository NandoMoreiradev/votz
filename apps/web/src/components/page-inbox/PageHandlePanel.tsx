import { useEffect, useState, type FormEvent } from 'react'
import styled from 'styled-components'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import type { OrgType } from '../../hooks/useOrgMemberships'
import { pageErrorMessage, useSetPageHandle } from '../../hooks/usePageInbox'
import { Callout, DarkButton, Panel, PanelBody, PanelHead } from '../studio/studio-ui'

const InputRow = styled.form`
  display: flex;
  gap: 8px;
  align-items: center;
`

const HandleField = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;

  span {
    position: absolute;
    left: 11px;
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.muted};
    pointer-events: none;
  }

  input {
    width: 100%;
    height: 36px;
    padding: 0 10px 0 26px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: ${({ theme }) => theme.radii.md};
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.text};
    background: ${({ theme }) => theme.colors.white};
    box-sizing: border-box;
  }

  input:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary}1A;
  }
`

const Hint = styled.p`
  margin: 10px 0 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.muted};
`

/** Define o @nome da página. Único em todo o Votz, como no Instagram. */
export function PageHandlePanel({
  orgType,
  orgId,
  current,
}: {
  orgType: OrgType
  orgId: string
  current: string | null | undefined
}) {
  const [value, setValue] = useState(current ?? '')
  const save = useSetPageHandle(orgType, orgId)

  useEffect(() => {
    if (current !== undefined) setValue(current ?? '')
  }, [current])

  const clean = value.trim().replace(/^@+/, '').toLowerCase()
  const valid = /^[a-z0-9_]{3,30}$/.test(clean)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (valid && clean !== (current ?? '')) save.mutate(clean)
  }

  return (
    <Panel>
      <PanelHead
        title="Nome de usuário"
        hint="Endereço único da sua página no Votz."
      />
      <PanelBody>
        <InputRow onSubmit={submit}>
          <HandleField>
            <span aria-hidden="true">@</span>
            <input
              id="page-handle"
              aria-label="Nome de usuário da página"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sua_pagina"
              maxLength={31}
              autoComplete="off"
            />
          </HandleField>
          <DarkButton
            type="submit"
            disabled={!valid || clean === (current ?? '') || save.isPending}
          >
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </DarkButton>
        </InputRow>
        <Hint>
          De 3 a 30 letras minúsculas, números ou <code>_</code>. Nenhuma outra pessoa ou página pode usar o mesmo nome.
        </Hint>
        {save.isError && (
          <div style={{ marginTop: 10 }}>
            <Callout tone="action" icon={WarningCircle} role="alert">
              {pageErrorMessage(save.error)}
            </Callout>
          </div>
        )}
        {save.isSuccess && (
          <div style={{ marginTop: 10 }}>
            <Callout tone="positive" icon={CheckCircle} role="status">
              Nome de usuário salvo.
            </Callout>
          </div>
        )}
      </PanelBody>
    </Panel>
  )
}
