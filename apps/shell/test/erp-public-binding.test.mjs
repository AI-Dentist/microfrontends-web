import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {createPublicLoader} from '../src/erp-public-loader.mjs';

test('a delegated public module failure invalidates readiness',async t=>{
  const names=['navigator','importShim','__erpPublicShimFetchHook','__erpPublicModuleTarget'],saved=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
  t.after(()=>{for(const n of names){if(saved[n])Object.defineProperty(globalThis,n,saved[n]);else delete globalThis[n];}});
  const controller={scriptURL:'https://shell.example/erp-sw.js?release='+'a'.repeat(64)},target='https://erp.example/routes.js',state={ready:false};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{controller,addEventListener(){},removeEventListener(){}}}});
  delete globalThis.__erpPublicShimFetchHook;globalThis.importShim=async()=>{throw Error('synthetic runtime failure');};
  const guard=createPublicLoader({controller,scriptURL:controller.scriptURL,release:{runtimePolicy:{targets:[target]}}},state);guard.markReady();assert.equal(state.ready,true);
  await assert.rejects(()=>guard.loadModuleFn(target),/synthetic runtime failure/);assert.equal(state.ready,false);
});

test('configured online module roots remain network-only without widening native federation',async t=>{
  const names=['navigator','fetch','importShim','esmsInitOptions','__erpPublicModuleTarget','__erpPublicShimFetchHook'];
  const saved=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
  t.after(()=>{for(const n of names){if(saved[n])Object.defineProperty(globalThis,n,saved[n]);else delete globalThis[n];}});
  const calls=[],controller={scriptURL:'https://shell.example/erp-sw.js?release='+'a'.repeat(64)};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{controller,addEventListener(){},removeEventListener(){}}}});
  globalThis.fetch=async url=>{calls.push(url);return{ok:true};};globalThis.importShim=async()=>({});
  const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/giu))vm.runInThisContext(m[1]);
  const entry='https://operations.example/releases/v1/remote.js',known='https://erp.example/known.js',state={ready:false};
  const guard=createPublicLoader({controller,scriptURL:controller.scriptURL,release:{publicBootConfig:{remotes:[{kind:'module',entry}]},runtimePolicy:{targets:[known],contracts:['es-module-shims-fetch-v1','configured-module-remotes-v1']}}},state);
  guard.markReady();assert.equal((await globalThis.esmsInitOptions.fetch('https://operations.example/releases/v1/chunk.js')).ok,true);assert.equal(state.ready,true);
  await assert.rejects(()=>globalThis.esmsInitOptions.fetch('https://operations.example/releases/v1/auth/session.js'));
  await assert.rejects(()=>guard.loadModuleFn(entry));
  assert.deepEqual(calls,['https://operations.example/releases/v1/chunk.js']);
});
test('verified native binding also confines the official shim fetch hook',async t=>{
  const names=['navigator','fetch','importShim','esmsInitOptions','__erpPublicModuleTarget','__erpPublicShimFetchHook'];
  const saved=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
  t.after(()=>{for(const n of names){if(saved[n])Object.defineProperty(globalThis,n,saved[n]);else delete globalThis[n];}});
  const calls=[],controller={scriptURL:'https://shell.example/erp-sw.js?release='+ 'a'.repeat(64)};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{controller,addEventListener(){},removeEventListener(){}}}});
  globalThis.fetch=async url=>{calls.push(url);return{ok:true};};globalThis.importShim=async()=>({});
  const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/giu))vm.runInThisContext(m[1]);
  const known='https://erp.example/known.js',state={ready:false};
  const guard=createPublicLoader({controller,scriptURL:controller.scriptURL,release:{runtimePolicy:{targets:[known],contracts:['native-federation-load-module-v1','es-module-shims-fetch-v1']}}},state);
  guard.markReady();assert.equal(state.ready,true);
  await globalThis.esmsInitOptions.fetch(known);
  await assert.rejects(()=>globalThis.esmsInitOptions.fetch('https://evil.example/module.js'));
  assert.deepEqual(calls,[known]);assert.equal(state.ready,false);
});
