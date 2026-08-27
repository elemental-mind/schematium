import type { ValidationAPI } from "../../api/definition-interface.ts";
import type { InternalValueTemplate } from "../../api/interal-interface.ts";
import type { InferCollectionEntryType } from "../../api/utility-types/inference.ts";
import type { Validator } from "../../validation/validation.ts";

import { TypeMismatch, ValidationIssue } from "../../validation/validation.ts";
import { ValueTemplate } from "../base.ts";

export interface InternalCollectionTemplate<T = any> extends InternalValueTemplate<T>
{
    acceptsEntries(validator: (key: string | number, value: InferCollectionEntryType<T>) => boolean): this;
    acceptsEntries(validator: (key: string | number, value: InferCollectionEntryType<T>, validator: ValidationAPI) => void): this;
}

abstract class CollectionTemplate<T> extends ValueTemplate<T>
{
    readonly matchingPriority: number = 2;
    protected entryTemplate: InternalValueTemplate<any>;
    protected entryGuard?:
        ((key: string | number, value: InferCollectionEntryType<T>) => boolean) |
        ((key: string | number, value: InferCollectionEntryType<T>, validator: ValidationAPI) => void);

    constructor(entryTemplate: InternalValueTemplate<any>)
    {
        super();
        this.entryTemplate = entryTemplate;
    }

    acceptsEntries(validator: (key: string | number, value: InferCollectionEntryType<T>) => boolean): this;
    acceptsEntries(validator: (key: string | number, value: InferCollectionEntryType<T>, validator: ValidationAPI) => void): this;
    acceptsEntries(validator: typeof this.entryGuard)
    {
        this.entryGuard = validator;
        return this;
    }

    parseIntoRawType = this.parseObject;

    protected validateEntry(key: string | number, entry: any, validator: Validator): Validator
    {
        validator.pathTrace.push(key);

        if (validator.issueCount === this.entryTemplate.validateWithValidator(entry, validator).issueCount &&
            this.entryGuard?.(key, entry, validator) === false)
            validator.rejectWith(ValidationIssue, "Entry Validation failed");

        validator.pathTrace.pop();
        return validator;
    }
}

export class RecordTemplate<T> extends CollectionTemplate<Record<string, T>>
{
    identifiesBaseType(value: unknown): boolean
    {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    validateType(value: unknown, validator: Validator)
    {
        if (typeof value !== "object" || value === null || Array.isArray(value))
            return validator.rejectWith(TypeMismatch, "Expected object");

        for (const [key, entry] of Object.entries(value))
            if (!this.validateEntry(key, entry, validator).continueValidating) break;

        return validator;
    }
}

export class ArrayTemplate<T> extends CollectionTemplate<T[]>
{
    identifiesBaseType(value: unknown): boolean
    {
        return Array.isArray(value);
    }

    validateType(value: unknown, validator: Validator)
    {
        if (!Array.isArray(value))
            return validator.rejectWith(TypeMismatch, "Array expected");

        for (const [key, entry] of value.entries())
            if (!this.validateEntry(key, entry, validator).continueValidating) break;

        return validator;
    }
}
