import type { ValueAPI } from "../../template-classes/base.ts";
import type { LiteralType, TemplateObject, TypeOption } from "../definition-interface.ts";
import type { OptionalKeys, RequiredKeys } from "./optionality.ts";

export type ValueType<Template> =
    Template extends ValueAPI<infer T> ? T :
    Template extends TemplateObject ? InferSchemaType<Template> :
    Template extends LiteralType ? Template :
    never;

export type InferSchemaType<T extends TemplateObject> =
    { [K in RequiredKeys<T>]: Exclude<ValueType<T[K]>, undefined>; } &
    { [K in OptionalKeys<T>]?: ValueType<T[K]>; };

export type InferTypeDefinitionType<T extends TypeOption> =
    T extends (...args: any[]) => ValueAPI<infer Value> ? Value :
    T extends number | string ? T :
    T extends TemplateObject ? InferSchemaType<T> :
    never;

export type InferCollectionEntryType<T> =
    T extends Record<string, infer E> ? E :
    T extends Array<infer E> ? E :
    never;
