import { createContext, useContext } from 'react'
import { Navbar } from './Navbar'

/** Verdadeiro quando a tela está dentro do Estúdio (que já tem a barra do topo e o menu lateral). */
export const StudioEmbedContext = createContext(false)

export function useStudioEmbedded(): boolean {
  return useContext(StudioEmbedContext)
}

/** Barra do topo da tela. Dentro do Estúdio ela não aparece de novo. */
export function PageNavbar() {
  return useStudioEmbedded() ? null : <Navbar />
}
