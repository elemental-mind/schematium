import { generateTemplateAPI } from "./api/api-generator.ts";

//Definition Components
export const { validatorFor, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf } = generateTemplateAPI();

//Definition Essentials
export type { TemplateObject, TypeOption, ValidationContext } from "./api/definition-interface.ts";
export type { ExpectedType, MemberReflectionAPI, ReflectionAPI } from "./api/reflection-interface.ts";
export type { ValueType } from "./api/utility-types/inference.ts";
export type { ValueAPI } from "./template-classes/base.ts";

//Validation Settings
export type { ObjectValidatorAPI, ValidationAndParsingAPI, ValidationSettings, ValidationTolerances } from "./api/validation-interface.ts";
//Validation & Parsing Results
export type { ValidationResult, ParseResult, ValidationSuccessResult, ParseSuccessResult, RejectionResult } from "./validation/validation.ts";
//Validation & Parsing Errors/Issue Types
export { ValidationIssue, ParseError, TypeMismatch, MissingMember, UndefinedValue, UnknownMember, UnknownValue } from "./validation/validation.ts";
