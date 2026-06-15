/**
 * config — loads the on-disk config file and resolves values
 * with the right precedence (CLI flag > config file > env).
 *
 * The default config path is `./webium.config.json` and can be
 * overridden via the `--config` flag.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import
  {
    SEARCH_PROVIDERS,
    type SearchProvider,
  } from "./constants/search.ts";

// ---------- Raw config types ----------

export interface SearchConfig
{
  provider?: SearchProvider;
  maxResults?: number;
}

export interface FetchConfig
{
  stealth?: boolean;
}

export interface AppConfig
{
  apiKey?: string;
  search?: SearchConfig;
  fetch?: FetchConfig;
}

// ---------- Config class ----------

/**
 * Holds the resolved app config and provides typed accessors that
 * apply the CLI > file > default precedence chain.
 */
export class Config
{
  readonly apiKey: string | undefined;
  readonly search: SearchConfig;
  readonly fetch: FetchConfig;

  private constructor(app: AppConfig)
  {
    this.apiKey =
      typeof app.apiKey === "string" && app.apiKey.length > 0
        ? app.apiKey
        : undefined;
    this.search = app.search ?? {};
    this.fetch = app.fetch ?? {};
  }

  /** Load a config from `configPath` (or `./webium.config.json` if omitted). */
  static load(configPath?: string): Config
  {
    const candidates = [configPath, "webium.config.json"].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    );
    for (const p of candidates)
    {
      const abs = resolvePath(p);
      if (existsSync(abs))
      {
        try
        {
          const raw = readFileSync(abs, "utf-8");
          const parsed = JSON.parse(raw) as AppConfig;
          return new Config(parsed ?? {});
        } catch (err)
        {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to read config file ${abs}: ${msg}`);
        }
      }
    }
    return new Config({});
  }

  /** Create an empty config (no file loaded). */
  static empty(): Config
  {
    return new Config({});
  }

  /** Resolve the API key: CLI flag > config file > WEBIUM_API_KEY > NANOGPT_API_KEY. */
  resolveApiKey(cliKey: string | undefined): string
  {
    return (
      (typeof cliKey === "string" && cliKey.length > 0 ? cliKey : "") ||
      this.apiKey ||
      process.env.WEBIUM_API_KEY ||
      process.env.NANOGPT_API_KEY ||
      ""
    );
  }

  /** Resolve the search provider, validating against the known list. */
  resolveSearchProvider(flagValue: string | undefined): SearchProvider
  {
    const v = flagValue ?? this.search.provider ?? DEFAULT_SEARCH_PROVIDER;
    if (!(SEARCH_PROVIDERS as readonly string[]).includes(v))
    {
      throw new Error(
        `Invalid --provider "${v}". Allowed: ${SEARCH_PROVIDERS.join(", ")}`,
      );
    }
    return v as SearchProvider;
  }

  /** Resolve the search depth, validating against the known list. */
  resolveSearchDepth(flagValue: string | undefined): SearchDepth
  {
    const v = flagValue ?? this.search.depth ?? DEFAULT_SEARCH_DEPTH;
    if (!(SEARCH_DEPTHS as readonly string[]).includes(v))
    {
      throw new Error(
        `Invalid --depth "${v}". Allowed: ${SEARCH_DEPTHS.join(", ")}`,
      );
    }
    return v as SearchDepth;
  }

  /** Resolve the maximum result count, enforcing a positive integer. */
  resolveMaxResults(flagValue: number | undefined): number
  {
    const n = typeof flagValue === "number" ? flagValue : this.search.maxResults ?? DEFAULT_SEARCH_RESULT_COUNT;
    if (!Number.isInteger(n) || n < 1)
    {
      throw new Error(`--max-results must be a positive integer, got: ${n}`);
    }
    return n;
  }

  /** Resolve the stealth flag (CLI > config > false). */
  resolveStealth(flagValue: boolean | undefined): boolean
  {
    if (typeof flagValue === "boolean") return flagValue;
    return this.fetch.stealth ?? false;
  }
}
