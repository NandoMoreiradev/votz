import { Link } from 'react-router-dom'
import styled from 'styled-components'
import {
  DEFAULT_CONVERSATION_SETTINGS,
  type ConversationAudience,
  type ConversationDirectPolicy,
  type ConversationFontScale,
  type ConversationMediaAutoDownload,
  type ConversationWallpaper,
  type UpdateConversationSettings,
} from '@votz/shared-types'
import {
  useConversationSettings,
  useUpdateConversationSettings,
} from '../../hooks/useConversations'

const Group = styled.section`
  padding: 20px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: grid;
  gap: 14px;
  h2 {
    margin: 0;
    font-size: 16px;
    color: ${({ theme }) => theme.colors.text};
  }
`
const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`
const Help = styled.p`
  margin: 4px 0 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`
const Select = styled.select`
  min-height: 40px;
  padding: 6px 12px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;
`
const NavLink = styled(Link)`
  color: ${({ theme }) => theme.colors.action};
  font-weight: 600;
  text-decoration: none;
`
const Status = styled.p`
  margin: 0;
  padding: 12px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`

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
    <div>
      <Group>
        <h2>Privacidade</h2>
        <Row>
          <div>
            <label htmlFor="cfg-read-receipts">
              <strong>Confirmação de leitura</strong>
            </label>
            <Help>
              Mostra quando você leu uma mensagem. Se desativado, você também não vê quando outras pessoas leram.
            </Help>
          </div>
          <input
            id="cfg-read-receipts"
            type="checkbox"
            checked={settings.readReceiptsEnabled}
            disabled={update.isPending}
            onChange={(e) => save({ readReceiptsEnabled: e.target.checked })}
          />
        </Row>
        <Row>
          <div>
            <label htmlFor="cfg-last-seen">
              <strong>Visto por último</strong>
            </label>
            <Help>
              Recíproco: ao escolher "Ninguém", você também não vê o visto por último de outras pessoas.
            </Help>
          </div>
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
          <div>
            <label htmlFor="cfg-group-invite">
              <strong>Quem pode me adicionar a grupos</strong>
            </label>
          </div>
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
          <div>
            <label htmlFor="cfg-direct-request">
              <strong>Quem pode me enviar solicitações</strong>
            </label>
          </div>
          <Select
            id="cfg-direct-request"
            value={settings.directRequestPolicy}
            disabled={update.isPending}
            onChange={(e) => save({ directRequestPolicy: e.target.value as ConversationDirectPolicy })}
          >
            <option value="EVERYONE">Todos</option>
            <option value="NOBODY">Ninguém</option>
          </Select>
        </Row>
        <Row>
          <div>
            <strong>Pessoas bloqueadas</strong>
            <Help>Gerencie contas que não podem enviar mensagens para você.</Help>
          </div>
          <NavLink to="/conversas/bloqueios">Ver bloqueadas</NavLink>
        </Row>
      </Group>

      <Group>
        <h2>Notificações</h2>
        <Row>
          <div>
            <label htmlFor="cfg-notify-sound">
              <strong>Som nas notificações</strong>
            </label>
          </div>
          <input
            id="cfg-notify-sound"
            type="checkbox"
            checked={settings.notifySound}
            disabled={update.isPending}
            onChange={(e) => save({ notifySound: e.target.checked })}
          />
        </Row>
        <Row>
          <div>
            <label htmlFor="cfg-notify-vibration">
              <strong>Vibração</strong>
            </label>
          </div>
          <input
            id="cfg-notify-vibration"
            type="checkbox"
            checked={settings.notifyVibration}
            disabled={update.isPending}
            onChange={(e) => save({ notifyVibration: e.target.checked })}
          />
        </Row>
        <Row>
          <div>
            <label htmlFor="cfg-notify-preview">
              <strong>Mostrar aviso detalhado</strong>
            </label>
            <Help>
              Por privacidade, notificações nunca exibem o texto das mensagens — apenas que há uma nova mensagem.
            </Help>
          </div>
          <input
            id="cfg-notify-preview"
            type="checkbox"
            checked={settings.notifyPreview}
            disabled={update.isPending}
            onChange={(e) => save({ notifyPreview: e.target.checked })}
          />
        </Row>
        <Help>
          Para silenciar uma conversa ou grupo específico, abra os Detalhes dentro da conversa.
        </Help>
      </Group>

      <Group>
        <h2>Aparelhos e segurança</h2>
        <Row>
          <div>
            <strong>Aparelhos conectados</strong>
            <Help>Veja onde sua conta está conectada e desconecte aparelhos antigos.</Help>
          </div>
          <NavLink to="/conversas/aparelhos">Gerenciar aparelhos</NavLink>
        </Row>
        <Row>
          <div>
            <label htmlFor="cfg-security-alerts">
              <strong>Alertas de segurança</strong>
            </label>
            <Help>Avisa dentro da conversa quando um contato muda de aparelho.</Help>
          </div>
          <input
            id="cfg-security-alerts"
            type="checkbox"
            checked={settings.securityAlertsEnabled}
            disabled={update.isPending}
            onChange={(e) => save({ securityAlertsEnabled: e.target.checked })}
          />
        </Row>
        <Row>
          <div>
            <label htmlFor="cfg-key-backup">
              <strong>Backup protegido na nuvem (opcional)</strong>
            </label>
            <Help>
              Desativado por padrão. Mantém suas conversas apenas nos seus aparelhos quando desligado.
            </Help>
          </div>
          <input
            id="cfg-key-backup"
            type="checkbox"
            checked={settings.keyBackupEnabled}
            disabled={update.isPending}
            onChange={(e) => save({ keyBackupEnabled: e.target.checked })}
          />
        </Row>
      </Group>

      <Group>
        <h2>Mídia e aparência</h2>
        <Row>
          <div>
            <label htmlFor="cfg-media-download">
              <strong>Download automático de mídia</strong>
            </label>
          </div>
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
          <div>
            <label htmlFor="cfg-font-scale">
              <strong>Tamanho da fonte nas conversas</strong>
            </label>
          </div>
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
          <div>
            <label htmlFor="cfg-wallpaper">
              <strong>Papel de parede das conversas</strong>
            </label>
          </div>
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
      </Group>

      {update.isError && (
        <Status role="alert">Não foi possível salvar a alteração. Tente novamente.</Status>
      )}
    </div>
  )
}
