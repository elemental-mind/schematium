import * as assert from "node:assert";
import { GenerateTemplatingAPI, type TemplatingAPI, ValueType } from "./schematium-extensible.ts";
import { Debug } from "unitium";

export class BaseClassSubstitutionTests
{
    schemaResultShouldContainBaseClassMembers()
    {
        class MyBase
        {
            metadata = "custom-base";
            getBaseInfo() { return "base-info"; }
        }

        const api = GenerateTemplatingAPI<TemplatingAPI<MyBase>>(MyBase);
        const t = api.templating.schema({
            sample: api.primitives.string("default").required,
        });

        assert.strictEqual(t.metadata, "custom-base");
        assert.strictEqual(t.getBaseInfo(), "base-info");
    }

    schemaResultShouldCallBaseClassMembers()
    {
        class TrackingBase
        {
            calls: string[] = [];
            constructor() { this.calls.push("constructor"); }
            track() { this.calls.push("track"); return this; }
        }

        const api = GenerateTemplatingAPI<TemplatingAPI<TrackingBase>>(TrackingBase);
        const t = api.templating.schema({
            test: api.primitives.string("default")
        });

        assert.ok(t.calls.includes("constructor"), "Base class constructor should have been called");

        t.track();
        assert.ok(t.calls.includes("track"), "Base class method should be callable on the template");
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

        const defaultAPI = GenerateTemplatingAPI();
        // @ts-expect-error - .tag() does not exist on the default TemplatingAPI
        assert.throws(() => defaultAPI.primitives.string().tag("foo"));

        // With the extension type applied, .tag() should be available at the type level
        const extendedAPI = GenerateTemplatingAPI<TemplatingAPI<{}, PrimitiveExtension>>(PrimitiveExtension);
        extendedAPI.primitives.string().optional.tag("foo");
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

        const api = GenerateTemplatingAPI<TemplatingAPI<{}, Taggable>>(Taggable);
        const result = api.primitives.number(42).tag("my-number");

        assert.strictEqual(result.tagValue, "my-number");
    }

    baseTypeIsAccessibleInCustomDefinedInterfaces()
    {
        class Extension
        {
            typeDependentClosure(closure: (value: ValueType<this>) => boolean) { return this; };
        }

        const api = GenerateTemplatingAPI<TemplatingAPI<{}, Extension, Extension, Extension>>(Extension);
        api.primitives.number(42).typeDependentClosure((value: number) => true);
        //@ts-expect-error should throw because boolean =! number
        api.primitives.number(42).typeDependentClosure((value: boolean) => true);

        api.variadics.valueOf(api.primitives.number, api.primitives.string).typeDependentClosure((value: string | number) => true);
        //@ts-expect-error should throw because boll | number  =! number | string
        api.variadics.valueOf(api.primitives.number, api.primitives.string).typeDependentClosure((value: bool | number) => true);
    }
}