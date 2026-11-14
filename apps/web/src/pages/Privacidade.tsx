import { PRIVACY_VERSION } from '@votz/shared-types'
import { LegalPlaceholderPage } from '../components/legal/LegalPlaceholderPage'

export function Privacidade() {
  return <LegalPlaceholderPage title="Política de Privacidade" version={PRIVACY_VERSION} />
}
