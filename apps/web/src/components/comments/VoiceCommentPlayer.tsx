import { useState } from 'react'
import styled from 'styled-components'

interface VoiceCommentPlayerProps {
  url: string
  duration: number | null
  transcript: string | null
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const PlayerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const StyledAudio = styled.audio`
  flex: 1;
  height: 34px;
  min-width: 0;
`

const Duration = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  flex-shrink: 0;
`

const TranscriptToggle = styled.button`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.primary};
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-align: left;
  &:hover { opacity: 0.75; }
`

const TranscriptBox = styled.div`
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 10px 12px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.55;
  white-space: pre-wrap;
`

const Generating = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
`

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m${s.toString().padStart(2, '0')}s` : `${s}s`
}

export function VoiceCommentPlayer({ url, duration, transcript }: VoiceCommentPlayerProps) {
  const [showTranscript, setShowTranscript] = useState(false)

  return (
    <Wrap>
      <PlayerRow>
        <StyledAudio controls src={url} preload="metadata" />
        {duration != null && <Duration>{formatDuration(duration)}</Duration>}
      </PlayerRow>

      {transcript ? (
        <>
          <TranscriptToggle type="button" onClick={() => setShowTranscript(v => !v)}>
            {showTranscript ? 'Ocultar transcrição' : 'Ver transcrição'}
          </TranscriptToggle>
          {showTranscript && <TranscriptBox>{transcript}</TranscriptBox>}
        </>
      ) : (
        <Generating>Transcrição sendo gerada...</Generating>
      )}
    </Wrap>
  )
}
