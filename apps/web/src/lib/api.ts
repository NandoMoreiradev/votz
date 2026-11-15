import axios from 'axios'
import { getToken, setToken } from './token'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
})

let pendingRefresh: Promise<string> | null = null

export function refreshSession(): Promise<string> {
  if (!pendingRefresh) {
    pendingRefresh = axios
      .post<{ accessToken: string }>(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        setToken(data.accessToken)
        return data.accessToken
      })
      .finally(() => {
        pendingRefresh = null
      })
  }
  return pendingRefresh
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (
      error.response?.status !== 401 ||
      original._retry ||
      original.url === '/auth/refresh'
    ) {
      return Promise.reject(error)
    }

    original._retry = true

    try {
      const accessToken = await refreshSession()
      original.headers.Authorization = `Bearer ${accessToken}`
      return api(original)
    } catch (err) {
      setToken(null)
      window.dispatchEvent(new Event('votz:logout'))
      return Promise.reject(err)
    }
  },
)
