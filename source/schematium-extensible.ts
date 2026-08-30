// Factory for creating custom API instances by mixing into the common template base
export { generateTemplateAPI } from "./api/api-generator.ts";
export type { GeneratedTemplateAPI, ObjectValidatorFor, TemplateAPIExtensions, ValidatorEntriesFor, ValidatorFor } from "./api/api-generator.ts";
export type { TemplateMixin, ValueAPI, ValueTemplateConstructor } from "./template-classes/base.ts";

// API interfaces for implementing custom fluent definition chains
export type { CheckAPI, CollectionDefinitionAPI, DefaultsAPI, DefinitionAPI, ObjectDefinitionAPI, OptionalityAPI, TemplateObject, TypeOption, ValidationContext } from "./api/definition-interface.ts";
export type { ExpectedType, MemberReflectionAPI, ReflectionAPI } from "./api/reflection-interface.ts";
export type { ObjectValidatorAPI, ValidationAndParsingAPI, ValidationSettings, ValidationTolerances, ValidatorEntries } from "./api/validation-interface.ts";

export type { InferSchemaType, ValueType } from "./api/utility-types/inference.ts";
export type { DeepPartial } from "./api/utility-types/optionality.ts";

// Validation and parsing results
export type { ParseResult, ParseSuccessResult, RejectionResult, ValidationResult, ValidationSuccessResult } from "./validation/validation.ts";
// Validation and parsing issue types
export { MissingMember, ParseError, TypeMismatch, UndefinedValue, UnknownMember, UnknownValue, ValidationIssue } from "./validation/validation.ts";
