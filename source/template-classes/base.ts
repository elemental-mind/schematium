import type { CheckAPI, DefaultsAPI, SchemaAPI, ValidationAPI, ValidationSettings, ValidationTolerances, valueType } from "../api/templating-contracts.ts";
import type { ParseResult, ValidationResult } from "../validation/validation.ts";
import type { TemplateRegistry } from "./registry.ts";

import { ParseError, ParseSuccessResult, TypeMismatch, UndefinedValue, ValidationIssue, Validator } from "../validation/validation.ts";

export type ValueTemplateConstructor = abstract new <T = any>() => InternalValueTemplate<T>;

export interface InternalValueTemplate<T = any>
{
    matchingPriority: number;
    isOptional: boolean;
    hasDefaultValue: boolean;

    withDefault(defaultValue: T, cloneWhenAssigned?: boolean): any;
    parseWithValidation(value: string, validator: Validator): T | undefined;
    parseIntoRawType(value: string, validator: Validator): T | undefined;
    parseObject(value: string, validator: Validator): T | undefined;
    identifiesBaseType(value: unknown): boolean;
    check(value: unknown, settings?: ValidationTolerances): value is T;
    validateWithValidator(value: unknown, validator: Validator): Validator;
    validateType(value: unknown, validator: Validator): Validator;
    getDefault(): any;
    merge(base: any, checkedPatch: any): any;
}

/** Creates the common base for one registry's mutually-compatible template family. */
export function createValueTemplate(BaseClass: new (...args: any[]) => any, registry: TemplateRegistry): ValueTemplateConstructor
{
    abstract class ValueTemplate<T> extends BaseClass implements SchemaAPI<T>, CheckAPI<T>, DefaultsAPI<T>
    {
        declare resolveType: TemplateRegistry;

        declare [valueType]: T;

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

        parseString<Parsed>(value: string, settings: ValidationSettings = Validator.DefaultSettings): ParseResult<Parsed>
        {
            const validator = Validator.withSettings(settings);
            const resultValue = this.parseWithValidation(value, validator);
            const parsed = validator.result.success ? new ParseSuccessResult<Parsed>(resultValue as Parsed) : validator.result;
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

    ValueTemplate.prototype.resolveType = registry;

    return ValueTemplate;
}
