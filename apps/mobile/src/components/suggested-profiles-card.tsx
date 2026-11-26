import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import BadgeCheck from 'lucide-react-native/icons/badge-check'
import type { FeedSuggestedProfile, FeedSuggestions } from '@votz/shared-types'
import { useFollowing, useToggleFollow } from '../hooks/use-content'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'
import { Avatar } from './ui'

function Row({ profile }: { profile: FeedSuggestedProfile }) {
  const { colors, theme } = useAppTheme()
  const user = useSession((s) => s.user)
  const following = useFollowing(profile.kind, profile.id, !!user)
  const toggle = useToggleFollow(profile.kind, profile.id)
  const on = !!following.data?.following
  const open = () => router.push({ pathname: '/profile/[kind]/[id]', params: { kind: profile.kind, id: profile.id } })
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${profile.name}`} onPress={open}><Avatar name={profile.name} uri={profile.avatarUrl} size={40} /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${profile.name}`} onPress={open} style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: colors.primary, flexShrink: 1 }}>{profile.name}</Text>
        {profile.verified && <BadgeCheck size={14} color={colors.action} />}
      </View>
      <Text numberOfLines={1} style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>{[profile.username ? `@${profile.username}` : null, profile.subtitle].filter(Boolean).join(' · ')}</Text>
    </Pressable>
    {!!user && <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={on ? `Deixar de seguir ${profile.name}` : `Seguir ${profile.name}`} disabled={toggle.isPending} onPress={() => toggle.mutate()} style={{ minHeight: 34, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 17, borderWidth: 1, borderColor: on ? colors.border : colors.action, backgroundColor: on ? 'transparent' : colors.action, opacity: toggle.isPending ? 0.6 : 1 }}>
      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: on ? colors.primary : colors.onAccent }}>{on ? 'Seguindo' : 'Seguir'}</Text>
    </Pressable>}
  </View>
}

/** Para quem segue poucas contas: políticos e entidades da cidade. O título vem do servidor, igual no web. */
export function SuggestedProfilesCard({ suggestions }: { suggestions: FeedSuggestions }) {
  const { colors, theme } = useAppTheme()
  return <View accessibilityLabel={suggestions.title} style={{ backgroundColor: colors.surface, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14 }}>
    <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>{suggestions.title}</Text>
    <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted, marginBottom: 6 }}>Seguir ajuda o seu feed a mostrar o que importa para você.</Text>
    {suggestions.profiles.map((profile) => <Row key={`${profile.kind}-${profile.id}`} profile={profile} />)}
  </View>
}
