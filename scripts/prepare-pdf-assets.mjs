import {cp,mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const source=resolve('node_modules/pdfjs-dist');
const {version}=JSON.parse(await readFile(resolve(source,'package.json'),'utf8'));
const target=resolve('public/vendor/pdfjs',version);
await mkdir(target,{recursive:true});
await Promise.all(['cmaps','standard_fonts','wasm','LICENSE'].map(name=>cp(resolve(source,name),resolve(target,name),{recursive:true})));
await cp(resolve(source,'build/pdf.worker.min.mjs'),resolve(target,'pdf.worker.min.mjs'));
console.log(`Prepared local PDF.js ${version} assets`);
