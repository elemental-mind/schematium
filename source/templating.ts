//------------------------------------------------
// Interfaces
//------------------------------------------------

export interface TemplateObject
{
    [key: string]: TemplateObjectEntry;
}

declare const valueType: unique symbol;
export interface SchemaBaseAPI<T>
{
    [valueType]: T;
}

export interface SchemaAPI<T> extends SchemaBaseAPI<T>
{
    isOptional: boolean;
    check(value: unknown, settings?: ValidationTolerances): value is T;
    validate(value: unknown, settings?: ValidationSettings): ValidationResult;
    parseString<T>(value: string, settings?: ValidationSettings): ParseResult<T>;
    getDefault(): Partial<T> | undefined;
    patchOrOverride(base: Partial<T>, patch: Partial<T>): Partial<T>;
}

export interface TemplateAPI<T> extends OptionalityAPI<T>, DefaultsAPI<T>, CheckAPI<T> { };

export interface OptionalityAPI<T> extends SchemaBaseAPI<T>
{
    required: ForceRequired<this, true>;
    optional: ForceRequired<this, false>;
}

export interface DefaultsAPI<T> extends SchemaBaseAPI<T>
{
    withDefault: (defaultValue: T, cloneWhenAssigned?: boolean) => SetRequired<this, false>;
}

export interface ValidationAPI
{
    rejectWith(errorType: typeof ValidationIssue, message?: string): void;
}

export interface CheckAPI<T> extends OptionalityAPI<T>
{
    accepts(validator: (value: T) => boolean): this;
    accepts(validator: (value: T, validator: ValidationAPI) => void): this;
}

export interface CollectionTemplateAPI<T> extends TemplateAPI<T>
{
    acceptsEntries(validator: (key: string | number, value: CollectionEntryType<T>) => boolean): this;
    acceptsEntries(validator: (key: string | number, value: CollectionEntryType<T>, validator: ValidationAPI) => void): this;
}

export interface ValidationTolerances
{
    //allowPartial enables checking only partial objects, that don't have all required keys. It only checks types of known keys, not if all required keys are present. Defaults to false. 
    allowPartial?: boolean;
    //allowUnknowns ignores keys that are not defined in the schema and lets objects pass that have more keys than defined in the schema. Defaults to false.
    allowUnknowns?: boolean;
}

export interface ValidationSettings extends ValidationTolerances
{
    //fast validation fails on the first wrong validation and does not report issues, defaults to true
    mode?: "fastNoIssueReport" | "thorough";
}


//------------------------------------------------
// Types
//------------------------------------------------

export type ValueType<Template> =
    Template extends SchemaBaseAPI<infer T> ? T :
    Template extends TemplateObject ? InferSchemaType<Template> :
    Template extends LiteralType ? Template :
    never;

export type TemplateObjectEntry = TemplateObject | LiteralType | SchemaBaseAPI<any>;

export type InferSchemaType<T extends TemplateObject> = { [K in RequiredKeys<T>]: Exclude<ValueType<T[K]>, undefined>; } & { [K in OptionalKeys<T>]?: ValueType<T[K]>; };

export type InferTypeDefinitionType<T extends TypeOption> =
    T extends typeof number ? number :
    T extends typeof string ? string :
    T extends typeof boolean ? boolean :
    T extends number | string ? T :
    T extends TemplateObject ? InferSchemaType<T> :
    never;

type CollectionEntryType<T> =
    T extends Record<string, infer E> ? E :
    T extends Array<infer E> ? E :
    never;

type TypeOption = PrimitiveType | TemplateObject | SchemaAPI<any> | LiteralType;
type PrimitiveType = typeof number | typeof string | typeof boolean;
type LiteralType = number | string;

declare const required: unique symbol;
declare const forceRequired: unique symbol;

type RequiredEntry = { [required]: true; };
type StrictlyRequiredEntry = { [forceRequired]: true; };
type OptionalEntry = { [required]: false; };
type StrictlyOptionalEntry = { [forceRequired]: false; };

type RequiredKeys<T extends TemplateObject> = { [K in keyof T]-?: T[K] extends RequiredEntry ? K : T[K] extends LiteralType ? K : never }[keyof T];
type OptionalKeys<T extends TemplateObject> = Exclude<keyof T, RequiredKeys<T>>;

type ForceRequired<T, ForcedState extends boolean> =
    Omit<T, typeof required | typeof forceRequired> &
    (ForcedState extends true ? StrictlyRequiredEntry & RequiredEntry : StrictlyOptionalEntry & OptionalEntry);

type SetRequired<T, DefaultState extends boolean> =
    Omit<T, typeof required | typeof forceRequired> & (
        T extends StrictlyRequiredEntry ? StrictlyRequiredEntry & RequiredEntry :
        T extends StrictlyOptionalEntry ? StrictlyOptionalEntry & OptionalEntry :
        { [required]: DefaultState; }
    );

//------------------------------------------------
// Templating Classes
//------------------------------------------------

function generateTemplatingClasses(BaseClass: new (...args: any[]) => any = Object)
{
    abstract class ValueTemplate<T> extends BaseClass implements SchemaAPI<T>, CheckAPI<T>, DefaultsAPI<T>
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
                    if (exampleValue === null)
                        throw new Error("Cannot derive template from null");
                    if (Array.isArray(exampleValue))
                        return ArrayTemplate.fromExample<any>(exampleValue);
                    else
                        return RecordTemplate.fromExample(exampleValue);
            }
            throw new Error("Cannot resolve template from example value");
        }

        static fromExamples(...exampleValues: any[]): ValueTemplate<any> | VariadicTemplate<any> | RecordTemplate<any> | ArrayTemplate<any>
        {
            if (exampleValues.length === 0)
                throw new Error("Example values needed to derive template");
            if (exampleValues.length === 1)
                return this.fromExample(exampleValues[0]);

            const identifiedNormalizedTypes = new Set<ValueTemplate<any> | PrimitiveType>();
            for (const exampleValue of exampleValues)
            {
                switch (typeof exampleValue)
                {
                    case "string":
                        identifiedNormalizedTypes.add(string);
                        break;
                    case "number":
                        identifiedNormalizedTypes.add(number);
                        break;
                    case "boolean":
                        identifiedNormalizedTypes.add(boolean);
                        break;
                    case "object":
                        if (Array.isArray(exampleValue))
                            identifiedNormalizedTypes.add(ArrayTemplate.fromExample(exampleValue));
                        else
                            identifiedNormalizedTypes.add(RecordTemplate.fromExample(exampleValue));
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

        static fromTypeInput(typeOption: TypeOption): ValueTemplate<any>
        {
            switch (typeof typeOption)
            {
                case "string":
                case "number":
                    return new LiteralTemplate(typeOption);
                case "function":
                    // If they pass the function references (e.g., `arrayOf(string)`), just invoke it to generate a required template
                    return typeOption() as any;
                case "object":
                    if (typeOption === null)
                        break;
                    if (typeOption instanceof ValueTemplate)
                        return typeOption;
                    return ObjectTemplate.fromTemplateObject(typeOption as TemplateObject);
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

        public readonly matchingPriority: number = 3;
        public isOptional = false;
        public customValidator?: ((value: T) => boolean) | ((value: T, validator: ValidationAPI) => void);
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

        accepts(validator: (value: T) => boolean): any;
        accepts(validator: (value: T, validator: ValidationAPI) => void): any;
        accepts(validator: any): any
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

        parseString<T>(value: string, settings: ValidationSettings = Validator.DefaultSettings): ParseResult<T>
        {
            const validator = Validator.withSettings(settings);
            const resultValue = this.parseWithValidation(value, validator);
            const parsed = validator.result.success ? new ParseSuccessResult<T>(resultValue as any) : validator.result;
            validator.release();
            return parsed;
        }

        parseWithValidation(value: string, validator: Validator): T | undefined
        {
            const preParseIssueCount = validator.issueCount;
            const parsedValue = this.parseIntoRawType(value, validator);

            if (validator.issueCount !== preParseIssueCount)
                return undefined;

            if (this.validateWithValidator(parsedValue, validator).result.success)
                return parsedValue as T;
        }

        abstract parseIntoRawType(value: string, validator: Validator): T | undefined;
        abstract identifiesBaseType(value: unknown): boolean;

        parseObject(value: string, validator: Validator): T | undefined
        {
            let result: T | undefined;
            try { result = JSON.parse(value); }
            catch (e)
            {
                validator.rejectWith(ParseError, (e as any)?.message ?? "JSON Parsing Error");
                return undefined;
            }
            return result;
        }

        check(value: unknown, settings?: ValidationTolerances): value is T
        {
            return this.validate(value, { mode: "fastNoIssueReport", ...settings }).success;
        }

        validate(value: unknown, settings: ValidationSettings = Validator.DefaultSettings): ValidationResult
        {
            const validator = Validator.withSettings(settings);
            this.validateWithValidator(value, validator);
            validator.release();
            return validator.result;
        }

        validateWithValidator(value: unknown, validator: Validator)
        {
            if (value === undefined)
                return this.isOptional ? validator : validator.rejectWith(UndefinedValue, "Value is required");

            //We compare issue count before and after validation. If rejectWith...was called we skip the custom validation as we already have an issue within.
            if (validator.issueCount !== this.validateType(value, validator).issueCount)
                return validator;

            // simple style: `(value) => boolean` — false means reject
            // detailed style: `(value, validator) => void` — already called validator.rejectWith itself
            if (this.customValidator?.(value as T, validator) === false)
                validator.rejectWith(ValidationIssue, "Custom validation failed");

            return validator;
        }

        validateType(value: unknown, validator: Validator): Validator
        {
            return this.identifiesBaseType(value) ? validator : validator.rejectWith(TypeMismatch, this.typeLabel + " expected");
        }

        getDefault()
        {
            return this.cloneDefaultWhenDefaultRequested ? structuredClone(this.default) : this.default;
        }

        patchOrOverride(base: any, uncheckedPatch: any): any
        {
            if (uncheckedPatch === undefined || uncheckedPatch === null)
                return base;

            if (!this.check(uncheckedPatch, { allowPartial: true, allowUnknowns: false }))
                throw new Error("Patch is not schema-conforming");

            return this.merge(base, uncheckedPatch);
        }

        merge(base: any, checkedPatch: any): any
        {
            return checkedPatch;
        }
    }

    class StringTemplate extends ValueTemplate<string>
    {
        readonly matchingPriority: number = 4;

        parseIntoRawType(value: string, validator: Validator): string | undefined
        {
            return value;
        }

        identifiesBaseType(value: unknown): boolean
        {
            return typeof value === "string";
        }
    }

    class NumberTemplate extends ValueTemplate<number>
    {
        readonly matchingPriority: number = 0;

        parseIntoRawType(value: string, validator: Validator): number | undefined
        {
            if (value.trim() !== "")
                return Number(value);

            validator.rejectWith(ParseError, "'" + value + "' can not be parsed as number");
        }

        identifiesBaseType(value: unknown): boolean
        {
            return (typeof value === "number" && Number.isFinite(value));
        }
    }

    class BooleanTemplate extends ValueTemplate<boolean>
    {
        readonly matchingPriority: number = 1;

        parseIntoRawType(value: string, validator: Validator): boolean | undefined
        {
            const lowered = value.trim().toLowerCase();
            if (lowered === "true" || lowered === "1") return true;
            if (lowered === "false" || lowered === "0") return false;

            validator.rejectWith(ParseError, "'" + value + "' can not be parsed as boolean");
        }

        identifiesBaseType(value: unknown): boolean
        {
            return typeof value === "boolean";
        }
    }

    class LiteralTemplate<T extends LiteralType> extends ValueTemplate<T>
    {
        permittedValue: T;
        permittedValueTemplate: ValueTemplate<T>;

        constructor(permittedValue: T)
        {
            super();
            this.permittedValue = permittedValue;
            this.permittedValueTemplate = ValueTemplate.fromExample(permittedValue);

            if (!(this.permittedValueTemplate instanceof NumberTemplate ||
                this.permittedValueTemplate instanceof StringTemplate ||
                this.permittedValueTemplate instanceof BooleanTemplate))
                throw new Error("Only numbers, booleans or strings permitted as literal types");
        }

        parseIntoRawType(value: string, validator: Validator): T | undefined
        {
            return this.permittedValueTemplate.parseIntoRawType(value, validator);
        }

        validateType(value: unknown, validator: Validator): Validator
        {
            return value === this.permittedValue ? validator : validator.rejectWith(TypeMismatch, `Literal "${this.permittedValue}" expected`);
        }

        identifiesBaseType(value: unknown): boolean
        {
            return this.permittedValueTemplate.identifiesBaseType(value);
        }
    }

    type ShapeEntryTemplatePair = { shape: ObjectTemplate<any>, keyTemplate: ValueTemplate<any>; };
    type ObjectFingerprints = { uniqueKeys: Map<string, ShapeEntryTemplatePair>, typeDiscernableKeys: Map<string, ShapeEntryTemplatePair[]>; };
    type IterableValue<T> = T extends Iterable<infer E> ? E : never;
    type FilterMatch<Variant, Result> = { input: Variant; result: Result; };

    class VariadicTemplate<T> extends ValueTemplate<T>
    {
        public permittedTypes: ValueTemplate<any>[] = [];
        //This map groups by base type parsing strategies to avoid calling them over and over again for the same input. E.g. we might have multiple type candidates that utitilize JSON.parse.
        public parseStrategyGroups?: Map<ValueTemplate<any>["parseIntoRawType"], ValueTemplate<any>[]>;
        public objectFingerprints?: ObjectFingerprints;

        constructor(...permittedTypes: ValueTemplate<any>[])
        {
            super();
            this.permittedTypes = permittedTypes.sort((type1, type2) => type1.matchingPriority - type2.matchingPriority);

            for (const template of permittedTypes)
            {
                //We need this for now. Otherwise we clash in the parser map as it maps two Variadic Types into one parse pass.
                if (template instanceof VariadicTemplate)
                    throw new Error("Nesting a variadic template in a variadic template not allowed. Flatten the type.");
            }
        }

        parseWithValidation(input: string, validator: Validator): T | undefined
        {
            const parsedAndMatchPrioSortedUnvalidatedValueTemplatePairs = this.parseIntoRawType(input, validator) as { template: ValueTemplate<any>, parsedValue: T; }[];

            if (!parsedAndMatchPrioSortedUnvalidatedValueTemplatePairs.length)
            {
                validator.rejectWith(ParseError, "None of the given templates can parse'" + input + "' successfully");
                return undefined;
            }

            const validatedValueTemplatePairs = this
                .filterValidating(parsedAndMatchPrioSortedUnvalidatedValueTemplatePairs, validator, true,
                    (valueTemplatePair, filterValidator) =>
                        valueTemplatePair.template.validateWithValidator(valueTemplatePair.parsedValue, filterValidator));

            if (validatedValueTemplatePairs.length)
                return validatedValueTemplatePairs[0].input.parsedValue;

            validator.rejectWith(UnknownValue, "'" + input + "' did parse, but can not be interpreted as a permitted value");
            return undefined;
        }

        parseIntoRawType(input: string, validator: Validator): T | undefined
        {
            if (!this.parseStrategyGroups) this.groupTemplatesByParsingStrategy();

            const parsedAndMatchPrioSortedRawValueTemplatePairs = this
                .filterValidating(this.parseStrategyGroups!.values(), validator, false,
                    (templates, filterValidator) =>
                        //templates[0] is the representative that uses the same parse function as all the other templates in the array.
                        templates[0].parseIntoRawType(input, filterValidator))
                //We spread the results to template <==> value pairs for validation later
                .flatMap(({ input: variant, result }) => variant.map(template => { return { template, parsedValue: result }; }));

            return parsedAndMatchPrioSortedRawValueTemplatePairs as T;
        }

        identifiesBaseType(value: unknown): boolean
        {
            return this.permittedTypes.some(type => type.identifiesBaseType(value));
        }

        validateType(value: unknown, validator: Validator)
        {
            const candidateTypes = this.permittedTypes.filter(type => type.identifiesBaseType(value));
            const validatedTypes = this.filterValidating(candidateTypes, validator, true,
                (candidate, filterValidator) => candidate.validateType(value, filterValidator)
            );

            return validatedTypes.length ? validator : validator.rejectWith(UnknownValue, "Value not in list of allowed types");
        }

        merge(base: any, override: any): any
        {
            const validatedBaseTypes = this.findMatchingTypes(base);
            const validatedOverrideTypes = this.findMatchingTypes(override);

            const commonType = validatedBaseTypes.find(baseType => validatedOverrideTypes.includes(baseType));

            if (commonType)
                return commonType.merge(base, override);

            return override;
        }

        private findMatchingTypes(value: unknown): ValueTemplate<any>[]
        {
            const candidates = this.permittedTypes.filter(type => type.identifiesBaseType(value));
            return this.filterValidating(candidates, { allowPartial: true, allowUnknowns: false }, false,
                (candidate, filterValidator) => candidate.validateType(value, filterValidator)
            ).map(result => result.input);
        }

        private filterValidating<VariantCollection extends Iterable<any>, Result>(inputs: VariantCollection, validationSettings: ValidationTolerances, failFast: boolean, checker: ((variant: IterableValue<VariantCollection>, filterValidator: Validator) => Result | undefined)): FilterMatch<IterableValue<VariantCollection>, Result>[]
        {
            const matches: FilterMatch<IterableValue<VariantCollection>, Result>[] = [];
            const fastSubValidator = Validator.getFastSubValidator(validationSettings);

            for (const input of inputs)
            {
                const result = checker(input, fastSubValidator)!;
                if (!fastSubValidator.issueCount)
                {
                    matches.push({ input, result });
                    if (failFast) break;
                }
                fastSubValidator.refresh();
            }

            fastSubValidator.release();
            return matches;
        }

        private groupTemplatesByParsingStrategy()
        {
            this.parseStrategyGroups = new Map();
            for (const template of this.permittedTypes)
                this.parseStrategyGroups.get(template.parseIntoRawType)?.push(template) ?? this.parseStrategyGroups.set(template.parseIntoRawType, [template]);
        }
    }

    class ObjectTemplate<T> extends ValueTemplate<T>
    {
        static TemplateCache = new WeakMap<TemplateObject, ObjectTemplate<any>>();

        static fromTemplateObject(templateObject: TemplateObject)
        {
            if (typeof templateObject !== "object")
                throw new Error("Expected template object, but got raw value instead");

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
                const subTemplate = value instanceof ValueTemplate ? value : ValueTemplate.fromTypeInput(value as TypeOption);

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

        parseIntoRawType = this.parseObject;

        identifiesBaseType(value: unknown): boolean
        {
            return value !== null && typeof value === "object" && !Array.isArray(value);
        }

        validateType(value: T, validator: Validator)
        {
            if (typeof value !== "object" || value === null)
                return validator.rejectWith(TypeMismatch, "Expected object");

            const input = value as Record<string, unknown>;

            for (const [key, template] of this.entries)
            {
                validator.pathTrace.push(key);

                if (Object.hasOwn(input, key))
                    template.validateWithValidator(input[key], validator);
                else if (!(template.isOptional || validator.allowPartial))
                    validator.rejectWith(MissingMember, "Expected property '" + key + "' in object");

                validator.pathTrace.pop();

                if (!validator.continueValidating) break;
            }

            if (validator.continueValidating && !validator.allowUnknowns && this.strict)
                for (const key of Object.keys(input))
                    if (!this.keys.has(key) && !validator.rejectWith(UnknownMember, "Member '" + key + "' not allowed").continueValidating) break;

            return validator;
        }

        merge(base: any, override: any): any
        {
            const baseObject = this.identifiesBaseType(base) ? base as Record<string, unknown> : {};
            const overrideObject = override as Record<string, unknown>;
            const result: Record<string, unknown> = {};

            for (const [key, template] of this.entries)
            {
                if (Object.hasOwn(overrideObject, key))
                    result[key] = template.merge(baseObject[key], overrideObject[key]);
                else if (Object.hasOwn(baseObject, key))
                    result[key] = baseObject[key];
                else if (template.hasDefaultValue)
                    result[key] = template.getDefault();
            }

            return result as Partial<T>;
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

    abstract class CollectionTemplate<T> extends ValueTemplate<T> implements CollectionTemplateAPI<T>
    {
        readonly matchingPriority: number = 2;
        protected entryTemplate: ValueTemplate<any> | VariadicTemplate<any>;
        protected entryGuard?: ((key: string | number, value: CollectionEntryType<T>) => boolean) | ((key: string | number, value: CollectionEntryType<T>, validator: ValidationAPI) => void);

        constructor(entryTemplate: ValueTemplate<any> | VariadicTemplate<any>)
        {
            super();
            this.entryTemplate = entryTemplate;
        }

        acceptsEntries(validator: (key: string | number, value: CollectionEntryType<T>) => boolean): this;
        acceptsEntries(validator: (key: string | number, value: CollectionEntryType<T>, validator: ValidationAPI) => void): this;
        acceptsEntries(validator: any)
        {
            this.entryGuard = validator;
            return this;
        }

        parseIntoRawType = this.parseObject;

        protected validateEntry(key: string | number, entry: any, validator: Validator): Validator
        {
            validator.pathTrace.push(key);

            //We only call the entryGuard if there was no issue with the underlying type
            // Also if we have a boolean validator, we need to reject ourselves:
            // simple style: `(key, value) => boolean` — false means reject
            // detailed style: `(key, value, validator) => void` — already called validator.rejectWith itself
            if (validator.issueCount === this.entryTemplate.validateWithValidator(entry, validator).issueCount && this.entryGuard?.(key, entry, validator) === false)
                validator.rejectWith(ValidationIssue, "Entry Validation failed");

            validator.pathTrace.pop();

            return validator;
        }
    }

    class RecordTemplate<T> extends CollectionTemplate<Record<string, T>>
    {
        static fromExample<T = any>(exampleRecord: Record<string, T>)
        {
            const elementType = ValueTemplate.fromExamples(...Object.values(exampleRecord));
            return new RecordTemplate<T>(elementType);
        }

        static fromTypes<T extends TypeOption[]>(...types: T)
        {
            const elementType = ValueTemplate.fromTypeInputs(...types);
            return new RecordTemplate<InferTypeDefinitionType<T[number]>>(elementType);
        }

        identifiesBaseType = ObjectTemplate.prototype.identifiesBaseType;

        validateType(value: Record<string, T>, validator: Validator)
        {
            if (typeof value !== "object" || value === null || Array.isArray(value))
                return validator.rejectWith(TypeMismatch, "Expected object");

            for (const [key, entry] of Object.entries(value))
                if (!this.validateEntry(key, entry, validator).continueValidating) break;

            return validator;
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

        identifiesBaseType(value: unknown): boolean
        {
            return Array.isArray(value);
        }

        validateType(value: T[], validator: Validator)
        {
            if (!Array.isArray(value))
                return validator.rejectWith(TypeMismatch, "Array expected");

            for (const [key, entry] of value.entries())
                if (!this.validateEntry(key, entry, validator).continueValidating) break;

            return validator;
        }
    }

    return { ValueTemplate, StringTemplate, NumberTemplate, BooleanTemplate, VariadicTemplate, ObjectTemplate, CollectionTemplate, RecordTemplate, ArrayTemplate, LiteralTemplate } as const;
}

//------------------------------------------------
// Validation
//------------------------------------------------

export abstract class Validator
{
    static DefaultSettings: ValidationSettings = { mode: "fastNoIssueReport", allowPartial: false, allowUnknowns: false };
    protected static FastValidatorCache: FastValidator[] = [];
    protected static ThoroughValidatorCache: ThoroughValidator[] = [];

    static withSettings(settings: ValidationSettings)
    {
        let validator;
        if (settings.mode === "thorough")
            validator = this.ThoroughValidatorCache.pop() ?? new ThoroughValidator();
        else
            validator = this.FastValidatorCache.pop() ?? new FastValidator();

        validator.refresh();
        validator.adoptSettings(settings);
        return validator;
    }

    static getFastSubValidator(settings: ValidationSettings)
    {
        const subValidator = this.FastValidatorCache.pop() ?? new FastValidator();
        subValidator.refresh();
        subValidator.adoptSettings(settings);
        return subValidator;
    }

    allowPartial = false;
    allowUnknowns = false;

    abstract pathTrace: Array<String | Number>;
    continueValidating = true;
    issueCount = 0;

    result: ValidationResult = ValidationResult.Success;

    abstract rejectWith(errorType: typeof ValidationIssue, message?: string): Validator;
    abstract release(): void;

    adoptSettings(settingsOrValidator: ValidationSettings = Validator.DefaultSettings)
    {
        this.allowPartial = settingsOrValidator.allowPartial ?? false;
        this.allowUnknowns = settingsOrValidator.allowUnknowns ?? false;
    }

    refresh()
    {
        this.result = ValidationResult.Success;
        this.continueValidating = true;
        this.issueCount = 0;
    }
}

class FastValidator extends Validator
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
        this.result = ValidationResult.Failure;
        this.continueValidating = false;
        this.issueCount++;

        return this;
    }

    release()
    {
        Validator.FastValidatorCache.push(this);
    }
}

class ThoroughValidator extends Validator
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

        if (this.result === ValidationResult.Success)
            this.result = new RejectionResult();

        (this.result as RejectionResult).issues!.push(error);

        this.issueCount++;

        return this;
    }

    release()
    {
        Validator.ThoroughValidatorCache.push(this);
    }
}

//------------------------------------------------
// Results
//------------------------------------------------

export class ValidationSuccessResult
{
    success = true as const;
}

export class ParseSuccessResult<T> extends ValidationSuccessResult
{
    value: T;

    constructor(value: T) { super(); this.value = value; }
}

export class RejectionResult
{
    success = false as const;
    issues: ValidationIssue[] = [];
}

export type ValidationResult = ValidationSuccessResult | RejectionResult;
export type ParseResult<T> = ParseSuccessResult<T> | RejectionResult;

export const ValidationResult = {
    Success: Object.freeze(new ValidationSuccessResult()),
    Failure: Object.freeze(new RejectionResult())
};

//------------------------------------------------
// Issues
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
class ParseError extends ValidationIssue { }

//------------------------------------------------
// API Generator
//------------------------------------------------

export function generateTemplatingAPI<GeneralExt = {}, SchemaExt = {}, PrimitiveExt = {}, VariadicExt = {}, CollectionExt = {}>(BaseClass: new (...args: any[]) => any = Object)
{
    const { ValueTemplate, StringTemplate, NumberTemplate, BooleanTemplate, VariadicTemplate, ObjectTemplate, RecordTemplate, ArrayTemplate, LiteralTemplate } = generateTemplatingClasses(BaseClass);

    function schema<T extends TemplateObject>(inputSchema: T): SchemaAPI<InferSchemaType<T>> & SchemaExt & GeneralExt;
    function schema(inputSchema: any)
    {
        return ObjectTemplate.fromTemplateObject(inputSchema) as any;
    }

    function string(): TemplateAPI<string> & RequiredEntry & PrimitiveExt & GeneralExt;
    function string(defaultValue: string): CheckAPI<string> & OptionalEntry & PrimitiveExt & GeneralExt;
    function string(defaultValue?: string)
    {
        return defaultValue !== undefined ? new StringTemplate().withDefault(defaultValue) : new StringTemplate();
    }

    function number(): TemplateAPI<number> & RequiredEntry & PrimitiveExt & GeneralExt;
    function number(defaultValue: number): CheckAPI<number> & OptionalEntry & PrimitiveExt & GeneralExt;
    function number(defaultValue?: number)
    {
        return defaultValue !== undefined ? new NumberTemplate().withDefault(defaultValue) : new NumberTemplate();
    }

    function boolean(): TemplateAPI<boolean> & RequiredEntry & PrimitiveExt & GeneralExt;
    function boolean(defaultValue: boolean): CheckAPI<boolean> & OptionalEntry & PrimitiveExt & GeneralExt;
    function boolean(defaultValue?: boolean)
    {
        return defaultValue !== undefined ? new BooleanTemplate().withDefault(defaultValue) : new BooleanTemplate();
    }

    function valueOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): TemplateAPI<InferTypeDefinitionType<T[number]>> & RequiredEntry & VariadicExt & GeneralExt;
    function valueOf(...types: any[])
    {
        return ValueTemplate.fromTypeInputs(...types) as any;
    }

    function oneOf<const T extends readonly [string | number, ...(string | number)[]]>(...possibleValues: T): TemplateAPI<T[number]> & RequiredEntry & VariadicExt & GeneralExt;
    function oneOf(...possibleValues: any[])
    {
        const literalTypes = possibleValues.map(value => new LiteralTemplate(value));
        return new VariadicTemplate<number | string>(...literalTypes) as any;
    }

    function object<T extends TemplateObject>(value: T): TemplateAPI<InferSchemaType<T>> & RequiredEntry & PrimitiveExt & GeneralExt;
    function object(value: any)
    {
        return ObjectTemplate.fromTemplateObject(value) as any;
    }

    function record<T>(defaultValue: Record<string, T>, cloneOnDefaultAssignment?: boolean): CollectionTemplateAPI<Record<string, T>> & OptionalEntry & CollectionExt & GeneralExt;
    function record(defaultValue: Record<string, any>, cloneOnDefaultAssignment: boolean = true)
    {
        return RecordTemplate.fromExample(defaultValue).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function recordOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): CollectionTemplateAPI<Record<string, InferTypeDefinitionType<T[number]>>> & RequiredEntry & CollectionExt & GeneralExt;
    function recordOf(...types: any[])
    {
        return RecordTemplate.fromTypes(...types) as any;
    }

    function array<T>(defaultValue: T[], cloneOnDefaultAssignment?: boolean): CollectionTemplateAPI<T[]> & OptionalEntry & CollectionExt & GeneralExt;
    function array(defaultValue: any[], cloneOnDefaultAssignment = true)
    {
        return ArrayTemplate.fromExample(defaultValue).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function arrayOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): CollectionTemplateAPI<InferTypeDefinitionType<T[number]>[]> & RequiredEntry & CollectionExt & GeneralExt;
    function arrayOf(...types: any[])
    {
        return ArrayTemplate.fromTypes(...types) as any;
    }

    return { schema, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf };
}

export const { schema, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf } = generateTemplatingAPI();
