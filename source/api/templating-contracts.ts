import type { ParseResult, ValidationIssue, ValidationResult } from "../validation/validation.ts";

export interface TemplateObject
{
    [key: string]: TemplateObjectEntry;
}

export declare const valueType: unique symbol;

export interface SchemaBaseAPI<T>
{
    [valueType]: T;
}

export interface SchemaAPI<T> extends SchemaBaseAPI<T>
{
    isOptional: boolean;
    check(value: unknown, settings?: ValidationTolerances): value is T;
    validate(value: unknown, settings?: ValidationSettings): ValidationResult;
    parseString<T>(value: string, settings?: ValidationSettings): ParseResult<T>;
    getDefault(): Partial<T> | undefined;
    patchOrOverride(base: Partial<T>, patch: Partial<T>): Partial<T>;
}

export interface TemplateAPI<T> extends OptionalityAPI<T>, DefaultsAPI<T>, CheckAPI<T> { }

export interface OptionalityAPI<T> extends SchemaBaseAPI<T>
{
    required: ForceRequired<this, true>;
    optional: ForceRequired<this, false>;
}

export interface DefaultsAPI<T> extends SchemaBaseAPI<T>
{
    withDefault: (defaultValue: T, cloneWhenAssigned?: boolean) => SetRequired<this, false>;
}

export interface ValidationAPI
{
    rejectWith(errorType: typeof ValidationIssue, message?: string): void;
}

export interface CheckAPI<T> extends OptionalityAPI<T>
{
    accepts(validator: (value: T) => boolean): this;
    accepts(validator: (value: T, validator: ValidationAPI) => void): this;
}

export interface CollectionTemplateAPI<T> extends TemplateAPI<T>
{
    acceptsEntries(validator: (key: string | number, value: CollectionEntryType<T>) => boolean): this;
    acceptsEntries(validator: (key: string | number, value: CollectionEntryType<T>, validator: ValidationAPI) => void): this;
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

export type ValueType<Template> =
    Template extends SchemaBaseAPI<infer T> ? T :
    Template extends TemplateObject ? InferSchemaType<Template> :
    Template extends LiteralType ? Template :
    never;

export type TemplateObjectEntry = TemplateObject | LiteralType | SchemaBaseAPI<any>;

export type InferSchemaType<T extends TemplateObject> =
    { [K in RequiredKeys<T>]: Exclude<ValueType<T[K]>, undefined>; } &
    { [K in OptionalKeys<T>]?: ValueType<T[K]>; };

export type InferTypeDefinitionType<T extends TypeOption> =
    T extends (...args: any[]) => SchemaBaseAPI<infer Value> ? Value :
    T extends number | string ? T :
    T extends TemplateObject ? InferSchemaType<T> :
    never;

export type CollectionEntryType<T> =
    T extends Record<string, infer E> ? E :
    T extends Array<infer E> ? E :
    never;

export type PrimitiveType =
    (() => SchemaBaseAPI<string>) |
    (() => SchemaBaseAPI<number>) |
    (() => SchemaBaseAPI<boolean>);
export type LiteralType = number | string;
export type TypeOption = PrimitiveType | TemplateObject | SchemaAPI<any> | LiteralType;

declare const required: unique symbol;
declare const forceRequired: unique symbol;

export type RequiredEntry = { [required]: true; };
type StrictlyRequiredEntry = { [forceRequired]: true; };
export type OptionalEntry = { [required]: false; };
type StrictlyOptionalEntry = { [forceRequired]: false; };

type RequiredKeys<T extends TemplateObject> =
    { [K in keyof T]-?: T[K] extends RequiredEntry ? K : T[K] extends LiteralType ? K : never }[keyof T];
type OptionalKeys<T extends TemplateObject> = Exclude<keyof T, RequiredKeys<T>>;

type ForceRequired<T, ForcedState extends boolean> =
    Omit<T, typeof required | typeof forceRequired> &
    (ForcedState extends true ? StrictlyRequiredEntry & RequiredEntry : StrictlyOptionalEntry & OptionalEntry);

type SetRequired<T, DefaultState extends boolean> =
    Omit<T, typeof required | typeof forceRequired> & (
        T extends StrictlyRequiredEntry ? StrictlyRequiredEntry & RequiredEntry :
        T extends StrictlyOptionalEntry ? StrictlyOptionalEntry & OptionalEntry :
        { [required]: DefaultState; }
    );
