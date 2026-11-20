import { Modal, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useVideoPlayer, VideoView } from 'expo-video'
import X from 'lucide-react-native/icons/x'
import { IconButton } from './ui'
import { theme } from '../theme'

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (instance) => { instance.play() })
  return <VideoView player={player} nativeControls allowsPictureInPicture contentFit="contain" style={{ flex: 1 }} accessibilityLabel="Vídeo do relato" />
}

/** Toca o vídeo dentro do app. O player só existe enquanto a janela está aberta, então não gasta dados nem memória antes. */
export function VideoModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  return <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: 16 }}><IconButton label="Fechar vídeo" onPress={onClose}><X color={theme.colors.surface} size={24} /></IconButton></View>
      {url && <Player url={url} />}
    </SafeAreaView>
  </Modal>
}
