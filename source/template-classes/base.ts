import type { CheckAPI, DefaultsAPI, ValidationContext } from "../api/definition-interface.ts";
import type { ExpectedType, ReflectionAPI } from "../api/reflection-interface.ts";
import type { ObjectValidatorAPI, ValidationAndParsingAPI, ValidationSettings, ValidationTolerances, ValidatorEntries } from "../api/validation-interface.ts";
import type { ParseResult, ValidationResult } from "../validation/validation.ts";
import type { JSONSchema } from "../json-schema/json-schema.ts";
import type { TemplateRegistry } from "./registry.ts";

import { ParseError, ParseSuccessResult, TypeMismatch, UndefinedValue, ValidationIssue, Validator } from "../validation/validation.ts";
import { JSONSchemaContext } from "../json-schema/json-schema.ts";
import type { InternalValueTemplate } from "../api/interal-interface.ts";

export type ValueTemplateConstructor = new (...args: any[]) => InternalValueTemplate<any>;
export type TemplateMixin = (Base: ValueTemplateConstructor) => ValueTemplateConstructor;

declare const containedType: unique symbol;
export interface ValueAPI<T>
{
    [containedType]: T;
};

export abstract class ValueTemplate<T> implements ValidationAndParsingAPI<T>, ReflectionAPI, CheckAPI<T>, DefaultsAPI<T>
{
    // The registry serves as a resolver for the specific subtemplates we need.
    // As we have this lib extensible with Mixins, we keep a separate registry for each mixin as the tempaltes are not identical in behaviour due to mixin behavour variances.
    // To mot mix templates of different mixins and thus different behaviour we can not hard code the registry at compile time.
    // Look into the constructor of the TemplateRegistry to see registry being defined there as the TemplateRegistry instance once a new API with a certain mixin is defined.
    declare readonly registry: TemplateRegistry;
    abstract readonly type: ExpectedType | readonly ExpectedType[];

    declare [containedType]: T;

    public readonly matchingPriority: number = 3;
    public isOptional = false;
    public customValidator?: ((value: T) => boolean) | ((value: T, context: ValidationContext) => void);
    public cloneDefaultWhenDefaultRequested = true;
    protected default?: T;
    protected readonly objectTemplate: boolean = false;
    protected readonly typeLabel: string = "value";

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

    isObject(): this is this & ObjectValidatorAPI<NonNullable<T> & object, ValidatorEntries>
    {
        return this.objectTemplate;
    }

    expects(type: ExpectedType): boolean
    {
        return false;
    }

    expectsExclusively(type: ExpectedType): boolean
    {
        return this.expects(type);
    }

    accepts(validator: (value: T) => boolean): any;
    accepts(validator: (value: T, context: ValidationContext) => void): any;
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

    parseString(value: string, settings: ValidationSettings = Validator.DefaultSettings): ParseResult<T>
    {
        const validator = Validator.withSettings(settings);
        const resultValue = this.parseWithValidation(value, validator);
        const parsed = validator.result.success ? new ParseSuccessResult<T>(resultValue as T) : validator.result;
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

    // Variadics parse once per strategy and share the result, so templates reporting the same strategy must parse every input identically.
    get parseStrategy(): InternalValueTemplate<T>["parseIntoRawType"]
    {
        return this.parseIntoRawType;
    }

    parseObject(value: string, validator: Validator): T | undefined
    {
        let result: T | undefined;
        try { result = JSON.parse(value); }
        catch (error)
        {
            validator.rejectWith(ParseError, (error as any)?.message ?? "JSON Parsing Error");
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

        if (validator.issueCount !== this.validateType(value, validator).issueCount)
            return validator;

        return this.validateCustom(value, validator);
    }

    protected validateCustom(value: unknown, validator: Validator): Validator
    {
        return this.customValidator?.(value as T, validator) === false
            ? validator.rejectWith(ValidationIssue, "Custom validation failed")
            : validator;
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

    toJSONSchema(tolerances: ValidationTolerances = {}): JSONSchema
    {
        return { $schema: JSONSchemaContext.dialect, ...new JSONSchemaContext(tolerances).buildSchema(this) };
    }

    buildJSONSchema(context: JSONSchemaContext): JSONSchema
    {
        return this.default === undefined ? {} : { default: structuredClone(this.default) };
    }

    getUniqueTypes(templates: readonly InternalValueTemplate<any>[]): ExpectedType[]
    {
        const types: ExpectedType[] = [];
        for (const template of templates)
        {
            const reflectedType = template.type;
            Array.isArray(reflectedType) ? types.push(...reflectedType as ExpectedType[]) : types.push(reflectedType as ExpectedType);
        }
        return [...new Set(types)];
    }
}
