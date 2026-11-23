import * as fs from 'fs'
import * as path from 'path'

/**
 * Trava contra um erro que só o banco real mostrava: a tabela `reports` guarda `"createdAt"` e `"pressureScore"`
 * (o Prisma não renomeia esses dois campos), mas o SQL cru foi escrito com `created_at` e `pressure_score`.
 * O erro ficava escondido porque a busca por similaridade ignora falha em silêncio.
 */
describe('SQL cru sobre a tabela reports', () => {
  const root = path.resolve(__dirname, '../../../..')
  const schema = fs.readFileSync(path.join(root, 'packages/database/prisma/schema.prisma'), 'utf8')
  const reportModel = schema.slice(schema.indexOf('model Report {'), schema.indexOf('@@map("reports")'))

  it('createdAt e pressureScore do Report não têm @map (a coluna é camelCase)', () => {
    expect(reportModel).toMatch(/\n\s+createdAt\s+DateTime\s+@default\(now\(\)\)\s*\n/)
    expect(reportModel).toMatch(/\n\s+pressureScore\s+Float\s+@default\(0\)\s*\n/)
  })

  it('colunas com @map (city_key, first_response_at) continuam em snake_case', () => {
    expect(reportModel).toMatch(/cityKey\s+String\?\s+@map\("city_key"\)/)
  })

  it.each([
    'src/imprensa/press-search.repository.ts',
    'src/reports/reports.repository.ts',
  ])('%s não usa os nomes errados created_at / pressure_score', (file) => {
    const source = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8')
    expect(source).not.toMatch(/\bcreated_at\b/)
    expect(source).not.toMatch(/\bpressure_score\b/)
  })
})
