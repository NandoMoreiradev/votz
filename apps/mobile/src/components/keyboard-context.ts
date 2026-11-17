import { createContext, useContext, type ComponentRef } from 'react'
import type { TextInput } from 'react-native'

export type InputHandle = ComponentRef<typeof TextInput>
export const RevealInput = createContext<(input: InputHandle | null) => void>(() => {})
export const useRevealInput = () => useContext(RevealInput)
