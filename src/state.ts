/** Small durable state document for the host control toggle and session overrides. */

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface SessionProtectionRecord {
  protection: 'off'
  updatedAt: number
}

export interface OffpeakState {
  version: 1
  enabled: boolean
  sessions: Record<string, SessionProtectionRecord>
}

const STATE_VERSION = 1

export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DSH_HOME?.trim()
  return configured ? configured : join(homedir(), '.dsh')
}

export function defaultOffpeakState(): OffpeakState {
  return { version: STATE_VERSION, enabled: true, sessions: {} }
}

function sanitize(value: unknown): OffpeakState {
  if (typeof value !== 'object' || value === null) return defaultOffpeakState()
  const candidate = value as Partial<OffpeakState>
  if (candidate.version !== STATE_VERSION) return defaultOffpeakState()
  const sessions: Record<string, SessionProtectionRecord> = {}
  if (typeof candidate.sessions === 'object' && candidate.sessions !== null) {
    for (const [id, record] of Object.entries(candidate.sessions)) {
      if (id.length > 0 && typeof record === 'object' && record !== null
        && (record as SessionProtectionRecord).protection === 'off'
        && typeof (record as SessionProtectionRecord).updatedAt === 'number') {
        sessions[id] = { protection: 'off', updatedAt: (record as SessionProtectionRecord).updatedAt }
      }
    }
  }
  return {
    version: STATE_VERSION,
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    sessions,
  }
}

/** One atomic JSON document under `$DSH_HOME/offpeak/state.json`. */
export class OffpeakStateStore {
  readonly path: string
  private state: OffpeakState | undefined
  private writeChain: Promise<void> = Promise.resolve()

  constructor(path = join(resolveDshHome(), 'offpeak', 'state.json')) {
    this.path = path
  }

  async load(): Promise<OffpeakState> {
    if (this.state) return this.state
    try {
      this.state = sanitize(JSON.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // A malformed control document must not invent peak authorization.
        this.state = defaultOffpeakState()
      } else {
        this.state = defaultOffpeakState()
      }
    }
    return this.state
  }

  current(): OffpeakState {
    return this.state ?? defaultOffpeakState()
  }

  async update(change: (state: OffpeakState) => OffpeakState): Promise<OffpeakState> {
    const current = await this.load()
    const next = sanitize(change(structuredClone(current)))
    this.state = next
    this.writeChain = this.writeChain.then(() => this.write(next)).catch(error => {
      // Keep the in-memory decision authoritative for this process but surface
      // the durability failure to the caller that requested the change.
      throw error
    })
    await this.writeChain
    return next
  }

  private async write(state: OffpeakState): Promise<void> {
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    await chmod(temporary, 0o600)
    await rename(temporary, this.path)
  }

  async flush(): Promise<void> {
    await this.writeChain
  }
}
