// Factory for creating custom API instances with BaseClass injection into the class hierarchy
export { generateTemplatingAPI } from "./api/templating.ts";

// Validation & Parse result classes and runtime values
export { ValidationIssue } from "./api/templating.ts";
export type {
    ValidationResult,
    ParseResult,
    ValidationSuccessResult,
    ParseSuccessResult,
    RejectionResult,
} from "./api/templating.ts";

// API interfaces for implementing custom fluent definition chains
export type {
    TemplateAPI,
    SchemaAPI,
    OptionalityAPI,
    DefaultsAPI,
    CheckAPI,
    CollectionTemplateAPI,
    ValidationAPI,
} from "./api/templating.ts";

// Template object types and type inference utilities
export type {
    TemplateObject,
    TemplateObjectEntry,
    ValueType,
    InferSchemaType,
    InferTypeDefinitionType,
} from "./api/templating.ts";

// Validation settings and tolerances
export type {
    ValidationTolerances,
    ValidationSettings,
} from "./api/templating.ts";
