import type { CheckAPI, CollectionDefinitionAPI, DefinitionAPI, LiteralType, ObjectDefinitionAPI, PrimitiveType, TemplateObject, TypeOption } from "./definition-interface.ts";
import type { InferSchemaType, InferTypeDefinitionType } from "./utility-types/inference.ts";
import type { OptionalEntry, RequiredEntry } from "./utility-types/optionality.ts";
import type { ObjectValidatorAPI, ValidationAndParsingAPI } from "./validation-interface.ts";
import type { MemberReflectionAPI, ReflectionAPI } from "./reflection-interface.ts";
import type { TemplateMixin, ValueAPI } from "../template-classes/base.ts";

import { TemplateRegistry } from "../template-classes/registry.ts";

export interface TemplateAPIExtensions
{
    definitionExtensions?: {
        general?: object;
        primitive?: object;
        object?: object;
        variadic?: object;
        collection?: object;
    };
    validationExtensions?: {
        general?: object;
        object?: object;
    };
}

type GetExtension<Extensions, Group extends PropertyKey, Kind extends PropertyKey> =
    Group extends keyof Extensions ?
    NonNullable<Extensions[Group]> extends infer ExtensionGroup ?
    Kind extends keyof ExtensionGroup ?
    NonNullable<ExtensionGroup[Kind]> : {} : {} : {};
type ValueValidator<Value, Extensions> = ValidationAndParsingAPI<Value, GetExtension<Extensions, "validationExtensions", "general">, GetExtension<Extensions, "validationExtensions", "object">> & ReflectionAPI & GetExtension<Extensions, "validationExtensions", "general">;
type MemberValueValidator<Value, Extensions> = ValueValidator<Value, Extensions> & MemberReflectionAPI;

export type ObjectValidatorFor<Template extends TemplateObject, Extensions extends TemplateAPIExtensions = {}> = ObjectValidatorAPI<InferSchemaType<Template>, ValidatorEntriesFor<Template, Extensions>, GetExtension<Extensions, "validationExtensions", "general">, GetExtension<Extensions, "validationExtensions", "object">> & MemberReflectionAPI & GetExtension<Extensions, "validationExtensions", "general"> & GetExtension<Extensions, "validationExtensions", "object">;
export type ValidatorFor<Input, Extensions extends TemplateAPIExtensions = {}> =
    Input extends ObjectDefinitionAPI<infer Template> ? ObjectValidatorFor<Template, Extensions> :
    Input extends TemplateObject ? ObjectValidatorFor<Input, Extensions> :
    Input extends CollectionDefinitionAPI<infer Value> ? MemberValueValidator<Value, Extensions> :
    Input extends PrimitiveType ? ValueValidator<ReturnType<Input> extends ValueAPI<infer Value> ? Value : never, Extensions> :
    Input extends ValueAPI<infer Value> ? ValueValidator<Value, Extensions> :
    Input extends LiteralType ? ValueValidator<Input, Extensions> :
    never;
export type ValidatorEntriesFor<Template extends TemplateObject, Extensions extends TemplateAPIExtensions = {}> = { readonly [Key in keyof Template]: ValidatorFor<Template[Key], Extensions>; };

export interface GeneratedTemplateAPI<Extensions extends TemplateAPIExtensions = {}>
{
    validatorFor: {
        <T extends TemplateObject>(template: T): ObjectValidatorFor<T, Extensions>;
        <T extends ValueAPI<any>>(template: T): ValidatorFor<T, Extensions>;
    };
    string: {
        (): DefinitionAPI<string> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
        (defaultValue: string): CheckAPI<string> & OptionalEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
    };
    number: {
        (): DefinitionAPI<number> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
        (defaultValue: number): CheckAPI<number> & OptionalEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
    };
    boolean: {
        (): DefinitionAPI<boolean> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
        (defaultValue: boolean): CheckAPI<boolean> & OptionalEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
    };
    object<T extends TemplateObject>(value: T): ObjectDefinitionAPI<T> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "object">;
    valueOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): DefinitionAPI<InferTypeDefinitionType<T[number]>> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "variadic">;
    oneOf<const T extends readonly [string | number, ...(string | number)[]]>(...possibleValues: T): DefinitionAPI<T[number]> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "variadic">;
    record<T>(defaultValue: Record<string, T>, cloneOnDefaultAssignment?: boolean): CollectionDefinitionAPI<Record<string, T>> & OptionalEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "collection">;
    recordOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): CollectionDefinitionAPI<Record<string, InferTypeDefinitionType<T[number]>>> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "collection">;
    array<T>(defaultValue: T[], cloneOnDefaultAssignment?: boolean): CollectionDefinitionAPI<T[]> & OptionalEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "collection">;
    arrayOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): CollectionDefinitionAPI<InferTypeDefinitionType<T[number]>[]> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "collection">;
}

const defaultTemplateRegistry = new TemplateRegistry();

export function generateTemplateAPI<Extensions extends TemplateAPIExtensions = {}>(mixin?: TemplateMixin): GeneratedTemplateAPI<Extensions>
{
    const registry = mixin ? new TemplateRegistry(mixin) : defaultTemplateRegistry;
    const { validatorFor, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf } = registry;
    return { validatorFor, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf } as unknown as GeneratedTemplateAPI<Extensions>;
}
