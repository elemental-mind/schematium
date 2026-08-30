import type { ValueAPI } from "../template-classes/base.ts";
import type { ValidationIssue } from "../validation/validation.ts";
import type { InferCollectionEntryType, InferSchemaType } from "./utility-types/inference.ts";
import type { ForceRequired, SetRequired } from "./utility-types/optionality.ts";

export interface TemplateObject
{
    [key: string]: TemplateObject | LiteralType | ValueAPI<any>;
}

export type TypeOption = PrimitiveType | TemplateObject | ValueAPI<any> | LiteralType;
export type PrimitiveType = (() => ValueAPI<string>) | (() => ValueAPI<number>) | (() => ValueAPI<boolean>);
export type LiteralType = number | string;

export type DefinitionAPI<T> =
    OptionalityAPI<T> &
    DefaultsAPI<T> &
    CheckAPI<T>;

declare const objectDefinition: unique symbol;
export interface ObjectDefinitionAPI<T extends TemplateObject> extends DefinitionAPI<InferSchemaType<T>>
{
    [objectDefinition]: T;
}

export interface CollectionDefinitionAPI<T> extends DefinitionAPI<T>
{
    acceptsEntries(validator: (key: string | number, value: InferCollectionEntryType<T>) => boolean): this;
    acceptsEntries(validator: (key: string | number, value: InferCollectionEntryType<T>, context: ValidationContext) => void): this;
}

export interface OptionalityAPI<T> extends ValueAPI<T>
{
    required: ForceRequired<this, true>;
    optional: ForceRequired<this, false>;
}

export interface DefaultsAPI<T> extends ValueAPI<T>
{
    withDefault: (defaultValue: T, cloneWhenAssigned?: boolean) => SetRequired<this, false>;
}

export interface ValidationContext
{
    rejectWith(errorType: typeof ValidationIssue, message?: string): void;
}

export interface CheckAPI<T> extends OptionalityAPI<T>
{
    accepts(validator: (value: T) => boolean): this;
    accepts(validator: (value: T, context: ValidationContext) => void): this;
}
