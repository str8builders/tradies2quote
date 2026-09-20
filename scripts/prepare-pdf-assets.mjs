import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const source=resolve('node_modules/pdfjs-dist');
const {version}=JSON.parse(await readFile(resolve(source,'package.json'),'utf8'));
const target=resolve('public/t2qcal/vendor/pdfjs',version);
await mkdir(target,{recursive:true});
await Promise.all(['cmaps','standard_fonts','wasm','LICENSE'].map(name=>cp(resolve(source,name),resolve(target,name),{recursive:true})));
await cp(resolve(source,'build/pdf.worker.min.mjs'),resolve(target,'pdf.worker.min.mjs'));
console.log(`Prepared local PDF.js ${version} assets`);

async function files(directory,prefix=''){
  const entries=await readdir(directory,{withFileTypes:true});
  return (await Promise.all(entries.map(entry=>entry.isDirectory()?files(resolve(directory,entry.name),`${prefix}${entry.name}/`):`${prefix}${entry.name}`))).flat();
}
await writeFile(resolve(target,'assets.json'),JSON.stringify((await files(target)).filter(name=>name!=='assets.json')));
