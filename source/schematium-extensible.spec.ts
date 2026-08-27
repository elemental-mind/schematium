import { Debug } from "unitium";
import * as assert from "node:assert";
import { generateTemplateAPI, ValueType } from "./schematium-extensible.ts";
import { StringTemplate } from "./template-classes/families/primitives.ts";
import type { TemplateMixin, ValidatorAPI, ValueTemplateConstructor } from "./schematium-extensible.ts";

export class TemplateMixinTests
{
    defaultApiShouldUseTheBuiltInClassesDirectly()
    {
        assert.strictEqual(generateTemplateAPI().string().constructor, StringTemplate);
    }

    registryShouldBeStoredOnTheMixedPrototype()
    {
        const mixin: TemplateMixin = Base => class extends Base { };
        const firstTemplate = generateTemplateAPI(mixin).string();
        const secondTemplate = generateTemplateAPI(mixin).string();
        const firstPrototype = Object.getPrototypeOf(firstTemplate);
        const secondPrototype = Object.getPrototypeOf(secondTemplate);

        assert.strictEqual(Object.hasOwn(firstTemplate, "registry"), false);
        assert.strictEqual(Object.hasOwn(firstPrototype, "registry"), true);
        assert.notStrictEqual(firstPrototype.registry, secondPrototype.registry);
    }

    validatorResultShouldContainMixinMembers()
    {
        function withMetadata(Base: ValueTemplateConstructor)
        {
            return class extends Base
            {
                metadata = "custom-mixin";
                getMixinInfo() { return "mixin-info"; }
            };
        }
        type MetadataExtension = InstanceType<ReturnType<typeof withMetadata>>;

        const { validatorFor, string } = generateTemplateAPI<{ validationExtensions: { general: MetadataExtension; }; }>(withMetadata);
        const t = validatorFor({
            sample: string("default").required,
        });

        assert.strictEqual(t.metadata, "custom-mixin");
        assert.strictEqual(t.getMixinInfo(), "mixin-info");
    }

    validatorResultShouldCallMixinMembers()
    {
        function withTracking(Base: ValueTemplateConstructor)
        {
            return class extends Base
            {
                calls: string[] = [];
                constructor(...args: any[]) { super(...args); this.calls.push("constructor"); }
                track() { this.calls.push("track"); return this; }
            };
        }
        type TrackingExtension = InstanceType<ReturnType<typeof withTracking>>;

        const { validatorFor, string } = generateTemplateAPI<{ validationExtensions: { general: TrackingExtension; }; }>(withTracking);
        const t = validatorFor({
            test: string("default")
        });

        assert.ok(t.calls.includes("constructor"), "Mixin constructor should have been called");

        t.track();
        assert.ok(t.calls.includes("track"), "Mixin method should be callable on the template");
    }

    inferredCollectionEntriesShouldUseTheCurrentMixin()
    {
        let instanceCount = 0;
        const withTracking: TemplateMixin = Base => class extends Base
        {
            constructor(...args: any[]) { super(...args); instanceCount++; }
        };

        const { array } = generateTemplateAPI(withTracking);
        array([1, 2]);

        assert.strictEqual(instanceCount, 2, "Both the collection and its inferred entry template should use the mixin");
    }

    objectTemplateCachesShouldBeIsolatedByClassFamily()
    {
        const firstMixedBases: ValueTemplateConstructor[] = [];
        const secondMixedBases: ValueTemplateConstructor[] = [];
        const firstMixin: TemplateMixin = Base => { const Mixed = class extends Base { }; firstMixedBases.push(Mixed); return Mixed; };
        const secondMixin: TemplateMixin = Base => { const Mixed = class extends Base { }; secondMixedBases.push(Mixed); return Mixed; };

        const firstAPI = generateTemplateAPI(firstMixin);
        const secondAPI = generateTemplateAPI(secondMixin);
        const sharedShape = { kind: "sample" };
        const firstTemplate = firstAPI.validatorFor(sharedShape);
        const cachedFirstTemplate = firstAPI.validatorFor(sharedShape);
        const secondTemplate = secondAPI.validatorFor(sharedShape);

        assert.strictEqual(firstTemplate, cachedFirstTemplate, "A class family should reuse its own cached object template");
        assert.notStrictEqual(firstTemplate, secondTemplate, "Different class families should not share cached object templates");
        assert.ok(firstMixedBases.some(Mixed => firstTemplate instanceof Mixed));
        assert.ok(secondMixedBases.some(Mixed => secondTemplate instanceof Mixed));
    }
}

export class ReflectionAPITests
{
    expectationQueriesRecognizeFactoriesFromTheSameSharedRegistry()
    {
        const firstAPI = generateTemplateAPI();
        const secondAPI = generateTemplateAPI();
        const validator = firstAPI.validatorFor(firstAPI.number());

        assert.strictEqual(firstAPI.number, secondAPI.number);
        assert.strictEqual(validator.expects(firstAPI.number), true);
        assert.strictEqual(validator.expects(secondAPI.number), true);
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
        function withExtension(Base: ValueTemplateConstructor)
        {
            return class extends Base
            {
                validationExtension() { return "validation"; }
                objectValidationExtension() { return "object"; }
            };
        }
        type Extension = InstanceType<ReturnType<typeof withExtension>>;

        const { number, validatorFor } = generateTemplateAPI<{
            validationExtensions: {
                general: Pick<Extension, "validationExtension">;
                object: Pick<Extension, "objectValidationExtension">;
            };
        }>(withExtension);
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
        function withPrimitiveExtension(Base: ValueTemplateConstructor)
        {
            return class extends Base
            {
                tag(tag: string): this { return this; }
            };
        }
        type PrimitiveExtension = InstanceType<ReturnType<typeof withPrimitiveExtension>>;

        const defaultAPI = generateTemplateAPI();
        // @ts-expect-error - .tag() does not exist on the default TemplatingAPI
        assert.throws(() => defaultAPI.string().tag("foo"));

        // With the extension type applied, .tag() should be available at the type level
        const { string } = generateTemplateAPI<{ definitionExtensions: { primitive: PrimitiveExtension; }; }>(withPrimitiveExtension);
        string().optional.tag("foo");
        string().withDefault("whatever").tag("foo");
    }

    valueTemplateShouldReflectAddedInterfaceCalls()
    {
        function withTagging(Base: ValueTemplateConstructor)
        {
            return class extends Base
            {
                public tagValue?: string;
                tag(tag: string): this
                {
                    this.tagValue = tag;
                    return this;
                }
            };
        }
        type Taggable = InstanceType<ReturnType<typeof withTagging>>;

        const { number } = generateTemplateAPI<{ definitionExtensions: { primitive: Taggable; }; }>(withTagging);
        const result = number(42).tag("my-number");

        assert.strictEqual(result.tagValue, "my-number");
    }

    baseTypeIsAccessibleInCustomDefinedInterfaces()
    {
        function withTypeDependentClosure(Base: ValueTemplateConstructor)
        {
            return class extends Base
            {
                typeDependentClosure(closure: (value: ValueType<this>) => boolean) { return this; };
            };
        }
        type Extension = InstanceType<ReturnType<typeof withTypeDependentClosure>>;

        const { number, string, valueOf } = generateTemplateAPI<{ definitionExtensions: { general: Extension; }; }>(withTypeDependentClosure);
        number(42).typeDependentClosure(value => value === 100);
        //@ts-expect-error should throw because boolean =! number
        number(42).typeDependentClosure(value => value === false);

        valueOf(number, string).typeDependentClosure((value: string | number) => true);
        //@ts-expect-error should throw because boll | number  =! number | string
        valueOf(number, string).typeDependentClosure((value: bool | number) => true);
    }
}
