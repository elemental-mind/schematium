// Factory for creating custom API instances with BaseClass injection into the class hierarchy
export { GenerateTemplatingAPI } from "./templating.ts";

// Definition API interfaces for implementing custom fluent definition chains
export type {
    ValueTemplateAPI,
    OptionalityDefinitionAPI,
    ValueDefinitionAPI,
    CollectionDefinitionAPI,
    TypedCollectionDefinitionAPI,
    TemplateObject,
    TemplateObjectEntry,
    ValueConfiguration,
    EntryValidationClosure,
    TemplatingAPI,
    ValueType
} from "./templating.ts";
