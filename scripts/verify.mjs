import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFile } from 'node:fs/promises'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)

const testScripts = Object.entries(packageJson.scripts)
  .filter(([name]) => name.startsWith('test:'))
  .map(([name, command]) => ({
    name,
    needsServer: command.includes('.integration.'),
  }))

const localTests = testScripts.filter((test) => !test.needsServer)
const integrationTests = testScripts.filter((test) => test.needsServer)

function run(command, args, options = {}) {
  console.log(`\n[verify] ${command} ${args.join(' ')}`)

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      const result = signal ? `signal ${signal}` : `exit code ${code}`
      reject(new Error(`${command} ${args.join(' ')} failed with ${result}`))
    })
  })
}

async function availablePort() {
  const server = createServer()

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })

  if (!port) throw new Error('Could not reserve a local verification port.')
  return port
}

async function waitForHealth(serverUrl, serverProcess, serverState) {
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    if (serverState.spawnError) throw serverState.spawnError

    if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
      const result = serverProcess.signalCode
        ? `signal ${serverProcess.signalCode}`
        : `exit code ${serverProcess.exitCode}`
      throw new Error(`Verification server stopped with ${result}.`)
    }

    try {
      const response = await fetch(`${serverUrl}/health`, {
        signal: AbortSignal.timeout(1_000),
      })
      if (response.ok) return
    } catch {
      // The server can refuse connections while it finishes starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error('Verification server did not become healthy within 30 seconds.')
}

async function stopServer(serverProcess) {
  if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) return

  const exited = new Promise((resolve) => serverProcess.once('exit', resolve))
  serverProcess.kill('SIGTERM')

  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
  ])

  if (!stopped && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    serverProcess.kill('SIGKILL')
    await exited
  }
}

async function main() {
  console.log(`[verify] Running ${testScripts.length} repository test scripts.`)

  await run(npmCommand, ['run', 'typecheck'])
  await run(npmCommand, ['run', 'build'])

  for (const test of localTests) {
    await run(npmCommand, ['run', test.name])
  }

  if (integrationTests.length === 0) return

  const port = await availablePort()
  const serverUrl = `http://127.0.0.1:${port}`
  console.log(`\n[verify] Starting integration server at ${serverUrl}`)

  const serverProcess = spawn(process.execPath, ['server-dist/server/index.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit',
  })
  const serverState = { spawnError: null }
  serverProcess.once('error', (error) => {
    serverState.spawnError = error
  })

  try {
    await waitForHealth(serverUrl, serverProcess, serverState)

    for (const test of integrationTests) {
      await run(npmCommand, ['run', test.name], {
        env: { ...process.env, ROOM_SERVER_URL: serverUrl },
      })
    }
  } finally {
    await stopServer(serverProcess)
  }
}

try {
  await main()
  console.log('\n[verify] All checks passed.')
} catch (error) {
  console.error(`\n[verify] ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
}
