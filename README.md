# Schematium

Type-safe schema & templating library for TypeScript — define, validate, and
parse structured configurations with a fluent API.

> Think of it as a simpler, lighter (sub 1.5KB minizipped) alternative to Zod -
> and one that's easier to extend.

Schematium lets you describe the shape of structured data (configs, CLI args,
JSON payloads, environment inputs…) once, and then validate and parse values
against that shape with full type inference.

See this example:

```ts
const template = schema({
  name: string("anonymous"), // optional, due to default value "anonymous"
  age: number().accepts((n) => n >= 0), // required, as no default provided
  role: oneOf("admin", "user"),
  variadicMember: valueOf(string, number, boolean).optional,
  permissions: recordOf({
    domain: string(),
    granted: arrayOf("read", "write", "delete"),
  }).withDefault({}),
});

template.check(
  { age: 35, role: "admin" }, // → true (type guard)
);

template.validate(
  { age: 35, role: "admin" },
  { mode: "thorough" }, // → ValidationResult with detailed issues
);
```

## Why Schematium?

- **End-to-end type safety** — `schema({...})` produces a value type you can use
  in function signatures, with optional vs. required fields tracked
  automatically.
- **Fluent, declarative API** — chain `.required`, `.optional`, `.accepts(...)`,
  `.withDefault(...)` to express constraints in the order you read them.
- **Fast by default** — validation short-circuits on the first failure for hot
  paths, but you can switch into a mode that collects every issue with
  path-traced `ValidationIssue`s using `{ mode: "thorough" }`.
- **Zero dependencies** at runtime.
- **Extensible** — bring your own base class / decorator chain via
  `generateSchemaDefinitionAPI(BaseClass)`.

## Quick start

### Installation

```text
npm install schematium
```

### Usage

```ts
//Pick what you need from the default entry point:
import {
  array,
  arrayOf,
  boolean,
  number,
  object, // primitives
  oneOf,
  record,
  recordOf, // collections
  schema, // the main validation/parsing API function
  string,
  valueOf, // variadics
} from "schematium";

//You can define sub templates
const PostTemplate = {
  title: string(),
  content: string(),
};

const UserConfig = schema({
  name: string("anonymous"), // optional (has default)
  age: number().accepts((n) => n >= 0), // required
  role: oneOf("admin", "user"), // required
  tags: arrayOf(string).withDefault([]), // optional (has default)
  posts: recordOf(PostTemplate).withDefault({}), // optional (has default)
});

UserConfig.check({
  name: "Ada",
  age: 36,
  role: "admin",
  tags: ["founder"],
}); // → true

UserConfig.check({
  age: 36,
}); // → false (missing `role`)

// Detailed result with every issue path-traced:
UserConfig.validate(
  { age: 36 },
  { mode: "thorough" },
); // → ValidationResult { success: false, issues: [...] }

// Recursively merge a partial input with schema defaults:
const userInput = {
  age: 40,
  role: "user",
} as const;

const newUserWithDefaults = UserConfig.patchOrOverride({}, userInput);
```

## Concepts

### Definition API vs. Schema API

Every template in Schematium is backed by a single class, which exposes **two
complementary interfaces**:

- **Definition API** — the fluent, chainable surface you use while
  _constructing_ a template (`string()`, `number().required`,
  `arrayOf(...).withDefault([])`, `accepts(...)`, etc.). It lives on the value
  returned by the primitive, variadic, and collection factory functions.
- **Schema API** — the operational surface you use while _consuming_ a template
  (`.check(value)`, `.validate(value, settings)`,
  `.parseString(text, settings)`, `.getDefault()`). It is only exposed once an
  entire object schema is wrapped by `schema(...)`.

### Type References & Inference

In the definition API you have two distinct factory types to define your schema:

- **Value factories** — They take default values and infer the resulting type
  from them. E.g. `array([1, 2, 3])` infers to be an `Array<number>` from the
  given default value. `record({ alice: "admin" })` infers a
  `Record<string, string>` and uses teh given value as a default. Empty default
  values/examples such as `array([])` and `record({})` cannot infer an element
  type.
- **Type-array factories** — They take other template factories as type
  descriptors and have no value to fall back on — `valueOf(number, string)`,
  `arrayOf(number, string)`, `recordOf(number, string)`. Note that we only pass
  the functions, _we do not invoke the factories_. These are always required; if
  you want a default you have to call `.withDefault(...)` explicitly.

### Understanding Defaults

Schematium lets you manage defaults for incomplete configuration/data.
`template.getDefault()` returns the default tree, or `undefined` when the
template has no defaults. Use `template.patchOrOverride(base, patch)` to
validate a partial patch and recursively merge it into a base value; missing
members are filled from schema defaults where available.

- **Defaults are cloned on read.** `getDefault()` runs the stored default
  through `structuredClone` before returning it by default. If you'd like to
  return a shared default value, specify `false` as a second parameter to
  `withDefault()`.
- **You can share default values by reference.** Despite the standard being a
  structured clone, when you supply `.withDefault(/* default value */, false)`
  in the definition phase, Schematium will always inject a reference to this
  passed default in the tree produced by `.getDefault()`, instead of a clone.
- **Objects synthesize member defaults.** When `object({...})` or
  `schema({...})` has members with defaults, `.getDefault()` assembles a fresh
  object containing those members. An explicit `.withDefault({...})`
  defines/overrides that synthesized value.

### Understanding Optionality

- **Types without defaults are required.** Schematium distinguishes between two
  kinds of factory functions.
- **Defaults imply optionality.** Passing a value to a primitive factory
  (`string("anonymous")`), supplying a non-empty collection example, or calling
  `.withDefault(...)` marks a value optional _and_ adds the given value as a
  default. For an empty collection default, use
  `arrayOf(string).withDefault([])` or `recordOf(string).withDefault({})` in
  order to define the type that can not be inferred from empty default values.
- **`.required` and `.optional` override schematium's inferred optionality.**
  The modifiers apply last-wins.
- **At runtime, object optionality follows its members.** An object is optional
  only when _every immediate member_ is optional. The `object({...})` factory is
  typed as required by default; use `.required` or `.optional` explicitly when
  its inferred containing-object optionality must match that runtime choice.

## Validation

Schematium exposes three runtime entry points on every `schema(...)` template:

| Method                                  | Returns                           | Use when                                                           |
| --------------------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `template.check(value, tolerances?)`    | `value is T` (boolean type guard) | You want a fast boolean decision                                   |
| `template.validate(value, settings?)`   | `ValidationResult`                | You want every issue, with path traces, using `{mode: "thorough"}` |
| `template.parseString(text, settings?)` | `ParseResult<T>`                  | Input arrives as a raw string                                      |

### Validation modes

`ValidationSettings` lets you switch between two modes:

- `"fastNoIssueReport"` _(default)_ — short-circuits on the first failure.
  `validate()` returns a result that only signals success/failure; no individual
  issues are collected.
- `"thorough"` — keeps validating after the first failure. `validate()` and
  `parseString()` return a `RejectionResult` whose `issues` array contains one
  `ValidationIssue` per failure, each with `path`, `message`, and a `kind`
  derived from the issue class.

### Validation tolerances

`ValidationTolerances` are accepted by every method (and form the base of
`ValidationSettings`):

- `allowPartial` — accept objects that don't have all the keys declared in the
  schema; only the types of the keys that _are_ present are checked. Defaults to
  `false`.
- `allowUnknowns` — accept objects that have additional keys not declared in the
  schema. Defaults to `false`.

### Custom validators with issue reporting

`accepts(...)` and `acceptsEntries(...)` accept either a `(value) => boolean`
predicate or a `(value, validator) => void` callback. The callback form gives
you a `ValidationAPI` you can call
`validator.rejectWith(ValidationIssue,
message)` on to attach a custom issue to
the result — which is only useful in `"thorough"` mode, since
`"fastNoIssueReport"` discards issue detail.

**Important:** Inside these callbacks, **do not throw exceptions** to
communicate validation failures. Throwing will abort validation entirely and
bubble out of `template.validate(...)` / `template.parseString(...)`, bypassing
the result-based contract. Instead, signal failures by calling
`validator.rejectWith(ValidationIssue, "message")` on the provided context —
this keeps the failure inside the validation pipeline and lets the caller handle
it as a normal `RejectionResult`:

```ts
const Port = number().accepts((value, validator) => {
  if (!(value > 0 && value < 65536)) {
    validator.rejectWith(ValidationIssue, "Port out of range");
  }
});
```

If you only need a yes/no decision and don't care about issue detail, prefer the
boolean-returning form (`accepts((value) => true | false)`), which keeps your
callback simple and works in both validation modes.

## Interfaces

### Definition API

Every value template supports these chainable modifiers:

- `.required` — mark as required (overrides optionality from a default).
- `.optional` — mark as optional (overrides a prior `.required`).
- `.accepts((value) => boolean)` — install a custom validator (boolean form).
- `.accepts((value, validator) => void)` — install a validator that can emit
  `ValidationIssue`s via the `ValidationAPI` callback.
- `.withDefault(value, cloneOnAssign?)` — set a default value and implicitly
  make it optional.
- `.acceptsEntries((key, value) => boolean)` — for collections, validate each
  entry (boolean form).
- `.acceptsEntries((key, value, validator) => void)` — entry-level validator
  with issue reporting.

### Schema API

- `template.check(value, tolerances?)` — type-guard; returns `value is T`.
- `template.validate(value, settings?)` — returns `ValidationResult`
  (`ValidationSuccessResult` or `RejectionResult`).
- `template.parseString(text, settings?)` — returns `ParseResult<T>`
  (`ParseSuccessResult<T>` or `RejectionResult`).
- `template.getDefault()` — returns the default tree (cloned by default), or
  `undefined` when no default exists.
- `template.patchOrOverride(base, patch)` — validates a partial patch and
  recursively merges it into `base`, using schema defaults for missing members.

`parseString` is particularly useful for CLI arguments and environment
variables, which always arrive as strings. Variadic alternatives are tried by
their built-in parsing priority, not the order passed to `valueOf(...)`:
`number` first, then `boolean`, then JSON-parsed arrays/records, then strings.
Thus `valueOf(string, number)` parses `"42"` as `42`, while `"hello"` remains a
string.

## Types overview

### Primitives

| Function           | Description                                            |
| ------------------ | ------------------------------------------------------ |
| `string()`         | required `string`                                      |
| `string(default)`  | optional `string` with default                         |
| `number()`         | required `number`                                      |
| `number(default)`  | optional `number` with default                         |
| `boolean()`        | required `boolean`                                     |
| `boolean(default)` | optional `boolean` with default                        |
| `object({...})`    | nested object definition; typed as required by default |

### Literals

String and number values can be used directly as exact-value constraints where a
type descriptor would be expected, like in schemas and type-based collections:

```ts
const TypedSchema = schema({
  kind: string(),
  version: number(),
});

const AllLiteralsSchema = schema({
  kind: "created",
  version: 1,
}); //only accepts {kind: "created", version: 1}

const StringArray = arrayOf(string);
const LiteralArray = arrayOf("read", "write", "delete"); //equivalent to
```

### Variadics

| Function            | Description                              |
| ------------------- | ---------------------------------------- |
| `valueOf(...types)` | accepts any of the listed types          |
| `oneOf(...values)`  | accepts any of the listed literal values |

### Collections

| Function                        | Description                                                           |
| ------------------------------- | --------------------------------------------------------------------- |
| `array(defaultArray, clone?)`   | optional `T[]` inferred from a non-empty example array                |
| `arrayOf(...types)`             | required array of the listed element types                            |
| `record(defaultObject, clone?)` | optional `Record<string, T>` inferred from a non-empty example object |
| `recordOf(...types)`            | required dictionary of the listed element types                       |

> `record`/`recordOf` describe dictionaries (`Record<string, T>`). Keys are not
> constrained by the schema — only the value type is. Use
> `.acceptsEntries((key, value) => ...)` to add per-entry rules.

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

Config.check({
  server: { port: 9000, tls: true },
  features: ["auth", "logging"],
}); // → true
```

### Collecting every validation issue

```ts
const result = Config.validate(
  { server: { port: 9000, tls: "yes" }, features: "nope" },
  { mode: "thorough", allowUnknowns: true },
);

if (!result.success) {
  for (const issue of result.issues) {
    console.log(issue.kind, issue.path, issue.message);
  }
}
```

### Parsing JSON input

```ts
import { number, oneOf, schema, valueOf } from "schematium";

const CliArguments = schema({
  mode: oneOf("dev", "prod"),
  port: number(),
});

CliArguments.parseString('{"mode":"dev","port":3000}');
// { success: true, value: { mode: "dev", port: 3000 } }
```

### Records with arbitrary keys

```ts
const ProfilesConfig = schema({
  profiles: recordOf(string)
    .withDefault({})
    .acceptsEntries((key, value) => typeof key === "string" && key.length > 0),
});

ProfilesConfig.check({ profiles: { alice: "admin", bob: "user" } }); // → true
```

## Extending the API

`schematium` ships a default API instance, but you can create a separate,
customized API with `generateSchemaDefinitionAPI(BaseClass?)`. The extension
entry point is `schematium/extensible`:

```ts
// Value imports
import {
  generateSchemaDefinitionAPI, // Customized API surface generator
  ValidationIssue, // issue class (for typed rejectWith)
} from "schematium/extensible";

// Type-only imports
import type {
  CollectionDefinitionAPI, // fluent API for arrays and records
  DefinitionAPI, // shape/type of a fluent definition chain
  SchemaAPI, // shape/type of a fully-built schema(...)
  ValidationAPI, // shape of the validator callback API
  ValidationResult, // success / rejection union
  ValidationSettings, // per-call settings (tolerances + mode)
  ValidationTolerances, // per-call tolerance settings
  ValueType, // extract the value type from a definition
} from "schematium/extensible";
```

`generateSchemaDefinitionAPI` is parameterized over five extension slots:

```ts
generateSchemaDefinitionAPI<
  GeneralExt = {}, // mixed into every template class
  SchemaExt = {}, // mixed into the Schema API returned by schema(...)
  PrimitiveExt = {}, // mixed into string/number/boolean/object definitions
  VariadicExt = {}, // mixed into valueOf/oneOf definitions
  CollectionExt = {} // mixed into record/array definitions
>;
```

### Substituting the base class

Pass any class (or class-like constructor) as the first argument. The chosen
base is inserted at the top of every template class hierarchy, so every template
instance will `instanceof` your class and inherit its members.

```ts
class MyBase {
  metadata = "custom-base";
  getBaseInfo() {
    return "base-info";
  }
}

// Use MyBase as GeneralExt so its members are visible on every generated API.
const { schema, string } = generateSchemaDefinitionAPI<MyBase>(MyBase);

const t = schema({
  sample: string("default").required,
});

t.metadata; // "custom-base"
t.getBaseInfo(); // "base-info"
```

If you only need runtime base-class behavior, omit the generic argument. Supply
the base class as `GeneralExt` too when its members should be visible to
TypeScript:

```ts
class TrackingBase {
  calls: string[] = [];
  constructor() {
    this.calls.push("constructor");
  }
}

const { schema, boolean } = generateSchemaDefinitionAPI(TrackingBase);
const runtimeTemplate = schema({ enabled: boolean() });
// runtimeTemplate instanceof TrackingBase
```

### Extending the fluent interfaces

To add new chainable methods, declare a class whose members become part of the
fluent API, then pass it as the appropriate generic slot. The methods can return
`this`, so they compose with the built-in modifiers (`.required`, `.optional`,
`.accepts(...)`, `.withDefault(...)`, `.acceptsEntries(...)`).

```ts
import { generateSchemaDefinitionAPI } from "schematium/extensible";

class Taggable {
  public tagValue?: string;
  tag(tag: string): this {
    this.tagValue = tag;
    return this;
  }
}

// Apply the extension to primitive definitions.
const { schema, number } = generateSchemaDefinitionAPI<{}, {}, Taggable>(
  Taggable,
);

const n = number(42).tag("my-number");
n.tagValue; // "my-number"
schema({ n }).check({ n: 7 }); // built-in schema API is preserved
```

### Writing definition methods that see the value's type

When your extension needs the concrete value type of the template it is attached
to, use the `ValueType<this>` helper. It extracts the inferred value type from
any definition-API surface, including variadics, so the same extension works on
`string()`, `valueOf(number, string)`, etc.

```ts
import {
  generateSchemaDefinitionAPI,
  type ValueType,
} from "schematium/extensible";

class Extension {
  typeDependentClosure(closure: (value: ValueType<this>) => boolean) {
    return this;
  }
}

// Apply the extension to Schema, primitive, variadic, and collection APIs.
const { number, string, valueOf } = generateSchemaDefinitionAPI<
  {},
  Extension,
  Extension,
  Extension,
  Extension
>(Extension);

number(42)
  .typeDependentClosure((value: number) => true); // ok
// .typeDependentClosure((value: boolean) => true);  // type error

valueOf(number, string)
  .typeDependentClosure((value: string | number) => true); // ok
```

This is the recommended way to build reusable helpers (custom validators,
formatters, telemetry tags, etc.) that stay fully type-safe across every kind of
template.

## License

MIT
