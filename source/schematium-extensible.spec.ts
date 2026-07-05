import { Debug } from "unitium";
import * as assert from "node:assert";
import { generateTemplatingAPI, ValueType } from "./schematium-extensible.ts";

export class BaseClassSubstitutionTests
{
    schemaResultShouldContainBaseClassMembers()
    {
        class MyBase
        {
            metadata = "custom-base";
            getBaseInfo() { return "base-info"; }
        }

        const { schema, string } = generateTemplatingAPI<MyBase>(MyBase);
        const t = schema({
            sample: string("default").required,
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

        const { schema, string } = generateTemplatingAPI<TrackingBase>(TrackingBase);
        const t = schema({
            test: string("default")
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

        const defaultAPI = generateTemplatingAPI();
        // @ts-expect-error - .tag() does not exist on the default TemplatingAPI
        assert.throws(() => defaultAPI.primitives.string().tag("foo"));

        // With the extension type applied, .tag() should be available at the type level
        const { string } = generateTemplatingAPI<{}, {}, PrimitiveExtension>(PrimitiveExtension);
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

        const { number } = generateTemplatingAPI<{}, {}, Taggable>(Taggable);
        const result = number(42).tag("my-number");

        assert.strictEqual(result.tagValue, "my-number");
    }

    baseTypeIsAccessibleInCustomDefinedInterfaces()
    {
        class Extension
        {
            typeDependentClosure(closure: (value: ValueType<this>) => boolean) { return this; };
        }

        const { number, string, valueOf } = generateTemplatingAPI<{}, Extension, Extension, Extension>(Extension);
        number(42).typeDependentClosure(value => value === 100);
        //@ts-expect-error should throw because boolean =! number
        number(42).typeDependentClosure(value => value === false);

        valueOf(number, string).typeDependentClosure((value: string | number) => true);
        //@ts-expect-error should throw because boll | number  =! number | string
        valueOf(number, string).typeDependentClosure((value: bool | number) => true);
    }
}