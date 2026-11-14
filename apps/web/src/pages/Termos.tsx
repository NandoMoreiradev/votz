import { LegalDocument } from '../components/legal/LegalDocument'
import { termosDeUso } from '../legal/termos-de-uso'

export function Termos() {
  return <LegalDocument doc={termosDeUso} />
}
