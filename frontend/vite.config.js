import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendDirectory = resolve(projectRoot, 'backend')
const pythonEnvironmentDirectory =
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'

async function backendIsReady() {
  try {
    const response = await fetch('http://127.0.0.1:8000/')
    if (!response.ok) {
      return false
    }

    const data = await response.json()
    return data.message === 'AI Business Advisor API is running'
  } catch {
    return false
  }
}

function startBackend() {
  const pythonCandidates = [
    resolve(projectRoot, '.venv', pythonEnvironmentDirectory),
    resolve(projectRoot, '..', '.venv', pythonEnvironmentDirectory),
  ]
  const python =
    process.env.PYTHON ||
    pythonCandidates.find((candidate) => existsSync(candidate)) ||
    (process.platform === 'win32' ? 'py' : 'python3')
  const pythonArgs = python === 'py' ? ['-3'] : []
  const backend = spawn(
    python,
    [
      ...pythonArgs,
      '-m',
      'uvicorn',
      'app:app',
      '--host',
      '127.0.0.1',
      '--port',
      '8000',
    ],
    { cwd: backendDirectory, stdio: 'inherit', windowsHide: true },
  )

  let startupError
  backend.once('error', (error) => {
    startupError = error
  })

  return (async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (startupError) {
        throw new Error(`Could not start the backend: ${startupError.message}`)
      }

      if (backend.exitCode !== null || backend.signalCode !== null) {
        throw new Error(
          `Backend exited before becoming ready (code ${backend.exitCode}).`,
        )
      }

      if (await backendIsReady()) {
        return backend
      }

      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    }

    throw new Error('Backend did not become ready at http://127.0.0.1:8000/.')
  })().catch((error) => {
    backend.kill()
    throw error
  })
}

function backendPlugin() {
  return {
    name: 'start-local-backend',
    apply: 'serve',
    async configureServer(server) {
      if (await backendIsReady()) {
        server.config.logger.info(
          'Using the backend already running at http://127.0.0.1:8000/',
        )
        return
      }

      const backend = await startBackend()
      server.config.logger.info('Started backend at http://127.0.0.1:8000/')
      server.httpServer?.once('close', () => backend.kill())
    },
  }
}

export default defineConfig({
  plugins: [react(), backendPlugin()],
  server: {
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
