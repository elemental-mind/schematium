import type { ValidationSettings } from "../api/schema-interface.ts";

export abstract class Validator
{
    static DefaultSettings: ValidationSettings = { mode: "fastNoIssueReport", allowPartial: false, allowUnknowns: false };
    protected static FastValidatorCache: FastValidator[] = [];
    protected static ThoroughValidatorCache: ThoroughValidator[] = [];

    static withSettings(settings: ValidationSettings)
    {
        const validator = settings.mode === "thorough"
            ? this.ThoroughValidatorCache.pop() ?? new ThoroughValidator()
            : this.FastValidatorCache.pop() ?? new FastValidator();

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

    static
    {
        this.prototype.pathTrace = [];
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

        (this.result as RejectionResult).issues.push(error);
        this.issueCount++;
        return this;
    }

    release()
    {
        Validator.ThoroughValidatorCache.push(this);
    }
}

export class ValidationSuccessResult
{
    success = true as const;
}

export class ParseSuccessResult<T> extends ValidationSuccessResult
{
    value: T;

    constructor(value: T)
    {
        super();
        this.value = value;
    }
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
    Failure: Object.freeze(new RejectionResult()),
};

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

export class TypeMismatch extends ValidationIssue { }
export class MissingMember extends ValidationIssue { }
export class UnknownMember extends ValidationIssue { }
export class UnknownValue extends ValidationIssue { }
export class UndefinedValue extends ValidationIssue { }
export class ParseError extends ValidationIssue { }
