import { TERMS_VERSION } from '@votz/shared-types'
import { LegalPlaceholderPage } from '../components/legal/LegalPlaceholderPage'

export function Termos() {
  return <LegalPlaceholderPage title="Termos de Uso" version={TERMS_VERSION} />
}
