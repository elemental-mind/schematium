import { generateSchemaDefinitionAPI } from "./api/api-generator.ts";

//Definition Essentials
export { TemplateObject, TypeOption } from "./api/definition-interface.ts";
//Definition Components
export const { schema, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf } = generateSchemaDefinitionAPI();

//Validation Settings
export type { ValidationSettings, ValidationTolerances } from "./api/schema-interface.ts";
//Validation & Parsing Results
export type { ValidationResult, ParseResult, ValidationSuccessResult, ParseSuccessResult, RejectionResult } from "./validation/validation.ts";
//Validation & Parsing Errors/Issue Types
export { ValidationIssue, ParseError, TypeMismatch, MissingMember, UndefinedValue, UnknownMember, UnknownValue } from "./validation/validation.ts";
