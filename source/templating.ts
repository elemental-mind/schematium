type PrimitiveTemplate = typeof number | typeof string | typeof boolean;
type PrimitiveString = "string" | "boolean" | "number";

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
    T[K] extends ValueConfiguration<infer V> ? T[K] extends Required ? Exclude<V, undefined> : V | undefined :
    T[K] extends TemplateObject ? Concrete<T[K]>
    : never
};

declare const required: unique symbol;
declare const forceRequired: unique symbol;

type Required = { [required]: true; };
type StrictlyRequired = { [forceRequired]: true; };
type Optional = { [required]: false; };
type StrictlyOptional = { [forceRequired]: false; };

type ForceRequired<T, ForcedState extends boolean> =
    Omit<T, typeof required | typeof forceRequired> &
    (ForcedState extends true ? StrictlyRequired & Required : StrictlyOptional & Optional);

type SetRequired<T, DefaultState extends boolean> =
    Omit<T, typeof required | typeof forceRequired> & (
        T extends StrictlyRequired ? StrictlyRequired & Required :
        T extends StrictlyOptional ? StrictlyOptional & Optional :
        { [required]: DefaultState; }
    );

export interface ValueTemplateAPI<T>
{
    validate(value: T): boolean;
    parseString(value: string): T;
}

export type ValueType<ThisType> = ThisType extends DefinitionAPI<infer T> ? T : never;

declare const valueType: unique symbol;

export interface DefinitionAPI<T>
{
    [valueType]: T;
}

export interface OptionalityDefinitionAPI<T> extends DefinitionAPI<T>
{
    required: ForceRequired<this, true>;
    optional: ForceRequired<this, false>;
}

export interface ValueDefinitionAPI<T> extends OptionalityDefinitionAPI<T>
{
    accepts(validator: (value: T) => boolean): this;
}

export interface CollectionDefinitionAPI<T> extends ValueDefinitionAPI<T>
{
    acceptsEntries(validator: EntryValidationClosure<T>): this;
}

export interface TypedCollectionDefinitionAPI<T> extends CollectionDefinitionAPI<T>
{
    withDefault: (defaultValue: T) => SetRequired<this, false>;
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

export interface TemplatingAPI<
    TemplateExt = {},
    PrimitiveExt = {},
    VariadicExt = {},
    CollectionExt = {}
>
{
    templating: {
        schema<T extends TemplateObject>(inputSchema: T): ValueTemplateAPI<Concrete<T>> & TemplateExt;
    },
    primitives: {
        string(): ValueDefinitionAPI<string> & PrimitiveExt & Required;
        string(defaultValue: string): ValueDefinitionAPI<string> & PrimitiveExt & Optional;
        number(): ValueDefinitionAPI<number> & PrimitiveExt & Required;
        number(defaultValue: number): ValueDefinitionAPI<number> & PrimitiveExt & Optional;
        boolean(): ValueDefinitionAPI<boolean> & PrimitiveExt & Required;
        boolean(defaultValue: boolean): ValueDefinitionAPI<boolean> & PrimitiveExt & Optional;
        object<T extends TemplateObject>(value: T): ValueDefinitionAPI<Concrete<T>> & PrimitiveExt & Required;
    },
    variadics: {
        valueOf<T extends TypeOption[]>(...types: T): ValueDefinitionAPI<ResolveTypeInput<T[number]>> & VariadicExt & Required;
        oneOf<T extends string | number>(...possibleValues: T[]): OptionalityDefinitionAPI<T> & VariadicExt & Required;
    },
    collections: {
        list<T>(defaultValue: Record<string, T>): CollectionDefinitionAPI<Record<string, T>> & CollectionExt & Optional;
        listOf<T extends TypeOption[]>(...types: T): TypedCollectionDefinitionAPI<Record<string, ResolveTypeInput<T[number]>>> & CollectionExt & Required;
        array<T>(defaultValue: T[]): CollectionDefinitionAPI<T[]> & CollectionExt & Optional;
        arrayOf<T extends TypeOption[]>(...types: T): TypedCollectionDefinitionAPI<ResolveTypeInput<T[number]>[]> & CollectionExt & Required;
    },
}

function generateTemplatingClasses(BaseClass: new (...args: any[]) => any = Object)
{
    abstract class ValueTemplate<T> extends BaseClass implements ValueTemplateAPI<T>, ValueDefinitionAPI<T>
    {
        declare [valueType]: T;

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
            if (typeof typeOption === "string")
                switch (typeOption)
                {
                    case "string": return new StringTemplate();
                    case "number": return new NumberTemplate();
                    case "boolean": return new BooleanTemplate();
                }
            // If they pass the function references (e.g., `arrayOf(string)`), just invoke it to generate a arequired template
            else if (typeof typeOption === "function")
                return typeOption() as any;
            else if (typeOption instanceof ValueTemplate)
                return typeOption;
            else if (typeof typeOption === "object" && typeOption !== null)
                return ObjectTemplate.fromTemplateObject(typeOption as TemplateObject);

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

        readonly parsingPriority: number = 3;
        public default?: T;
        isOptional = false;
        protected customValidator?: (value: T) => boolean;

        get required(): any
        {
            this.isOptional = false;
            return this;
        }

        get optional(): any
        {
            this.isOptional = true;
            return this;
        }

        accepts(validator: (value: T) => boolean): any
        {
            this.customValidator = validator;
            return this;
        }

        withDefault(defaultValue: T): any
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
        readonly parsingPriority: number = 4;
        parseString(value: string): string { return value; }
        validateType(value: unknown): value is string { return typeof value === "string"; }
    }

    class NumberTemplate extends ValueTemplate<number>
    {
        readonly parsingPriority: number = 0;
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
        readonly parsingPriority: number = 1;
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
        readonly parsingPriority: number = 2;
        protected entryTemplate: ValueTemplate<any> | VariadicTemplate<any>;

        constructor(entryTemplate: ValueTemplate<any> | VariadicTemplate<any>)
        {
            super();
            this.entryTemplate = entryTemplate;
        }

        abstract acceptsEntries(validator: EntryValidationClosure<T>): any;
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

export function GenerateTemplatingAPI<T = TemplatingAPI>(BaseClass: new (...args: any[]) => any = Object)
{
    const { ValueTemplate, StringTemplate, NumberTemplate, BooleanTemplate, VariadicTemplate, ObjectTemplate, CollectionTemplate, ListTemplate, ArrayTemplate } = generateTemplatingClasses(BaseClass);

    function schema(inputSchema: TemplateObject)
    {
        return ObjectTemplate.fromTemplateObject(inputSchema);
    }

    function string(defaultValue?: string): any
    {
        return defaultValue !== undefined ? new StringTemplate().withDefault(defaultValue) : new StringTemplate();
    }

    function number(defaultValue?: number): any
    {
        return defaultValue !== undefined ? new NumberTemplate().withDefault(defaultValue) : new NumberTemplate();
    }

    function boolean(defaultValue?: boolean): any
    {
        return defaultValue !== undefined ? new BooleanTemplate().withDefault(defaultValue) : new BooleanTemplate();
    }

    function valueOf<T extends TypeOption[]>(...types: T): ValueDefinitionAPI<ResolveTypeInput<T[number]>> & Required
    {
        return ValueTemplate.fromTypeInputs(...types) as any;
    }

    function oneOf<T extends string | number>(...possibleValues: T[]): OptionalityDefinitionAPI<T> & Required
    {
        const valueSet = new Set(possibleValues);
        return ValueTemplate.fromExamples(...possibleValues).accepts(value => valueSet.has(value)) as any;
    }

    function object<T extends TemplateObject>(value: T): ValueDefinitionAPI<Concrete<T>> & Required
    {
        return ObjectTemplate.fromTemplateObject(value) as any;
    }

    function list<T>(defaultValue: Record<string, T>): TypedCollectionDefinitionAPI<Record<string, T>> & Optional
    {
        const template = ListTemplate.fromExample<T>(defaultValue);
        template.withDefault(defaultValue);
        return template as any;
    }

    function listOf<T extends TypeOption[]>(...types: T): TypedCollectionDefinitionAPI<Record<string, ResolveTypeInput<T[number]>>> & Required
    {
        return ListTemplate.fromTypes(...types) as any;
    }

    function array<T>(defaultValue: T[]): TypedCollectionDefinitionAPI<T[]> & Optional
    {
        const template = ArrayTemplate.fromExample(defaultValue);
        template.withDefault(defaultValue);
        return template as any;
    }

    function arrayOf<T extends TypeOption[]>(...types: T): TypedCollectionDefinitionAPI<ResolveTypeInput<T[number]>[]> & Required
    {
        return ArrayTemplate.fromTypes(...types) as any;
    }

    return {
        templating: { schema },
        primitives: { string, number, boolean, object },
        variadics: { valueOf, oneOf },
        collections: { list, listOf, array, arrayOf }
    } as T;
}

const defaultAPI = GenerateTemplatingAPI();
export default defaultAPI;
export const { schema } = defaultAPI.templating;
export const { string, number, boolean, object } = defaultAPI.primitives;
export const { valueOf, oneOf } = defaultAPI.variadics;
export const { list, listOf, array, arrayOf } = defaultAPI.collections;