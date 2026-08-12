import type { ParseResult, ValidationResult } from "../validation/validation.ts";
import type { ValueAPI } from "../template-classes/base.ts";

export interface SchemaAPI<T> extends ValueAPI<T>
{
    isOptional: boolean;
    check(value: unknown, settings?: ValidationTolerances): value is T;
    validate(value: unknown, settings?: ValidationSettings): ValidationResult;
    parseString<T>(value: string, settings?: ValidationSettings): ParseResult<T>;
    getDefault(): Partial<T> | undefined;
    patchOrOverride(base: Partial<T>, patch: Partial<T>): Partial<T>;
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
