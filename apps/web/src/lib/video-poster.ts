/**
 * Capa do vídeo: a API guarda `<nome>.poster.jpg` ao lado de `<nome>.mp4`.
 * Vídeos antigos não têm capa; nesse caso o navegador mostra o primeiro quadro, como antes.
 */
export function videoPosterUrl(url: string): string | undefined {
  return /\.(mp4|mov|m4v|webm)(?=$|[?#])/i.test(url)
    ? url.replace(/\.(mp4|mov|m4v|webm)(?=$|[?#])/i, '.poster.jpg')
    : undefined
}
