import type { ValidationTolerances } from "./validation-interface.ts";
import type { ReflectionAPI } from "./reflection-interface.ts";
import type { Validator } from "../validation/validation.ts";
import type { TemplateRegistry } from "../template-classes/registry.ts";
import type { JSONSchema, JSONSchemaContext } from "../json-schema/json-schema.ts";

export interface InternalValueTemplate<T = any> extends ReflectionAPI
{
    registry: TemplateRegistry;

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
    buildJSONSchema(context: JSONSchemaContext): JSONSchema;
}
