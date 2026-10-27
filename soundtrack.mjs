import fs from 'node:fs';
const sr=44100,seconds=180,frames=sr*seconds;
const out=Buffer.alloc(44+frames*4);
out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(2,22);out.writeUInt32LE(sr,24);out.writeUInt32LE(sr*4,28);out.writeUInt16LE(4,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(frames*4,40);
// Original slow orchestral-synth ambient loop in D minor. No sampled copyrighted material.
const chords=[[146.832,174.614,220],[130.813,174.614,220],[130.813,164.814,195.998],[146.832,195.998,233.082]];
const melody=[293.665,349.228,440,391.995,349.228,293.665,261.626,293.665];
let noise=12345;
for(let i=0;i<frames;i++){
 const t=i/sr,phase=t/seconds*Math.PI*2,bar=Math.floor(t/12)%4,blend=(t%12)/12;
 const envelope=Math.min(1,t/4,(seconds-t)/4);
 const chord=chords[bar],next=chords[(bar+1)%4],fade=blend>.85?(blend-.85)/.15:0;
 let l=0,r=0;for(let j=0;j<3;j++){
 const f=chord[j],nf=next[j],v=(Math.sin(t*f*Math.PI*2)+.18*Math.sin(t*f*Math.PI*4));
 const nv=Math.sin(t*nf*Math.PI*2);const tone=v*(1-fade)+nv*fade;
 l+=tone*.048*(.9+.1*Math.sin(phase*(j+1)));r+=(Math.sin(t*f*1.0007*Math.PI*2)*(1-fade)+Math.sin(t*nf*1.0007*Math.PI*2)*fade)*.048;
 }
 const beat=t%6,idx=Math.floor(t/6)%melody.length,melEnv=Math.exp(-beat*1.25)*Math.min(1,beat*10);
 const m=Math.sin(t*melody[idx]*Math.PI*2)*melEnv*.055;
 const low=Math.sin(t*chord[0]*.25*Math.PI*2)*.06*(.65+.35*Math.sin(t*.45));
 noise=(noise*1664525+1013904223)>>>0;const air=(noise/4294967296-.5)*.004;
 l=(l+m+low+air)*envelope;r=(r+m*.9+low-air)*envelope;
 out.writeInt16LE(Math.round(Math.tanh(l)*28000),44+i*4);out.writeInt16LE(Math.round(Math.tanh(r)*28000),46+i*4);
}
fs.writeFileSync('assets/command-ambient.wav',out);
console.log('Original ambient score:',out.length,'bytes');
