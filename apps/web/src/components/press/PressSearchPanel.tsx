import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { CATEGORY_LABELS, PRESS_SEARCH_LIMITS as L, getCategoryLabel, type PressPlanInfo } from '@votz/shared-types'
import { Button } from '../ui/Button'
import { StateSelect } from '../ui/LocationSelect'
import { apiErrorMessage } from '../../hooks/usePressCredential'
import { usePressSearch } from '../../hooks/usePressAi'

const Box = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 24px;
  margin-bottom: 24px;
  @media (max-width: 640px) { padding: 16px; }
`
const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.primary};
  margin: 0 0 6px;
`
const Text = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
  margin: 0 0 14px;
  max-width: 680px;
`
const Row = styled.form`display: flex; gap: 10px; flex-wrap: wrap; align-items: stretch;`
const controlCss = `
  font: inherit; font-size: 0.875rem;
  padding: 10px 12px; border-radius: 8px; border: 1px solid #E5E5E5; background: #fff;
  &:focus { outline: 2px solid #1A1A2E; outline-offset: 0; }
`
const Input = styled.input`${controlCss} flex: 1 1 280px; min-width: 0;`
const Select = styled.select`${controlCss}`
const StateField = styled(StateSelect)`${controlCss}`
const Msg = styled.p<{ $error?: boolean }>`
  margin: 12px 0 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $error }) => ($error ? theme.colors.action : theme.colors.muted)};
`
const Result = styled(Link)`
  display: block; text-decoration: none; color: inherit;
  padding: 14px 0; border-top: 1px solid ${({ theme }) => theme.colors.border};
  &:hover strong { text-decoration: underline; }
`
const ResultTitle = styled.strong`font-size: ${({ theme }) => theme.fontSizes.md}; color: ${({ theme }) => theme.colors.text};`
const Excerpt = styled.div`font-size: ${({ theme }) => theme.fontSizes.sm}; color: ${({ theme }) => theme.colors.muted}; margin-top: 4px; line-height: 1.5;`
const Meta = styled.div`
  display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px;
  font-family: ${({ theme }) => theme.fonts.mono}; font-size: ${({ theme }) => theme.fontSizes.xs}; color: ${({ theme }) => theme.colors.muted};
`
const Match = styled.span<{ $score: number }>`
  padding: 2px 8px; border-radius: ${({ theme }) => theme.radii.full}; color: #fff; font-weight: ${({ theme }) => theme.fontWeights.bold};
  background: ${({ theme, $score }) => ($score >= 78 ? theme.colors.positive : theme.colors.primary)};
`

export function PressSearchPanel({ info }: { info: PressPlanInfo }) {
  const search = usePressSearch()
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [category, setCategory] = useState('')
  const data = search.data

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (q.trim().length >= L.QUERY_MIN) search.mutate({ q: q.trim(), state: state || undefined, category: category || undefined })
  }

  return (
    <Box>
      <Title>Busca por significado</Title>
      <Text>
        Escreva o assunto com as suas palavras, por exemplo "falta de remédio no posto" ou "esgoto na rua". A busca acha
        relatos que falam do mesmo assunto, mesmo sem repetir as palavras. Mostra até {info.limits.searchResults} relatos
        públicos dos últimos {info.limits.exportMaxDays} dias; relatos anônimos ficam de fora.
      </Text>
      <Row onSubmit={submit}>
        <Input
          value={q} onChange={(e) => setQ(e.target.value)} maxLength={L.QUERY_MAX} minLength={L.QUERY_MIN}
          placeholder="O que você quer encontrar?" aria-label="O que você quer encontrar"
        />
        <StateField value={state} onChange={setState} placeholder="Todos os estados" aria-label="Estado" />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Tema">
          <option value="">Todos os temas</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Button type="submit" variant="action" disabled={search.isPending || q.trim().length < L.QUERY_MIN}>
          {search.isPending ? 'Buscando…' : 'Buscar'}
        </Button>
      </Row>

      {search.isError && <Msg $error>{apiErrorMessage(search.error, 'Não foi possível buscar agora. Tente de novo.')}</Msg>}

      {data && data.total === 0 && (
        <Msg>Nenhum relato parecido com "{data.query}". Tente outras palavras ou tire os filtros.</Msg>
      )}
      {data?.results.map((r) => (
        <Result key={r.id} to={`/relatos/${r.id}`}>
          <ResultTitle>{r.title}</ResultTitle>
          <Excerpt>{r.excerpt}</Excerpt>
          <Meta>
            <Match $score={r.score} title="O quanto o relato fala do assunto buscado">{r.score}% parecido</Match>
            <span>{getCategoryLabel(r.category)}</span>
            {r.city && <span>{r.city}{r.state ? `/${r.state}` : ''}</span>}
            <span>pressão {Math.round(r.pressureScore)}</span>
            <span>{new Date(r.createdAt).toLocaleDateString('pt-BR')}</span>
            {r.pressContactOk && <span title="O autor aceita pedido de contato da imprensa. O botão fica na página do relato.">✓ aceita falar com a imprensa</span>}
          </Meta>
        </Result>
      ))}
      {data && data.indexing.missing > 0 && (
        <Msg>
          Atenção: {data.indexing.missing.toLocaleString('pt-BR')} relato(s) público(s) ainda não entraram na busca (são
          adicionados aos poucos). Se faltar alguma coisa, tente de novo mais tarde.
        </Msg>
      )}
    </Box>
  )
}
