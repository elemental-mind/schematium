// Factory for creating custom API instances with BaseClass injection into the class hierarchy
export { generateTemplatingAPI } from "./templating.ts";

// Validation & Parse result classes and runtime values
export type {
    ValidationResult,
    ParseResult,
    ValidationSuccessResult,
    ParseSuccessResult,
    RejectionResult,
    ValidationIssue,
} from "./templating.ts";

// API interfaces for implementing custom fluent definition chains
export type {
    TemplateAPI,
    ValidationAPI,
    OptionalityAPI,
    DefaultsAPI,
    CheckAPI,
    CollectionTemplateAPI,
} from "./templating.ts";

// Template object types and type inference utilities
export type {
    TemplateObject,
    TemplateObjectEntry,
    ValueType,
    InferSchemaType,
    InferTypeDefinitionType,
} from "./templating.ts";

// Validation settings and tolerances
export type {
    ValidationTolerances,
    ValidationSettings,
} from "./templating.ts";
