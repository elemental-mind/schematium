//==============================================
// Contracts
//==============================================

interface ParsingAPI<T>
{
    fromString: (value: string) => T;
}

interface ValidationAPI<T>
{
    validate: (value: T) => boolean;
}

interface ValueDefinitionAPI<T>
{
    required: ValueDefinitionAPI<T>,
    optional: ValueDefinitionAPI<T>,
    accepts: (validator: (value: T) => boolean) => ValueDefinitionAPI<T>;
}

interface CollectionDefinitionAPI<T>
{
    accepts: (validator: (value: T) => boolean) => CollectionDefinitionAPI<T>,
    acceptsEntries: (validator: (value: CollectionEntryType<T>) => boolean) => CollectionDefinitionAPI<T>,
}

interface TypedCollectionDefinitionAPI<T> extends CollectionDefinitionAPI<T>
{
    withDefault: (defaultValue: T) => CollectionDefinitionAPI<T>,
}

//==============================================
// Types
//==============================================

interface TemplateObject
{
    [key: string]: TemplateObjectEntry;
}
type TemplateObjectEntry<T = any> = TemplateObject | ValueConfiguration<T>;
type PrimitiveTemplate = typeof number | typeof string | typeof boolean;
type CollectionEntryType<T> = T extends Array<infer E> ? E : T extends Record<string, infer R> ? [key: string, value: R] : never;
type TypeOption = PrimitiveTemplate | TemplateObject;
type ValueConfiguration<T> = ValueDefinitionAPI<T> | CollectionDefinitionAPI<T> | TypedCollectionDefinitionAPI<T>;

type Resolve<T extends TypeOption> =
    T extends typeof number ? number :
    T extends typeof string ? string :
    T extends typeof boolean ? boolean :
    T extends TemplateObject ? Concrete<T> :
    T extends Array<infer E extends TypeOption> ? Resolve<E> :
    never;

type Concrete<T extends TemplateObject> = {
    [K in keyof T]:
    T[K] extends ValueDefinitionAPI<infer V> ? V :
    T[K] extends CollectionDefinitionAPI<infer C> ? C :
    T[K] extends TemplateObject ? Concrete<T[K]>
    : never
};

//==============================================
// Value Template (base)
//==============================================

abstract class ValueTemplate<T> implements ParsingAPI<T>, ValidationAPI<T>, ValueDefinitionAPI<T>
{
    public default?: T;
    protected isOptional = false;
    protected customValidator?: (value: T) => boolean;

    get required()
    {
        this.isOptional = false;
        return this;
    }

    get optional()
    {
        this.isOptional = true;
        return this;
    }

    accepts(validator: (value: T) => boolean): this
    {
        this.customValidator = validator;
        return this;
    }

    withDefault(defaultValue: T): this
    {
        this.default = defaultValue;
        return this;
    }

    abstract fromString(value: string): T;

    validate(value: T): boolean { return this.customValidator ? this.customValidator(value) : true; }
}

//==============================================
// String Template
//==============================================

class StringTemplate extends ValueTemplate<string>
{
    fromString(value: string): string { return value; }
    validate(value: unknown): value is string { return typeof value === "string" && super.validate(value); }
}

export function string(): ValueDefinitionAPI<string | undefined>;
export function string(defaultValue: string): ValueDefinitionAPI<string>;
export function string(defaultValue?: string)
{
    const template = new StringTemplate();
    if (defaultValue !== undefined) template.default = defaultValue;
    return template as ValueDefinitionAPI<string | undefined>;
}

//==============================================
// Number Template
//==============================================

class NumberTemplate extends ValueTemplate<number>
{
    fromString(value: string): number
    {
        const parsed = Number(value);
        if (!Number.isFinite(parsed))
            throw new Error(`Cannot parse "${value}" as number`);
        return parsed;
    }
    validate(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && super.validate(value); }
}

export function number(): ValueDefinitionAPI<number | undefined>;
export function number(defaultValue: number): ValueDefinitionAPI<number>;
export function number(defaultValue?: number)
{
    const template = new NumberTemplate();
    if (defaultValue !== undefined) template.default = defaultValue;
    return template as ValueDefinitionAPI<number | undefined>;
}

//==============================================
// Boolean Template
//==============================================

class BooleanTemplate extends ValueTemplate<boolean>
{
    fromString(value: string): boolean
    {
        const lowered = value.trim().toLowerCase();
        if (lowered === "true" || lowered === "1") return true;
        if (lowered === "false" || lowered === "0") return false;
        throw new Error(`Cannot parse "${value}" as boolean`);
    }
    validate(value: unknown): value is boolean { return typeof value === "boolean" && super.validate(value); }
}

export function boolean(): ValueDefinitionAPI<boolean | undefined>;
export function boolean(defaultValue: boolean): ValueDefinitionAPI<boolean>;
export function boolean(defaultValue?: boolean)
{
    const template = new BooleanTemplate();
    if (defaultValue !== undefined) template.default = defaultValue;
    return template as ValueDefinitionAPI<boolean | undefined>;
}


//==============================================
// Variadic Template
//==============================================

class VariadicTemplate<T> extends ValueTemplate<T>
{
    public permittedTypes: any[] = [];

    constructor(...permittedTypes: TypeOption[])
    {
        super();
        for (const permittedType of permittedTypes)
        {
            if (permittedType === string)
                this.permittedTypes.push(new StringTemplate());
            else if (permittedType === number)
                this.permittedTypes.push(new NumberTemplate());
            else if (permittedType === boolean)
                this.permittedTypes.push(new BooleanTemplate());
            else if (permittedType instanceof Object)
                this.permittedTypes.push(ObjectTemplate.fromTemplateObject(permittedType as TemplateObject));
            else
                throw new Error("Type constraint not recognized");
        }
    }

    fromString(valueString: string): T
    {
        for (const permittedType of this.permittedTypes)
            try
            {
                const value = permittedType.fromString(valueString);
                return value;
            }
            catch (e) { continue; }
        throw new Error("Could not match input to any possible type");
    }

    validateValue(value: T, type: any)
    {
        if (!type.validate(value))
            throw new Error("Could not validate value");
    }
}

export function valueOf<T extends TypeOption[]>(...types: T): ValueDefinitionAPI<Resolve<T[number]>>
{
    return new VariadicTemplate(...types);
}

//==============================================
// Object Template (base)
//==============================================

class ObjectTemplate<T> extends ValueTemplate<T>
{
    static Templates = new WeakMap<TemplateObject, ObjectTemplate<any>>();
    static fromTemplateObject(templateObject: TemplateObject)
    {
        return ObjectTemplate.Templates.get(templateObject) ?? new ObjectTemplate(templateObject);
    }

    public template: Record<string, ValueConfiguration<any> | ObjectTemplate<any>> = {};

    private constructor(templateObject: TemplateObject)
    {
        super();
        ObjectTemplate.Templates.set(templateObject, this);
        for (const [key, value] of Object.entries(templateObject))
            this.template[key] = value instanceof ValueTemplate ? value : ObjectTemplate.fromTemplateObject(value as TemplateObject);
    }

    fromString(value: string): T
    {
        return JSON.parse(value);
    }

    validate(value: T): boolean
    {
        return true;
    }
}

//==============================================
// Collection Template (base)
//==============================================

abstract class CollectionTemplate<T> extends ValueTemplate<T>
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
            else if (t === "boolean") found.add(boolean);
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

    protected entryValidator?: (value: any) => boolean;
}

//==============================================
// List  (Record<string, V>)
//==============================================

class ListTemplate<V> extends CollectionTemplate<Record<string, V>>
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
    static fromTypes<T extends TypeOption[]>(...types: T): ListTemplate<Resolve<T[number]>>
    {
        const entryShape = types.length === 1 ? types[0] : types;
        return new ListTemplate<Resolve<T[number]>>(entryShape);
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

    acceptsEntries(validator: (value: [string, V]) => boolean): CollectionDefinitionAPI<Record<string, V>>
    {
        // TODO first draft: per-entry validator is captured but not yet wired
        // into `fromString` / resolve flow.
        this.entryValidator = validator as (value: any) => boolean;
        return this as unknown as CollectionDefinitionAPI<Record<string, V>>;
    }
}

export const list = ListTemplate.fromDefault as <T extends Record<string, boolean> | Record<string, number> | Record<string, string>>(defaultValue: T) => CollectionDefinitionAPI<T>;
export const listOf = ListTemplate.fromTypes as <T extends TypeOption[]>(...types: T) => TypedCollectionDefinitionAPI<Record<string, Resolve<T[number]>>>;

//==============================================
// Array  (V[])
//==============================================

class ArrayTemplate<V> extends CollectionTemplate<V[]>
{
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

    static fromTypes<T extends TypeOption[]>(...types: T): ArrayTemplate<Resolve<T[number]>>
    {
        const entryShape = types.length === 1 ? types[0] : types;
        return new ArrayTemplate<Resolve<T[number]>>(entryShape);
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

    acceptsEntries(validator: (value: V) => boolean): CollectionDefinitionAPI<V[]>
    {
        // TODO first draft: per-entry validator is captured but not yet wired
        // into `fromString` / resolve flow.
        this.entryValidator = validator as (value: any) => boolean;
        return this as unknown as CollectionDefinitionAPI<V[]>;
    }
}

export const array = ArrayTemplate.fromDefault as <T extends boolean[] | number[] | string[]>(defaultValue: T) => CollectionDefinitionAPI<T>;
export const arrayOf = ArrayTemplate.fromTypes as <T extends TypeOption[]>(...types: T) => TypedCollectionDefinitionAPI<Resolve<T[number]>[]>;

//==============================================
// Example Usage
//==============================================

const SubTemplate = {
    sampleValue: string(),
    sampleParameter: number(123),
} satisfies TemplateObject;

const SampleTemplate = {
    number: number(123).accepts(number => number < 256),
    bool: boolean(),
    string: string().required,
    either: valueOf(number, string),
    array: arrayOf(number, string).withDefault([]).accepts(array => array.length < 100).acceptsEntries(entry => true),
    list: listOf(SubTemplate).withDefault({ sample: { sampleParameter: 123, sampleValue: "text" } }).acceptsEntries(([key, value]) => true),
    deep: {
        bar: array(["bla", "bla"])
    }
} satisfies TemplateObject;

