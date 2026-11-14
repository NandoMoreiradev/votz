import { LegalDocument } from '../components/legal/LegalDocument'
import { politicaDeCookies } from '../legal/politica-de-cookies'

export function Cookies() {
  return <LegalDocument doc={politicaDeCookies} />
}
