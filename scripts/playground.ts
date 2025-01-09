import {pushable} from 'it-pushable';

const source = pushable({objectMode: true});

setTimeout(() => source.push('hello'), 100);
setTimeout(() => source.push('world'), 200);
setTimeout(() => source.end(), 300);

const start = Date.now();

for await (const value of source) {
    console.log(`got "${value}" after ${Date.now() - start}ms`);
}
console.log(`done after ${Date.now() - start}ms`);
