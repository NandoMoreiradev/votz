import { useRef, useState } from 'react'
import styled from 'styled-components'
import { MagnifyingGlass, UploadSimple, X } from '@phosphor-icons/react'
import { useGifSearch, useUploadPostCommentMedia } from '../../hooks/usePosts'

interface GifPickerPopoverProps {
  onSelectGif: (payload: { url: string; key?: string }) => void
  onClose: () => void
}

const Box = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.white};
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: 12px;
  margin-top: 8px;
`

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
`

const SearchInputWrap = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surfaceHover};

  input {
    border: none;
    background: transparent;
    width: 100%;
    font-size: ${({ theme }) => theme.fontSizes.sm};
    color: ${({ theme }) => theme.colors.text};
    outline: none;
  }
`

const UploadGifBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const CloseBtn = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
`

const GifTile = styled.button`
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.neutral};
  aspect-ratio: 4 / 3;
  cursor: pointer;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.action};
  }
`

const Hint = styled.p`
  margin: 8px 0 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
`

export function GifPickerPopover({ onSelectGif, onClose }: GifPickerPopoverProps) {
  const [query, setQuery] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { data, isLoading } = useGifSearch(query, true)
  const uploadMedia = useUploadPostCommentMedia()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    if (file.type !== 'image/gif') {
      setUploadError('Selecione um arquivo .gif válido.')
      return
    }
    try {
      const uploaded = await uploadMedia.mutateAsync(file)
      onSelectGif({ url: uploaded.url, key: uploaded.key })
    } catch {
      setUploadError('Não foi possível enviar o GIF.')
    }
  }

  return (
    <Box>
      <TopRow>
        <SearchInputWrap>
          <MagnifyingGlass size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar GIFs..."
          />
        </SearchInputWrap>
        <UploadGifBtn
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploadMedia.isPending}
        >
          <UploadSimple size={14} />
          {uploadMedia.isPending ? 'Enviando...' : 'Enviar .gif'}
        </UploadGifBtn>
        <input
          ref={fileRef}
          type="file"
          accept="image/gif"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <CloseBtn type="button" onClick={onClose} aria-label="Fechar seletor de GIF">
          <X size={16} />
        </CloseBtn>
      </TopRow>

      {uploadError && <Hint style={{ color: '#E63946' }}>{uploadError}</Hint>}

      {isLoading ? (
        <Hint>Buscando GIFs...</Hint>
      ) : data && !data.enabled ? (
        <Hint>
          Busca integrada aguardando chave KLIPY/GIPHY no servidor — use o botão{' '}
          <strong>Enviar .gif</strong> ao lado.
        </Hint>
      ) : data && data.items.length > 0 ? (
        <Grid>
          {data.items.map((item) => (
            <GifTile
              key={item.id}
              type="button"
              title={item.title}
              onClick={() => onSelectGif({ url: item.gifUrl })}
            >
              <img src={item.previewUrl} alt={item.title} loading="lazy" />
            </GifTile>
          ))}
        </Grid>
      ) : (
        <Hint>Nenhum GIF encontrado para esta busca.</Hint>
      )}
    </Box>
  )
}
