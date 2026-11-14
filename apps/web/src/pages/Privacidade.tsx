import { LegalDocument } from '../components/legal/LegalDocument'
import { politicaDePrivacidade } from '../legal/politica-de-privacidade'

export function Privacidade() {
  return <LegalDocument doc={politicaDePrivacidade} />
}
