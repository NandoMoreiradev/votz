import { PRIVACY_VERSION } from '@votz/shared-types'
import { LegalPlaceholderPage } from '../components/legal/LegalPlaceholderPage'

export function Cookies() {
  return <LegalPlaceholderPage title="Política de Cookies" version={PRIVACY_VERSION} />
}
