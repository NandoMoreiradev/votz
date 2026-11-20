import { useState, type ComponentType } from 'react'
import { Linking, Text, View } from 'react-native'
import ExternalLink from 'lucide-react-native/icons/external-link'
import { Button } from './ui'
import { EMBED_ORIGIN, youtubeEmbedUrl, youtubeWatchUrl } from '../lib/debate-view'
import { theme } from '../theme'

// O player usa uma biblioteca nativa (react-native-webview) que só existe em builds feitas depois dela.
// Em um aplicativo mais antigo o import falharia e derrubaria a tela; então carregamos com cuidado e,
// sem ela, o botão "Abrir no YouTube" continua levando a pessoa ao vídeo.
type WebViewProps = {
  source: { uri: string; headers?: Record<string, string> }
  style?: object
  [key: string]: unknown
}
const WebView: ComponentType<WebViewProps> | null = (() => {
  try {
    // require de propósito: um import estático derrubaria a tela em builds sem a biblioteca nativa.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('react-native-webview') as { WebView: ComponentType<WebViewProps> }).WebView
  } catch {
    return null
  }
})()

const CARD = { width: '100%', aspectRatio: 16 / 9, backgroundColor: theme.colors.primary } as const
const isYoutubeEmbed = (url: string) => url.startsWith('https://www.youtube-nocookie.com/embed/')

/**
 * Live do YouTube no debate. Nada do Google carrega antes do toque em "Assistir": só depois o
 * player (domínio youtube-nocookie) é aberto. Troque a `key` ao mudar de vídeo para pedir o toque de novo.
 */
export function YoutubePlayer({ videoId, channelTitle }: { videoId: string; channelTitle?: string | null }) {
  const [started, setStarted] = useState(false)
  const embed = youtubeEmbedUrl(videoId)
  const watch = youtubeWatchUrl(videoId)
  if (!embed || !watch) return null
  const openInYoutube = () => { void Linking.openURL(watch) }

  if (started && WebView) {
    return <View style={CARD}>
      <WebView
        source={{ uri: embed, headers: { Referer: EMBED_ORIGIN } }}
        style={{ flex: 1, backgroundColor: theme.colors.primary }}
        incognito
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        // O player só pode ficar no próprio embed. Qualquer outro endereço abre fora do app.
        onShouldStartLoadWithRequest={(request: { url: string }) => {
          if (isYoutubeEmbed(request.url) || request.url === 'about:blank') return true
          void Linking.openURL(request.url)
          return false
        }}
      />
    </View>
  }

  return <View style={[CARD, { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }]}>
    {channelTitle ? <Text numberOfLines={1} style={{ color: theme.colors.surface, fontFamily: theme.fonts.medium, fontSize: 14 }}>Transmissão do canal {channelTitle}</Text> : null}
    {WebView
      ? <Button title="Assistir" onPress={() => setStarted(true)} />
      : <Button title="Abrir no YouTube" onPress={openInYoutube} />}
    <Text style={{ color: theme.colors.border, fontFamily: theme.fonts.body, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
      O vídeo é do YouTube e só carrega depois do seu toque. O YouTube (Google) pode guardar dados do seu aparelho. O Votz não controla esse vídeo.
    </Text>
  </View>
}

/** Atalho para quem prefere o aplicativo do YouTube (ou quando o player não abre). */
export function OpenInYoutube({ videoId }: { videoId: string }) {
  const watch = youtubeWatchUrl(videoId)
  if (!watch) return null
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <ExternalLink size={14} color={theme.colors.muted} />
    <Text accessibilityRole="link" onPress={() => { void Linking.openURL(watch) }} style={{ color: theme.colors.muted, fontFamily: theme.fonts.body, fontSize: 12, textDecorationLine: 'underline' }}>Não abriu? Veja no YouTube</Text>
  </View>
}
