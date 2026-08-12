import type { CollectionEntryType, ValidationAPI } from "../../api/definition-interface.ts";
import type { Validator } from "../../validation/validation.ts";
import type { InternalValueTemplate, ValueTemplateConstructor } from "../base.ts";

import { TypeMismatch, ValidationIssue, } from "../../validation/validation.ts";

export interface InternalCollectionTemplate<T = any> extends InternalValueTemplate<T>
{
    acceptsEntries(validator: (key: string | number, value: CollectionEntryType<T>) => boolean): this;
    acceptsEntries(validator: (key: string | number, value: CollectionEntryType<T>, validator: ValidationAPI) => void): this;
}

export type RecordTemplateConstructor = new <T>(entryTemplate: InternalValueTemplate<any>) => InternalCollectionTemplate<Record<string, T>>;
export type ArrayTemplateConstructor = new <T>(entryTemplate: InternalValueTemplate<any>) => InternalCollectionTemplate<T[]>;

export function createCollectionTemplates(ValueTemplate: ValueTemplateConstructor): { RecordTemplate: RecordTemplateConstructor, ArrayTemplate: ArrayTemplateConstructor; }
{
    abstract class CollectionTemplate<T> extends ValueTemplate<T>
    {
        readonly matchingPriority: number = 2;
        protected entryTemplate: InternalValueTemplate<any>;
        protected entryGuard?:
            ((key: string | number, value: CollectionEntryType<T>) => boolean) |
            ((key: string | number, value: CollectionEntryType<T>, validator: ValidationAPI) => void);

        constructor(entryTemplate: InternalValueTemplate<any>)
        {
            super();
            this.entryTemplate = entryTemplate;
        }

        acceptsEntries(validator: (key: string | number, value: CollectionEntryType<T>) => boolean): this;
        acceptsEntries(validator: (key: string | number, value: CollectionEntryType<T>, validator: ValidationAPI) => void): this;
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

    class RecordTemplate<T> extends CollectionTemplate<Record<string, T>>
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

    class ArrayTemplate<T> extends CollectionTemplate<T[]>
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

    return { RecordTemplate, ArrayTemplate };
}
