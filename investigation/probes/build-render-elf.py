#!/usr/bin/env python3
"""Build an analysis-only ELF from bounded main-relative memory slices."""
import argparse,json,struct
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('logs',type=Path,nargs='+');p.add_argument('--output',type=Path,required=True);p.add_argument('--entry',type=lambda v:int(v,0),required=True);p.add_argument('--function',type=lambda v:int(v,0),action='append',default=[]);a=p.parse_args()
segments={}
for log in a.logs:
 for line in log.read_text().splitlines():
  if line.startswith(('MOONLIGHT_RENDER_SLICE:','MOONLIGHT_RENDER_CALLBACK_CODE:')):
   item=json.loads(line.split(': ',1)[1]);offset=int(item['offset'],16)
   if 0<=offset<0x6000000:segments[offset]=(bytes.fromhex(item['hex']),item.get('permissions',5))
items=sorted(segments.items())
if not any(address<=a.entry<address+len(code) for address,(code,permissions) in items):
 raise SystemExit('Entry point is absent from the captured slices; capture it before analysis')
names=b'\0'+b''.join(f'.slice{i}\0'.encode() for i in range(len(items)))+b'.symtab\0.strtab\0.shstrtab\0';name_offsets=[];at=1
for i in range(len(items)):name_offsets.append(at);at+=len(f'.slice{i}')+1
blob=bytearray(4096);headers=[];sections=[]
for i,(address,(code,permissions)) in enumerate(items):
 offset=len(blob);blob.extend(code);blob.extend(bytes((-len(blob))%16));flags=(4 if permissions&1 else 0)|(2 if permissions&2 else 0)|(1 if permissions&4 else 0)
 headers.append(struct.pack('<IIQQQQQQ',1,flags,offset,address,address,len(code),len(code),1))
 sections.append(struct.pack('<IIQQQQIIQQ',name_offsets[i],1,2|(4 if permissions&4 else 0),address,offset,len(code),0,0,4,0))
symbol_names=bytearray(b'\0');symbols=bytearray(24)
function_addresses=set(a.function)|{address for address,(code,permissions) in items if permissions&4}
for address in sorted(function_addresses):
 for i,(start,(code,permissions)) in enumerate(items):
  if permissions&4 and start<=address<start+len(code):
   offset=len(symbol_names);symbol_names.extend(f'capture_{address:x}\0'.encode())
   symbols.extend(struct.pack('<IBBHQQ',offset,0x12,0,i+1,address,0));break
 else:raise SystemExit(f'Function {address:#x} is absent from captured executable slices')
symbol_start=len(blob);blob.extend(symbols);string_start=len(blob);blob.extend(symbol_names)
name_start=len(blob);blob.extend(names);blob.extend(bytes((-len(blob))%8));shoff=len(blob);blob.extend(bytes(64));blob.extend(b''.join(sections))
blob.extend(struct.pack('<IIQQQQIIQQ',at,2,0,0,symbol_start,len(symbols),len(items)+2,1,8,24))
blob.extend(struct.pack('<IIQQQQIIQQ',at+8,3,0,0,string_start,len(symbol_names),0,0,1,0))
blob.extend(struct.pack('<IIQQQQIIQQ',at+16,3,0,0,name_start,len(names),0,0,1,0))
assert len(headers)*56+64<4096
blob[:64]=struct.pack('<16sHHIQQQIHHHHHH',b'\x7fELF\x02\x01\x01'+bytes(9),2,183,1,a.entry,64,shoff,0,64,56,len(headers),64,len(items)+4,len(items)+3)
blob[64:64+56*len(headers)]=b''.join(headers);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_bytes(blob)
print(f'Wrote {len(items)} bounded slices ({len(blob)} bytes) to {a.output}')
