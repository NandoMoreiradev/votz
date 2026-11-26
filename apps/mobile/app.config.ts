import type { ConfigContext, ExpoConfig } from 'expo/config'

// O iOS mostra um único texto de microfone, usado por vídeo, nota de voz e chamada.
const MICROPHONE_REASON = 'O Votz usa o microfone para gravar o som de vídeos, notas de voz e chamadas.'

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT
  if ((variant === 'preview' || variant === 'production') && !process.env.EXPO_PUBLIC_API_URL?.startsWith('https://')) {
    throw new Error('Configure EXPO_PUBLIC_API_URL com a URL HTTPS da API antes de gerar uma build de preview ou produção.')
  }
  return {
  ...config,
  name: 'Votz',
  slug: 'votz-mobile',
  owner: 'fernando_moreira.dev',
  extra: { eas: { projectId: 'bad8e5fc-6bbd-45ac-bbc7-5bcd2ac52ad9' } },
  scheme: 'votz',
  version: '0.1.0',
  icon: './assets/votz-icon.png',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  // Atualizações sem build: mudanças só de JavaScript chegam por `eas update`. O "fingerprint" amarra cada
  // atualização a builds com o mesmo código nativo, então nenhuma atualização cai num app incompatível.
  runtimeVersion: { policy: 'fingerprint' },
  updates: { url: 'https://u.expo.dev/bad8e5fc-6bbd-45ac-bbc7-5bcd2ac52ad9', checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 },
  ios: {
    supportsTablet: false, bundleIdentifier: 'br.com.votz.app',
    // Áudio em segundo plano: nota de voz tocando e chamada que continua com a tela bloqueada.
    infoPlist: { UIBackgroundModes: ['audio'] },
  },
  android: {
    package: 'br.com.votz.app', predictiveBackGestureEnabled: true,
    adaptiveIcon: { foregroundImage: './assets/votz-foreground.png', backgroundColor: '#1A1A2E' },
    // Push (FCM): em build de nuvem, o google-services.json vem de um arquivo secreto do EAS (variável GOOGLE_SERVICES_JSON).
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
    // Chamadas de voz e vídeo (LiveKit) e nota de voz.
    permissions: ['CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'BLUETOOTH_CONNECT'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-image',
    'expo-font',
    'expo-updates',
    'expo-sharing',
    '@maplibre/maplibre-react-native',
    ['expo-splash-screen', { image: './assets/votz-icon.png', imageWidth: 120, backgroundColor: '#1A1A2E' }],
    ['expo-image-picker', {
      photosPermission: 'O Votz precisa acessar as fotos e vídeos que você escolher para sua publicação ou relato.',
      cameraPermission: 'O Votz usa a câmera para registrar seu relato.',
      microphonePermission: MICROPHONE_REASON,
    }],
    ['expo-audio', { microphonePermission: MICROPHONE_REASON, recordAudioAndroid: true, enableBackgroundPlayback: true }],
    ['expo-video', { supportsBackgroundPlayback: false, supportsPictureInPicture: true }],
    ['expo-notifications', { color: '#E63946', defaultChannel: 'chat-messages' }],
    ['expo-location', { locationWhenInUsePermission: 'Use sua localização para indicar onde o problema acontece.' }],
    '@livekit/react-native-expo-plugin',
    ['expo-build-properties', { android: { usesCleartextTraffic: process.env.APP_VARIANT === 'development' } }],
  ],
  experiments: { typedRoutes: true },
  }
}
