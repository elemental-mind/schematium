import type { ValidationTolerances } from "../../api/templating-contracts.ts";
import { ParseError, UnknownValue, Validator } from "../../validation/validation.ts";
import type { InternalValueTemplate, ValueTemplateConstructor } from "../base.ts";

type IterableValue<T> = T extends Iterable<infer Entry> ? Entry : never;
type FilterMatch<Variant, Result> = { input: Variant; result: Result; };

export interface InternalVariadicTemplate<T = any> extends InternalValueTemplate<T>
{
    permittedTypes: InternalValueTemplate<any>[];
    parseStrategyGroups?: Map<InternalValueTemplate<any>["parseIntoRawType"], InternalValueTemplate<any>[]>;
}

export type VariadicTemplateConstructor = new <T = any>(
    ...permittedTypes: InternalValueTemplate<any>[]
) => InternalVariadicTemplate<T>;

export function createVariadicTemplate(ValueTemplate: ValueTemplateConstructor): VariadicTemplateConstructor
{
    return class VariadicTemplate<T> extends ValueTemplate<T>
    {
        public permittedTypes: InternalValueTemplate<any>[];
        public parseStrategyGroups?: Map<InternalValueTemplate<any>["parseIntoRawType"], InternalValueTemplate<any>[]>;

        constructor(...permittedTypes: InternalValueTemplate<any>[])
        {
            super();
            this.permittedTypes = permittedTypes.sort((type1, type2) => type1.matchingPriority - type2.matchingPriority);

            for (const template of permittedTypes)
                if (template instanceof VariadicTemplate)
                    throw new Error("Nesting a variadic template in a variadic template not allowed. Flatten the type.");
        }

        parseWithValidation(input: string, validator: Validator): T | undefined
        {
            const parsedTemplatePairs = this.parseIntoRawType(input, validator) as {
                template: InternalValueTemplate<any>;
                parsedValue: T;
            }[];

            if (!parsedTemplatePairs.length)
            {
                validator.rejectWith(ParseError, "None of the given templates can parse'" + input + "' successfully");
                return undefined;
            }

            const validatedPairs = this.filterValidating(
                parsedTemplatePairs,
                validator,
                true,
                (pair, filterValidator) => pair.template.validateWithValidator(pair.parsedValue, filterValidator),
            );

            if (validatedPairs.length)
                return validatedPairs[0].input.parsedValue;

            validator.rejectWith(UnknownValue, "'" + input + "' did parse, but can not be interpreted as a permitted value");
            return undefined;
        }

        parseIntoRawType(input: string, validator: Validator): T | undefined
        {
            if (!this.parseStrategyGroups)
                this.groupTemplatesByParsingStrategy();

            const parsedTemplatePairs = this
                .filterValidating(
                    this.parseStrategyGroups!.values(),
                    validator,
                    false,
                    (templates, filterValidator) => templates[0].parseIntoRawType(input, filterValidator),
                )
                .flatMap(({ input: templates, result }) =>
                    templates.map(template => ({ template, parsedValue: result })));

            return parsedTemplatePairs as T;
        }

        identifiesBaseType(value: unknown): boolean
        {
            return this.permittedTypes.some(type => type.identifiesBaseType(value));
        }

        validateType(value: unknown, validator: Validator)
        {
            const candidateTypes = this.permittedTypes.filter(type => type.identifiesBaseType(value));
            const validatedTypes = this.filterValidating(
                candidateTypes,
                validator,
                true,
                (candidate, filterValidator) => candidate.validateType(value, filterValidator),
            );

            return validatedTypes.length
                ? validator
                : validator.rejectWith(UnknownValue, "Value not in list of allowed types");
        }

        merge(base: any, override: any): any
        {
            const validatedBaseTypes = this.findMatchingTypes(base);
            const validatedOverrideTypes = this.findMatchingTypes(override);
            const commonType = validatedBaseTypes.find(baseType => validatedOverrideTypes.includes(baseType));

            return commonType ? commonType.merge(base, override) : override;
        }

        private findMatchingTypes(value: unknown): InternalValueTemplate<any>[]
        {
            const candidates = this.permittedTypes.filter(type => type.identifiesBaseType(value));
            return this.filterValidating(
                candidates,
                { allowPartial: true, allowUnknowns: false },
                false,
                (candidate, filterValidator) => candidate.validateType(value, filterValidator),
            ).map(result => result.input);
        }

        private filterValidating<VariantCollection extends Iterable<any>, Result>(
            inputs: VariantCollection,
            validationSettings: ValidationTolerances,
            failFast: boolean,
            checker: (variant: IterableValue<VariantCollection>, filterValidator: Validator) => Result | undefined,
        ): FilterMatch<IterableValue<VariantCollection>, Result>[]
        {
            const matches: FilterMatch<IterableValue<VariantCollection>, Result>[] = [];
            const fastSubValidator = Validator.getFastSubValidator(validationSettings);

            for (const input of inputs)
            {
                const result = checker(input, fastSubValidator)!;
                if (!fastSubValidator.issueCount)
                {
                    matches.push({ input, result });
                    if (failFast) break;
                }
                fastSubValidator.refresh();
            }

            fastSubValidator.release();
            return matches;
        }

        private groupTemplatesByParsingStrategy()
        {
            this.parseStrategyGroups = new Map();
            for (const template of this.permittedTypes)
                this.parseStrategyGroups.get(template.parseIntoRawType)?.push(template) ??
                    this.parseStrategyGroups.set(template.parseIntoRawType, [template]);
        }
    };
}
