//------------------------------------------------
// Types & Interfaces
//------------------------------------------------

declare const required: unique symbol;
declare const forceRequired: unique symbol;
declare const valueType: unique symbol;

export type ParseResult<T> =
    | { success: true; value: T; }
    | { success: false; error: string; };

export type ValueType<ThisType> = ThisType extends DefinitionAPI<infer T> ? T : never;

export type TemplateObjectEntry<T = any> = TemplateObject | ValueConfiguration<T>;
export type ValueConfiguration<T> = ValueDefinitionAPI<T> | CollectionDefinitionAPI<T>;

export type ValueValidationClosure<T> = ((value: T) => boolean) | ((value: T, context: ValidationContext) => void);
export type EntryValidationClosure<T> = ((key: string | number, value: T) => boolean) | ((key: string | number, value: T, context: ValidationContext) => void);

type TypeOption = PrimitiveTemplate | TemplateObject | ValueTemplateAPI<any>;
type PrimitiveTemplate = typeof number | typeof string | typeof boolean;
type PrimitiveString = "string" | "boolean" | "number";

type RequiredEntry = { [required]: true; };
type StrictlyRequiredEntry = { [forceRequired]: true; };
type OptionalEntry = { [required]: false; };
type StrictlyOptionalEntry = { [forceRequired]: false; };

export type InferTypeDefinitionType<T extends TypeOption> =
    T extends typeof number ? number :
    T extends typeof string ? string :
    T extends typeof boolean ? boolean :
    T extends TemplateObject ? InferSchemaType<T> :
    T extends Array<infer E extends TypeOption> ? InferTypeDefinitionType<E> :
    never;

export type InferSchemaType<T extends TemplateObject> = {
    [K in keyof T]:
    T[K] extends ValueConfiguration<infer V> ? T[K] extends RequiredEntry ? Exclude<V, undefined> : V | undefined :
    T[K] extends TemplateObject ? InferSchemaType<T[K]>
    : never
};

type ForceRequired<T, ForcedState extends boolean> =
    Omit<T, typeof required | typeof forceRequired> &
    (ForcedState extends true ? StrictlyRequiredEntry & RequiredEntry : StrictlyOptionalEntry & OptionalEntry);

type SetRequired<T, DefaultState extends boolean> =
    Omit<T, typeof required | typeof forceRequired> & (
        T extends StrictlyRequiredEntry ? StrictlyRequiredEntry & RequiredEntry :
        T extends StrictlyOptionalEntry ? StrictlyOptionalEntry & OptionalEntry :
        { [required]: DefaultState; }
    );

export interface ValidationToleranceSettings
{
    //allowPartial enables checking only partial objects, that don't have all required keys. It only checks types of known keys, not if all required keys are present. Defaults to false. 
    allowPartial?: boolean;
    //allowUnknowns ignores keys that are not defined in the schema and lets objects pass that have more keys than defined in the schema. Defaults to false.
    allowUnknowns?: boolean;
}

export interface ValidationSettings extends ValidationToleranceSettings
{
    //fast validation fails on the first wrong validation and does not report issues, defaults to true
    fast?: boolean;
}

export interface ValueTemplateAPI<T>
{
    isOptional: boolean;
    check(value: unknown, settings: ValidationToleranceSettings): value is T;
    validate(value: unknown, settings: ValidationSettings): ValidationResult;
    parseString(value: string, settings?: ValidationToleranceSettings): ParseResult<T>;
    getDefault(): T | undefined;
}

export interface DefinitionAPI<T>
{
    [valueType]: T;
}

export interface OptionalityDefinitionAPI<T> extends DefinitionAPI<T>
{
    required: ForceRequired<this, true>;
    optional: ForceRequired<this, false>;
}

export interface DefaultDefinitionAPI<T> extends DefinitionAPI<T>
{
    withDefault: (defaultValue: T, cloneWhenAssigned?: boolean) => SetRequired<this, false>;
}

export interface ValueDefinitionAPI<T> extends OptionalityDefinitionAPI<T>
{
    accepts(validator: ValueValidationClosure<T>): this;
}

export interface CollectionDefinitionAPI<T> extends ValueDefinitionAPI<T>
{
    acceptsEntries(validator: EntryValidationClosure<T>): this;
}

export interface TemplateObject
{
    [key: string]: TemplateObjectEntry;
}

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
        string(): ValueDefinitionAPI<string> & DefaultDefinitionAPI<string> & PrimitiveExt & RequiredEntry;
        string(defaultValue: string): ValueDefinitionAPI<string> & PrimitiveExt & OptionalEntry;
        number(): ValueDefinitionAPI<number> & DefaultDefinitionAPI<number> & PrimitiveExt & RequiredEntry;
        number(defaultValue: number): ValueDefinitionAPI<number> & PrimitiveExt & OptionalEntry;
        boolean(): ValueDefinitionAPI<boolean> & DefaultDefinitionAPI<boolean> & PrimitiveExt & RequiredEntry;
        boolean(defaultValue: boolean): ValueDefinitionAPI<boolean> & PrimitiveExt & OptionalEntry;
        object<T extends TemplateObject>(value: T): ValueDefinitionAPI<InferSchemaType<T>> & DefaultDefinitionAPI<InferSchemaType<T>> & PrimitiveExt & RequiredEntry;
    },
    variadics: {
        valueOf<T extends TypeOption[]>(...types: T): ValueDefinitionAPI<InferTypeDefinitionType<T[number]>> & DefaultDefinitionAPI<T[number]> & VariadicExt & RequiredEntry;
        oneOf<T extends string | number>(...possibleValues: T[]): OptionalityDefinitionAPI<T> & DefaultDefinitionAPI<T> & VariadicExt & RequiredEntry;
    },
    collections: {
        list<T>(defaultValue: Record<string, T>, cloneOnDefaultAssignment?: boolean): CollectionDefinitionAPI<Record<string, T>> & CollectionExt & OptionalEntry;
        listOf<T extends TypeOption[]>(...types: T): CollectionDefinitionAPI<Record<string, InferTypeDefinitionType<T[number]>>> & DefaultDefinitionAPI<Record<string, InferTypeDefinitionType<T[number]>>> & CollectionExt & RequiredEntry;
        array<T>(defaultValue: T[], cloneOnDefaultAssignment?: boolean): CollectionDefinitionAPI<T[]> & CollectionExt & OptionalEntry;
        arrayOf<T extends TypeOption[]>(...types: T): CollectionDefinitionAPI<InferTypeDefinitionType<T[number]>[]> & DefaultDefinitionAPI<InferTypeDefinitionType<T[number]>[]> & CollectionExt & RequiredEntry;
    },
}

//------------------------------------------------
// Utility Functions
//------------------------------------------------

function ParseSuccess<T>(value: T): ParseResult<T> { return { success: true, value }; }
function ParseFailure<T = never>(error: string): ParseResult<T> { return { success: false, error }; }

//------------------------------------------------
// Templating Classes
//------------------------------------------------

function generateTemplatingClasses(BaseClass: new (...args: any[]) => any = Object)
{
    abstract class ValueTemplate<T> extends BaseClass implements ValueTemplateAPI<T>, ValueDefinitionAPI<T>, DefaultDefinitionAPI<T>
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
                        break;
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
        public customValidator?: ValueValidationClosure<T>;
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

        protected get typeLabel(): string
        {
            return this.constructor.name.replace(/Template$/, '').toLowerCase();
        }

        accepts(validator: ValueValidationClosure<T>): any
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

        parseString(value: string, settings?: ValidationToleranceSettings): ParseResult<T>
        {
            const parsed = this.parseRaw(value);
            if (parsed === undefined)
                return ParseFailure(`Cannot parse "${value}" as ${this.typeLabel}`);

            if (!this.check(parsed as T, settings))
                return ParseFailure(`Parsed value does not satisfy ${this.typeLabel} schema`);

            return ParseSuccess(parsed as T);
        }

        protected abstract parseRaw(value: string): T | undefined;

        protected parseJSON(value: string): T | undefined
        {
            try { return JSON.parse(value); }
            catch { return undefined; }
        }

        check(value: T, settings?: ValidationToleranceSettings): value is T
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
            if (value === undefined)
                return this.isOptional ? context : context.rejectWith(UndefinedValue, "Value is required");

            //We compare issue count before and after validation. If rejectWith...was called we skip the custom validation as we already have an issue within.
            if (context.issueCount !== this.validateType(value, context).issueCount)
                return context;

            // simple style: `(value) => boolean` — false means reject
            // detailed style: `(value, context) => void` — already called context.rejectWith itself
            if (this.customValidator?.(value, context) === false)
                context.rejectWith(ValidationIssue, "Custom validation failed");

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

        protected parseRaw(value: string)
        {
            return value;
        }

        validateType(value: unknown, context: ValidationContext)
        {
            return typeof value === "string" ? context : context.rejectWith(TypeMismatch, "String expected");
        }
    }

    class NumberTemplate extends ValueTemplate<number>
    {
        readonly parsingPriority: number = 0;

        protected parseRaw(value: string)
        {
            if (value.trim() === "") return undefined;
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : undefined;
        }

        validateType(value: unknown, context: ValidationContext)
        {
            return (typeof value === "number" && Number.isFinite(value)) ? context : context.rejectWith(TypeMismatch, "Number expected");
        }
    }

    class BooleanTemplate extends ValueTemplate<boolean>
    {
        readonly parsingPriority: number = 1;

        protected parseRaw(value: string)
        {
            const lowered = value.trim().toLowerCase();
            if (lowered === "true" || lowered === "1") return true;
            if (lowered === "false" || lowered === "0") return false;
            return undefined;
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
                if (result.success)
                    return result as ParseResult<T>;
            }
            return ParseFailure("Could not match input to any possible type");
        }

        // parseString is a full override (try each candidate type), so parseRaw is never called
        protected parseRaw(value: string)
        {
            return undefined;
        }

        validateType(value: unknown, context: ValidationContext)
        {
            const fastSubContext = ValidationContext.getFastSubContext(context);

            let matched = false;
            for (const permittedType of this.permittedTypes)
            {
                matched = permittedType.validateWithContext(value, fastSubContext).result === ValidationResult.Pass;

                if (matched) break; else fastSubContext.refresh();
            }

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
        public entries: Array<[string, ValueTemplate<any>]> = [];
        public keys: Set<string> = new Set();
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

                this.keys.add(key);
                this.entries.push([key, subTemplate]);

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

        protected parseRaw(value: string)
        {
            return this.parseJSON(value);
        }

        validateType(value: T, context: ValidationContext)
        {
            if (typeof value !== "object" || value === null)
                return context.rejectWith(TypeMismatch, "Expected object");

            const input = value as Record<string, unknown>;

            for (const [key, template] of this.entries)
            {
                if (Object.hasOwn(input, key))
                {
                    context.pathTrace.push(key);
                    template.validateWithContext(input[key], context);
                    context.pathTrace.pop();
                }
                else if (!(template.isOptional || context.allowPartial))
                    context.rejectWith(MissingMember, "Expected property '" + key + "' in object");

                if (!context.continueValidating) break;
            }

            if (!context.allowUnknowns && this.strict)
                for (const key of Object.keys(input))
                    if (!this.keys.has(key) && !context.rejectWith(UnknownMember, "Member '" + key + "' not allowed").continueValidating) break;

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
        protected entryGuard?: EntryValidationClosure<T>;

        constructor(entryTemplate: ValueTemplate<any> | VariadicTemplate<any>)
        {
            super();
            this.entryTemplate = entryTemplate;
        }

        acceptsEntries(validator: EntryValidationClosure<T>)
        {
            this.entryGuard = validator;
            return this;
        }

        protected validateEntry(key: string | number, entry: any, context: ValidationContext): ValidationContext
        {
            context.pathTrace.push(key);

            //We only call the entryGuard if there was no issue with the underlying type
            // Also if we have a boolean validator, we need to reject ourselves:
            // simple style: `(key, value) => boolean` — false means reject
            // detailed style: `(key, value, context) => void` — already called context.rejectWith itself
            if (context.issueCount === this.entryTemplate.validateWithContext(entry, context).issueCount && this.entryGuard?.(key, entry, context) === false)
                context.rejectWith(ValidationIssue, "Entry Validation failed");

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

        protected parseRaw(value: string): Record<string, T> | undefined { return this.parseJSON(value); }

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

        protected parseRaw(value: string): T[] | undefined { return this.parseJSON(value); }

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

//------------------------------------------------
// Validation Classes
//------------------------------------------------

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
    issueCount = 0;

    result: ValidationResult = ValidationResult.Pass;

    abstract rejectWith(errorType: typeof ValidationIssue, message?: string): ValidationContext;
    abstract release(): void;

    adoptSettings(contextOrSettings: ValidationToleranceSettings)
    {
        this.allowPartial = contextOrSettings.allowPartial ?? false;
        this.allowUnknowns = contextOrSettings.allowUnknowns ?? false;
    }

    refresh()
    {
        this.result = ValidationResult.Pass;
        this.continueValidating = true;
        this.issueCount = 0;
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
        this.issueCount++;

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

    rejectWith(errorType: typeof ValidationIssue, message?: string)
    {
        const error = new errorType();
        if (this.pathTrace.length)
            error.path = this.pathTrace.join(".");
        if (message !== undefined)
            error.message = message;

        if (this.result === ValidationResult.Pass)
            this.result = new ValidationFailure();

        (this.result as ValidationFailure).issues!.push(error);

        this.issueCount++;

        return this;
    }

    release()
    {
        ValidationContext.ThoroughContextCache.push(this);
    }
}

class ValidationSuccess
{
    success = true as const;
}

class ValidationFailure
{
    success = false as const;
    issues: ValidationIssue[] = [];
}

type ValidationResult = { success: true; } | { success: false, issues: ValidationIssue[]; };
const ValidationResult = {
    Pass: Object.freeze(new ValidationSuccess()),
    Fail: Object.freeze(new ValidationFailure())
};

//------------------------------------------------
// Validation Issues
//------------------------------------------------

export class ValidationIssue
{
    static None = Object.freeze(new ValidationIssue());

    path?: string;
    message?: string;

    get kind()
    {
        return this.constructor.name;
    }
}

class TypeMismatch extends ValidationIssue { }
class MissingMember extends ValidationIssue { }
class UnknownMember extends ValidationIssue { }
class UnknownValue extends ValidationIssue { }
class UndefinedValue extends ValidationIssue { }

//------------------------------------------------
// Templating API Functions
//------------------------------------------------

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

    function valueOf<T extends TypeOption[]>(...types: T): ValueDefinitionAPI<InferTypeDefinitionType<T[number]>> & RequiredEntry
    {
        return ValueTemplate.fromTypeInputs(...types) as any;
    }

    function oneOf<T extends string | number>(...possibleValues: T[]): OptionalityDefinitionAPI<T> & RequiredEntry
    {
        const valueSet = new Set(possibleValues);
        return ValueTemplate.fromExamples(...possibleValues).accepts(value => valueSet.has(value)) as any;
    }

    function object<T extends TemplateObject>(value: T): ValueDefinitionAPI<InferSchemaType<T>> & RequiredEntry
    {
        return ObjectTemplate.fromTemplateObject(value) as any;
    }

    function list<T>(defaultValue: Record<string, T>, cloneOnDefaultAssignment: boolean = true): CollectionDefinitionAPI<Record<string, T>> & OptionalEntry
    {
        return ListTemplate.fromExample<T>(defaultValue).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function listOf<T extends TypeOption[]>(...types: T): CollectionDefinitionAPI<Record<string, InferTypeDefinitionType<T[number]>>> & RequiredEntry
    {
        return ListTemplate.fromTypes(...types) as any;
    }

    function array<T>(defaultValue: T[], cloneOnDefaultAssignment = true): CollectionDefinitionAPI<T[]> & OptionalEntry
    {
        return ArrayTemplate.fromExample(defaultValue).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function arrayOf<T extends TypeOption[]>(...types: T): CollectionDefinitionAPI<InferTypeDefinitionType<T[number]>[]> & RequiredEntry
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