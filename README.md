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
    permissions: listOf({
        domain: string(),
        granted: arrayOf(oneOf("read", "write", "delete")),
    }).withDefault({}),
});

template.validate(
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

### Usage

```ts
//Pick what you need from the default entry point:
import {
    schema,                         // the main validation/parsing API function
    boolean, number, string, object // primitives
    array, arrayOf, list, listOf,   // collections
    oneOf, valueOf                  // variadics
} from "schematium";

//You can define sub templates
const PostTemplate = {
    title: string(),
    content: string(),
};

const UserConfig = schema({
    name: string("anonymous"),                   // optional (has default)
    age: number().accepts((n) => n >= 0),        // required
    role: oneOf("admin", "user"),                // required
    tags: arrayOf(string).withDefault([]),       // optional (has default)
    posts: listOf(PostTemplate).withDefault({}),  // optional (has default)
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

## Concepts

### Definition API vs. Template API

Every template in Schematium is backed by a single class, which exposes **two
complementary interfaces**:

- **Definition API** — the fluent, chainable surface you use while
  _constructing_ a template (`string()`, `number().required`,
  `arrayOf(...).withDefault([])`, `accepts(...)`, etc.). It lives on the value
  returned by the primitive, variadic, and collection factory functions.
- **Template API** — the operational surface you use while _consuming_ a
  template (`.validate(value)`, `.parseString(text)`, `.getDefault()`). It is
  only exposed once an entire object schema is wrapped by `schema(...)`.

### Type References & Inference

In the definition API you have two distinct factory types to define your schema:

- **Value-array factories** — They take default values and infer the resulting
  type from them — `oneOf("admin", "user")`, `array([1, 2, 3])`,
  `list({ alice: "admin" })`.
- **Type-array factories** — They take other template factories as type descriptors and
  have no value to fall back on — `valueOf(number, string)`,
  `arrayOf(number, string)`, `listOf(number, string)`. Note that we only pass
  the functions, _we do not invoke the factories_. These are always required; if
  you want a default you have to call `.withDefault(...)` explicitly.

### Understanding Defaults

Schematium let's you manage defaults. This is handy in case you get incomplete
configuration/data and want to patch it with defaults. `template.getDefault()`
produces an object containing all the paths that you have defined defaults for.

In combination with `Object.assign` you can use it to patch incoming incomplete
objects. Because `Object.assign` would change the underlying defaults,
Schematium always returns a _fresh clone of the defaults_ when you call
`template.getDefault()`.

- **Defaults are cloned on read.** `getDefault()` runs the stored default
  through `structuredClone` before returning it by default. If you'd like to
  return a shared default value, specify `false` as a second parameter to
  `withDefault()`
- **You can share default values by reference.** Despite the standard being a
  structured clone, when you supply `.withDefault(/* default value*/, false)` in
  the definition phase, Schematium will always inject a reference to this passed
  default in the tree produced by `.getDefault()`, instead of a clone.
- **Objects have implicit defaults.** when `object` or `schema` are used and no
  `.withDefault` defines a default value, `.getDefault()` assembles a fresh
  object from all member defaults on every call. An explicit
  `.withDefault({/* object */})` overrides that synthesis and pins the object
  reference.

### Understanding Optionality

- **Types without defaults are required.** Schematium distinguishes between two
  kinds of factory functions:
- **Defaults imply optionality.** Passing a value to a primitive factory
  (`string("anonymous")`) or to a collection factory (`array([])`, `list({})`)
  or calling `.withDefault(...)` marks a value optional _and_ adds a default.
- **`.required` and `.optional`override schematium's inferred optionality.** The
  modifiers apply last-wins.
- **Objects with all optional members are inferred as optional.**
  `schema({...})` considers an object template optional only when _every_ member
  is optional. The moment one member is required, the whole object becomes
  required too — so forgetting `.required` on a single nested field quietly
  turns the entire parent into an optional one.

## Interfaces

### Definition API

Every value template supports these chainable modifiers:

- `.required` — mark as required (overrides optionality from a default).
- `.optional` — mark as optional (overrides a prior `.required`).
- `.accepts((value) => boolean)` — install a custom validator.
- `.withDefault(value)` — set a default value and implicitly make it optional.
- `.acceptsEntries((value) => boolean)` — for collections, validate each entry.

### Template API

- `template.validate(value)` — accepts a typed JS value, returns `boolean`.
- `template.parseString(text)` — accepts a raw string, returns the parsed value
  (or throws).

`parseString` is particularly useful for CLI arguments and environment
variables, which always arrive as strings. `valueOf(number, string)`
automatically tries `number` first (parse-priority 0), then `boolean` (priority
1), then `string` (priority 2) — so `"42"` becomes `42` and `"hello"` stays
`"hello"` regardless of the order you pass the types.

## Types overview

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

| Function            | Description                              |
| ------------------- | ---------------------------------------- |
| `valueOf(...types)` | accepts any of the listed types          |
| `oneOf(...values)`  | accepts any of the listed literal values |

### Collections

| Function              | Description                                                                  |
| --------------------- | ---------------------------------------------------------------------------- |
| `array(defaultArray)` | optional `T[]` whose element type is inferred from the example               |
| `arrayOf(...types)`   | required array of the listed element types                                   |
| `list(defaultObject)` | optional `Record<string, T>` whose element type is inferred from the example |
| `listOf(...types)`    | required dictionary of the listed element types                              |

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
Port.parseString(process.argv[3]); // number even though process.argv is string[]
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

`schematium` ships a default API instance, but the entire class hierarchy is
generated by a factory — `GenerateTemplatingAPI(BaseClass?)` — so you can
substitute your own base class and/or extend the fluent interfaces with your own
methods. The extension entry point lives in `schematium-extensible`:

```text
import {
    GenerateTemplatingAPI,           // Customized API surface generator
    type TemplatingAPI,              // shape/type of the generated API
    type ValueType,                  // extract the value type from a definition
} from "schematium/extensible";
```

`TemplatingAPI` is parameterized over four slots:

```ts
TemplatingAPI<
    TemplateExt, // mixed into the *Template API* of schema(...)
    PrimitiveExt, // mixed into the *Definition API* of string/number/boolean/object(...)
    VariadicExt, // mixed into the *Definition API* valueOf/oneOf(...)
    CollectionExt // mixed into the *Definition API* list/listOf/array/arrayOf(...)
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

//Here we supply MyBase type as the generic for TemplateExt, so MyBase members are available on the Templating API
const api = GenerateTemplatingAPI<TemplatingAPI<MyBase>>(MyBase);

const t = api.templating.schema({
    sample: api.primitives.string("default").required,
});

t.metadata; // "custom-base"
t.getBaseInfo(); // "base-info"
```

If you only need a base class and want the default fluent shape, omit the
generic argument:

```ts
class TrackingBase {
    calls: string[] = [];
    constructor() {
        this.calls.push("constructor");
    }
}

//Note that this Extension will neither be visible in the Definition API nor the Templating API
const api = GenerateTemplatingAPI(TrackingBase);
```

### Extending the fluent interfaces

To add new chainable methods, declare a plain class whose members become part of
the fluent API, then pass it as the appropriate `TemplatingAPI` slot. The
methods automatically return `this`, so they compose with the built-in modifiers
(`.required`, `.optional`, `.accepts(...)`, `.withDefault(...)`,
`.acceptsEntries(...)`).

```ts
import {
    GenerateTemplatingAPI,
    type TemplatingAPI,
} from "schematium/extensible";

class Taggable {
    public tagValue?: string;
    tag(tag: string): this {
        this.tagValue = tag;
        return this;
    }
}

// Spread the extension into the primitive slot ( we supply {} to not modify the Template API):
const api = GenerateTemplatingAPI<TemplatingAPI<{}, Taggable>>(Taggable);

const n = api.primitives.number(42).tag("my-number");
n.tagValue; // "my-number"
n.validate(7); // still works — the built-in API is preserved
```

### Writing definition methods that see the value's type

When your extension needs the concrete value type of the template it is attached
to, use the `ValueType<this>` helper. It extracts the inferred value type from
any definition-API surface, including variadics, so the same extension works on
`string()`, `valueOf(number, string)`, etc.

```ts
import {
    GenerateTemplatingAPI,
    type TemplatingAPI,
    type ValueType,
} from "schematium/extensible";

class Extension {
    typeDependentClosure(closure: (value: ValueType<this>) => boolean) {
        return this;
    }
}

// Apply the extension to every slot — primitives, variadics, and collections.
const api = GenerateTemplatingAPI<
    TemplatingAPI<{}, Extension, Extension, Extension>
>(Extension);

api.primitives.number(42)
    .typeDependentClosure((value: number) => true); // ok
// .typeDependentClosure((value: boolean) => true);         // type error

api.variadics.valueOf(api.primitives.number, api.primitives.string)
    .typeDependentClosure((value: string | number) => true); // ok
```

This is the recommended way to build reusable helpers (custom validators,
formatters, telemetry tags, etc.) that stay fully type-safe across every kind of
template.

## License

MIT
