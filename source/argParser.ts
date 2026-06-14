/**
 * cli — minimal argument parser for the webium CLI.
 *
 * The parser is intentionally dependency-free and command-agnostic:
 * it just splits argv into a `command` (first positional), a list of
 * remaining positionals, and a flag bag. Help text lives in
 * `./constants/help.ts` and is re-exported from here for convenience.
 */

export { HELPTEXT_GLOBAL as GLOBAL_HELP } from "./constants/help.ts";

// ---------- Types ----------

export interface ParsedArgs {
  /** First positional argument (e.g. "search", "fetch", "help") or null. */
  command: string | null;
  /** All positionals after the command. */
  positional: string[];
  /** Parsed flags keyed by their canonical (long) name. */
  flags: Record<string, string | boolean | number>;
}

// ---------- Minimal arg parser ----------

/**
 * Parse a list of CLI arguments into a `ParsedArgs` structure.
 *
 * Supports:
 *   --flag value      long flag with separate value
 *   --flag=value      long flag with inline value
 *   -x value          short flag with separate value
 *   --bool            boolean flag (sets value to true)
 *   --no-bool         alias to set boolean flag to false (only for known bools)
 *
 * Unknown long flags are passed through as strings (or `true` if no value
 * is given) for forward compatibility.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean | number> = {};
  const positional: string[] = [];
  let command: string | null = null;

  const knownBoolFlags = new Set(["stealth", "no-stealth", "help", "h"]);
  const knownStringFlags = new Set([
    "api-key",
    "k",
    "config",
    "c",
    "provider",
    "p",
    "depth",
    "d",
  ]);
  const knownNumberFlags = new Set(["max-results", "n"]);

  const aliases: Record<string, string> = {
    k: "api-key",
    c: "config",
    p: "provider",
    d: "depth",
    n: "max-results",
    h: "help",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === "--help" || arg === "-h") {
      flags["help"] = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      let name: string;
      let inlineValue: string | undefined;
      if (eqIdx !== -1) {
        name = arg.slice(2, eqIdx);
        inlineValue = arg.slice(eqIdx + 1);
      } else {
        name = arg.slice(2);
      }
      const canonical = aliases[name] ?? name;

      if (canonical === "help") {
        flags["help"] = true;
        continue;
      }
      if (canonical === "stealth") {
        flags["stealth"] = true;
        continue;
      }
      if (canonical === "no-stealth") {
        flags["stealth"] = false;
        continue;
      }
      if (knownBoolFlags.has(canonical)) {
        flags[canonical] = true;
        continue;
      }
      if (knownNumberFlags.has(canonical)) {
        const value = inlineValue ?? argv[++i];
        const num = Number(value);
        if (!Number.isFinite(num)) {
          throw new Error(`Flag --${canonical} expects a number, got: ${value}`);
        }
        flags[canonical] = num;
        continue;
      }
      if (knownStringFlags.has(canonical)) {
        const value = inlineValue ?? argv[++i];
        if (value === undefined) {
          throw new Error(`Flag --${canonical} expects a value`);
        }
        flags[canonical] = value;
        continue;
      }
      // Unknown long flag — pass it through for forward compat
      const value = inlineValue ?? argv[++i];
      flags[canonical] = value ?? true;
      continue;
    }

    if (arg.startsWith("-") && arg.length > 1) {
      const name = arg.slice(1);
      const canonical = aliases[name] ?? name;
      if (canonical === "help") {
        flags["help"] = true;
        continue;
      }
      if (canonical === "stealth") {
        flags["stealth"] = true;
        continue;
      }
      if (knownBoolFlags.has(canonical)) {
        flags[canonical] = true;
        continue;
      }
      if (knownNumberFlags.has(canonical)) {
        const value = argv[++i];
        const num = Number(value);
        if (!Number.isFinite(num)) {
          throw new Error(`Flag -${name} expects a number, got: ${value}`);
        }
        flags[canonical] = num;
        continue;
      }
      if (knownStringFlags.has(canonical)) {
        const value = argv[++i];
        if (value === undefined) {
          throw new Error(`Flag -${name} expects a value`);
        }
        flags[canonical] = value;
        continue;
      }
      throw new Error(`Unknown flag: ${arg}`);
    }

    // Positional
    if (command === null) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}
