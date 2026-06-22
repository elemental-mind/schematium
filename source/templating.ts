//==============================================
// Contracts
//==============================================

interface ParsingAPI<T>
{
    parseString: (value: string) => T;
}

// Internal indirection — never used by call sites, just breaks type circularity
type ValueDefinitionSelf<T> = ValueDefinitionAPI<T, ValueDefinitionSelf<T>>;
type CollectionDefinitionSelf<T> = CollectionDefinitionAPI<T, CollectionDefinitionSelf<T>>;
type TypedCollectionDefinitionSelf<T> = TypedCollectionDefinitionAPI<T, TypedCollectionDefinitionSelf<T>>;

interface ValueDefinitionAPI<T, TSelf extends ValueDefinitionAPI<T, TSelf> = ValueDefinitionSelf<T>>
{
    required: TSelf;
    optional: TSelf;
    accepts: (validator: (value: T) => boolean) => TSelf;
}

interface CollectionDefinitionAPI<T, TSelf extends CollectionDefinitionAPI<T, TSelf> = CollectionDefinitionSelf<T>> extends ValueDefinitionAPI<T, TSelf>
{
    acceptsEntries: (validator: (value: CollectionEntryType<T>) => boolean) => TSelf;
}

interface TypedCollectionDefinitionAPI<T, TSelf extends TypedCollectionDefinitionAPI<T, TSelf> = TypedCollectionDefinitionSelf<T>> extends CollectionDefinitionAPI<T, TSelf>
{
    withDefault: (defaultValue: T) => TSelf;
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
type PrimitiveString = "string" | "boolean" | "number";
type CollectionEntryType<T> = T extends Array<infer E> ? E : T extends Record<string, infer R> ? [key: string, value: R] : never;
type TypeOption = PrimitiveTemplate | TemplateObject | ValueTemplate<any>;
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

abstract class ValueTemplate<T> implements ParsingAPI<T>, ValueDefinitionAPI<T>
{

    /**
     * This takes an example and outputs a template that satisfies the example input.
     * 
     * Note: A given object will be interpreted as a list (like Record<string, ...>) instead of an object template (object with concrete key values)
     */
    static fromExample(exampleValue: any): ValueTemplate<any>
    {
        switch (typeof exampleValue)
        {
            case "string": return new StringTemplate();
            case "number": return new NumberTemplate();
            case "boolean": return new BooleanTemplate();
            case "object":
                if (Array.isArray(exampleValue))
                    return ArrayTemplate.fromExample(exampleValue as boolean[] | number[] | string[]);
                else
                    return ListTemplate.fromExample(exampleValue as Record<string, boolean> | Record<string, number> | Record<string, string>);
        }
        throw new Error("Cannot resolve template from example value");
    }

    /**
     * This takes example inputs and outputs a template that satisfies the example input.
     * 
     * Note: Given objects will be interpreted as lists (like Record<string, ...>) instead of object templates (object with concrete key values)
     */
    static fromExamples(...exampleValues: any[]): ValueTemplate<any> | VariadicTemplate<any> | ListTemplate<any> | ArrayTemplate<any>
    {
        if (exampleValues.length === 0)
            throw new Error("Example values needed to derive template");
        if (exampleValues.length === 1)
            return this.fromExample(exampleValues[0]);

        const identifiedNormalizedTypes = new Set<PrimitiveString | ValueTemplate<any>>();
        for (const exampleValue of exampleValues)
        {
            switch (typeof exampleValue)
            {
                case "string":
                case "number":
                case "boolean":
                    identifiedNormalizedTypes.add(typeof exampleValue as PrimitiveString);
                    break;
                case "object":
                    if (Array.isArray(exampleValue))
                        identifiedNormalizedTypes.add(ArrayTemplate.fromExample(exampleValue));
                    else
                        identifiedNormalizedTypes.add(ListTemplate.fromExample(exampleValue as Record<string, boolean> | Record<string, number> | Record<string, string>));
            }
            throw new Error("Cannot resolve template from example value");
        }

        const templateValues = [...identifiedNormalizedTypes].map(templateOrTypeString => ValueTemplate.fromTypeInput(templateOrTypeString));

        if (templateValues.length === 1)
            return templateValues[0];
        else
            return new VariadicTemplate(...templateValues);
    }

    static fromTypeInput(typeOption: TypeOption | PrimitiveString): ValueTemplate<any>
    {
        switch (typeOption)
        {
            case string:
            case "string":
                return new StringTemplate();
            case number:
            case "number":
                return new NumberTemplate();
            case boolean:
            case "boolean":
                return new BooleanTemplate();
            default:
                if (typeOption instanceof ValueTemplate) return typeOption;
                if (typeOption instanceof Object) return ObjectTemplate.fromTemplateObject(typeOption as TemplateObject);
        }
        throw new Error("Type constraint not recognized");
    }

    static fromTypeInputs(...types: TypeOption[])
    {
        if (types.length === 0)
            throw new Error("Can not define template without type input");
        if (types.length === 1)
            return ValueTemplate.fromTypeInput(types[0]);

        const valueTemplates = types.map(type => ValueTemplate.fromTypeInput(type));
        return new VariadicTemplate<any>(...valueTemplates);
    }

    public default?: T;
    isOptional = false;
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

    accepts(validator: (value: T) => boolean)
    {
        this.customValidator = validator;
        return this;
    }

    withDefault(defaultValue: T)
    {
        this.default = defaultValue;
        return this;
    }

    abstract parseString(value: string): T;

    validate(value: T): boolean
    {
        if (value === undefined && this.isOptional) return true;
        if (!this.validateType(value)) return false;
        return this.customValidator?.(value as T) ?? true;
    }

    abstract validateType(value: T): boolean;
}

//==============================================
// String Template
//==============================================

class StringTemplate extends ValueTemplate<string>
{
    parseString(value: string): string { return value; }
    validateType(value: unknown): value is string { return typeof value === "string"; }
}

export function string(): ValueDefinitionAPI<string | undefined>;
export function string(defaultValue: string): ValueDefinitionAPI<string>;
export function string(defaultValue?: string)
{
    const template = new StringTemplate();
    if (defaultValue !== undefined)
        template.default = defaultValue;
    else
        template.isOptional = true;
    return template;
}

//==============================================
// Number Template
//==============================================

class NumberTemplate extends ValueTemplate<number>
{
    parseString(value: string): number
    {
        const parsed = Number(value);
        if (!Number.isFinite(parsed))
            throw new Error(`Cannot parse "${value}" as number`);
        return parsed;
    }
    validateType(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
}

export function number(): ValueDefinitionAPI<number | undefined>;
export function number(defaultValue: number): ValueDefinitionAPI<number>;
export function number(defaultValue?: number)
{
    const template = new NumberTemplate();
    if (defaultValue !== undefined)
        template.default = defaultValue;
    else
        template.isOptional = true;
    return template;
}

//==============================================
// Boolean Template
//==============================================

class BooleanTemplate extends ValueTemplate<boolean>
{
    parseString(value: string): boolean
    {
        const lowered = value.trim().toLowerCase();
        if (lowered === "true" || lowered === "1") return true;
        if (lowered === "false" || lowered === "0") return false;
        throw new Error(`Cannot parse "${value}" as boolean`);
    }
    validateType(value: unknown): value is boolean { return typeof value === "boolean"; }
}

export function boolean(): ValueDefinitionAPI<boolean | undefined>;
export function boolean(defaultValue: boolean): ValueDefinitionAPI<boolean>;
export function boolean(defaultValue?: boolean)
{
    const template = new BooleanTemplate();
    if (defaultValue !== undefined)
        template.default = defaultValue;
    else
        template.isOptional = true;
    return template;
}


//==============================================
// Variadic Template (multiple possible types)
//==============================================

class VariadicTemplate<T> extends ValueTemplate<T>
{
    public permittedTypes: ValueTemplate<any>[] = [];

    constructor(...permittedTypes: ValueTemplate<any>[])
    {
        super();
        this.permittedTypes = permittedTypes;
    }

    parseString(valueString: string): T
    {
        for (const permittedType of this.permittedTypes)
            try
            {
                const value = permittedType.parseString(valueString);
                if (permittedType.validate(value)) return value;
            }
            catch (e) { continue; }
        throw new Error("Could not match input to any possible type");
    }

    validateType(value: unknown): boolean
    {
        for (const permittedType of this.permittedTypes)
            if (permittedType.validate(value)) return true;
        return false;
    }
}

export function valueOf<T extends TypeOption[]>(...types: T): ValueDefinitionAPI<Resolve<T[number]>>
{
    return ValueTemplate.fromTypeInputs(...types);
}

//==============================================
// Object Template (base)
//==============================================

class ObjectTemplate<T> extends ValueTemplate<T>
{
    static TemplateCache = new WeakMap<TemplateObject, ObjectTemplate<any>>();

    static fromTemplateObject(templateObject: TemplateObject)
    {
        return ObjectTemplate.TemplateCache.get(templateObject) ?? new ObjectTemplate(templateObject);
    }

    public strict: boolean = true;
    public template: Map<string, ValueTemplate<any>> = new Map();

    private constructor(templateObject: TemplateObject)
    {
        super();
        ObjectTemplate.TemplateCache.set(templateObject, this);
        for (const [key, value] of Object.entries(templateObject))
            this.template.set(key, value instanceof ValueTemplate ? value : ObjectTemplate.fromTemplateObject(value as TemplateObject));
    }

    parseString(value: string): T
    {
        return JSON.parse(value);
    }

    validateType(value: T): boolean
    {
        if (typeof value !== "object" || value === null)
            return false;

        const input = value as Record<string, unknown>;

        for (const [key, template] of this.template.entries())
        {
            const value = input[key];
            if (value === undefined && !template.isOptional)
                return false;
            else if (value !== undefined && !template.validate(value))
                return false;
        }

        if (this.strict)
            for (const key of Object.keys(input))
                if (!this.template.has(key)) return false;

        return true;
    }
}

//==============================================
// Collection Template (base)
//==============================================

abstract class CollectionTemplate<T> extends ValueTemplate<T> implements TypedCollectionDefinitionAPI<T>
{
    protected entryTemplate: ValueTemplate<any> | VariadicTemplate<any>;

    constructor(entryTemplate: ValueTemplate<any> | VariadicTemplate<any>)
    {
        super();
        this.entryTemplate = entryTemplate;
    }

    protected validateEntry(entry: any): boolean
    {
        return this.entryTemplate.validate(entry) && this.entryGuard(entry);
    }

    protected entryGuard(value: any)
    {
        return true;
    }

    acceptsEntries(validator: (value: any) => boolean)
    {
        this.entryGuard = validator;
        return this;
    }
}

//==============================================
// List  (Record<string, V>)
//==============================================

class ListTemplate<T> extends CollectionTemplate<Record<string, T>>
{
    static fromExample(exampleList: Record<string, any>)
    {
        const elementType = ValueTemplate.fromExamples(Object.values(exampleList));
        return new ListTemplate<any>(elementType);
    }

    static fromTypes<T extends TypeOption[]>(...types: T)
    {
        const elementType = ValueTemplate.fromTypeInputs(...types);
        return new ListTemplate<Resolve<T[number]>>(elementType);
    }

    parseString(value: string)
    {
        // TODO first draft: this is a JSON-only parser. A follow-up should
        // also accept `key=value,key=value` style input and convert each
        // entry through `entryShape` when an entry shape is provided.
        const parsed = JSON.parse(value);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
            throw new Error(`Cannot parse "${value}" as list`);
        return parsed as Record<string, T>;
    }

    validateType(value: Record<string, T>): boolean
    {
        if (typeof value !== "object" || value === null || Array.isArray(value))
            return false;
        for (const entry of Object.values(value))
            if (!this.validateEntry(entry)) return false;
        return true;
    }
}

export const list = ListTemplate.fromExample as <T extends Record<string, boolean> | Record<string, number> | Record<string, string>>(defaultValue: T) => CollectionDefinitionAPI<T>;
export const listOf = ListTemplate.fromTypes as <T extends TypeOption[]>(...types: T) => TypedCollectionDefinitionAPI<Record<string, Resolve<T[number]>>>;

//==============================================
// Array  (V[])
//==============================================

class ArrayTemplate<T> extends CollectionTemplate<T[]>
{
    static fromExample<T extends unknown>(exampleArray: T[]): ArrayTemplate<T>
    {
        const elementType = ValueTemplate.fromExamples(Object.values(exampleArray));
        return new ArrayTemplate<any>(elementType);
    }

    static fromTypes<T extends TypeOption[]>(...types: T): ArrayTemplate<Resolve<T[number]>>
    {
        const elementType = ValueTemplate.fromTypeInputs(...types);
        return new ArrayTemplate<Resolve<T[number]>>(elementType);
    }

    parseString(value: string): T[]
    {
        // TODO first draft: JSON-only parser. A follow-up should also accept
        // `value,value,value` style input and coerce each entry through
        // `entryShape` when an entry shape is provided.
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed))
            throw new Error(`Cannot parse "${value}" as array`);
        return parsed as T[];
    }

    validateType(value: T[]): boolean
    {
        if (!Array.isArray(value))
            return false;
        for (const entry of value)
            if (!this.validateEntry(entry)) return false;
        return true;
    }
}

export const array = ArrayTemplate.fromExample as <T extends boolean[] | number[] | string[]>(defaultValue: T) => CollectionDefinitionAPI<T>;
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

