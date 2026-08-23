import { generateTemplateAPI } from "./api/api-generator.ts";

//Definition Essentials
export { TemplateObject, TypeOption } from "./api/definition-interface.ts";
//Definition Components
export const { validatorFor, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf } = generateTemplateAPI();

//Validation Settings
export type { ObjectValidatorAPI, ValidationSettings, ValidationTolerances, ValidatorAPI } from "./api/validator-interface.ts";
//Validation & Parsing Results
export type { ValidationResult, ParseResult, ValidationSuccessResult, ParseSuccessResult, RejectionResult } from "./validation/validation.ts";
//Validation & Parsing Errors/Issue Types
export { ValidationIssue, ParseError, TypeMismatch, MissingMember, UndefinedValue, UnknownMember, UnknownValue } from "./validation/validation.ts";
