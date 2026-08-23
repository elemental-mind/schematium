import { Debug } from "unitium";
import * as assert from "node:assert";
import { generateTemplateAPI, ValueType } from "./schematium-extensible.ts";
import type { ValidatorAPI } from "./schematium-extensible.ts";

export class BaseClassSubstitutionTests
{
    validatorResultShouldContainBaseClassMembers()
    {
        class MyBase
        {
            metadata = "custom-base";
            getBaseInfo() { return "base-info"; }
        }

        const { validatorFor, string } = generateTemplateAPI<{ validationExtensions: { general: MyBase; }; }>(MyBase);
        const t = validatorFor({
            sample: string("default").required,
        });

        assert.strictEqual(t.metadata, "custom-base");
        assert.strictEqual(t.getBaseInfo(), "base-info");
    }

    validatorResultShouldCallBaseClassMembers()
    {
        class TrackingBase
        {
            calls: string[] = [];
            constructor() { this.calls.push("constructor"); }
            track() { this.calls.push("track"); return this; }
        }

        const { validatorFor, string } = generateTemplateAPI<{ validationExtensions: { general: TrackingBase; }; }>(TrackingBase);
        const t = validatorFor({
            test: string("default")
        });

        assert.ok(t.calls.includes("constructor"), "Base class constructor should have been called");

        t.track();
        assert.ok(t.calls.includes("track"), "Base class method should be callable on the template");
    }

    inferredCollectionEntriesShouldUseTheCurrentBaseClass()
    {
        class TrackingBase
        {
            static instanceCount = 0;
            constructor() { TrackingBase.instanceCount++; }
        }

        const { array } = generateTemplateAPI(TrackingBase);
        array([1, 2]);

        assert.strictEqual(TrackingBase.instanceCount, 2, "Both the collection and its inferred entry template should use the custom base class");
    }

    objectTemplateCachesShouldBeIsolatedByClassFamily()
    {
        class FirstBase { }
        class SecondBase { }

        const firstAPI = generateTemplateAPI(FirstBase);
        const secondAPI = generateTemplateAPI(SecondBase);
        const sharedShape = { kind: "sample" };
        const firstTemplate = firstAPI.validatorFor(sharedShape);
        const cachedFirstTemplate = firstAPI.validatorFor(sharedShape);
        const secondTemplate = secondAPI.validatorFor(sharedShape);

        assert.strictEqual(firstTemplate, cachedFirstTemplate, "A class family should reuse its own cached object template");
        assert.notStrictEqual(firstTemplate, secondTemplate, "Different class families should not share cached object templates");
        assert.ok(firstTemplate instanceof FirstBase);
        assert.ok(secondTemplate instanceof SecondBase);
    }
}

export class ValidatorApiTransitionTests
{
    valueDefinitionCanBePromotedToAValidator()
    {
        const { number, validatorFor } = generateTemplateAPI();
        const definition = number().accepts(value => value > 0);
        const validator = validatorFor(definition);

        assert.strictEqual(validator, definition);
        assert.strictEqual(validator.check(1), true);
        assert.strictEqual(validator.check(-1), false);
    }

    objectValidatorEntriesSupportTypedTraversal()
    {
        const { arrayOf, number, string, validatorFor } = generateTemplateAPI();
        const validator = validatorFor({
            server: { port: number() },
            tags: arrayOf(string),
        });

        assert.strictEqual(validator.isObject(), true);
        assert.strictEqual(Array.isArray(validator.entries), false);
        assert.strictEqual(validator.entries.server.isObject(), true);
        assert.strictEqual(validator.entries.tags.isObject(), false);
        assert.throws(() => Object.assign(validator.entries, { unexpected: number() }));

        const serverValidator = validator.entries.server;
        if (!serverValidator.isObject())
            assert.fail("Expected the server validator to be an object validator");

        assert.strictEqual(serverValidator.entries.port.check(8080), true);
        assert.strictEqual(serverValidator.entries.port.check("8080"), false);
    }

    objectDefinitionsRetainTheirEntriesAfterPromotion()
    {
        const { number, object, validatorFor } = generateTemplateAPI();
        const validator = validatorFor(object({ value: number() }));

        assert.strictEqual(validator.entries.value.check(42), true);
        assert.strictEqual(validator.entries.value.check("42"), false);
    }

    validationExtensionsAreExposedAfterPromotionAndObjectNarrowing()
    {
        class Extension
        {
            validationExtension() { return "validation"; }
            objectValidationExtension() { return "object"; }
        }

        const { number, validatorFor } = generateTemplateAPI<{
            validationExtensions: {
                general: Pick<Extension, "validationExtension">;
                object: Pick<Extension, "objectValidationExtension">;
            };
        }>(Extension);
        const numberValidator = validatorFor(number());
        const unknownValidator = validatorFor({ value: number() }).entries.value;
        const polymorphicValidator: ValidatorAPI<unknown, Pick<Extension, "validationExtension">, Pick<Extension, "objectValidationExtension">> = validatorFor({ value: number() });

        assert.strictEqual(numberValidator.validationExtension(), "validation");
        // @ts-expect-error Object validation extensions are unavailable before object narrowing.
        unknownValidator.objectValidationExtension;

        const objectValidator = validatorFor({ nested: { value: number() } }).entries.nested;
        assert.strictEqual(objectValidator.objectValidationExtension(), "object");

        if (!polymorphicValidator.isObject())
            assert.fail("Expected the polymorphic validator to narrow to an object validator");

        assert.strictEqual(polymorphicValidator.objectValidationExtension(), "object");
        assert.strictEqual(polymorphicValidator.entries.value.validationExtension(), "validation");
    }
}

export class DefinitionApiExtensionTests
{
    valueDefinitionShouldExposeAdditionalInterfaceMembers()
    {
        class PrimitiveExtension
        {
            tag(tag: string): this { return this; }
        }

        const defaultAPI = generateTemplateAPI();
        // @ts-expect-error - .tag() does not exist on the default TemplatingAPI
        assert.throws(() => defaultAPI.string().tag("foo"));

        // With the extension type applied, .tag() should be available at the type level
        const { string } = generateTemplateAPI<{ definitionExtensions: { primitive: PrimitiveExtension; }; }>(PrimitiveExtension);
        string().optional.tag("foo");
        string().withDefault("whatever").tag("foo");
    }

    valueTemplateShouldReflectAddedInterfaceCalls()
    {
        class Taggable
        {
            public tagValue?: string;
            tag(tag: string): this
            {
                this.tagValue = tag;
                return this;
            }
        }

        const { number } = generateTemplateAPI<{ definitionExtensions: { primitive: Taggable; }; }>(Taggable);
        const result = number(42).tag("my-number");

        assert.strictEqual(result.tagValue, "my-number");
    }

    baseTypeIsAccessibleInCustomDefinedInterfaces()
    {
        class Extension
        {
            typeDependentClosure(closure: (value: ValueType<this>) => boolean) { return this; };
        }

        const { number, string, valueOf } = generateTemplateAPI<{ definitionExtensions: { general: Extension; }; }>(Extension);
        number(42).typeDependentClosure(value => value === 100);
        //@ts-expect-error should throw because boolean =! number
        number(42).typeDependentClosure(value => value === false);

        valueOf(number, string).typeDependentClosure((value: string | number) => true);
        //@ts-expect-error should throw because boll | number  =! number | string
        valueOf(number, string).typeDependentClosure((value: bool | number) => true);
    }
}
