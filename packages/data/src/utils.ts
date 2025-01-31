import {z} from 'zod';
import {astream, AsyncStream, ColdStream} from './async-stream.js';
import {CancelledError, Cx} from './context.js';
import {Deferred} from './deferred.js';
import {
    AggregateBusinessError,
    AggregateError,
    AppError,
    BusinessError,
} from './errors.js';
import {logger} from './logger.js';

export type Brand<T, B> = T & {__brand: () => B | undefined};

export type Nothing = void | undefined;

export interface Observer<T> {
    next: (cx: Cx, value: T) => Promise<void>;
    throw: (error: AppError) => Promise<void>;
    close: () => Nothing;
}

export class Subject<TValue> {
    private subs: Array<{observer: Observer<TValue>}> = [];
    private _open = true;

    get open() {
        return this._open;
    }

    get anyObservers(): boolean {
        return this.subs.length > 0;
    }

    subscribe(cx: Cx, observer: Observer<TValue>): void {
        this.ensureOpen(cx);

        // wrap if the same observer is used twice for subscription, so unsubscribe wouldn't filter both out
        const sub = {observer};

        this.subs.push(sub);
        cx.onCancel(() => {
            this.subs = this.subs.filter(x => x !== sub);
        });
    }

    value$(cx: Cx): AsyncStream<TValue> {
        const stream = new ColdStream<TValue>(exe => {
            this.subscribe(cx, {
                next: (cx, value) => exe.next(cx, value),
                throw: error => exe.throw(error),
                close: () => exe.end(),
            });

            return () => {
                exe.throw(new CancelledError(Cx.todo())).finally(() =>
                    exe.end()
                );
            };
        });
        return astream(stream);
    }

    async next(cx: Cx, value: TValue): Promise<void> {
        this.ensureOpen(cx);
        // copy in case if new subscribers are added/removed during notification
        // await whenAll([...this.subs].map(sub => sub.observer.next(cx, value)));

        // to preserve stack
        for (const sub of [...this.subs]) {
            await sub.observer.next(cx, value);
        }
    }

    async throw(error: AppError): Promise<void> {
        this.ensureOpen(Cx.todo());
        // copy in case if new subscribers are added/removed during notification
        // await whenAll(
        //     [...this.subs].map(sub =>
        //         sub.observer.throw(cx, new ForwardedError(error))
        //     )
        // );

        // to preserve stack
        for (const sub of [...this.subs]) {
            await sub.observer.throw(error);
        }
    }

    async close(cx: Cx): Promise<void> {
        if (this._open) {
            this._open = false;
            for (const sub of [...this.subs]) {
                sub.observer.close();
            }
        } else {
            logger.warn(cx, 'subject already closed');
        }
    }

    private ensureOpen(cx: Cx) {
        if (!this._open) {
            throw new AppError(cx, 'subject is closed');
        }
    }
}

export function assertNever(cx: Cx, value: never): never {
    throw new AppError(cx, 'assertNever failed: ' + value);
}

export function assert(cx: Cx, expression: boolean): asserts expression {
    if (!expression) {
        throw new AppError(cx, 'assertion failed');
    }
}

export function assertDefined<T>(cx: Cx, value: T | undefined | null): T {
    if (value === null || value === undefined) {
        throw new AppError(cx, 'assertion failed: value is not defined');
    }

    return value;
}

export function wait(cx: Cx, ms: number): Promise<void> {
    const result = new Deferred<void>();
    const timeoutId = setTimeout(() => result.resolve(cx), ms);

    cx.onCancel(() => {
        result.reject(new CancelledError(Cx.todo()));
        clearTimeout(timeoutId);
    });
    return result.promise;
}

export function isCancelledError(error: unknown): boolean {
    return (
        error instanceof CancelledError ||
        (error instanceof AppError && isCancelledError(error.cause))
    );
}

export async function ignoreCancel<T>(promise: Promise<T>): Promise<T | never> {
    try {
        return await promise;
    } catch (error) {
        if (isCancelledError(error)) {
            return new Promise(() => {});
        }
        return await Promise.reject(error);
    }
}

export function interval(ms: number, cx: Cx): AsyncStream<number> {
    return astream(_interval(cx, ms));
}

async function* _interval(cx: Cx, ms: number): AsyncIterable<[Cx, number]> {
    let index = 0;
    while (cx.alive) {
        cx.ensureAlive(cx);
        yield [cx, index];
        index += 1;
        await wait(cx, ms);
    }
}

export function pipe<T>(x: T): T;
export function pipe<T, R>(x: T, fn1: (x: T) => R): R;
export function pipe<T, A, R>(x: T, fn1: (x: T) => A, fn2: (arg: A) => R): R;
export function pipe<T, A, B, R>(
    x: T,
    fn1: (x: T) => A,
    fn2: (arg: A) => B,
    fn3: (arg: B) => R
): R;
export function pipe<T, A, B, C, R>(
    x: T,
    fn1: (x: T) => A,
    fn2: (arg: A) => B,
    fn3: (arg: B) => C,
    fn4: (arg: C) => R
): R;
export function pipe<T, A, B, C, D, R>(
    x: T,
    fn1: (x: T) => A,
    fn2: (arg: A) => B,
    fn3: (arg: B) => C,
    fn4: (arg: C) => D,
    fn5: (arg: D) => R
): R;
export function pipe<T, A, B, C, D, E, R>(
    x: T,
    fn1: (x: T) => A,
    fn2: (arg: A) => B,
    fn3: (arg: B) => C,
    fn4: (arg: C) => D,
    fn5: (arg: D) => E,
    fn6: (arg: E) => R
): R;
export function pipe<T, A, B, C, D, E, F, R>(
    x: T,
    fn1: (x: T) => A,
    fn2: (arg: A) => B,
    fn3: (arg: B) => C,
    fn4: (arg: C) => D,
    fn5: (arg: D) => E,
    fn6: (arg: E) => F,
    fn7: (arg: F) => R
): R;
export function pipe<T, A, B, C, D, E, F, G, R>(
    x: T,
    fn1: (x: T) => A,
    fn2: (arg: A) => B,
    fn3: (arg: B) => C,
    fn4: (arg: C) => D,
    fn5: (arg: D) => E,
    fn6: (arg: E) => F,
    fn7: (arg: F) => G,
    fn8: (arg: G) => R
): R;
export function pipe<T>(x: T, ...fns: Function[]): any {
    if (fns.length === 0) {
        return x;
    }
    return fns.reduce((prevResult, fn) => fn(prevResult), x as unknown);
}

export function concatBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
    const mergedArray = new Uint8Array(a.length + b.length);
    mergedArray.set(a);
    mergedArray.set(b, a.length);

    return mergedArray;
}

export function distinct<T>(items: T[]): T[] {
    return [...new Set(items).values()];
}

export function zip<T1, T2>(
    cx: Cx,
    a: readonly T1[],
    b: readonly T2[]
): [T1, T2][] {
    assert(cx, a.length === b.length);

    const result: [T1, T2][] = [];
    for (let i = 0; i < a.length; i += 1) {
        result.push([a[i], b[i]]);
    }

    return result;
}

export function compareUint8Array(a: Uint8Array, b: Uint8Array): 1 | 0 | -1 {
    const minLength = Math.min(a.length, b.length);

    for (let i = 0; i < minLength; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
    }

    if (a.length < b.length) return -1;
    if (a.length > b.length) return 1;

    return 0;
}

export function bufStartsWith(buf: Uint8Array, prefix: Uint8Array): boolean {
    const bufPrefix = buf.slice(0, prefix.length);
    return compareUint8Array(bufPrefix, prefix) === 0;
}

export function unreachable(cx: Cx): never {
    throw new AppError(cx, 'unreachable');
}

export function unimplemented(cx: Cx): never {
    throw new AppError(cx, 'unimplemented');
}

export function arrayEqual<T>(a: T[], b: T[]) {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }

    return true;
}

/**
 * In contrast to Promise.all, whenAll waits for all rejections and combines them into AggregateError
 */
export async function whenAll<const T extends Promise<any>[]>(
    cx: Cx,
    promises: T
): ReturnType<typeof Promise.all<T>> {
    const result = await Promise.allSettled(promises);
    const rejected = result.filter(x => x.status === 'rejected');

    if (rejected.length === 0) {
        return result
            .filter(x => x.status === 'fulfilled')
            .map(x => x.value) as any;
    } else if (rejected.length === 1) {
        throw rejected[0].reason;
    } else {
        if (rejected.every(x => x.reason instanceof BusinessError)) {
            throw new AggregateBusinessError(
                cx,
                rejected.map(x => x.reason)
            );
        } else {
            throw new AggregateError(
                cx,
                rejected.map(x => x.reason)
            );
        }
    }
}

export async function whenAny<T>(cx: Cx, promises: Promise<T>[]) {
    assert(cx, promises.length > 0);

    const withId = promises.map((promise, idx) =>
        promise.then(result => ({result, idx}))
    );
    const racer = await Promise.race(withId);

    return [
        racer.result,
        promises.filter((_, idx) => idx !== racer.idx),
    ] as const;
}

export function zUint8Array() {
    return z.custom<Uint8Array>(x => x instanceof Uint8Array, {
        message: 'Uint8Array expected',
    });
}

export interface ObservableOptions<T> {
    get: (cx: Cx) => Promise<T>;
    update$: Promise<AsyncIterable<any>>;
}

export async function observable<T>(
    cx: Cx,
    options: ObservableOptions<T>
): Promise<[initialValue: T, update$: AsyncIterable<[Cx, T]>]> {
    return [
        await options.get(cx),
        astream(await options.update$).map(cx => options.get(cx)),
    ];
}
