import type { LiteralType, TemplateObject } from "../definition-interface.ts";

declare const required: unique symbol;
declare const forceRequired: unique symbol;
export type RequiredEntry = { [required]: true; };
type StrictlyRequiredEntry = { [forceRequired]: true; };
export type OptionalEntry = { [required]: false; };
type StrictlyOptionalEntry = { [forceRequired]: false; };


export type ForceRequired<T, ForcedState extends boolean> =
    Omit<T, typeof required | typeof forceRequired> &
    (ForcedState extends true ? StrictlyRequiredEntry & RequiredEntry : StrictlyOptionalEntry & OptionalEntry);

export type SetRequired<T, DefaultState extends boolean> =
    Omit<T, typeof required | typeof forceRequired> & (
        T extends StrictlyRequiredEntry ? StrictlyRequiredEntry & RequiredEntry :
        T extends StrictlyOptionalEntry ? StrictlyOptionalEntry & OptionalEntry :
        { [required]: DefaultState; }
    );


export type RequiredKeys<T extends TemplateObject> =
    { [K in keyof T]-?: T[K] extends RequiredEntry ? K : T[K] extends LiteralType ? K : never }[keyof T];

export type OptionalKeys<T extends TemplateObject> = Exclude<keyof T, RequiredKeys<T>>;