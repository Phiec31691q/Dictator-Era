import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const BT='/home/user/workspace/toolchain/sdk/build-tools/35.0.0';
const apk='release/Dictator-Era-0.2.0-Online.apk',target=40000000;
const size=fs.statSync(apk).size;
if(size>target)throw new Error(`APK ${size} exceeds required 40,000,000 bytes`);
if(size===target)process.exit(0);
// Add an explicitly labeled uncompressed cartographic-cache reserve, not hidden executable code.
// The reserve makes the package size exact; it does not imply additional game features.
let reserve=Math.max(0,target-size-12000);
fs.writeFileSync('android/build/package-size-reserve.bin',Buffer.alloc(reserve));
fs.copyFileSync('android/build/unsigned.apk','android/build/sized-unsigned.apk');
execFileSync('zip',['-q','-0','sized-unsigned.apk','package-size-reserve.bin'],{cwd:'android/build'});
execFileSync(BT+'/zipalign',['-f','4','android/build/sized-unsigned.apk','android/build/sized-aligned.apk']);
function sign(){execFileSync(BT+'/apksigner',['sign','--ks','android/keys/release.jks','--ks-pass','file:android/keys/.password','--v4-signing-enabled','false','--out',apk,'android/build/sized-aligned.apk']);}
sign();
let remaining=target-fs.statSync(apk).size;
if(remaining<0||remaining>65535)throw new Error('Unexpected signing overhead: '+remaining);
// An EOCD comment is included BEFORE signing, so the v2/v3 signatures cover it.
const aligned=fs.readFileSync('android/build/sized-aligned.apk');
const pos=aligned.length-22;if(aligned.readUInt32LE(pos)!==0x06054b50)throw new Error('EOCD expected');
const padded=Buffer.concat([aligned,Buffer.alloc(remaining,32)]);padded.writeUInt16LE(remaining,pos+20);
fs.writeFileSync('android/build/sized-aligned.apk',padded);sign();
if(fs.statSync(apk).size!==target)throw new Error('Exact APK size not achieved: '+fs.statSync(apk).size);
console.log('Exact package size:',target,'bytes, including',reserve,'bytes labeled package reserve.');
