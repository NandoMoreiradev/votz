import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { Page } from './layout'
import {
  Bell,
  CaretRight,
  Checks,
  Clock,
  Cloud,
  Database,
  DeviceMobile,
  DownloadSimple,
  HardDrive,
  Image,
  ImageSquare,
  Prohibit,
  ShieldCheck,
  SpeakerHigh,
  TextAa,
  UserPlus,
  Users,
  Vibrate,
} from '@phosphor-icons/react'
import {
  DEFAULT_CONVERSATION_SETTINGS,
  type ConversationAudience,
  type ConversationDirectPolicy,
  type ConversationFontScale,
  type ConversationMediaAutoDownload,
  type ConversationMediaUploadQuality,
  type ConversationWallpaper,
  type UpdateConversationSettings,
} from '@votz/shared-types'
import { CHAT_CACHE_VIEW, CHAT_QUALITY_VIEW, parseChatQuality } from '@votz/chat-core'
import { useAuthStore } from '../../store/auth.store'
import { getMediaCache } from '../../lib/chat-media-cache'
import {
  useConversationSettings,
  useUpdateConversationSettings,
} from '../../hooks/useConversations'

const Group = styled.section`
  padding: 4px 0 8px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  overflow: hidden;
  h2 {
    margin: 0;
    padding: 16px 24px 8px;
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.muted};
  }
`
const Row = styled.div<{ $soon?: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 60px;
  padding: 10px 24px;
  opacity: ${({ $soon }) => ($soon ? 0.55 : 1)};
`
const LinkRow = styled(Link)`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 60px;
  padding: 10px 24px;
  color: inherit;
  text-decoration: none;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral};
  }
`
const IconBox = styled.span`
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.primary};
`
const Texts = styled.div`
  flex: 1;
  min-width: 0;
  label,
  strong {
    display: block;
    font-weight: 400;
    font-size: 15px;
    color: ${({ theme }) => theme.colors.text};
  }
`
const Help = styled.p`
  margin: 2px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.muted};
`
const Note = styled.p`
  margin: 0;
  padding: 8px 24px 12px;
  font-size: 12.5px;
  color: ${({ theme }) => theme.colors.muted};
`
const Select = styled.select`
  min-height: 40px;
  max-width: 48%;
  padding: 6px 12px;
  border-radius: 10px;
  font-size: 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;
`
// Chave liga/desliga desenhada em cima do campo de marcar, que continua sendo o controle de verdade.
const Switch = styled.input`
  appearance: none;
  flex-shrink: 0;
  position: relative;
  width: 44px;
  height: 26px;
  margin: 0;
  border-radius: 13px;
  background: ${({ theme }) => theme.colors.border};
  cursor: pointer;
  transition: background 0.15s;
  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.white};
    box-shadow: 0 1px 2px rgba(13, 13, 13, 0.3);
    transition: transform 0.15s;
  }
  &:checked {
    background: ${({ theme }) => theme.colors.action};
  }
  &:checked::after {
    transform: translateX(18px);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`
const Status = styled.p`
  margin: 0;
  padding: 12px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`

function Lead({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <>
      <IconBox aria-hidden="true">{icon}</IconBox>
      <Texts>{children}</Texts>
    </>
  )
}

const TextButton = styled.button`
  flex-shrink: 0;
  min-height: 40px;
  padding: 8px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 20px;
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

/** Quanto espaço os arquivos já abertos ocupam neste navegador, e o botão para liberar. Some se não houver cache. */
function CachedFilesRow() {
  const userId = useAuthStore((state) => state.user?.id)
  const [bytes, setBytes] = useState<number | null>(null)
  const [available, setAvailable] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!userId) return
    let alive = true
    void getMediaCache(userId).then(async (cache) => {
      if (!alive) return
      if (!cache) return setAvailable(false)
      setBytes(await cache.usage())
    })
    return () => {
      alive = false
    }
  }, [userId])

  async function clear() {
    if (!userId || !window.confirm(CHAT_CACHE_VIEW.clearConfirm)) return
    const cache = await getMediaCache(userId)
    await cache?.clear()
    setBytes(0)
    setMessage(CHAT_CACHE_VIEW.cleared)
  }

  if (!userId || !available) return null
  return (
    <>
      <Row>
        <Lead icon={<HardDrive size={20} />}>
          <strong>{CHAT_CACHE_VIEW.title}</strong>
          <Help>
            {CHAT_CACHE_VIEW.help}
            {bytes !== null ? ` ${CHAT_CACHE_VIEW.usage(bytes)}` : ''}
          </Help>
        </Lead>
        <TextButton type="button" disabled={!bytes} onClick={() => void clear()}>
          {CHAT_CACHE_VIEW.clear}
        </TextButton>
      </Row>
      {message && <Note role="status">{message}</Note>}
    </>
  )
}

export function ConversationSettingsView() {
  const query = useConversationSettings()
  const update = useUpdateConversationSettings()
  const settings = query.data ?? DEFAULT_CONVERSATION_SETTINGS

  function save(patch: UpdateConversationSettings) {
    update.mutate(patch)
  }

  if (query.isPending) return <Status role="status">Carregando configurações…</Status>
  if (query.isError) return <Status role="alert">Não foi possível carregar suas configurações agora.</Status>

  return (
    <Page>
      <Group>
        <h2>Privacidade</h2>
        <Row>
          <Lead icon={<Checks size={20} />}>
            <label htmlFor="cfg-read-receipts">Confirmação de leitura</label>
            <Help>
              Mostra quando você leu uma mensagem. Se desativado, você também não vê quando outras pessoas leram.
            </Help>
          </Lead>
          <Switch
            id="cfg-read-receipts"
            type="checkbox"
            checked={settings.readReceiptsEnabled}
            disabled={update.isPending}
            onChange={(e) => save({ readReceiptsEnabled: e.target.checked })}
          />
        </Row>
        <Row>
          <Lead icon={<Clock size={20} />}>
            <label htmlFor="cfg-last-seen">Visto por último</label>
            <Help>
              Recíproco: ao escolher "Ninguém", você também não vê o visto por último de outras pessoas.
            </Help>
          </Lead>
          <Select
            id="cfg-last-seen"
            value={settings.lastSeenVisibility}
            disabled={update.isPending}
            onChange={(e) => save({ lastSeenVisibility: e.target.value as ConversationAudience })}
          >
            <option value="EVERYONE">Todos</option>
            <option value="CONTACTS">Meus contatos</option>
            <option value="NOBODY">Ninguém</option>
          </Select>
        </Row>
        <Row>
          <Lead icon={<Users size={20} />}>
            <label htmlFor="cfg-group-invite">Quem pode me adicionar a grupos</label>
          </Lead>
          <Select
            id="cfg-group-invite"
            value={settings.groupInvitePolicy}
            disabled={update.isPending}
            onChange={(e) => save({ groupInvitePolicy: e.target.value as ConversationAudience })}
          >
            <option value="EVERYONE">Todos</option>
            <option value="CONTACTS">Meus contatos</option>
            <option value="NOBODY">Ninguém</option>
          </Select>
        </Row>
        <Row>
          <Lead icon={<UserPlus size={20} />}>
            <label htmlFor="cfg-direct-request">Quem pode me enviar solicitações</label>
          </Lead>
          <Select
            id="cfg-direct-request"
            value={settings.directRequestPolicy}
            disabled={update.isPending}
            onChange={(e) => save({ directRequestPolicy: e.target.value as ConversationDirectPolicy })}
          >
            <option value="EVERYONE">Todos</option>
            <option value="FOLLOWING">Só quem eu sigo</option>
            <option value="NOBODY">Ninguém</option>
          </Select>
        </Row>
        <LinkRow to="/conversas/bloqueios">
          <Lead icon={<Prohibit size={20} />}>
            <strong>Pessoas bloqueadas</strong>
            <Help>Gerencie contas que não podem enviar mensagens para você.</Help>
          </Lead>
          <CaretRight size={18} aria-hidden="true" />
        </LinkRow>
      </Group>

      <Group>
        <h2>Conversas</h2>
        <Row>
          <Lead icon={<TextAa size={20} />}>
            <label htmlFor="cfg-font-scale">Tamanho da fonte nas conversas</label>
          </Lead>
          <Select
            id="cfg-font-scale"
            value={settings.fontScale}
            disabled={update.isPending}
            onChange={(e) => save({ fontScale: e.target.value as ConversationFontScale })}
          >
            <option value="SMALL">Pequena</option>
            <option value="MEDIUM">Padrão</option>
            <option value="LARGE">Grande</option>
          </Select>
        </Row>
        <Row>
          <Lead icon={<ImageSquare size={20} />}>
            <label htmlFor="cfg-wallpaper">Papel de parede das conversas</label>
          </Lead>
          <Select
            id="cfg-wallpaper"
            value={settings.wallpaper}
            disabled={update.isPending}
            onChange={(e) => save({ wallpaper: e.target.value as ConversationWallpaper })}
          >
            <option value="DEFAULT">Padrão</option>
            <option value="SOFT">Suave</option>
            <option value="PLAIN">Liso</option>
          </Select>
        </Row>
        <Row>
          <Lead icon={<DownloadSimple size={20} />}>
            <label htmlFor="cfg-media-download">Download automático de mídia</label>
          </Lead>
          <Select
            id="cfg-media-download"
            value={settings.mediaAutoDownload}
            disabled={update.isPending}
            onChange={(e) =>
              save({ mediaAutoDownload: e.target.value as ConversationMediaAutoDownload })
            }
          >
            <option value="WIFI_ONLY">Somente no Wi-Fi</option>
            <option value="ALWAYS">Wi-Fi e dados móveis</option>
            <option value="NEVER">Nunca (baixar manualmente)</option>
          </Select>
        </Row>
        <Row>
          <Lead icon={<Image size={20} />}>
            <label htmlFor="cfg-upload-quality">{CHAT_QUALITY_VIEW.settingTitle}</label>
            <Help>
              {CHAT_QUALITY_VIEW.settingHelp}{' '}
              {CHAT_QUALITY_VIEW.options[parseChatQuality(settings.mediaUploadQuality)].help}
            </Help>
          </Lead>
          <Select
            id="cfg-upload-quality"
            value={settings.mediaUploadQuality}
            disabled={update.isPending}
            onChange={(e) => save({ mediaUploadQuality: e.target.value as ConversationMediaUploadQuality })}
          >
            <option value="NORMAL">{CHAT_QUALITY_VIEW.options.normal.label}</option>
            <option value="HIGH">{CHAT_QUALITY_VIEW.options.high.label}</option>
          </Select>
        </Row>
        <CachedFilesRow />
      </Group>

      <Group>
        <h2>Notificações</h2>
        <Row $soon>
          <Lead icon={<SpeakerHigh size={20} />}>
            <label htmlFor="cfg-notify-sound">Som nas notificações</label>
            <Help>Em breve</Help>
          </Lead>
          <Switch id="cfg-notify-sound" type="checkbox" checked={settings.notifySound} disabled readOnly />
        </Row>
        <Row $soon>
          <Lead icon={<Vibrate size={20} />}>
            <label htmlFor="cfg-notify-vibration">Vibração</label>
            <Help>Em breve</Help>
          </Lead>
          <Switch id="cfg-notify-vibration" type="checkbox" checked={settings.notifyVibration} disabled readOnly />
        </Row>
        <Row $soon>
          <Lead icon={<Bell size={20} />}>
            <label htmlFor="cfg-notify-preview">Mostrar aviso detalhado</label>
            <Help>Em breve</Help>
          </Lead>
          <Switch id="cfg-notify-preview" type="checkbox" checked={settings.notifyPreview} disabled readOnly />
        </Row>
        <Note>Para silenciar uma conversa ou grupo específico, abra os Detalhes dentro da conversa.</Note>
      </Group>

      <Group>
        <h2>Aparelhos e segurança</h2>
        <LinkRow to="/conversas/armazenamento">
          <Lead icon={<Database size={20} />}>
            <strong>Gerenciar armazenamento</strong>
            <Help>Veja quanto espaço você usa e apague os arquivos que não quer mais guardar.</Help>
          </Lead>
          <CaretRight size={18} aria-hidden="true" />
        </LinkRow>
        <LinkRow to="/conversas/aparelhos">
          <Lead icon={<DeviceMobile size={20} />}>
            <strong>Aparelhos conectados</strong>
            <Help>Veja onde sua conta está conectada e desconecte aparelhos antigos.</Help>
          </Lead>
          <CaretRight size={18} aria-hidden="true" />
        </LinkRow>
        <Row>
          <Lead icon={<ShieldCheck size={20} />}>
            <label htmlFor="cfg-security-alerts">Alertas de segurança</label>
            <Help>Sempre ligados: avisam na conversa quando um contato muda de aparelho.</Help>
          </Lead>
          <Switch id="cfg-security-alerts" type="checkbox" checked disabled readOnly />
        </Row>
        <LinkRow to="/conversas/backup">
          <Lead icon={<Cloud size={20} />}>
            <strong>Backup protegido na nuvem</strong>
            <Help>
              {settings.keyBackupEnabled
                ? 'Ativo · restaure ou transfira seu histórico entre aparelhos.'
                : 'Guarde uma cópia protegida ou transfira seu histórico para outro aparelho.'}
            </Help>
          </Lead>
          <CaretRight size={18} aria-hidden="true" />
        </LinkRow>
      </Group>

      {update.isError && (
        <Status role="alert">Não foi possível salvar a alteração. Tente novamente.</Status>
      )}
    </Page>
  )
}
