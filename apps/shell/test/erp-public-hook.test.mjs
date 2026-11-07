import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
async function hook(bound) {
  const calls=[];const context=vm.createContext({fetch:async url=>{calls.push(url);return{ok:true};}});
  if(bound)context.__erpPublicModuleTarget=url=>{if(url!=='https://erp.example/known.js')throw Error('unlisted');};
  const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/giu))vm.runInContext(match[1],context);
  return{context,calls,load:context.esmsInitOptions?.fetch??context.fetch};
}
test('official shim fetch hook checks every module URL before network delegation',async()=>{
  const s=await hook(true);await s.load('https://erp.example/known.js');
  await assert.rejects(()=>s.load('https://evil.example/unknown.js'));
  assert.deepEqual(s.calls,['https://erp.example/known.js']);assert.equal(s.context.esmsInitOptions.shimMode,true);
});
test('shim hook preserves normal fetching when no verified release is bound',async()=>{
  const s=await hook(false);assert.equal((await s.load('https://operations.example/remote.js')).ok,true);
  assert.deepEqual(s.calls,['https://operations.example/remote.js']);
});
