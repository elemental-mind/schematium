# Schematium

> Type-safe schema & templating library for TypeScript — define, validate, and
> parse structured configurations with a fluent API.

Schematium lets you describe the shape of structured data (configs, CLI args,
JSON payloads, environment inputs…) once, and then validate and parse values
against that shape with full type inference. The library targets TypeScript only
— every template you build flows its concrete value type back into your code.

See this example:

```ts
schema({
    name: string("anonymous"),
    age: number().required.accepts((n) => n >= 0),
    role: oneOf("admin", "user"),
    variadicMember: valueOf(string, number, boolean).optional,
    permissions: listOf({
        domain: string(),
        granted: arrayOf(oneOf("read", "write", "delete")),
    }).withDefault({}),
}).validate(
    { age: 35, role: "admin" }, // → true
);
```

## Why Schematium?

- **End-to-end type safety** — `schema({...})` produces a value type you can use
  in function signatures, with optional vs. required fields tracked
  automatically.
- **Fluent, declarative API** — chain `.required`, `.optional`, `.accepts(...)`,
  `.withDefault(...)` to express constraints in the order you read them.
- **Zero dependencies** at runtime.
- **Extensible** — bring your own base class / decorator chain via
  `GenerateTemplatingAPI(BaseClass)`.

## Quick start

### Installation

```text
npm install schematium
```

Requires Node.js ≥ 22.6.0 and TypeScript. Ships as ESM with bundled `.d.ts`
files.

### Usage

Pick what you need from the default entry point:

```ts
import {
    schema,                         // the main validation/parsing API function
    boolean, number, string, object // primitives
    array, arrayOf, list, listOf,   // collections
    oneOf, valueOf                  // variadics
} from "schematium";

//You can define subtemplates and use them seamlessly
const SubTemplate = {
    title: string(),
    content: string(),
};

const UserConfig = schema({
    name: string("anonymous"),                   // optional (has default)
    age: number().accepts((n) => n >= 0),        // required
    role: oneOf("admin", "user"),                // required
    tags: arrayOf(string).withDefault([]),       // optional (has default)
    posts: listOf(SubTemplate).withDefault({}),  // optional (has default)
});

UserConfig.validate({
    name: "Ada",
    age: 36,
    role: "admin",
    tags: ["founder"],
}); // → true

UserConfig.validate({ 
    age: 36,
}); // → false (missing `role`)

// Create a normalized object
const userInput = {
    age: 40,
    role: "user"
}

const newUserWithDefaults = Object.assign(UserConfig.default, userInput);
```

## API overview

### Primitives

| Function           | Description                     |
| ------------------ | ------------------------------- |
| `string()`         | required `string`               |
| `string(default)`  | optional `string` with default  |
| `number()`         | required `number`               |
| `number(default)`  | optional `number` with default  |
| `boolean()`        | required `boolean`              |
| `boolean(default)` | optional `boolean` with default |
| `object({...})`    | required nested object template |

### Variadics

| Function            | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `valueOf(...types)` | accepts any of the listed primitive types (string/number/boolean/...) |
| `oneOf(...values)`  | accepts any of the listed literal values                              |

### Collections

| Function              | Description                                                                  |
| --------------------- | ---------------------------------------------------------------------------- |
| `array(defaultArray)` | optional `T[]` whose element type is inferred from the example               |
| `arrayOf(...types)`   | required array of the listed element types                                   |
| `list(defaultObject)` | optional `Record<string, T>` whose element type is inferred from the example |
| `listOf(...types)`    | required dictionary of the listed element types                              |

### Modifiers

Every value template supports these chainable modifiers:

- `.required` — mark as required (overrides optionality from a default).
- `.optional` — mark as optional (overrides a prior `.required`).
- `.accepts((value) => boolean)` — install a custom validator.
- `.withDefault(value)` — set a default value and implicitly make it optional.
- `.acceptsEntries((value) => boolean)` — for collections, validate each entry.

## Type inference

Templates are objects, not generic factories. Schematium's trick is that every
chain call returns a strongly-typed `DefinitionAPI` whose `validate` and
`parseString` signatures reflect the concrete value type:

```ts
const tpl = number(123).required.accepts((n) => n < 256);
// tpl: ValueDefinitionAPI<number> & Required
```

For `schema({...})` the resulting template implements
`ValueTemplateAPI<Concrete<T>>` where `Concrete<T>` is a structural type
mirroring your template — `T | undefined` for optional entries,
`Exclude<V, undefined>` for required entries.

```ts
const Sample = schema({
    id: string(),
    count: number(0),
});

function render(input: Parameters<typeof Sample.validate>[0]) {/* ... */}
```

## Validation vs. parsing

- `template.validate(value)` — accepts a typed JS value, returns `boolean`.
- `template.parseString(text)` — accepts a raw string, returns the parsed value
  (or throws).

`parseString` is particularly useful for CLI arguments and environment
variables, which always arrive as strings. `valueOf(number, string)`
automatically tries `number` first (parse-priority 0), then `boolean` (priority
1), then `string` (priority 2) — so `"42"` becomes `42` and `"hello"` stays
`"hello"` regardless of the order you pass the types.

## Examples

### Validating a nested config

```ts
const Config = schema({
    server: {
        host: string("localhost"),
        port: number(8080).required.accepts((p) => p > 0 && p < 65536),
        tls: boolean(false),
    },
    features: arrayOf(string).withDefault([]),
});

Config.validate({
    server: { port: 9000, tls: true },
    features: ["auth", "logging"],
}); // → true
```

### Parsing CLI args

```ts
import { oneOf, valueOf } from "schematium";

const Mode = oneOf("dev", "prod");
const Port = valueOf(number);

Mode.parseString(process.argv[2]); // "dev" | "prod"
Port.parseString(process.argv[3]); // number
```

### Lists with arbitrary keys

`list`/`listOf` describe dictionaries (`Record<string, T>`). Keys are not
constrained by the schema — only the value type is. Use
`acceptsEntries((key, value) => ...)` to add per-entry rules.

```ts
const Profiles = listOf(string)
    .withDefault({})
    .acceptsEntries((key, value) => key.length > 0);

Profiles.validate({ alice: "admin", bob: "user" }); // → true
```

## Extending the API

Need a custom fluent chain, decorator, or to integrate with a framework-specific
base class? Use `GenerateTemplatingAPI`:

```ts
import { GenerateTemplatingAPI } from "schematium/extensible";

class CustomBase {}

const custom = GenerateTemplatingAPI(CustomBase);
// custom.templating.schema, custom.primitives.string, etc.
```

The `extensible` entry point also re-exports the `DefinitionAPI` interfaces
(`ValueTemplateAPI`, `OptionalityDefinitionAPI`, `ValueDefinitionAPI`,
`CollectionDefinitionAPI`, `TypedCollectionDefinitionAPI`, `TemplateObject`,
`ValueConfiguration`, `EntryValidationClosure`, `TemplatingAPI`, `ValueType`) so
you can build your own templates.

## Requirements

- **Node.js** ≥ 22.6.0
- **TypeScript** (uses `tsc`; ships `.d.ts` files in `distribution/`)
- ESM only (`"type": "module"`)

## Scripts

```bash
npm run build         # compile sources to distribution/
npm test              # run unitium-tsx test suite
npm run version:patch # bump patch version
npm run publish:npm   # git push --follow-tags && build && npm publish
```

## Project layout

```text
source/
  templating.ts              # core templating engine + fluent API
  schematium.ts              # default public entry point
  schematium-extensible.ts   # GenerateTemplatingAPI + type exports
  *.spec.ts                  # unitium tests
distribution/                # compiled JS + .d.ts (published)
build.js                     # build script
```

## License

MIT
