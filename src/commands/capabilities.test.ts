import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const exec = promisify(execFile);
const tenant = '00000000-0000-7000-8000-000000000001';
const other = '00000000-0000-7000-8000-000000000002';
const root = mkdtempSync(join(tmpdir(), 'fmx-capabilities-'));
let server: Server, origin: string;
let calls: { path: string; method: string; raw: string; contentType?: string }[];
let response: unknown;
async function run(args: string[]) {
  try { const r = await exec(process.execPath,[resolve('dist/bin.js'),'--format','json',...args],{env:{...process.env,FLUXOMIND_API_URL:origin,FLUXOMIND_ACCESS_TOKEN:'opaque-fixture',FMX_READ_ONLY:'0'}}); return {code:0,data:JSON.parse(r.stdout)}; }
  catch(error) { const r=error as {code:number;stdout:string};return {code:r.code,data:JSON.parse(r.stdout)}; }
}
beforeAll(async()=>{
  server=createServer(async(req,res)=>{const parts:Buffer[]=[];for await(const part of req)parts.push(Buffer.from(part));calls.push({path:req.url!,method:req.method!,raw:Buffer.concat(parts).toString(),contentType:req.headers['content-type']});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(response));});
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async()=>{await new Promise<void>(done=>server.close(()=>done()));rmSync(root,{recursive:true,force:true});});
beforeEach(()=>{calls=[];response={success:true};});
describe('new domain journeys',()=>{
  it('projects remote identity without printing diagnostic cookies and rejects tenant mismatch',async()=>{
    response={tokenUser:{tenantId:tenant,userId:'user'},rawCookieHeader:'sensitive',cookies:[{value:'secret'}]};
    expect((await run(['tenant','identity','--tenant',tenant])).data).toEqual({tenantId:tenant,userId:'user'});
    expect((await run(['tenant','identity','--tenant',other])).code).toBe(1);
  });
  it('routes restore through the lifecycle service and previews without HTTP',async()=>{
    expect((await run(['model','restore-object','t101__sample'])).code).toBe(0);
    expect(calls[0]).toMatchObject({path:'/api/services/modelling/objects/t101__sample/restore',method:'POST'});
    calls=[];expect((await run(['--dry-run','model','restore-object','sample'])).data.dryRun).toBe(true);expect(calls).toHaveLength(0);
  });
  it('exports without truncating and refuses overwriting a reviewed file',async()=>{
    response={version:'1.0',objects:[{apiName:'sample',description:'x'.repeat(2000)}]};
    const path=join(root,'export.json');const result=await run(['model','export','sample','--out',path]);expect(result.code).toBe(0);expect(JSON.parse(readFileSync(path,'utf8'))).toEqual(response);
    expect((await run(['model','export','sample','--out',path])).code).toBe(1);expect(JSON.parse(readFileSync(path,'utf8'))).toEqual(response);
  });
  it('refuses an import that would silently drop triggers and reports partial application',async()=>{
    expect((await run(['model','import','--data',JSON.stringify({objects:[{apiName:'sample',triggers:[{name:'rule'}]}]})])).code).toBe(2);expect(calls).toHaveLength(0);
    response={results:[{apiName:'sample',status:'partial',fieldCount:1}]};expect((await run(['model','import','--data','{"objects":[{"apiName":"sample"}]}'])).code).toBe(1);expect(calls).toHaveLength(1);
  });
  it('uploads a file with a generated multipart boundary and previews metadata only',async()=>{
    const path=join(root,'sample.txt');writeFileSync(path,'fictional sample');
    expect((await run(['--dry-run','files','upload',path,'--mime','text/plain'])).data.bytes).toBe(16);expect(calls).toHaveLength(0);
    expect((await run(['--read-only','files','upload',path,'--mime','text/plain'])).code).toBe(1);expect(calls).toHaveLength(0);
    expect((await run(['files','upload',path,'--mime','text/plain'])).code).toBe(0);
    expect(calls[0].contentType).toContain('multipart/form-data; boundary=');expect(calls[0].raw).toContain('fictional sample');expect(calls[0].raw).toContain('name="file"');
  });
  it('keeps file deletion and unlinking distinct and guarded by domain routes',async()=>{
    expect((await run(['files','delete',tenant])).code).toBe(0);expect(JSON.parse(calls[0].raw)).toEqual({itemType:'file',itemId:tenant});
    expect((await run(['files','unlink','--data',JSON.stringify({file_id:tenant,target_record_id:other,target_object_api_name:'sample'})])).code).toBe(0);expect(calls[1].path).toBe('/api/services/fileEngine/unlinkFile');
  });
  it('exposes schemas for creation without hitting the platform',async()=>{
    const result=await run(['catalog','model','create-object','--full']);expect(result.data.command.contract.inputSchema.required).toContain('api_name');expect(calls).toHaveLength(0);
  });
  it('binds opaque environment tokens remotely before planning and refuses mismatches',async()=>{
    const path=join(root,'manifest.json');writeFileSync(path,JSON.stringify({apiVersion:'fmx/v1',apiOrigin:origin,tenant,resources:[{key:'one',object:'sample',id:other,data:{name:'new'}}]}));
    response={tokenUser:{tenantId:other,userId:'user'}};
    expect((await run(['resources','plan','--file',path,'--remote'])).code).toBe(1);expect(calls).toHaveLength(1);expect(calls[0].method).toBe('GET');
  });
});
