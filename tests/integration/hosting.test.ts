import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { testDatabase } from '../helpers/database.js';
import { startProcess } from '../helpers/processes.js';
const hosted = (url: string,path: string,host: string) => new Promise<number>((resolve,reject)=>{const req=request(url+path,{headers:{Host:host}},res=>{res.resume();resolve(res.statusCode!);});req.on('error',reject);req.end();});
test('Render listener supports PORT, configured HTTPS host and health; rejects unrelated hosts',async t=>{
 const db=await testDatabase();t.after(()=>db.close());const token=randomBytes(32).toString('hex');
 const mcp=await startProcess('dist/src/mcp-server.js',{DATABASE_URL:db.url,MCP_TOKEN:token,PORT:'0',BIND_HOST:'0.0.0.0',RENDER_EXTERNAL_URL:'https://mcp.example.com'});
 const web=await startProcess('dist/src/web.js',{MCP_URL:mcp.url+'/mcp',MCP_TOKEN:token,PORT:'0',BIND_HOST:'0.0.0.0',RENDER_EXTERNAL_URL:'https://home.example.com'});
 t.after(async()=>{await web.stop();await mcp.stop();});
 assert.equal(await hosted(web.url,'/healthz','home.example.com'),200);
 assert.equal(await hosted(mcp.url,'/healthz','mcp.example.com'),200);
 assert.equal(await hosted(web.url,'/','evil.example.com'),403);
 assert.equal(await hosted(mcp.url,'/mcp','mcp.example.com'),401);
});
