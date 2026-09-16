/** @typedef {import('./types.js').ApiKey} ApiKey */
/** @typedef {import('./types.js').KeyRole} KeyRole */

export class ConfigError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Validated service configuration. Build with {@link Config.fromEnv}. */
export class Config {
  static MIN_SECRET_LENGTH = 32;
  static ENV_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

  /** @param {import('./types.js').ConfigValues} v */
  constructor(v) {
    this.port = v.port;
    this.host = v.host;
    this.logLevel = v.logLevel;
    this.trustProxy = v.trustProxy;
    this.tls = v.tls;
    this.bodyLimit = v.bodyLimit;
    this.dbPath = v.dbPath;
    this.apiKeys = v.apiKeys;
    this.environments = v.environments;
    this.rateLimitMax = v.rateLimitMax;
    this.historyRetentionDays = v.historyRetentionDays;
    this.maxValueBytes = v.maxValueBytes;
    Object.freeze(this);
  }

  /**
   * @param {NodeJS.ProcessEnv} [env]
   * @returns {Config}
   */
  static fromEnv(env = process.env) {
    const r = new EnvReader(env);

    const certPath = r.optional('TLS_CERT_PATH');
    const keyPath = r.optional('TLS_KEY_PATH');
    if (Boolean(certPath) !== Boolean(keyPath)) throw new ConfigError('TLS_CERT_PATH and TLS_KEY_PATH must be set together');

    const environments = Config.#parseEnvironments(r.optional('FLAGS_ENVIRONMENTS') || 'dev,staging,prod');

    return new Config({
      port: r.integer('PORT', 3007, { min: 0, max: 65535 }),
      host: r.optional('HOST') || '0.0.0.0',
      logLevel: r.optional('LOG_LEVEL') || 'info',
      trustProxy: r.boolean('TRUST_PROXY', false),
      tls: certPath ? { certPath, keyPath } : null,
      bodyLimit: r.integer('BODY_LIMIT', 65_536, { min: 1_024 }),
      dbPath: r.optional('DB_PATH') || './data/flags.db',
      apiKeys: Config.#parseApiKeys(r.required('FLAGS_API_KEYS'), environments),
      environments,
      rateLimitMax: r.integer('RATE_LIMIT_MAX', 1_200, { min: 1 }),
      historyRetentionDays: r.integer('HISTORY_RETENTION_DAYS', 365, { min: 1 }),
      maxValueBytes: r.integer('MAX_VALUE_BYTES', 16_384, { min: 64 }),
    });
  }

  /** @param {string} raw */
  static #parseEnvironments(raw) {
    const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) throw new ConfigError('FLAGS_ENVIRONMENTS must list at least one environment');
    for (const e of list) if (!Config.ENV_PATTERN.test(e)) throw new ConfigError(`FLAGS_ENVIRONMENTS entry "${e}" must match [a-z][a-z0-9-]{0,31}`);
    if (new Set(list).size !== list.length) throw new ConfigError('FLAGS_ENVIRONMENTS entries must be unique');
    return list;
  }

  /**
   * Parse `id:secret[:role[:env+env]]`. Role defaults to `readwrite`, environments to all.
   * @param {string} raw
   * @param {string[]} environments
   * @returns {ApiKey[]}
   */
  static #parseApiKeys(raw, environments) {
    const keys = raw.split(',').map((s) => s.trim()).filter(Boolean).map((entry) => {
      const parts = entry.split(':');
      if (parts.length < 2 || parts.length > 4) throw new ConfigError(`FLAGS_API_KEYS entry "${entry.slice(0, 8)}…" must be id:secret[:role[:envs]]`);
      const [id, secret, role = 'readwrite', envList = ''] = parts;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new ConfigError(`FLAGS_API_KEYS id "${id}" must match [A-Za-z0-9_-]{1,64}`);
      if (secret.length < Config.MIN_SECRET_LENGTH) throw new ConfigError(`FLAGS_API_KEYS secret for "${id}" must be at least ${Config.MIN_SECRET_LENGTH} characters`);
      if (role !== 'read' && role !== 'write' && role !== 'readwrite') throw new ConfigError(`FLAGS_API_KEYS role for "${id}" must be read, write or readwrite`);
      let envs = null;
      if (envList) {
        envs = envList.split('+').map((s) => s.trim()).filter(Boolean);
        for (const e of envs) if (!environments.includes(e)) throw new ConfigError(`FLAGS_API_KEYS key "${id}" names unknown environment "${e}"`);
      }
      return { id, secret, role: /** @type {KeyRole} */ (role), envs };
    });
    if (keys.length === 0) throw new ConfigError('FLAGS_API_KEYS must contain at least one key');
    if (new Set(keys.map((k) => k.id)).size !== keys.length) throw new ConfigError('FLAGS_API_KEYS ids must be unique');
    if (new Set(keys.map((k) => k.secret)).size !== keys.length) throw new ConfigError('FLAGS_API_KEYS secrets must be unique');
    return keys;
  }
}

/** Typed accessors over a raw environment map. */
class EnvReader {
  /** @param {NodeJS.ProcessEnv} env */
  constructor(env) {
    this.env = env;
  }

  /** @param {string} name */
  optional(name) {
    return this.env[name]?.trim() ?? '';
  }

  /** @param {string} name */
  required(name) {
    const v = this.optional(name);
    if (v === '') throw new ConfigError(`${name} is required`);
    return v;
  }

  /**
   * @param {string} name
   * @param {number} fallback
   * @param {{ min?: number, max?: number }} [range]
   */
  integer(name, fallback, range = {}) {
    const raw = this.optional(name);
    if (raw === '') return fallback;
    if (!/^-?\d+$/.test(raw)) throw new ConfigError(`${name} must be an integer, got "${raw}"`);
    const n = Number(raw);
    if (range.min !== undefined && n < range.min) throw new ConfigError(`${name} must be >= ${range.min}`);
    if (range.max !== undefined && n > range.max) throw new ConfigError(`${name} must be <= ${range.max}`);
    return n;
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  boolean(name, fallback) {
    const raw = this.optional(name);
    if (raw === '') return fallback;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    throw new ConfigError(`${name} must be true or false, got "${raw}"`);
  }
}
