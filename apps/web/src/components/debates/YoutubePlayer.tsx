import { useState } from 'react'
import styled from 'styled-components'

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

const Wrap = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  background: #000;
`

const Frame = styled.iframe`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
`

const Facade = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  text-align: center;
  color: rgba(255, 255, 255, 0.85);
`

const PlayBtn = styled.button`
  padding: 12px 28px;
  border: none;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.88; }
`

const Note = styled.p`
  max-width: 420px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.55);
`

const Source = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: rgba(255, 255, 255, 0.7);
`

interface Props {
  videoId: string
  /** Nome do canal que transmite, se o Votz já souber. */
  channelTitle?: string | null
  title: string
}

/**
 * Live do YouTube dentro do debate. Nada do Google carrega antes do clique em "Assistir":
 * só então o iframe (domínio youtube-nocookie) é montado. Troque o `key` ao mudar de vídeo
 * para a pessoa precisar clicar de novo.
 */
export function YoutubePlayer({ videoId, channelTitle, title }: Props) {
  const [started, setStarted] = useState(false)

  if (!VIDEO_ID_RE.test(videoId)) return null

  if (started) {
    return (
      <Wrap>
        <Frame
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </Wrap>
    )
  }

  return (
    <Wrap>
      <Facade>
        {channelTitle && <Source>Transmissão do canal {channelTitle}</Source>}
        <PlayBtn type="button" onClick={() => setStarted(true)}>
          ▶ Assistir
        </PlayBtn>
        <Note>
          O vídeo é do YouTube. Ele só carrega depois do seu clique, e o YouTube (Google) pode guardar dados do seu
          aparelho. O Votz não controla esse vídeo.
        </Note>
      </Facade>
    </Wrap>
  )
}
