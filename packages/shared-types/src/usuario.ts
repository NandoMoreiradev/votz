import { TipoUsuario } from './enums'

export interface UsuarioPublico {
  id: string
  nome: string
  tipo: TipoUsuario
  verificado: boolean
  reputacao: number
  avatarUrl?: string
  bio?: string
  contaCriada: string
}

export interface UsuarioAutenticado extends UsuarioPublico {
  email: string
  emailVerificado: boolean
}
