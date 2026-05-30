import { useState, useRef, useEffect } from 'react'
import styled from 'styled-components'

type RecorderState = 'idle' | 'requesting' | 'recording' | 'recorded'

interface VoiceRecorderProps {
  onRecorded: (blob: Blob, durationSeconds: number) => void
  onCancel: () => void
}

const MAX_SECONDS = 300 // 5 minutos

function getSupportedMimeType(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return types.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
}

// ── Styled ─────────────────────────────────────────────────────────────────

const Wrap = styled.div`
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 16px;
  background: ${({ theme }) => theme.colors.neutral};
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`

const RecordBtn = styled.button<{ $recording: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-family: ${({ theme }) => theme.fonts.heading};
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  background: ${({ $recording, theme }) => $recording ? theme.colors.action : theme.colors.primary};
  color: #fff;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:not(:disabled):hover { opacity: 0.88; }
`

const Timer = styled.span<{ $warn: boolean }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${({ $warn, theme }) => $warn ? theme.colors.action : theme.colors.text};
  min-width: 48px;
`

const Pulse = styled.span`
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.action};
  animation: pulse 1s ease-in-out infinite;
  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }
`

const CancelBtn = styled.button`
  padding: 8px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: none;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.875rem;
  border: 1px solid ${({ theme }) => theme.colors.border};
  cursor: pointer;
  transition: all 0.15s;
  &:hover { color: ${({ theme }) => theme.colors.text}; border-color: #c4c4c4; }
`

const PreviewWrap = styled.div`
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const AudioPreview = styled.audio`
  width: 100%;
  height: 36px;
`

const SendBtn = styled.button`
  padding: 9px 20px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.positive};
  color: #fff;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-family: ${({ theme }) => theme.fonts.heading};
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.88; }
`

const Hint = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 8px;
`

function formatTimer(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function VoiceRecorder({ onRecorded, onCancel }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTime = useRef<number>(0)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function startRecording() {
    setState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorder.current = recorder
      chunks.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const recorded = new Blob(chunks.current, { type: mimeType || 'audio/webm' })
        const url = URL.createObjectURL(recorded)
        setBlob(recorded)
        setPreviewUrl(url)
        setState('recorded')
      }

      recorder.start(250)
      startTime.current = Date.now()
      setState('recording')

      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startTime.current) / 1000)
        setElapsed(secs)
        if (secs >= MAX_SECONDS) stopRecording()
      }, 500)
    } catch {
      setState('idle')
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorder.current?.stop()
  }

  function handleSend() {
    if (!blob) return
    const duration = Math.floor((Date.now() - startTime.current) / 1000)
    onRecorded(blob, Math.max(duration, elapsed))
  }

  function handleReRecord() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setBlob(null)
    setPreviewUrl(null)
    setElapsed(0)
    setState('idle')
  }

  return (
    <Wrap>
      {state !== 'recorded' && (
        <Row>
          {state === 'recording' && <Pulse />}
          {(state === 'idle' || state === 'requesting') && (
            <RecordBtn
              $recording={false}
              onClick={startRecording}
              disabled={state === 'requesting'}
            >
              🎙 {state === 'requesting' ? 'Aguardando permissão...' : 'Iniciar gravação'}
            </RecordBtn>
          )}
          {state === 'recording' && (
            <>
              <Timer $warn={elapsed > 240}>{formatTimer(elapsed)}</Timer>
              <RecordBtn $recording onClick={stopRecording}>■ Parar</RecordBtn>
            </>
          )}
          <CancelBtn type="button" onClick={onCancel}>Cancelar</CancelBtn>
        </Row>
      )}

      {state === 'recorded' && previewUrl && (
        <PreviewWrap>
          <AudioPreview controls src={previewUrl} />
          <Row>
            <SendBtn type="button" onClick={handleSend}>✓ Enviar áudio</SendBtn>
            <CancelBtn type="button" onClick={handleReRecord}>Regravar</CancelBtn>
            <CancelBtn type="button" onClick={onCancel}>Cancelar</CancelBtn>
          </Row>
        </PreviewWrap>
      )}

      {state === 'idle' && (
        <Hint>Máximo de {MAX_SECONDS / 60} minutos. O áudio será transcrito automaticamente.</Hint>
      )}
    </Wrap>
  )
}
