// Factory for creating custom API instances with BaseClass injection into the class hierarchy
export { generateTemplateAPI } from "./api/api-generator.ts";
export type { GeneratedTemplateAPI, ObjectValidatorFor, TemplateAPIExtensions, ValidatorEntriesFor, ValidatorFor } from "./api/api-generator.ts";
export type { ValueAPI } from "./template-classes/base.ts";

// API interfaces for implementing custom fluent definition chains
export * from "./api/definition-interface.ts";
export * from "./api/validator-interface.ts";

export * from "./api/utility-types/inference.ts";
export * from "./api/utility-types/optionality.ts";

// Validation settings and tolerances
export * from "./validation/validation.ts";
