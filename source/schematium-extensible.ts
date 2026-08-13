// Factory for creating custom API instances with BaseClass injection into the class hierarchy
export { generateSchemaDefinitionAPI } from "./api/api-generator.ts";

// API interfaces for implementing custom fluent definition chains
export * from "./api/definition-interface.ts";
export * from "./api/schema-interface.ts";

export * from "./api/utility-types/inference.ts";
export * from "./api/utility-types/optionality.ts";

// Validation settings and tolerances
export * from "./validation/validation.ts";
