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
const template = validatorFor({
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

- **End-to-end type safety** — `validatorFor({...})` produces a value type you can use
  in function signatures, with optional vs. required fields tracked
  automatically.
- **Fluent, declarative API** — chain `.required`, `.optional`, `.accepts(...)`,
  `.withDefault(...)` to express constraints in the order you read them.
- **Fast by default** — validation short-circuits on the first failure for hot
  paths, but you can switch into a mode that collects every issue with
  path-traced `ValidationIssue`s using `{ mode: "thorough" }`.
- **Zero dependencies** at runtime.
- **Extensible** — mix custom behavior into the built-in template base via
  `generateTemplateAPI(mixin)`.

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
  validatorFor, // the main validation/parsing API function
  string,
  valueOf, // variadics
} from "schematium";
import type { ValueType } from "schematium";

//You can define sub templates
const PostTemplate = {
  title: string(),
  content: string(),
};

const UserConfig = validatorFor({
  name: string("anonymous"), // optional (has default)
  age: number().accepts((n) => n >= 0), // required
  role: oneOf("admin", "user"), // required
  tags: arrayOf(string).withDefault([]), // optional (has default)
  posts: recordOf(PostTemplate).withDefault({}), // optional (has default)
});

type UserConfigValue = ValueType<typeof UserConfig>;

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

### Definition API vs. validation and parsing API

Every template in Schematium is backed by a single class, which exposes **two
complementary interfaces**:

- **Definition API** — the fluent, chainable surface you use while
  _constructing_ a template (`string()`, `number().required`,
  `arrayOf(...).withDefault([])`, `accepts(...)`, etc.). It lives on the value
  returned by the primitive, variadic, and collection factory functions.
- **Validation and parsing API** — the operational surface you use while _consuming_ a template
  (`.check(value)`, `.validate(value, settings)`,
  `.parseString(text, settings)`, `.getDefault()`). Call `validatorFor(...)`
  with either an object template or an existing value definition to expose it.

```ts
const PortValidator = validatorFor(
  number().accepts((port) => port > 0 && port <= 65_535),
);

PortValidator.check(8080); // → true
```

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
  `validatorFor({...})` has members with defaults, `.getDefault()` assembles a fresh
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

Every `validatorFor(...)` template exposes runtime validation and basic type
reflection. Arrays, records, and shaped objects additionally expose member
reflection:

| Method                                  | Returns                           | Use when                                                           |
| --------------------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `template.check(value, tolerances?)`    | `value is T` (boolean type guard) | You want a fast boolean decision                                   |
| `template.validate(value, settings?)`   | `ValidationResult`                | You want every issue, with path traces, using `{mode: "thorough"}` |
| `template.parseString(text, settings?)` | `ParseResult<T>`                  | Input arrives as a raw string                                      |
| `template.type`                         | type factory or readonly array     | You need the validator's declared type categories                  |
| `template.memberType`                   | type factory or readonly array     | You need immediate object or collection member categories          |
| `template.expects(type)`                | `boolean`                         | You need to know whether an outer type is permitted                |
| `template.expectsExclusively(type)`     | `boolean`                         | You need to know whether only that outer type is permitted         |
| `template.expectsMember(type)`          | `boolean`                         | You need to inspect immediate object or collection member types    |
| `template.expectsMemberExclusively(type)` | `boolean`                       | You need to know whether every immediate member has only that type |

The expectation methods accept a type factory (`string`, `number`, `boolean`,
`array`, `record`, or `object`), rather than a template instance. `expects` is
true when the validator permits that outer schema category, and
`expectsExclusively` is true when every permitted branch has that category.
`expectsMember` and `expectsMemberExclusively` apply the same queries to
immediate array entries, record values, or shaped-object properties. Multiple
literal branches of the same primitive category remain exclusive. Custom
`accepts(...)` predicates do not affect these queries.

The readonly `type` property exposes the same factory identity directly. A
single-type validator returns one factory, while a variadic validator returns a
deduplicated array of its permitted type factories.

The readonly `memberType` property exposes immediate entry or property categories
for arrays, records, and shaped objects. It returns one factory for one unique
category or a deduplicated array for multiple categories. An empty shaped object
returns an empty array. Primitive, literal, and top-level variadic generated
types expose only the basic reflection surface.

```ts
const NegativeNumber = validatorFor(number().accepts(value => value < 0));
NegativeNumber.expects(number); // true
NegativeNumber.expects(boolean); // false

const NumberOrString = validatorFor(valueOf(number, string));
NumberOrString.expects(string); // true
NumberOrString.expectsExclusively(string); // false

const StringArray = validatorFor(arrayOf(string));
StringArray.type === array; // true
StringArray.memberType === string; // true
StringArray.expects(array); // true
StringArray.expectsMemberExclusively(string); // true

const User = validatorFor({ name: string(), age: number() });
User.expects(object); // true
User.expectsMember(string); // true
User.expectsMemberExclusively(string); // false
```

### Traversing object validators

Object validators expose their member validators through a readonly `entries`
record. The record retains the original template keys and each member's inferred
value type:

```ts
const ConfigValidator = validatorFor({
  server: {
    port: number(),
  },
});

const ServerValidator = ConfigValidator.entries.server;
const PortValidator = ServerValidator.entries.port;

PortValidator.check(8080); // → true
```

Use `isObject()` when the specific validator kind is not statically known. It
is a type predicate, so a successful check exposes `entries`:

```ts
if (someValidator.isObject()) {
  Object.keys(someValidator.entries);
}
```

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
predicate or a `(value, context) => void` callback. The callback form gives
you a `ValidationContext` you can call
`context.rejectWith(ValidationIssue,
message)` on to attach a custom issue to
the result — which is only useful in `"thorough"` mode, since
`"fastNoIssueReport"` discards issue detail.

**Important:** Inside these callbacks, **do not throw exceptions** to
communicate validation failures. Throwing will abort validation entirely and
bubble out of `template.validate(...)` / `template.parseString(...)`, bypassing
the result-based contract. Instead, signal failures by calling
`context.rejectWith(ValidationIssue, "message")` on the provided context —
this keeps the failure inside the validation pipeline and lets the caller handle
it as a normal `RejectionResult`:

```ts
import type { ValidationContext } from "schematium";

const Port = number().accepts((value, context: ValidationContext) => {
  if (!(value > 0 && value < 65536)) {
    context.rejectWith(ValidationIssue, "Port out of range");
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
- `.accepts((value, context) => void)` — install a validator that can emit
  `ValidationIssue`s via the `ValidationContext` callback.
- `.withDefault(value, cloneOnAssign?)` — set a default value and implicitly
  make it optional.
- `.acceptsEntries((key, value) => boolean)` — for collections, validate each
  entry (boolean form).
- `.acceptsEntries((key, value, context) => void)` — entry-level validator
  with issue reporting.

### Validation and parsing API

- `template.check(value, tolerances?)` — type-guard; returns `value is T`.
- `template.validate(value, settings?)` — returns `ValidationResult`
  (`ValidationSuccessResult` or `RejectionResult`).
- `template.parseString(text, settings?)` — returns `ParseResult<T>`
  (`ParseSuccessResult<T>` or `RejectionResult`).
- `template.type` — exposes the declared type factory, or the factories for a
  variadic validator.
- `template.memberType` — exposes immediate object or collection member factories
  on member-capable validators.
- `template.expects(type)` / `.expectsExclusively(type)` — query outer type
  categories.
- `template.expectsMember(type)` / `.expectsMemberExclusively(type)` — query
  immediate object or collection member categories.
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
const TypedValidator = validatorFor({
  kind: string(),
  version: number(),
});

const AllLiteralsValidator = validatorFor({
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
const Config = validatorFor({
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
import { number, oneOf, validatorFor, valueOf } from "schematium";

const CliArguments = validatorFor({
  mode: oneOf("dev", "prod"),
  port: number(),
});

CliArguments.parseString('{"mode":"dev","port":3000}');
// { success: true, value: { mode: "dev", port: 3000 } }
```

### Records with arbitrary keys

```ts
const ProfilesConfig = validatorFor({
  profiles: recordOf(string)
    .withDefault({})
    .acceptsEntries((key, value) => typeof key === "string" && key.length > 0),
});

ProfilesConfig.check({ profiles: { alice: "admin", bob: "user" } }); // → true
```

## Extending the API

`schematium` ships a default API instance, but you can create a separate,
customized API with `generateTemplateAPI(mixin?)`. The extension
entry point is `schematium/extensible`:

```ts
// Value imports
import {
  generateTemplateAPI, // Customized API surface generator
  ValidationIssue, // issue class (for typed rejectWith)
} from "schematium/extensible";

// Type-only imports
import type {
  CollectionDefinitionAPI, // fluent API for arrays and records
  DefinitionAPI, // shape/type of a fluent definition chain
  ValidationAndParsingAPI, // core validation and parsing methods
  ReflectionAPI, // basic type reflection composed onto generated validators
  MemberReflectionAPI, // additional reflection for objects and collections
  ValidationContext, // context provided to validator callbacks
  ValidationResult, // success / rejection union
  ValidationSettings, // per-call settings (tolerances + mode)
  ValidationTolerances, // per-call tolerance settings
  TemplateMixin, // function that extends the built-in template base
  ValueTemplateConstructor, // constructor received by a template mixin
  ValueType, // extract the value type from a definition
} from "schematium/extensible";
```

`generateTemplateAPI` accepts one structured extension type. Every member is
optional and omitted extension positions default to `{}`:

```ts
generateTemplateAPI<{
  definitionExtensions: {
    general: GeneralDefinitionExtension;
    primitive: PrimitiveDefinitionExtension;
    object: ObjectDefinitionExtension;
    variadic: VariadicDefinitionExtension;
    collection: CollectionDefinitionExtension;
  };
  validationExtensions: {
    general: GeneralValidationExtension;
    object: ObjectValidationExtension;
  };
}>;
```

### Mixing into template classes

Without a mixin, `generateTemplateAPI()` uses Schematium's built-in template
classes directly. Pass a mixin only when customization is needed; Schematium
then passes each concrete class to it and uses the returned subclasses for that
API instance. A supplied mixin must return a new subclass.

```ts
import {
  generateTemplateAPI,
  type ValueTemplateConstructor,
} from "schematium/extensible";

function withMetadata(Base: ValueTemplateConstructor) {
  return class extends Base {
    metadata = "custom-mixin";
    getMixinInfo() {
      return "mixin-info";
    }
  };
}

type MetadataExtension = InstanceType<ReturnType<typeof withMetadata>>;

// Expose the mixin on validators as well as installing it at runtime.
const { validatorFor, string } = generateTemplateAPI<{
  validationExtensions: { general: MetadataExtension };
}>(withMetadata);

const t = validatorFor({
  sample: string("default").required,
});

t.metadata; // "custom-mixin"
t.getMixinInfo(); // "mixin-info"
```

If you only need runtime mixin behavior, omit the generic extension type. Add
it when the mixin's members should also be visible to TypeScript:

```ts
import type { TemplateMixin } from "schematium/extensible";

let instanceCount = 0;
const withTracking: TemplateMixin = Base => class extends Base {
  constructor(...args: any[]) {
    super(...args);
    instanceCount++;
  }
};

const { validatorFor, boolean } = generateTemplateAPI(withTracking);
const runtimeTemplate = validatorFor({ enabled: boolean() });
```

### Extending the fluent interfaces

When a mixin declares a constructor, forward all arguments to `super` as shown
above so the built-in template constructor receives its inputs.

To add new chainable methods, return a class whose members become part of the
fluent API, then pass its instance type as the appropriate generic slot. The
methods can return `this`, so they compose with the built-in modifiers (`.required`, `.optional`,
`.accepts(...)`, `.withDefault(...)`, `.acceptsEntries(...)`).

```ts
import { generateTemplateAPI, type ValueTemplateConstructor } from "schematium/extensible";

function withTagging(Base: ValueTemplateConstructor) {
  return class extends Base {
    public tagValue?: string;
    tag(tag: string): this {
      this.tagValue = tag;
      return this;
    }
  };
}

type Taggable = InstanceType<ReturnType<typeof withTagging>>;

// Apply the extension to primitive definitions.
const { validatorFor, number } = generateTemplateAPI<{
  definitionExtensions: { primitive: Taggable };
}>(withTagging);

const n = number(42).tag("my-number");
n.tagValue; // "my-number"
validatorFor({ n }).check({ n: 7 }); // built-in validation and parsing API is preserved
```

Validation extensions are exposed only after `validatorFor(...)` performs the
definition-to-validation-and-parsing API transition. Object-specific validation extensions
are also available on statically known object entries and after `isObject()`
narrows a general validator:

```ts
function withValidationExtension(Base: ValueTemplateConstructor) {
  return class extends Base {
    traceValidation(): this {
      return this;
    }
    inspectEntries(): this {
      return this;
    }
  };
}

type ValidationExtension = InstanceType<ReturnType<typeof withValidationExtension>>;

const { number, validatorFor } = generateTemplateAPI<{
  validationExtensions: {
    general: Pick<ValidationExtension, "traceValidation">;
    object: Pick<ValidationExtension, "inspectEntries">;
  };
}>(withValidationExtension);

validatorFor(number()).traceValidation();
validatorFor({ value: number() }).inspectEntries();
```

### Writing definition methods that see the value's type

When your extension needs the concrete value type of the template it is attached
to, use the `ValueType<this>` helper. It extracts the inferred value type from
any definition-API surface, including variadics, so the same extension works on
`string()`, `valueOf(number, string)`, etc.

```ts
import {
  generateTemplateAPI,
  type ValueTemplateConstructor,
  type ValueType,
} from "schematium/extensible";

function withTypeDependentClosure(Base: ValueTemplateConstructor) {
  return class extends Base {
    typeDependentClosure(closure: (value: ValueType<this>) => boolean) {
      return this;
    }
  };
}

type Extension = InstanceType<ReturnType<typeof withTypeDependentClosure>>;

// Apply the extension to every definition family.
const { number, string, valueOf } = generateTemplateAPI<{
  definitionExtensions: { general: Extension };
}>(withTypeDependentClosure);

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
