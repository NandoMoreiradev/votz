import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vm from 'node:vm'
import * as ts from 'typescript'

function loadWebApiModule(mockAxios: any) {
  const apiPath = path.resolve(__dirname, '../../../web/src/lib/api.ts')
  const tokenPath = path.resolve(__dirname, '../../../web/src/lib/token.ts')

  const loadTsModule = (filePath: string, customRequire: (id: string) => any) => {
    const raw = fs
      .readFileSync(filePath, 'utf8')
      .replace(/import\.meta\.env\.VITE_API_URL/g, 'undefined')
    const transpiled = ts.transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    })
    const mod = { exports: {} as Record<string, any> }
    const fn = new vm.Script(
      `(function(exports, require, module) {\n${transpiled.outputText}\n})`,
      { filename: filePath },
    ).runInThisContext()
    fn(mod.exports, customRequire, mod)
    return mod.exports
  }

  const tokenMod = loadTsModule(tokenPath, require)
  const apiMod = loadTsModule(apiPath, (id: string) => {
    if (id === 'axios') return { default: mockAxios, ...mockAxios }
    if (id === './token') return tokenMod
    return require(id)
  })

  return { ...apiMod, ...tokenMod }
}

describe('frontend refreshSession single-flight (apps/web/src/lib/api.ts)', () => {
  it('shares one POST /auth/refresh across concurrent callers and allows subsequent refreshes after completion', async () => {
    let responseErrorHandler: (err: any) => Promise<any> = async () => {}
    let callCount = 0
    let resolveFirst!: (val: any) => void

    const apiInstance: any = jest.fn(async (cfg: any) => ({ data: { retried: true, cfg } }))
    apiInstance.interceptors = {
      request: { use: jest.fn() },
      response: {
        use: jest.fn((_ok: any, onErr: any) => {
          responseErrorHandler = onErr
        }),
      },
    }

    const mockAxios = {
      create: jest.fn(() => apiInstance),
      post: jest.fn((url: string, _body: any, _opts: any) => {
        callCount++
        if (callCount === 1) {
          return new Promise((resolve) => {
            resolveFirst = resolve
          })
        }
        return Promise.resolve({ data: { accessToken: `token-${callCount}` } })
      }),
    }

    const { refreshSession, getToken } = loadWebApiModule(mockAxios)

    // Simula 3 chamadas concorrentes (ex.: AuthInit + React.StrictMode + interceptor 401)
    const p1 = refreshSession()
    const p2 = refreshSession()
    const p3 = responseErrorHandler({
      response: { status: 401 },
      config: { url: '/auth/me', headers: {} },
    })

    expect(mockAxios.post).toHaveBeenCalledTimes(1)
    expect(mockAxios.post).toHaveBeenCalledWith(
      '/api/v1/auth/refresh',
      {},
      { withCredentials: true },
    )

    resolveFirst({ data: { accessToken: 'token-1' } })
    const [t1, t2, r3] = await Promise.all([p1, p2, p3])

    expect(t1).toBe('token-1')
    expect(t2).toBe('token-1')
    expect(r3.data.cfg.headers.Authorization).toBe('Bearer token-1')
    expect(getToken()).toBe('token-1')

    // Depois de concluir, uma nova chamada dispara outra requisição HTTP
    const tNext = await refreshSession()
    expect(mockAxios.post).toHaveBeenCalledTimes(2)
    expect(tNext).toBe('token-2')
    expect(getToken()).toBe('token-2')
  })

  it('clears pending promise after failure so a subsequent refresh can succeed', async () => {
    const apiInstance: any = jest.fn()
    apiInstance.interceptors = {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    }
    const mockAxios = {
      create: jest.fn(() => apiInstance),
      post: jest
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({ data: { accessToken: 'recovered-token' } }),
    }

    const { refreshSession } = loadWebApiModule(mockAxios)

    await expect(Promise.all([refreshSession(), refreshSession()])).rejects.toThrow('network error')
    expect(mockAxios.post).toHaveBeenCalledTimes(1)

    const recovered = await refreshSession()
    expect(recovered).toBe('recovered-token')
    expect(mockAxios.post).toHaveBeenCalledTimes(2)
  })
})
