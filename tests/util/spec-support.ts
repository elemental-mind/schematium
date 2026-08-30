import * as assert from "assert";

export type { ParseResult, ParseSuccessResult, TemplateObject, ValidationContext, ValidationSettings, ValidationSuccessResult, ValidationTolerances, ValueType } from "../../source/schematium-extensible.ts";
export { ValidationIssue } from "../../source/schematium-extensible.ts";
export { RejectionResult } from "../../source/validation/validation.ts";

import type { ParseResult, ParseSuccessResult, TemplateObject, ValidationResult, ValidationSettings, ValidationTolerances, ValueType, } from "../../source/schematium-extensible.ts";
import { generateTemplateAPI } from "../../source/schematium-extensible.ts";

interface TestValidationAndParsingAPI
{
    isOptional: boolean;
    check(value: unknown, settings?: ValidationTolerances): value is ValueType<this>;
    validate(value: unknown, settings?: ValidationSettings): ValidationResult;
    parseString(value: string, settings?: ValidationSettings): ParseResult<ValueType<this>>;
    getDefault(): Partial<ValueType<this>> | undefined;
    patchOrOverride(base: ValueType<this>, patch: any): ValueType<this>;
}

export const {
    validatorFor,
    string,
    number,
    boolean,
    object,
    valueOf,
    oneOf,
    record,
    recordOf,
    array,
    arrayOf,
} = generateTemplateAPI<{ definitionExtensions: { general: TestValidationAndParsingAPI; }; }>();


export function assertParseSuccess<T>(result: ParseResult<T>, expectedValue: T): void
{
    try
    {
        assert.strictEqual(result.success, true);
        assert.deepStrictEqual((result as ParseSuccessResult<T>).value, expectedValue);
    }
    catch (error)
    {
        //We rethrow the error with a patched stack so the right line in the test can get identified;
        if (error instanceof Error)
            Error.captureStackTrace(error, assertParseSuccess);

        throw error;
    }
}
