import { Fragment, type ReactNode } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { Navbar } from '../layout/Navbar'
import { Footer } from '../layout/Footer'
import { LEGAL_ENTITY, type LegalBlock, type LegalDoc } from '../../legal/types'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.main`
  max-width: 820px;
  margin: 0 auto;
  padding: ${({ theme }) => `${theme.spacing[10]} ${theme.spacing[4]} ${theme.spacing[16]}`};
`

const Card = styled.article`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[8]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[6]};

  @media (max-width: 640px) {
    padding: ${({ theme }) => theme.spacing[5]};
  }
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
  line-height: 1.15;
`

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[2]};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};

  span {
    background: ${({ theme }) => theme.colors.neutral};
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: ${({ theme }) => theme.radii.sm};
    padding: ${({ theme }) => `${theme.spacing[1]} ${theme.spacing[2]}`};
  }
`

const Summary = styled.section`
  background: ${({ theme }) => theme.colors.neutral};
  border-left: 4px solid ${({ theme }) => theme.colors.action};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[5]};

  h2 {
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: ${({ theme }) => theme.fontSizes.lg};
    color: ${({ theme }) => theme.colors.primary};
    margin-bottom: ${({ theme }) => theme.spacing[3]};
  }

  ul {
    margin: 0;
    padding-left: ${({ theme }) => theme.spacing[5]};
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing[2]};
  }

  li {
    font-size: ${({ theme }) => theme.fontSizes.md};
    line-height: 1.55;
    color: ${({ theme }) => theme.colors.text};
  }
`

const Toc = styled.nav`
  h2 {
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: ${({ theme }) => theme.fontSizes.md};
    color: ${({ theme }) => theme.colors.primary};
    margin-bottom: ${({ theme }) => theme.spacing[2]};
  }

  ol {
    margin: 0;
    padding-left: ${({ theme }) => theme.spacing[5]};
    columns: 2;
    column-gap: ${({ theme }) => theme.spacing[8]};
    font-size: ${({ theme }) => theme.fontSizes.sm};
    line-height: 1.8;

    @media (max-width: 640px) {
      columns: 1;
    }
  }

  a {
    color: ${({ theme }) => theme.colors.primary};
    text-decoration: underline;
  }
`

const SectionWrap = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[3]};
  scroll-margin-top: 88px;

  h2 {
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: ${({ theme }) => theme.fontSizes.xl};
    font-weight: ${({ theme }) => theme.fontWeights.bold};
    color: ${({ theme }) => theme.colors.primary};
    padding-top: ${({ theme }) => theme.spacing[4]};
    border-top: 1px solid ${({ theme }) => theme.colors.border};
  }

  p,
  li {
    font-size: ${({ theme }) => theme.fontSizes.md};
    line-height: 1.65;
    color: ${({ theme }) => theme.colors.text};
  }

  ul,
  ol {
    margin: 0;
    padding-left: ${({ theme }) => theme.spacing[6]};
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing[2]};
  }

  a {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    text-decoration: underline;
  }
`

const Note = styled.p`
  background: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[4]};
`

const TableWrap = styled.div`
  overflow-x: auto;

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: ${({ theme }) => theme.fontSizes.sm};
  }

  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: ${({ theme }) => `${theme.spacing[2]} ${theme.spacing[3]}`};
    border: 1px solid ${({ theme }) => theme.colors.border};
    line-height: 1.5;
  }

  th {
    background: ${({ theme }) => theme.colors.neutral};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    color: ${({ theme }) => theme.colors.primary};
  }
`

const ControllerInfo = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  padding-top: ${({ theme }) => theme.spacing[4]};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

// ── Inline: **negrito** e [texto](destino) ──────────────────────────────────

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.875em' }}>{part.slice(1, -1)}</code>
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (link) {
      const [, label, href] = link
      if (href.startsWith('/')) return <Link key={i} to={href}>{label}</Link>
      return <a key={i} href={href} rel="noopener noreferrer">{label}</a>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

function renderBlock(block: LegalBlock, key: number) {
  if ('p' in block) return <p key={key}>{renderInline(block.p)}</p>
  if ('note' in block) return <Note key={key}>{renderInline(block.note)}</Note>
  if ('ul' in block) {
    return <ul key={key}>{block.ul.map((li, i) => <li key={i}>{renderInline(li)}</li>)}</ul>
  }
  if ('ol' in block) {
    return <ol key={key}>{block.ol.map((li, i) => <li key={i}>{renderInline(li)}</li>)}</ol>
  }
  return (
    <TableWrap key={key}>
      <table>
        <thead>
          <tr>{block.table.head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, r) => (
            <tr key={r}>{row.map((cell, c) => <td key={c}>{renderInline(cell)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <Page>
      <Navbar />
      <Content>
        <Card>
          <Title>{doc.title}</Title>
          <Meta>
            <span>Versão {doc.version}</span>
            <span>Atualizado em {doc.updatedLabel}</span>
          </Meta>

          <Summary aria-labelledby="resumo-simples">
            <h2 id="resumo-simples">{doc.summaryTitle ?? 'Resumo em linguagem simples'}</h2>
            <ul>
              {doc.summary.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
            </ul>
          </Summary>

          <Toc aria-label="Índice">
            <h2>Neste documento</h2>
            <ol>
              {doc.sections.map((s) => (
                <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>
              ))}
            </ol>
          </Toc>

          {doc.sections.map((s, i) => (
            <SectionWrap key={s.id} id={s.id}>
              <h2>{i + 1}. {s.title}</h2>
              {s.blocks.map(renderBlock)}
            </SectionWrap>
          ))}

          <ControllerInfo>
            {LEGAL_ENTITY.name} · CNPJ {LEGAL_ENTITY.cnpj} · Contato:{' '}
            <a href={`mailto:${LEGAL_ENTITY.email}`}>{LEGAL_ENTITY.email}</a> · Foro: {LEGAL_ENTITY.foro}
          </ControllerInfo>
        </Card>
      </Content>
      <Footer />
    </Page>
  )
}
