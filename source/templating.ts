interface ObjectTemplate { [key: string]: TemplateEntry; }

type CollectionEntryType<T> = T extends Array<infer E> ? E : T extends Record<string, infer R> ? [key: string, value: R] : never;
type TemplateEntry<T = any> = ObjectTemplate | ValueConfiguration<T>;
type ValueConfiguration<T> = ValueAPI<T> | CollectionAPI<T> | TypedCollectionAPI<T>;
interface ValueAPI<T>
{
    accepts: (validator: (value: T) => boolean) => ValueAPI<T>;
}
interface CollectionAPI<T>
{
    accepts: (validator: (value: T) => boolean) => CollectionAPI<T>,
    acceptsEntries: (validator: (value: CollectionEntryType<T>) => boolean) => CollectionAPI<T>,
}
interface TypedCollectionAPI<T> extends CollectionAPI<T>
{
    withDefault: (defaultValue: T) => CollectionAPI<T>,
}

type TypeOption = typeof number | typeof string | typeof bool | ObjectTemplate;
type TypesParameter = TypeOption | TypeOption[];

type Resolve<T extends TypesParameter> =
    T extends typeof number ? number :
    T extends typeof string ? string :
    T extends typeof bool ? boolean :
    T extends ObjectTemplate ? Concrete<T> :
    T extends Array<infer E extends TypeOption> ? Resolve<E> :
    never;

type Concrete<T extends ObjectTemplate> = {
    [K in keyof T]:
    T[K] extends ValueAPI<infer V> ? V :
    T[K] extends CollectionAPI<infer C> ? C :
    T[K] extends ObjectTemplate ? Concrete<T[K]>
    : never
};

//==============================================
// Value Template (base)
//==============================================

abstract class ValueTemplate<T>
{
    static create(type: typeof number, defaultValue?: number): NumberTemplate;
    static create(type: typeof string, defaultValue?: string): StringTemplate;
    static create(type: typeof bool, defaultValue?: boolean): BoolTemplate;
    static create(type: TypeOption, defaultValue?: unknown): ValueTemplate<any>
    {
        let template: ValueTemplate<any>;
        switch (type)
        {
            case number: template = new NumberTemplate(); break;
            case string: template = new StringTemplate(); break;
            case bool: template = new BoolTemplate(); break;
            default: throw new Error(`ValueTemplate.create: unsupported type ${String(type)}`);
        }
        template.default = defaultValue as never;
        return template;
    }

    default?: T;

    /**
     * Used for parsing the value.
     * @param value
     */
    abstract fromString(value: string): T;

    abstract validateType(value: unknown): boolean;

    /**
     * Used for validating the value after parsing. Default accepts anything;
     * replaced by `.accepts(...)`.
     * @param value
     * @returns
     */
    validate(value: T): boolean
    {
        return true;
    }

    /** Registers a custom validator and returns `this` for fluent chaining. */
    accepts(validator: (value: T) => boolean): this
    {
        this.validate = validator;
        return this;
    }
}

//==============================================
// Number
//==============================================

export function number(): ValueAPI<number | undefined>;
export function number(defaultValue: number): ValueAPI<number>;
export function number(defaultValue?: number): ValueAPI<number | undefined>
{
    return ValueTemplate.create(number, defaultValue) as unknown as ValueAPI<number | undefined>;
}

class NumberTemplate extends ValueTemplate<number>
{
    fromString(value: string): number
    {
        const parsed = Number(value);
        if (!Number.isFinite(parsed))
            throw new Error(`Cannot parse "${value}" as number`);
        return parsed;
    }

    validateType(value: unknown): boolean
    {
        return typeof value === "number" && Number.isFinite(value);
    }
}

//==============================================
// String
//==============================================

export function string(): ValueAPI<string | undefined>;
export function string(defaultValue: string): ValueAPI<string>;
export function string(defaultValue?: string): ValueAPI<string | undefined>
{
    return ValueTemplate.create(string, defaultValue) as unknown as ValueAPI<string | undefined>;
}

class StringTemplate extends ValueTemplate<string>
{
    fromString(value: string): string
    {
        return value;
    }

    validateType(value: unknown): boolean
    {
        return typeof value === "string";
    }
}

//==============================================
// Boolean
//==============================================

export function bool(): ValueAPI<boolean | undefined>;
export function bool(defaultValue: boolean): ValueAPI<boolean>;
export function bool(defaultValue?: boolean): ValueAPI<boolean | undefined>
{
    return ValueTemplate.create(bool, defaultValue) as unknown as ValueAPI<boolean | undefined>;
}

class BoolTemplate extends ValueTemplate<boolean>
{
    fromString(value: string): boolean
    {
        const lowered = value.trim().toLowerCase();
        if (lowered === "true" || lowered === "1") return true;
        if (lowered === "false" || lowered === "0") return false;
        throw new Error(`Cannot parse "${value}" as boolean`);
    }

    validateType(value: unknown): boolean
    {
        return typeof value === "boolean";
    }
}

//==============================================
// Collection Template (base)
//==============================================

abstract class CollectionTemplate<C, V> extends ValueTemplate<C>
{
    /**
     * Inspects a flat collection of runtime values and reports which of the
     * supported primitive `TypeOption`s they belong to (`number`, `string`,
     * `bool`). Non-primitive values are ignored.
     */
    static inferEntryTypes(values: readonly unknown[]): TypeOption | TypeOption[]
    {
        const found = new Set<TypeOption>();
        for (const v of values)
        {
            const t = typeof v;
            if (t === "number") found.add(number);
            else if (t === "string") found.add(string);
            else if (t === "boolean") found.add(bool);
        }
        if (found.size === 0) return [];
        if (found.size === 1) return [...found][0];
        return [...found];
    }

    entryShape: unknown;

    constructor(entryShape?: unknown)
    {
        super();
        this.entryShape = entryShape;
    }

    withDefault(defaultValue: C): CollectionAPI<C>
    {
        this.default = defaultValue;
        return this as unknown as CollectionAPI<C>;
    }

    protected entryValidator?: (value: any) => boolean;
}

//==============================================
// List  (Record<string, V>)
//==============================================

class ListTemplate<V> extends CollectionTemplate<Record<string, V>, V>
{
    /**
     * Builds a `ListTemplate` from a homogeneous default value, inferring the
     * per-entry element type from the default's values. The default is also
     * stored verbatim on the template so `.withDefault(...)` doesn't need to
     * be chained separately.
     */
    static fromDefault<T extends Record<string, boolean> | Record<string, number> | Record<string, string>>(
        defaultValue: T
    ): ListTemplate<any>
    {
        const elementType = ListTemplate.inferEntryTypes(Object.values(defaultValue));
        const template = new ListTemplate<typeof elementType>(elementType);
        template.default = defaultValue as any;
        return template;
    }

    /**
     * Builds a `ListTemplate` whose entries are constrained to one or more
     * concrete `TypeOption`s. The provided types are stored verbatim as the
     * template's `entryShape` and used to validate / coerce parsed entries.
     */
    static fromTypeInput<T extends TypesParameter>(types: T): ListTemplate<Resolve<T>>
    {
        return new ListTemplate<Resolve<T>>(types);
    }

    fromString(value: string): Record<string, V>
    {
        // TODO first draft: this is a JSON-only parser. A follow-up should
        // also accept `key=value,key=value` style input and convert each
        // entry through `entryShape` when an entry shape is provided.
        const parsed = JSON.parse(value);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
            throw new Error(`Cannot parse "${value}" as list`);
        return parsed as Record<string, V>;
    }

    validateType(value: unknown): boolean
    {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }

    acceptsEntries(validator: (value: [string, V]) => boolean): CollectionAPI<Record<string, V>>
    {
        // TODO first draft: per-entry validator is captured but not yet wired
        // into `fromString` / resolve flow.
        this.entryValidator = validator as (value: any) => boolean;
        return this as unknown as CollectionAPI<Record<string, V>>;
    }
}

export const list = ListTemplate.fromDefault as <T extends Record<string, boolean> | Record<string, number> | Record<string, string>>(defaultValue: T) => CollectionAPI<T>;
export const listOf = ListTemplate.fromTypeInput as <T extends TypesParameter>(types: T) => TypedCollectionAPI<Record<string, Resolve<T>>>;

//==============================================
// Array  (V[])
//==============================================

class ArrayTemplate<V> extends CollectionTemplate<V[], V>
{
    /**
     * Builds an `ArrayTemplate` from a homogeneous default value, inferring
     * the per-entry element type from the first entry's `typeof`. The default
     * is also stored verbatim on the template so `.withDefault(...)` doesn't
     * need to be chained separately.
     */
    static fromDefault<T extends boolean[] | number[] | string[]>(
        defaultValue: T
    ): ArrayTemplate<any>
    {
        if (defaultValue.length === 0)
            throw new Error("Can not infer element types from empty array.");
        const elementTypes = CollectionTemplate.inferEntryTypes(Object.entries(defaultValue));
        const template = new ArrayTemplate<typeof elementTypes>(elementTypes);
        template.default = defaultValue as any;
        return template;
    }

    /**
     * Builds an `ArrayTemplate` whose entries are constrained to one or more
     * concrete `TypeOption`s. The provided types are stored verbatim as the
     * template's `entryShape` and used to validate / coerce parsed entries.
     */
    static fromTypeInput<T extends TypesParameter>(types: T): ArrayTemplate<Resolve<T>>
    {
        return new ArrayTemplate<Resolve<T>>(types);
    }

    fromString(value: string): V[]
    {
        // TODO first draft: JSON-only parser. A follow-up should also accept
        // `value,value,value` style input and coerce each entry through
        // `entryShape` when an entry shape is provided.
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed))
            throw new Error(`Cannot parse "${value}" as array`);
        return parsed as V[];
    }

    validateType(value: unknown): boolean
    {
        return Array.isArray(value);
    }

    acceptsEntries(validator: (value: V) => boolean): CollectionAPI<V[]>
    {
        // TODO first draft: per-entry validator is captured but not yet wired
        // into `fromString` / resolve flow.
        this.entryValidator = validator as (value: any) => boolean;
        return this as unknown as CollectionAPI<V[]>;
    }
}

export const array = ArrayTemplate.fromDefault as <T extends boolean[] | number[] | string[]>(defaultValue: T) => CollectionAPI<T>;
export const arrayOf = ArrayTemplate.fromTypeInput as <T extends TypesParameter>(types: T) => TypedCollectionAPI<Array<Resolve<T>>>;

//==============================================
// Example Usage
//==============================================

const SubTemplate = {
    sampleValue: string(),
    sampleParameter: number(123),
} satisfies ObjectTemplate;

const SampleTemplate = {
    number: number(123).accepts(number => number < 256),
    bool: bool(),
    string: string(),
    array: arrayOf([number, string]).withDefault([]).accepts(array => array.length < 100).acceptsEntries(entry => true),
    list: listOf(SubTemplate).withDefault({ sample: { sampleParameter: 123, sampleValue: "text" } }).acceptsEntries(([key, value]) => true),
    deep: {
        bar: array(["bla", "bla"])
    }
} satisfies ObjectTemplate;

type test = Concrete<typeof SampleTemplate>;
