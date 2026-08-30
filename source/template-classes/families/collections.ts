import type { ValidationContext } from "../../api/definition-interface.ts";
import type { ExpectedType, MemberReflectionAPI } from "../../api/reflection-interface.ts";
import type { InternalValueTemplate } from "../../api/interal-interface.ts";
import type { InferCollectionEntryType } from "../../api/utility-types/inference.ts";
import type { Validator } from "../../validation/validation.ts";

import { TypeMismatch, ValidationIssue } from "../../validation/validation.ts";
import { ValueTemplate } from "../base.ts";

export interface InternalCollectionTemplate<T = any> extends InternalValueTemplate<T>
{
    acceptsEntries(validator: (key: string | number, value: InferCollectionEntryType<T>) => boolean): this;
    acceptsEntries(validator: (key: string | number, value: InferCollectionEntryType<T>, context: ValidationContext) => void): this;
}

abstract class CollectionTemplate<T> extends ValueTemplate<T> implements MemberReflectionAPI
{
    readonly matchingPriority: number = 2;
    protected entryTemplate: InternalValueTemplate<any>;
    protected entryGuard?:
        ((key: string | number, value: InferCollectionEntryType<T>) => boolean) |
        ((key: string | number, value: InferCollectionEntryType<T>, context: ValidationContext) => void);

    get memberType(): ExpectedType | readonly ExpectedType[] { return this.entryTemplate.type; }

    constructor(entryTemplate: InternalValueTemplate<any>)
    {
        super();
        this.entryTemplate = entryTemplate;
    }

    acceptsEntries(validator: (key: string | number, value: InferCollectionEntryType<T>) => boolean): this;
    acceptsEntries(validator: (key: string | number, value: InferCollectionEntryType<T>, context: ValidationContext) => void): this;
    acceptsEntries(validator: typeof this.entryGuard)
    {
        this.entryGuard = validator;
        return this;
    }

    expectsMember(type: ExpectedType): boolean
    {
        return this.entryTemplate.expects(type);
    }

    expectsMemberExclusively(type: ExpectedType): boolean
    {
        return this.entryTemplate.expectsExclusively(type);
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
    get type(): ExpectedType { return this.registry.record; }

    expects(type: ExpectedType): boolean
    {
        return type === this.registry.record;
    }

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
    get type(): ExpectedType { return this.registry.array; }

    expects(type: ExpectedType): boolean
    {
        return type === this.registry.array;
    }

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
