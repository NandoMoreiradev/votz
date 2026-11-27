import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { Screen, Toolbar } from '../components/screen'
import { Button, Card, ErrorText, Field, State } from '../components/ui'
import { useCriarProposta } from '../hooks/use-politician-tools'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'HEALTH', label: 'Saúde' },
  { value: 'EDUCATION', label: 'Educação' },
  { value: 'MOBILITY', label: 'Mobilidade' },
  { value: 'SAFETY', label: 'Segurança' },
  { value: 'INFRASTRUCTURE', label: 'Infraestrutura' },
  { value: 'SANITATION', label: 'Saneamento' },
  { value: 'ENVIRONMENT', label: 'Meio Ambiente' },
  { value: 'HOUSING', label: 'Habitação' },
  { value: 'URBAN_SERVICES', label: 'Serviços Urbanos' },
  { value: 'SOCIAL_WELFARE', label: 'Assistência Social' },
  { value: 'OTHER', label: 'Outra' },
]

export default function NovaPropostaScreen() {
  const { colors, theme } = useAppTheme()
  const activeContext = useSession((s) => s.activeContext)
  const createMut = useCriarProposta()

  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [linkExterno, setLinkExterno] = useState('')
  const [categorias, setCategorias] = useState<string[]>([])

  if (activeContext?.type !== 'POLITICIAN') {
    return (
      <Screen>
        <Toolbar title="Nova proposta" back />
        <State
          title="Perfil de político necessário"
          description="Troque para o perfil do seu mandato em Perfil → Atuar como para criar propostas."
        />
      </Screen>
    )
  }

  const toggleCategory = (cat: string) => {
    setCategorias((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : prev.length < 3 ? [...prev, cat] : prev,
    )
  }

  const canSubmit = titulo.trim().length >= 5 && descricao.trim().length >= 20 && categorias.length >= 1

  const submit = () => {
    if (!canSubmit) return
    createMut.mutate(
      {
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        categorias,
        ...(linkExterno.trim() ? { linkExterno: linkExterno.trim() } : {}),
      },
      {
        onSuccess: (created) => {
          router.replace(`/propostas/${created.id}` as Href)
        },
      },
    )
  }

  return (
    <Screen>
      <Toolbar title="Nova proposta" back />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.soft }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Field label="Título da proposta *" value={titulo} onChangeText={setTitulo} placeholder="Ex.: Ampliação de creches no centro" maxLength={160} />
          <Field
            label="Descrição detalhada *"
            value={descricao}
            onChangeText={setDescricao}
            placeholder="Explique o objetivo, justificativa e impacto esperado (mín. 20 caracteres)"
            multiline
            maxLength={4000}
          />
          <Field
            label="Link oficial (opcional)"
            value={linkExterno}
            onChangeText={setLinkExterno}
            placeholder="https://…"
            autoCapitalize="none"
            keyboardType="url"
          />

          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: colors.text }}>
              Categorias (escolha de 1 a 3) *
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map((c) => {
                const selected = categorias.includes(c.value)
                return (
                  <Pressable
                    key={c.value}
                    onPress={() => toggleCategory(c.value)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: selected ? colors.action : colors.border,
                      backgroundColor: selected ? colors.tint : colors.soft,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: selected ? colors.action : colors.primary }}>
                      {c.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <ErrorText message={createMut.isError ? errorMessage(createMut.error) : undefined} />
          <Button title="Publicar proposta" loading={createMut.isPending} disabled={!canSubmit} onPress={submit} />
        </Card>
      </ScrollView>
    </Screen>
  )
}
