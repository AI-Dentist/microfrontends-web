// Local encrypted workspace only. No JWT/bearer is accepted as vault authority.
import {verifyPinnedGrant} from './grant.mjs';
const KDF={name:'PBKDF2',hash:'SHA-256',iterations:600000};
const encode=new TextEncoder(),decode=new TextDecoder('utf-8',{fatal:true});
const base64=bytes=>btoa(String.fromCharCode(...bytes));
const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const json=value=>encode.encode(JSON.stringify(value));
function clean(value){if(value instanceof Uint8Array)value.fill(0);else if(value instanceof ArrayBuffer)new Uint8Array(value).fill(0);}
function identity(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&typeof value.issuer==='string'&&value.issuer&&typeof value.subject==='string'&&value.subject&&(Number.isSafeInteger(value.epoch)||typeof value.epoch==='string'&&value.epoch)?Object.freeze({...value}):null;}
function pinBytes(pin){if(typeof pin!=='string'||!/^\d{6}$/u.test(pin))throw Error('OFFLINE_UNLOCK_FAILED');const bytes=encode.encode(pin);if(bytes.byteLength!==6)throw Error('OFFLINE_UNLOCK_FAILED');return bytes;}
export class OfflineVaultError extends Error{constructor(code){super(code);this.name='OfflineVaultError';this.code=code;}}
function failure(code='OFFLINE_UNLOCK_FAILED'){throw new OfflineVaultError(code);}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const digest=value=>crypto.subtle.digest('SHA-256',value);
export async function workspaceScopeId(binding){
  if(!binding||typeof binding.identityIssuer!=='string'||typeof binding.identitySubject!=='string'||typeof binding.erpUserId!=='string'||typeof binding.workspaceId!=='string'||typeof binding.deviceId!=='string')failure('OFFLINE_GRANT_INVALID');
  return hex(new Uint8Array(await digest(json({issuer:binding.identityIssuer,subject:binding.identitySubject,user:binding.erpUserId,workspace:binding.workspaceId,device:binding.deviceId}))));
}
export class OfflineVault{
  #store;#scopeId;#clock;#identity;#credential;#authority;#expected;#ownerEpoch;#expiresAt;#dek=null;#ivKey=null;#serial=0n;#keyId;#revision=0;#lastWall=null;#lastMono=null;#used;
  constructor({store,scopeId,clock,getIdentity}={}){
    this.#store=store;this.#scopeId=scopeId;this.#clock=clock;this.#identity=getIdentity;
    if(!store||!/^[0-9a-f]{64}$/u.test(scopeId)||typeof getIdentity!=='function'||!Number.isSafeInteger(clock?.wall())||!Number.isSafeInteger(clock?.mono()))failure('OFFLINE_STORAGE_FAILED');
  }
  #aad(){return json({schema:'erp-offline-vault-v1',scope:this.#scopeId});}
  #time(){
    if(this.#expiresAt!==null&&this.#clock.wall()>=this.#expiresAt)failure('OFFLINE_LOCKED');
    if(this.#lastWall!==null&&(this.#clock.wall()<this.#lastWall||this.#clock.mono()<this.#lastMono))failure('OFFLINE_LOCKED');
    if(this.#lastMono!==null){const wallDelta=this.#clock.wall()-this.#lastWall,monoDelta=this.#clock.mono()-this.#lastMono;if(Math.abs(wallDelta-monoDelta)>86400000)failure('OFFLINE_LOCKED');}
    this.#lastWall=this.#clock.wall();this.#lastMono=this.#clock.mono();
    if(this.#expiresAt!==null)this.#serial=BigInt(this.#expiresAt)*1_000_000n+BigInt(this.#clock.mono())*1000n+BigInt(this.#clock.wall());
  }
  #same(){
    const current=identity(this.#identity());
    // Offline there is no live identity to compare: unlock stays possible and the
    // caller must surface that the actor could not be re-verified.
    if(current===null)return;
    if(current.issuer!==this.#expected.identityIssuer||current.subject!==this.#expected.identitySubject||current.epoch!==this.#ownerEpoch)failure('OFFLINE_LOCKED');
  }
  #clear(){clean(this.#dek);this.#dek=null;this.#ivKey=null;this.#serial=0n;}
  #lockState(){this.#clear();return Object.freeze({status:'locked',capabilities:Object.freeze([])});}
  state(){
    try{if(!this.#dek)return this.#lockState();this.#time();this.#same();return Object.freeze({status:'unlocked',capabilities:Object.freeze([...this.#expected.capabilities])});}
    catch{return this.#lockState();}
  }
  async #seal(pin,dek,iterations,salt,iv,version,keyId,revision,clock){
    const password=pinBytes(pin);let material,derived;
    try{
      material=await crypto.subtle.importKey('raw',password,'PBKDF2',false,['deriveBits']);
      derived=new Uint8Array(await crypto.subtle.deriveBits({...KDF,salt,iterations},material,256));
      const wrapping=await crypto.subtle.importKey('raw',derived,'AES-GCM',false,['encrypt']);
      const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:this.#aad()},wrapping,dek));
      return{version,schema:'erp-offline-vault-v1',kdf:{...KDF},salt:base64(salt),wrap:{iv:base64(iv),cipher:base64(cipher)},clock,context:null,usedIVs:[],keyId,revision,retired:false};
    }finally{clean(password);clean(material);clean(derived);}
  }
  #reserved(iv){if(this.#used.has(base64(iv)))throw Error('duplicate');this.#used.add(base64(iv));return{iv:base64(iv),serial:(++this.#serial).toString()};}
  async #sealContext(pin){
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),contextIv=crypto.getRandomValues(new Uint8Array(12));
    const context={credential:this.#credential,authority:this.#authority,expected:this.#expected,ownerEpoch:this.#ownerEpoch,expiresAtMs:this.#expiresAt};
    const sealed=await this.#seal(pin,this.#dek,this.#activeIterations,salt,iv,this.#activeVersion,this.#activeKeyId,this.#revision,{maxWall:this.#clock.wall(),maxMono:this.#clock.mono(),lastWall:this.#clock.wall(),lastMono:this.#clock.mono()});
    const contextEnvelope=await this.#seal(pin,json(context),this.#activeIterations,salt,contextIv,this.#activeVersion,this.#activeKeyId,this.#revision,{maxWall:this.#clock.wall(),maxMono:this.#clock.mono(),lastWall:this.#clock.wall(),lastMono:this.#clock.mono()});
    sealed.context={iv:base64(contextIv),cipher:contextEnvelope.wrap.cipher};return sealed;
  }
  async #write(){
    const envelope=await this.#sealContext(this.#activePin);
    const revision=await this.#store.replaceContext(this.#keyId,this.#revision,envelope.context);
    this.#revision=revision;
  }
  #activePin='';#activeKeyId='';#activeVersion=1;#activeIterations=KDF.iterations;
  async activate(activation,pin){
    this.#clear();
    try{
      const verified=await verifyPinnedGrant({credential:activation.credential,authority:activation.authority,expected:activation.binding,nowMs:this.#clock.wall()});
      if(this.#scopeId!==await workspaceScopeId(verified.binding))failure('OFFLINE_GRANT_INVALID');
      const current=identity(this.#identity());
      if(current&&(current.issuer!==verified.grant.identityIssuer||current.subject!==verified.grant.identitySubject||current.epoch!==activation.ownerEpoch))failure('OFFLINE_GRANT_INVALID');
      if(await this.#store.load())failure('OFFLINE_GRANT_INVALID');
      const value=crypto.getRandomValues(new Uint8Array(32));this.#dek=value;
      this.#credential=activation.credential;this.#authority=activation.authority;this.#expected=activation.binding;this.#ownerEpoch=activation.ownerEpoch;this.#expiresAt=verified.expiresAtMs;this.#keyId=hex(crypto.getRandomValues(new Uint8Array(16)));this.#used=new Set();this.#revision=0;this.#time();
      this.#activePin=pin;this.#activeKeyId=this.#keyId;this.#activeVersion=1;this.#activeIterations=KDF.iterations;try{await this.#store.create(await this.#sealContext(pin));}catch(error){if(error instanceof OfflineVaultError)throw error;failure('OFFLINE_STORAGE_FAILED');}this.#activePin='';this.#lastWall=this.#clock.wall();this.#lastMono=this.#clock.mono();
      return this.state();
    }catch(error){this.#activePin='';this.#clear();if(error instanceof OfflineVaultError)throw error;if(error?.code?.startsWith('OFFLINE_'))throw error;failure('OFFLINE_STORAGE_FAILED');}
  }
  async unlock(pin){
    this.#clear();const password=pinBytes(pin);let material,derived;
    try{
      let envelope;try{envelope=await this.#store.load();}catch{failure('OFFLINE_STORAGE_FAILED');}if(!envelope||envelope.retired)failure();
      if(envelope.schema!=='erp-offline-vault-v1'||envelope.version!==1||envelope.kdf.name!==KDF.name||envelope.kdf.hash!==KDF.hash||envelope.kdf.iterations!==600000||typeof envelope.salt!=='string'||typeof envelope.wrap?.iv!=='string'||typeof envelope.wrap?.cipher!=='string')failure();
      const salt=bytes(envelope.salt),iv=bytes(envelope.wrap.iv),cipher=bytes(envelope.wrap.cipher);if(salt.length!==16||iv.length!==12||cipher.length!==48)failure();
      material=await crypto.subtle.importKey('raw',password,'PBKDF2',false,['deriveBits']);derived=new Uint8Array(await crypto.subtle.deriveBits({...KDF,salt,iterations:envelope.kdf.iterations},material,256));
      const wrapping=await crypto.subtle.importKey('raw',derived,'AES-GCM',false,['decrypt']);
      this.#dek=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:this.#aad()},wrapping,cipher));
      const contextCipher=bytes(envelope.context.cipher),contextIv=bytes(envelope.context.iv);
      const context=JSON.parse(decode.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:contextIv,additionalData:this.#aad()},wrapping,contextCipher)));
      if(this.#clock.wall()<envelope.clock.maxWall||this.#clock.mono()<envelope.clock.maxMono)failure();
      this.#credential=context.credential;this.#authority=context.authority;this.#expected=context.expected;this.#ownerEpoch=context.ownerEpoch;this.#expiresAt=context.expiresAtMs;this.#keyId=envelope.keyId;this.#revision=envelope.revision;this.#used=new Set(envelope.usedIVs);this.#lastWall=envelope.clock.lastWall;this.#lastMono=envelope.clock.lastMono;
      const current=identity(this.#identity());
      if(current&&(current.issuer!==this.#expected.identityIssuer||current.subject!==this.#expected.identitySubject||current.epoch!==this.#ownerEpoch))failure();
      this.#activeKeyId=this.#keyId;this.#activeVersion=1;this.#activeIterations=envelope.kdf.iterations;this.#time();this.#activePin=pin;try{await this.#write();}catch(error){if(error instanceof OfflineVaultError)throw error;failure('OFFLINE_STORAGE_FAILED');}this.#activePin='';return this.state();
    }catch(error){this.#activePin='';this.#clear();if(error instanceof OfflineVaultError)throw error;failure();}
    finally{clean(password);clean(material);clean(derived);}
  }
  lock(){return this.#lockState();}
  async retire(){this.#clear();try{await this.#store.retire();return this.#lockState();}catch{failure('OFFLINE_STORAGE_FAILED');}}
  logout(){return this.retire();}
  principalChanged(){return this.retire();}
}
