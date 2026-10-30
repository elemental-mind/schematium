import type { ValueAPI } from "../template-classes/base.ts";
import type { ParseResult, ValidationResult } from "../validation/validation.ts";
import type { JSONSchema } from "../json-schema/json-schema.ts";
import type { DeepPartial } from "./utility-types/optionality.ts";

export type ValidatorEntries<ValidationExtension = {}, ObjectValidationExtension = {}> = Readonly<Record<string, ValidationAndParsingAPI<any, ValidationExtension, ObjectValidationExtension> & ValidationExtension>>;

export interface ValidationAndParsingAPI<T, ValidationExtension = {}, ObjectValidationExtension = {}> extends ValueAPI<T>
{
    isOptional: boolean;
    isObject(): this is this & ObjectValidatorAPI<NonNullable<T> & object, ValidatorEntries<ValidationExtension, ObjectValidationExtension>, ValidationExtension, ObjectValidationExtension> & ObjectValidationExtension;
    check(value: unknown, settings?: ValidationTolerances): value is T;
    validate(value: unknown, settings?: ValidationSettings): ValidationResult;
    parseString(value: string, settings?: ValidationSettings): ParseResult<T>;
    getDefault(): Partial<T> | undefined;
    patchOrOverride(base: DeepPartial<T>, patch: DeepPartial<T>): DeepPartial<T>;
    toJSONSchema(tolerances?: ValidationTolerances): JSONSchema;
}

export interface ObjectValidatorAPI<T extends object, Entries extends ValidatorEntries<any, any> = ValidatorEntries, ValidationExtension = {}, ObjectValidationExtension = {}> extends ValidationAndParsingAPI<T, ValidationExtension, ObjectValidationExtension>
{
    readonly entries: Entries;
}

export interface ValidationTolerances
{
    /** Allow checking partial objects without all required keys. */
    allowPartial?: boolean;
    /** Ignore object keys that are not defined by the schema. */
    allowUnknowns?: boolean;
}

export interface ValidationSettings extends ValidationTolerances
{
    /** Fast validation stops at the first issue and omits issue details. */
    mode?: "fastNoIssueReport" | "thorough";
}
