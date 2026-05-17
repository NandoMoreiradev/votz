import { useState } from 'react'

export interface CnpjData {
  cnpj: string
  razao_social: string
  nome_fantasia: string
  natureza_juridica: string
  porte: string
  situacao_cadastral: string
  descricao_situacao_cadastral: string
  municipio: string
  uf: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cep: string
  email: string
  telefone: string
  atividade_principal: Array<{ code: string; text: string }>
}

export function useCnpj() {
  const [data, setData]       = useState<CnpjData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function lookup(rawCnpj: string) {
    const cnpj = rawCnpj.replace(/\D/g, '')
    if (cnpj.length !== 14) {
      setError('CNPJ deve ter 14 dígitos')
      return
    }

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
      if (!res.ok) {
        setError(res.status === 404 ? 'CNPJ não encontrado na Receita Federal' : 'Erro ao consultar CNPJ')
        return
      }
      const json = await res.json() as CnpjData
      if (json.descricao_situacao_cadastral !== 'ATIVA') {
        setError(`CNPJ com situação: ${json.descricao_situacao_cadastral}`)
        return
      }
      setData(json)
    } catch {
      setError('Falha na consulta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  function clear() {
    setData(null)
    setError(null)
  }

  return { data, loading, error, lookup, clear }
}
