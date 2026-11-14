import { LegalDocument } from '../components/legal/LegalDocument'
import { diretrizesDaComunidade } from '../legal/diretrizes-da-comunidade'

export function Diretrizes() {
  return <LegalDocument doc={diretrizesDaComunidade} />
}
