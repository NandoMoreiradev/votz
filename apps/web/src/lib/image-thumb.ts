/**
 * Miniatura da foto: a API guarda `<nome>.thumb.webp` (400 px) ao lado de `<nome>.jpeg|png|webp`.
 * Fotos antigas e GIFs não têm miniatura; quem usa precisa voltar para a foto inteira se ela não carregar.
 * Serve para quadradinhos de lista e galeria. Em área grande (capa do card), use a foto inteira.
 */
const IMAGE_EXT = /\.(jpe?g|png|webp)(?=$|[?#])/i

export function thumbUrl(url: string): string | undefined {
  return IMAGE_EXT.test(url) && !/\.thumb\.webp(?=$|[?#])/i.test(url)
    ? url.replace(IMAGE_EXT, '.thumb.webp')
    : undefined
}
