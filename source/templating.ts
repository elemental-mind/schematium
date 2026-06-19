interface ObjectTemplate { [key: string]: TemplateEntry; }

type CollectionEntryType<T> = T extends Array<infer E> ? E : T extends Record<string, infer R> ? [key: string, value: R] : never;
type TemplateEntry<T = any> = ObjectTemplate | ValueConfiguration<T>;
type ValueConfiguration<T> = ValueAPI<T> | CollectionAPI<T> | TypedCollectionAPI<T>;
interface ValueAPI<T>
{
    accepts: (validator: (value: T) => boolean) => ValueAPI<T>;
}
interface CollectionAPI<T>
{
    accepts: (validator: (value: T) => boolean) => CollectionAPI<T>,
    acceptsEntries: (validator: (value: CollectionEntryType<T>) => boolean) => CollectionAPI<T>,
}
interface TypedCollectionAPI<T> extends CollectionAPI<T>
{
    withDefault: (defaultValue: T) => CollectionAPI<T>,
}

type TypeOption = typeof number | typeof string | typeof bool | ObjectTemplate;
type TypesParameter = TypeOption | TypeOption[];

type Resolve<T extends TypesParameter> =
    T extends typeof number ? number :
    T extends typeof string ? string :
    T extends typeof bool ? boolean :
    T extends ObjectTemplate ? Concrete<T> :
    T extends Array<infer E extends TypeOption> ? Resolve<E> :
    never;

type Concrete<T extends ObjectTemplate> = {
    [K in keyof T]:
    T[K] extends ValueAPI<infer V> ? V :
    T[K] extends CollectionAPI<infer C> ? C :
    T[K] extends ObjectTemplate ? Concrete<T[K]>
    : never
};

//----------------------------------------------

const SubTemplate = {
    sampleValue: string(),
    sampleParameter: number(123),
} satisfies ObjectTemplate;

const SampleTemplate = {
    number: number(123).accepts(number => number < 256),
    bool: bool(),
    string: string(),
    array: arrayOf([number, string]).withDefault([]).accepts(array => array.length < 100).acceptsEntries(entry => true),
    list: listOf(SubTemplate).withDefault({ sample: { sampleParameter: 123, sampleValue: "text" } }).acceptsEntries(([key, value]) => true),
    deep: {
        bar: array(["bla", "bla"])
    }
} satisfies ObjectTemplate;

const testVar = SubTemplate;
type test = typeof testVar;
type resolution = Resolve<typeof testVar>;

//----------------------------------------------

abstract class ValueTemplate<T>
{
    default?: T;

    /**
     * Used for parsing the value.
     * @param value 
     */
    abstract fromString(value: string): T;

    /**
   * Used for validating the value after parsing
   * @param value 
   * @returns 
   */
    validate(value: T)
    {
        return true;
    }
}

export function number(): ValueAPI<number | undefined>;
export function number(defaultValue: number): ValueAPI<number>;
export function number(defaultValue?: number): any
{
}
class NumberTemplate extends ValueTemplate<number>
{
    fromString(value: string): number
    {

    }
}


export function string(): ValueAPI<string | undefined>;
export function string(defaultValue: string): ValueAPI<string>;
export function string(defaultValue?: string): any
{
}
class StringTemplate extends ValueTemplate<string>
{
    fromString(value: string): string
    {

    }
}

export function bool(): ValueAPI<boolean | undefined>;
export function bool(defaultValue: boolean): ValueAPI<boolean>;
export function bool(defaultValue?: boolean): any
{
}
class BoolTemplate extends ValueTemplate<boolean>
{
    fromString(value: string): boolean
    {

    }
}


export function list<T extends Record<string, boolean> | Record<string, number> | Record<string, string>>(defaultWithSingularEntryType: T): CollectionAPI<T>
{
}
export function listOf<T extends TypesParameter>(entryTypes: T): TypedCollectionAPI<Record<string, Resolve<T>>>
{
}
class ListTemplate<T> extends ValueTemplate<Record<string, T>>
{
    fromString(value: string): Record<string, T>
    {

    }
}

export function array<T extends boolean[] | number[] | string[]>(defaultWithSingularEntryType: T): CollectionAPI<T>
{
}
export function arrayOf<T extends TypesParameter>(entryTypes: T): TypedCollectionAPI<Array<Resolve<T>>>
{
}
class ArrayTemplate<T> extends ValueTemplate<T[]>
{
    fromString(value: string): T[]
    {

    }
}


