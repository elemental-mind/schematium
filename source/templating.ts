type PrimitiveTemplate = typeof number | typeof string | typeof boolean;
type PrimitiveString = "string" | "boolean" | "number";
// Structural type matching the ValueTemplate class returned from generateBaseClasses
export interface ValueTemplateAPI<T>
{
    validate(value: T): boolean;
    parseString(value: string): T;
}

type TypeOption = PrimitiveTemplate | TemplateObject | ValueTemplateAPI<any>;
type ResolveTypeInput<T extends TypeOption> =
    T extends typeof number ? number :
    T extends typeof string ? string :
    T extends typeof boolean ? boolean :
    T extends TemplateObject ? Concrete<T> :
    T extends Array<infer E extends TypeOption> ? ResolveTypeInput<E> :
    never;

type Concrete<T extends TemplateObject> = {
    [K in keyof T]:
    T[K] extends ValueDefinitionAPI<infer V> ? V :
    T[K] extends TemplateObject ? Concrete<T[K]>
    : never
};

// Internal indirection — never used by call sites, just breaks type circularity
type OptionalityDefinitionSelf<T> = OptionalityDefinitionAPI<T, OptionalityDefinitionSelf<T>>;
type ValueDefinitionSelf<T> = ValueDefinitionAPI<T, ValueDefinitionSelf<T>>;
type CollectionDefinitionSelf<T> = CollectionDefinitionAPI<T, CollectionDefinitionSelf<T>>;
type TypedCollectionDefinitionSelf<T> = TypedCollectionDefinitionAPI<T, TypedCollectionDefinitionSelf<T>>;

export interface OptionalityDefinitionAPI<T, TSelf extends OptionalityDefinitionAPI<T, TSelf> = OptionalityDefinitionSelf<T>>
{
    required: TSelf;
    optional: TSelf;
}

export interface ValueDefinitionAPI<T, TSelf extends ValueDefinitionAPI<T, TSelf> = ValueDefinitionSelf<T>> extends OptionalityDefinitionAPI<T, TSelf>
{
    accepts(validator: (value: T) => boolean): TSelf;
}

export interface CollectionDefinitionAPI<T, TSelf extends CollectionDefinitionAPI<T, TSelf> = CollectionDefinitionSelf<T>> extends ValueDefinitionAPI<T, TSelf>
{
    acceptsEntries(validator: EntryValidationClosure<T>): TSelf;
}

export interface TypedCollectionDefinitionAPI<T, TSelf extends TypedCollectionDefinitionAPI<T, TSelf> = TypedCollectionDefinitionSelf<T>> extends CollectionDefinitionAPI<T, TSelf>
{
    withDefault: (defaultValue: T) => TSelf;
}

export interface TemplateObject
{
    [key: string]: TemplateObjectEntry;
}

export type TemplateObjectEntry<T = any> = TemplateObject | ValueConfiguration<T>;

export type ValueConfiguration<T> = ValueDefinitionAPI<T> | CollectionDefinitionAPI<T> | TypedCollectionDefinitionAPI<T>;

export type EntryValidationClosure<T> =
    T extends Array<infer E> ? (value: E) => boolean :
    T extends Record<string, infer E> ? (key: string, value: E) => boolean :
    never;

export interface TemplatingAPI
{
    templating: {
        schema<T extends TemplateObject>(inputSchema: T): ValueTemplateAPI<Concrete<T>>;
    },
    primitives: {
        string(): ValueDefinitionAPI<string | undefined>;
        string(defaultValue: string): ValueDefinitionAPI<string>;
        number(): ValueDefinitionAPI<number | undefined>;
        number(defaultValue: number): ValueDefinitionAPI<number>;
        boolean(): ValueDefinitionAPI<boolean | undefined>;
        boolean(defaultValue: boolean): ValueDefinitionAPI<boolean>;
        object<T extends TemplateObject>(value: T): ValueDefinitionAPI<Concrete<T>>;
    },
    variadics: {
        valueOf(...types: any[]): ValueDefinitionAPI<any>;
        oneOf<T extends string | number>(...possibleValues: T[]): OptionalityDefinitionAPI<T>;
    },
    collections: {
        list<T>(defaultValue: Record<string, T>): CollectionDefinitionAPI<Record<string, T>>;
        listOf<T extends TypeOption[]>(...types: T): TypedCollectionDefinitionAPI<Record<string, ResolveTypeInput<T[number]>>>;
        array<T>(defaultValue: T[]): CollectionDefinitionAPI<T[]>;
        arrayOf<T extends TypeOption[]>(...types: T): TypedCollectionDefinitionAPI<ResolveTypeInput<T[number]>[]>;
    },
};

export type ExtensibleTemplatingAPI<TemplateExtensions = {}, PrimitiveExtensions = {}, VariadicExtensions = {}, CollectionExtensions = {}> =
    {
        [K in keyof TemplatingAPI]:
        K extends "templating" ? { [S in keyof TemplatingAPI["templating"]]: TemplatingAPI["templating"][S] & TemplateExtensions } :
        K extends "primitives" ? { [S in keyof TemplatingAPI["primitives"]]: TemplatingAPI["primitives"][S] & PrimitiveExtensions } :
        K extends "variadics" ? { [S in keyof TemplatingAPI["variadics"]]: TemplatingAPI["variadics"][S] & VariadicExtensions } :
        K extends "collections" ? { [S in keyof TemplatingAPI["collections"]]: TemplatingAPI["collections"][S] & CollectionExtensions } :
        never
    };

function generateTemplatingClasses(BaseClass: new (...args: any[]) => any = Object)
{
    abstract class ValueTemplate<T> extends BaseClass implements ValueTemplateAPI<T>, ValueDefinitionAPI<T>
    {
        static fromExample(exampleValue: any): ValueTemplate<any>
        {
            switch (typeof exampleValue)
            {
                case "string": return new StringTemplate();
                case "number": return new NumberTemplate();
                case "boolean": return new BooleanTemplate();
                case "object":
                    if (Array.isArray(exampleValue))
                        return ArrayTemplate.fromExample<any>(exampleValue);
                    else
                        return ListTemplate.fromExample(exampleValue);
            }
            throw new Error("Cannot resolve template from example value");
        }

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
                            identifiedNormalizedTypes.add(ListTemplate.fromExample(exampleValue));
                    default:
                        throw new Error("Cannot resolve template from example value");
                }
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

        get parsingPriority()
        {
            if (this instanceof NumberTemplate) return 0;
            if (this instanceof BooleanTemplate) return 1;
            if (this instanceof CollectionTemplate) return 2;
            if (this instanceof StringTemplate) return 4;

            return 3;
        }

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
            this.isOptional = true;
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

    class StringTemplate extends ValueTemplate<string>
    {
        parseString(value: string): string { return value; }
        validateType(value: unknown): value is string { return typeof value === "string"; }
    }

    class NumberTemplate extends ValueTemplate<number>
    {
        parseString(value: string): number
        {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || value.trim() === "")
                throw new Error(`Cannot parse "${value}" as number`);
            return parsed;
        }
        validateType(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
    }

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

    class VariadicTemplate<T> extends ValueTemplate<T>
    {
        public permittedTypes: ValueTemplate<any>[] = [];

        constructor(...permittedTypes: ValueTemplate<any>[])
        {
            super();
            this.permittedTypes = permittedTypes;
            this.sortForParsingPriority();
        }

        private sortForParsingPriority()
        {
            this.permittedTypes.sort((a, b) => a.parsingPriority - b.parsingPriority);
        }

        parseString(valueString: string): T
        {
            for (const permittedType of this.permittedTypes)
            {
                try
                {
                    const value = permittedType.parseString(valueString);
                    if (permittedType.validate(value)) return value;
                }
                catch (e) { continue; }
            }
            throw new Error("Could not match input to any possible type");
        }

        validateType(value: unknown): boolean
        {
            for (const permittedType of this.permittedTypes)
                if (permittedType.validate(value)) return true;
            return false;
        }
    }

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

            if ([...this.template.values()].every(value => value.isOptional))
                this.isOptional = true;
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

    abstract class CollectionTemplate<T> extends ValueTemplate<T> implements TypedCollectionDefinitionAPI<T>
    {
        protected entryTemplate: ValueTemplate<any> | VariadicTemplate<any>;

        constructor(entryTemplate: ValueTemplate<any> | VariadicTemplate<any>)
        {
            super();
            this.entryTemplate = entryTemplate;
        }

        abstract acceptsEntries(validator: EntryValidationClosure<T>): this;
    }

    class ListTemplate<T> extends CollectionTemplate<Record<string, T>>
    {
        static fromExample<T = any>(exampleList: Record<string, T>)
        {
            const elementType = ValueTemplate.fromExamples(...Object.values(exampleList));
            return new ListTemplate<T>(elementType);
        }

        static fromTypes<T extends TypeOption[]>(...types: T)
        {
            const elementType = ValueTemplate.fromTypeInputs(...types);
            return new ListTemplate<ResolveTypeInput<T[number]>>(elementType);
        }

        protected entryGuard(key: string, value: any)
        {
            return true;
        }

        acceptsEntries(validator: (key: string, value: T) => boolean)
        {
            this.entryGuard = validator;
            return this;
        }

        parseString(value: string)
        {
            const parsed = JSON.parse(value);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
                throw new Error(`Cannot parse "${value}" as list`);
            return parsed as Record<string, T>;
        }

        validateType(value: Record<string, T>): boolean
        {
            if (typeof value !== "object" || value === null || Array.isArray(value))
                return false;
            for (const [key, entry] of Object.entries(value))
                if (!this.validateEntry(key, entry)) return false;
            return true;
        }

        protected validateEntry(key: string, entry: any): boolean
        {
            return this.entryTemplate.validate(entry) && this.entryGuard(key, entry);
        }
    }

    class ArrayTemplate<T> extends CollectionTemplate<T[]>
    {
        static fromExample<T>(exampleArray: T[]): ArrayTemplate<T>
        {
            const elementType = ValueTemplate.fromExamples(...Object.values(exampleArray));
            return new ArrayTemplate<any>(elementType);
        }

        static fromTypes<T extends TypeOption[]>(...types: T): ArrayTemplate<ResolveTypeInput<T[number]>>
        {
            const elementType = ValueTemplate.fromTypeInputs(...types);
            return new ArrayTemplate<ResolveTypeInput<T[number]>>(elementType);
        }

        protected entryGuard(value: any)
        {
            return true;
        }

        acceptsEntries(validator: (value: T) => boolean)
        {
            this.entryGuard = validator;
            return this;
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

        protected validateEntry(entry: any): boolean
        {
            return this.entryTemplate.validate(entry) && this.entryGuard(entry);
        }
    }

    return { ValueTemplate, StringTemplate, NumberTemplate, BooleanTemplate, VariadicTemplate, ObjectTemplate, CollectionTemplate, ListTemplate, ArrayTemplate } as const;
}

export function GenerateTemplatingAPI(BaseClass: new (...args: any[]) => any = Object): TemplatingAPI
{
    const { ValueTemplate, StringTemplate, NumberTemplate, BooleanTemplate, VariadicTemplate, ObjectTemplate, CollectionTemplate, ListTemplate, ArrayTemplate } = generateTemplatingClasses(BaseClass);

    function schema(inputSchema: TemplateObject)
    {
        return ObjectTemplate.fromTemplateObject(inputSchema);
    }

    function string(): ValueDefinitionAPI<string | undefined>;
    function string(defaultValue: string): ValueDefinitionAPI<string>;
    function string(defaultValue?: string)
    {
        const template = new StringTemplate();
        if (defaultValue !== undefined)
        {
            template.default = defaultValue;
            template.isOptional = true;
        }
        return template;
    }

    function number(): ValueDefinitionAPI<number | undefined>;
    function number(defaultValue: number): ValueDefinitionAPI<number>;
    function number(defaultValue?: number)
    {
        const template = new NumberTemplate();
        if (defaultValue !== undefined)
        {
            template.default = defaultValue;
            template.isOptional = true;
        }
        return template;
    }

    function boolean(): ValueDefinitionAPI<boolean | undefined>;
    function boolean(defaultValue: boolean): ValueDefinitionAPI<boolean>;
    function boolean(defaultValue?: boolean)
    {
        const template = new BooleanTemplate();
        if (defaultValue !== undefined)
        {
            template.default = defaultValue;
            template.isOptional = true;
        }
        return template;
    }

    function valueOf<T extends TypeOption[]>(...types: T): ValueDefinitionAPI<ResolveTypeInput<T[number]>>
    {
        return ValueTemplate.fromTypeInputs(...types);
    }

    function oneOf<T extends string | number>(...possibleValues: T[]): OptionalityDefinitionAPI<T>
    {
        const valueSet = new Set(possibleValues);
        return ValueTemplate.fromExamples(...possibleValues).accepts(value => valueSet.has(value));
    }

    function object<T extends TemplateObject>(value: T): ValueDefinitionAPI<Concrete<T>>
    {
        return ObjectTemplate.fromTemplateObject(value);
    }

    function list<T>(defaultValue: Record<string, T>): TypedCollectionDefinitionAPI<Record<string, T>>
    {
        const template = ListTemplate.fromExample<T>(defaultValue);
        template.withDefault(defaultValue);
        return template;
    }

    function listOf<T extends TypeOption[]>(...types: T): TypedCollectionDefinitionAPI<Record<string, ResolveTypeInput<T[number]>>>
    {
        return ListTemplate.fromTypes(...types) as unknown as TypedCollectionDefinitionAPI<Record<string, ResolveTypeInput<T[number]>>>;
    }

    function array<T>(defaultValue: T[]): TypedCollectionDefinitionAPI<T[]>
    {
        const template = ArrayTemplate.fromExample(defaultValue);
        template.withDefault(defaultValue);
        return template;
    }

    function arrayOf<T extends TypeOption[]>(...types: T): TypedCollectionDefinitionAPI<ResolveTypeInput<T[number]>[]>
    {
        return ArrayTemplate.fromTypes(...types) as unknown as TypedCollectionDefinitionAPI<ResolveTypeInput<T[number]>[]>;
    }

    return {
        templating: { schema },
        primitives: { string, number, boolean, object },
        variadics: { valueOf, oneOf },
        collections: { list, listOf, array, arrayOf }
    };
}

const defaultAPI = GenerateTemplatingAPI();
export default defaultAPI;
export const { schema } = defaultAPI.templating;
export const { string, number, boolean, object } = defaultAPI.primitives;
export const { valueOf, oneOf } = defaultAPI.variadics;
export const { list, listOf, array, arrayOf } = defaultAPI.collections;
