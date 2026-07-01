type PrimitiveTemplate = typeof number | typeof string | typeof boolean;
type PrimitiveString = "string" | "boolean" | "number";

type TypeOption = PrimitiveTemplate | TemplateObject | ValueTemplateAPI<any>;
export type InferTypeDefinitionType<T extends TypeOption> =
    T extends typeof number ? number :
    T extends typeof string ? string :
    T extends typeof boolean ? boolean :
    T extends TemplateObject ? InferSchemaType<T> :
    T extends Array<infer E extends TypeOption> ? InferTypeDefinitionType<E> :
    never;

export type InferSchemaType<T extends TemplateObject> = {
    [K in keyof T]:
    T[K] extends ValueConfiguration<infer V> ? T[K] extends Required ? Exclude<V, undefined> : V | undefined :
    T[K] extends TemplateObject ? InferSchemaType<T[K]>
    : never
};

export type ParseResult<T> =
    | { success: true; value: T }
    | { success: false; error: string };

export function ParseSuccess<T>(value: T): ParseResult<T> { return { success: true, value }; }
export function ParseFailure<T = never>(error: string): ParseResult<T> { return { success: false, error }; }

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
    isOptional: boolean;
    check(value: T, settings: ValidationToleranceSettings): boolean;
    validate(value: T, settings: ValidationSettings): ValidationResult;
    parseString(value: string, settings?: ValidationToleranceSettings): ParseResult<T>;
    getDefault(): T | undefined;
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

export interface DefaultDefitionAPI<T> extends DefinitionAPI<T>
{
    withDefault: (defaultValue: T, cloneWhenAssigned?: boolean) => SetRequired<this, false>;
}

export interface ValueDefinitionAPI<T> extends OptionalityDefinitionAPI<T>
{
    accepts(validator: (((value: T) => boolean) | ((value: T, context: ValidationContext) => void))): this;
}

export interface CollectionDefinitionAPI<T> extends ValueDefinitionAPI<T>
{
    acceptsEntries(validator: EntryValidationClosure<T>): this;
}


export interface TemplateObject
{
    [key: string]: TemplateObjectEntry;
}

export type TemplateObjectEntry<T = any> = TemplateObject | ValueConfiguration<T>;

export type ValueConfiguration<T> = ValueDefinitionAPI<T> | CollectionDefinitionAPI<T>;

export type EntryValidationClosure<T> = (key: string | number, value: T) => boolean;

export interface TemplatingAPI<
    TemplateExt = {},
    PrimitiveExt = {},
    VariadicExt = {},
    CollectionExt = {}
>
{
    templating: {
        schema<T extends TemplateObject>(inputSchema: T): ValueTemplateAPI<InferSchemaType<T>> & TemplateExt;
    },
    primitives: {
        string(): ValueDefinitionAPI<string> & DefaultDefitionAPI<string> & PrimitiveExt & Required;
        string(defaultValue: string): ValueDefinitionAPI<string> & PrimitiveExt & Optional;
        number(): ValueDefinitionAPI<number> & DefaultDefitionAPI<number> & PrimitiveExt & Required;
        number(defaultValue: number): ValueDefinitionAPI<number> & PrimitiveExt & Optional;
        boolean(): ValueDefinitionAPI<boolean> & DefaultDefitionAPI<boolean> & PrimitiveExt & Required;
        boolean(defaultValue: boolean): ValueDefinitionAPI<boolean> & PrimitiveExt & Optional;
        object<T extends TemplateObject>(value: T): ValueDefinitionAPI<InferSchemaType<T>> & DefaultDefitionAPI<InferSchemaType<T>> & PrimitiveExt & Required;
    },
    variadics: {
        valueOf<T extends TypeOption[]>(...types: T): ValueDefinitionAPI<InferTypeDefinitionType<T[number]>> & DefaultDefitionAPI<T[number]> & VariadicExt & Required;
        oneOf<T extends string | number>(...possibleValues: T[]): OptionalityDefinitionAPI<T> & DefaultDefitionAPI<T> & VariadicExt & Required;
    },
    collections: {
        list<T>(defaultValue: Record<string, T>, cloneOnDefaultAssignment?: boolean): CollectionDefinitionAPI<Record<string, T>> & CollectionExt & Optional;
        listOf<T extends TypeOption[]>(...types: T): CollectionDefinitionAPI<Record<string, InferTypeDefinitionType<T[number]>>> & DefaultDefitionAPI<Record<string, InferTypeDefinitionType<T[number]>>> & CollectionExt & Required;
        array<T>(defaultValue: T[], cloneOnDefaultAssignment?: boolean): CollectionDefinitionAPI<T[]> & CollectionExt & Optional;
        arrayOf<T extends TypeOption[]>(...types: T): CollectionDefinitionAPI<InferTypeDefinitionType<T[number]>[]> & DefaultDefitionAPI<InferTypeDefinitionType<T[number]>[]> & CollectionExt & Required;
    },
}

function generateTemplatingClasses(BaseClass: new (...args: any[]) => any = Object)
{
    abstract class ValueTemplate<T> extends BaseClass implements ValueTemplateAPI<T>, ValueDefinitionAPI<T>, DefaultDefitionAPI<T>
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
        public isOptional = false;
        public customValidator?: (value: T, context: ValidationContext) => (boolean | void);
        public cloneDefaultWhenDefaultRequested = true;
        protected default?: T;

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

        get hasDefaultValue()
        {
            return this.default !== undefined;
        }

        accepts(validator: (value: T) => boolean): any
        {
            this.customValidator = validator;
            return this;
        }

        withDefault(defaultValue: T, cloneWhenAssigned: boolean = true): any
        {
            this.default = defaultValue;
            this.cloneDefaultWhenDefaultRequested = cloneWhenAssigned;
            this.isOptional = true;
            return this;
        }

        abstract parseString(value: string, settings?: ValidationToleranceSettings): ParseResult<T>;

        check(value: T, settings?: ValidationToleranceSettings): boolean
        {
            return this.validate(value, { fast: true, ...settings }) === ValidationResult.Pass;
        }

        validate(value: T, settings: ValidationSettings = ValidationContext.DefaultSettings): ValidationResult
        {
            const context = ValidationContext.withSettings(settings);
            this.validateWithContext(value, context);
            context.release();
            return context.result;
        }

        validateWithContext(value: T, context: ValidationContext)
        {
            if (value === undefined && !this.isOptional)
                return context.rejectWith(UndefinedValue);

            if (this.validateType(value, context).result !== ValidationResult.Pass)
                return context;

            // simple style: `(value) => boolean` — false means reject
            // detailed style: `(value, context) => void` — already called context.rejectWith itself
            if (this.customValidator?.(value, context) === false)
                context.rejectWith(ValidationError, "Custom validation failed");

            return context;
        }


        abstract validateType(value: T, context: ValidationContext): ValidationContext;

        getDefault()
        {
            return this.cloneDefaultWhenDefaultRequested ? structuredClone(this.default) : this.default;
        }
    }

    class StringTemplate extends ValueTemplate<string>
    {
        readonly parsingPriority: number = 4;

        parseString(value: string): ParseResult<string> { return ParseSuccess(value); }

        validateType(value: unknown, context: ValidationContext)
        {
            return typeof value === "string" ? context : context.rejectWith(TypeMismatch, "String expected");
        }
    }

    class NumberTemplate extends ValueTemplate<number>
    {
        readonly parsingPriority: number = 0;

        parseString(value: string): ParseResult<number>
        {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || value.trim() === "")
                return ParseFailure(`Cannot parse "${value}" as number`);
            return ParseSuccess(parsed);
        }

        validateType(value: unknown, context: ValidationContext)
        {
            return (typeof value === "number" && Number.isFinite(value)) ? context : context.rejectWith(TypeMismatch, "Number expected");
        }
    }

    class BooleanTemplate extends ValueTemplate<boolean>
    {
        readonly parsingPriority: number = 1;

        parseString(value: string): ParseResult<boolean>
        {
            const lowered = value.trim().toLowerCase();
            if (lowered === "true" || lowered === "1") return ParseSuccess(true);
            if (lowered === "false" || lowered === "0") return ParseSuccess(false);
            return ParseFailure(`Cannot parse "${value}" as boolean`);
        }

        validateType(value: unknown, context: ValidationContext)
        {
            return (typeof value === "boolean") ? context : context.rejectWith(TypeMismatch, "Boolean Expected");
        }
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


        parseString(valueString: string, settings?: ValidationToleranceSettings): ParseResult<T>
        {
            for (const permittedType of this.permittedTypes)
            {
                const result = permittedType.parseString(valueString, settings);
                if (result.success && permittedType.check(result.value, settings))
                    return result as ParseResult<T>;
            }
            return ParseFailure("Could not match input to any possible type");
        }

        validateType(value: unknown, context: ValidationContext)
        {
            const fastSubContext = ValidationContext.getFastSubContext(context);

            let matched = false;

            for (const permittedType of this.permittedTypes)
                if (!(matched = permittedType.validateWithContext(value, fastSubContext).result === ValidationResult.Pass))
                    fastSubContext.refresh();
                else break;

            fastSubContext.release();

            return matched ? context : context.rejectWith(UnknownValue, "Value not in list of allowed types");
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
        public hasNonCloneDefaultMembers: boolean = false;
        private membersWithDefaultValues: Map<string, ValueTemplate<any>> = new Map();

        private constructor(templateObject: TemplateObject)
        {
            super();
            ObjectTemplate.TemplateCache.set(templateObject, this);

            this.isOptional = true;

            for (const [key, value] of Object.entries(templateObject))
            {
                const subTemplate = value instanceof ValueTemplate ? value : ObjectTemplate.fromTemplateObject(value as TemplateObject);

                this.template.set(key, subTemplate);

                if (subTemplate.hasDefaultValue)
                    this.membersWithDefaultValues.set(key, subTemplate);

                //If one of the values is not optional make whole object not optional.
                this.isOptional &&= subTemplate.isOptional;
            }
        }

        get hasDefaultValue()
        {
            return this.default !== undefined || this.membersWithDefaultValues.size !== 0;
        }

        parseString(value: string): ParseResult<T>
        {
            let parsed: unknown;
            try { parsed = JSON.parse(value); }
            catch { return ParseFailure(`"${value}" is not valid JSON`); }

            if (!this.check(parsed as T, {}))
                return ParseFailure("Parsed value does not match schema");

            return ParseSuccess(parsed as T);
        }

        validateType(value: T, context: ValidationContext)
        {
            if (typeof value !== "object" || value === null)
                return context.rejectWith(TypeMismatch, "Expected object");

            const input = value as Record<string, unknown>;

            for (const [key, template] of this.template.entries())
            {
                if (key in input)
                {
                    context.pathTrace.push(key);
                    template.validateWithContext(value, context);
                    context.pathTrace.pop();
                }
                else if (!(template.isOptional || context.allowPartial))
                    context.rejectWith(MissingMember, "Expected property '" + key + "' in object");

                if (!context.continueValidating) break;
            }

            if (!context.allowUnknowns && this.strict)
                for (const key of Object.keys(input))
                    if (!this.template.has(key) && !context.rejectWith(UnknownMember, "Member '" + key + "' not allowed").continueValidating) break;

            return context;
        }

        getDefault(): T | undefined
        {
            if (!this.hasDefaultValue)
                return undefined;

            if (this.default !== undefined)
                return super.getDefault();

            //If no default value has been supplied we just create a new object every time.
            const clone = {} as any;
            for (const [key, template] of this.membersWithDefaultValues)
                clone[key] = template.getDefault();

            return clone;
        }
    }

    abstract class CollectionTemplate<T> extends ValueTemplate<T> implements CollectionDefinitionAPI<T>
    {
        readonly parsingPriority: number = 2;
        protected entryTemplate: ValueTemplate<any> | VariadicTemplate<any>;
        protected entryGuard?: (key: string | number, value: any, context: ValidationContext) => any;

        constructor(entryTemplate: ValueTemplate<any> | VariadicTemplate<any>)
        {
            super();
            this.entryTemplate = entryTemplate;
        }

        acceptsEntries(validator: (key: string | number, value: T) => boolean)
        {
            this.entryGuard = validator;
            return this;
        }

        protected validateEntry(key: string | number, entry: any, context: ValidationContext): ValidationContext
        {
            context.pathTrace.push(key);

            if (this.entryTemplate.validateWithContext(entry, context).continueValidating && this.entryGuard)
                this.entryGuard(key, entry, context);

            context.pathTrace.pop();

            return context;
        }
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
            return new ListTemplate<InferTypeDefinitionType<T[number]>>(elementType);
        }

        parseString(value: string): ParseResult<Record<string, T>>
        {
            let parsed: unknown;
            try { parsed = JSON.parse(value); }
            catch { return ParseFailure(`"${value}" is not valid JSON`); }

            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
                return ParseFailure(`Cannot parse "${value}" as list`);

            return ParseSuccess(parsed as Record<string, T>);
        }

        validateType(value: Record<string, T>, context: ValidationContext)
        {
            if (typeof value !== "object" || value === null || Array.isArray(value))
                return context.rejectWith(TypeMismatch, "Expected object");

            for (const [key, entry] of Object.entries(value))
                if (!this.validateEntry(key, entry, context).continueValidating) break;

            return context;
        }
    }

    class ArrayTemplate<T> extends CollectionTemplate<T[]>
    {
        static fromExample<T>(exampleArray: T[]): ArrayTemplate<T>
        {
            const elementType = ValueTemplate.fromExamples(...Object.values(exampleArray));
            return new ArrayTemplate<any>(elementType);
        }

        static fromTypes<T extends TypeOption[]>(...types: T): ArrayTemplate<InferTypeDefinitionType<T[number]>>
        {
            const elementType = ValueTemplate.fromTypeInputs(...types);
            return new ArrayTemplate<InferTypeDefinitionType<T[number]>>(elementType);
        }

        parseString(value: string): ParseResult<T[]>
        {
            let parsed: unknown;
            try { parsed = JSON.parse(value); }
            catch { return ParseFailure(`"${value}" is not valid JSON`); }

            if (!Array.isArray(parsed))
                return ParseFailure(`Cannot parse "${value}" as array`);

            return ParseSuccess(parsed as T[]);
        }

        validateType(value: T[], context: ValidationContext)
        {
            if (!Array.isArray(value))
                return context.rejectWith(TypeMismatch, "Array expected");

            for (const [key, entry] of value.entries())
                if (!this.validateEntry(key, entry, context).continueValidating) break;

            return context;
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

    function valueOf<T extends TypeOption[]>(...types: T): ValueDefinitionAPI<InferTypeDefinitionType<T[number]>> & Required
    {
        return ValueTemplate.fromTypeInputs(...types) as any;
    }

    function oneOf<T extends string | number>(...possibleValues: T[]): OptionalityDefinitionAPI<T> & Required
    {
        const valueSet = new Set(possibleValues);
        return ValueTemplate.fromExamples(...possibleValues).accepts(value => valueSet.has(value)) as any;
    }

    function object<T extends TemplateObject>(value: T): ValueDefinitionAPI<InferSchemaType<T>> & Required
    {
        return ObjectTemplate.fromTemplateObject(value) as any;
    }

    function list<T>(defaultValue: Record<string, T>, cloneOnDefaultAssignment: boolean = true): CollectionDefinitionAPI<Record<string, T>> & Optional
    {
        return ListTemplate.fromExample<T>(defaultValue).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function listOf<T extends TypeOption[]>(...types: T): CollectionDefinitionAPI<Record<string, InferTypeDefinitionType<T[number]>>> & Required
    {
        return ListTemplate.fromTypes(...types) as any;
    }

    function array<T>(defaultValue: T[], cloneOnDefaultAssignment = true): CollectionDefinitionAPI<T[]> & Optional
    {
        return ArrayTemplate.fromExample(defaultValue).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function arrayOf<T extends TypeOption[]>(...types: T): CollectionDefinitionAPI<InferTypeDefinitionType<T[number]>[]> & Required
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

interface ValidationToleranceSettings
{
    //allowPartial enables checking only partial objects, that don't have all required keys. It only checks types of known keys, not if all required keys are present. Defaults to false. 
    allowPartial?: boolean;
    //allowUnknowns ignores keys that are not defined in the schema and lets objects pass that have more keys than defined in the schema. Defaults to false.
    allowUnknowns?: boolean;
}

export interface ValidationSettings extends ValidationToleranceSettings
{
    //fast validation fails on the first wrong validation, defaults to true
    fast?: boolean;
}

abstract class ValidationContext
{
    static DefaultSettings = { fast: true, allowPartial: false, allowUnknowns: false };
    protected static FastContextCache: FastValidator[] = [];
    protected static ThoroughContextCache: ThoroughValidator[] = [];

    static withSettings(settings: ValidationSettings)
    {
        let context;
        if (settings.fast === false)
            context = this.ThoroughContextCache.pop() ?? new ThoroughValidator();
        else
            context = this.FastContextCache.pop() ?? new FastValidator();

        context.refresh();
        context.adoptSettings(settings);
        return context;
    }

    static getFastSubContext(mainContext: ValidationContext)
    {
        const subContext = this.FastContextCache.pop() ?? new FastValidator();
        subContext.adoptSettings(mainContext);
        return subContext;
    }

    allowPartial = false;
    allowUnknowns = false;

    abstract pathTrace: Array<String | Number>;
    continueValidating: boolean = true;

    result: ValidationResult = ValidationResult.Pass;

    abstract rejectWith(errorType: typeof ValidationError, message?: string): ValidationContext;
    abstract release(): void;

    adoptSettings(contextOrSettings: ValidationToleranceSettings)
    {
        this.allowPartial = contextOrSettings.allowPartial ?? false;
        this.allowUnknowns = contextOrSettings.allowPartial ?? false;;
    }

    refresh()
    {
        this.result = ValidationResult.Pass;
        this.continueValidating = true;
    }
}

class FastValidator extends ValidationContext
{
    declare pathTrace: (String | Number)[];
    static {
        //We use a single array instance so we don't have to instantiate an array per FastValidator instance.
        this.prototype.pathTrace = [];
        //We nerf the array so it never actually gets elements added. This way we eliminate path tracing which we don't need and speed up fast validation.
        this.prototype.pathTrace.push = () => 0;
    }

    rejectWith()
    {
        this.result = ValidationResult.Fail;
        this.continueValidating = false;

        return this;
    }

    release()
    {
        ValidationContext.FastContextCache.push(this);
    }
}

class ThoroughValidator extends ValidationContext
{
    pathTrace = [];

    refresh(): void
    {
        super.refresh();
        this.pathTrace.length = 0;
    }

    rejectWith(errorType: typeof ValidationError, message?: string)
    {
        const error = new errorType();
        if (this.pathTrace.length)
            error.path = this.pathTrace.join(".");
        if (message !== undefined)
            error.message = message;

        if (this.result === ValidationResult.Pass)
            this.result = new ValidationResult(false, [error]);
        else
            this.result.errors!.push(error);

        return this;
    }

    release()
    {
        ValidationContext.ThoroughContextCache.push(this);
    }
}

export class ValidationResult
{
    static Pass = Object.freeze(new ValidationResult(true));
    static Fail = Object.freeze(new ValidationResult(false));

    result: boolean;
    errors?: ValidationError[];

    constructor(result: boolean, errors?: ValidationError[])
    {
        this.result = result;
        if (errors)
            this.errors = errors;
    }
}

export class ValidationError
{
    static None = Object.freeze(new ValidationError());

    path?: string;
    message?: string;

    get kind()
    {
        return this.constructor.name;
    }
}

class TypeMismatch extends ValidationError
{

}

class MissingMember extends ValidationError
{

}

class UnknownMember extends ValidationError
{

}

class UnknownValue extends ValidationError
{

}

class UndefinedValue extends ValidationError
{

}

const defaultAPI = GenerateTemplatingAPI();
export default defaultAPI;
export const { schema } = defaultAPI.templating;
export const { string, number, boolean, object } = defaultAPI.primitives;
export const { valueOf, oneOf } = defaultAPI.variadics;
export const { list, listOf, array, arrayOf } = defaultAPI.collections;