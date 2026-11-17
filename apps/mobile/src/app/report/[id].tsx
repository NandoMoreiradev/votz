import { ScrollView } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ReportCard } from '../../components/content-card'
import { Button, Card, ErrorText, Heading, Label, State, styles } from '../../components/ui'
import { useAction, useDetail } from '../../hooks/use-content'
import { errorMessage } from '../../lib/api'
import { useSession } from '../../lib/session'
import type { Report } from '../../lib/types'

export default function ReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const report = useDetail<Report>('reports', id)
  const user = useSession((s) => s.user)
  const support = useAction(`/reports/${id}/votes`, ['reports'], { type: 'SUPPORT' })
  if (!report.data) return <State loading={report.isPending} title={report.isPending ? 'Abrindo relato' : 'Não foi possível abrir'} description={report.isError ? errorMessage(report.error) : undefined} retry={() => { void report.refetch() }} />
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <ReportCard report={report.data} detail />
    <Button title="Apoiar / retirar apoio" loading={support.isPending} onPress={() => user ? support.mutate() : router.push('/login')} />
    <ErrorText message={support.isError ? errorMessage(support.error) : undefined} />
    <Heading>Memória do relato</Heading>
    {report.data.timeline?.map((event) => <Card key={event.id}><Label>{event.content}</Label><Label muted>{new Date(event.createdAt).toLocaleString('pt-BR')}</Label></Card>)}
    {!report.data.timeline?.length && <Label muted>As atualizações públicas deste relato aparecerão aqui.</Label>}
  </ScrollView>
}
