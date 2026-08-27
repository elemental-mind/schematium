import type { LiteralType } from "../../api/definition-interface.ts";
import type { Validator } from "../../validation/validation.ts";
import type { InternalValueTemplate } from "../base.ts";
import type { TemplateRegistry } from "../registry.ts";

import { TypeMismatch } from "../../validation/validation.ts";
import { BooleanTemplate, NumberTemplate, StringTemplate } from "./primitives.ts";
import { ValueTemplate } from "../base.ts";

export class LiteralTemplate<T extends LiteralType> extends ValueTemplate<T>
{
    permittedValue: T;
    permittedValueTemplate: InternalValueTemplate<T>;

    constructor(registry: TemplateRegistry, permittedValue: T)
    {
        super(registry);
        this.permittedValue = permittedValue;
        this.permittedValueTemplate = registry.inferTemplateFromValue(permittedValue);

        const isPrimitiveTemplate = [NumberTemplate, StringTemplate, BooleanTemplate]
            .some(PrimitiveTemplate => this.permittedValueTemplate instanceof PrimitiveTemplate);

        if (!isPrimitiveTemplate)
            throw new Error("Only numbers, booleans or strings permitted as literal types");
    }

    parseIntoRawType(value: string, validator: Validator): T | undefined
    {
        return this.permittedValueTemplate.parseIntoRawType(value, validator);
    }

    validateType(value: unknown, validator: Validator): Validator
    {
        return value === this.permittedValue
            ? validator
            : validator.rejectWith(TypeMismatch, `Literal "${this.permittedValue}" expected`);
    }

    identifiesBaseType(value: unknown): boolean
    {
        return this.permittedValueTemplate.identifiesBaseType(value);
    }
}
