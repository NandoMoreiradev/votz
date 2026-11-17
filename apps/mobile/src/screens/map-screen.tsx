import { TurboModuleRegistry, View } from 'react-native'
import { Screen, Toolbar } from '../components/screen'
import { State } from '../components/ui'
import type { ComponentType } from 'react'

// Old development clients can still open the other tabs while the new native
// build is being installed. Do not evaluate MapLibre's enforcing imports there.
const NativeMap = TurboModuleRegistry.get('MLRNNetworkModule')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Delay enforcing native imports until the rebuilt client is installed.
  ? (require('../components/native-report-map') as { default: ComponentType }).default
  : null

export default function MapScreen() {
  return <Screen tabs><Toolbar title="Mapa de relatos" />
    {NativeMap ? <NativeMap /> : <View style={{ flex: 1, justifyContent: 'center' }}><State title="Atualize o Votz" description="Instale a versão mais recente do Votz para usar o mapa de relatos." /></View>}
  </Screen>
}
