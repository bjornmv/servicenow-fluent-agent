// Explicit read-only live integration tests. Writes are only tested as blocked, before transport.
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=join(process.env.APPDATA,'npm/node_modules/@earendil-works/pi-coding-agent');
const {loadExtensions}=await import(pathToFileURL(join(root,'dist/core/extensions/loader.js')));
const loaded=await loadExtensions([join(homedir(),'.pi/agent/extensions/sn-rest.ts')],homedir());
assert.deepEqual(loaded.errors,[]);
const ext=loaded.extensions[0];
const ctx={hasUI:false,ui:{confirm:async()=>{throw Error('Headless confirmation must not be called');}}};
let passed=0;
async function call(name,params) {
  for(const h of ext.handlers.get('before_agent_start')||[])await h({},ctx);
  for(const h of ext.handlers.get('turn_start')||[])await h({},ctx);
  const raw=await ext.tools.get(name).definition.execute('live',params,AbortSignal.timeout(90000),undefined,ctx);
  let result={...raw,toolName:name,input:params,isError:false};
  for(const h of ext.handlers.get('tool_result')||[])result={...result,...await h(result,ctx)};
  const text=result.content[0].text; assert.ok(text.length<=8000); return JSON.parse(text);
}
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
await check('schema discovery resolves Business Rules',async()=>{
  const r=await call('sn_schema',{search:'business rules'});assert.ok(r.records.some(r=>r.name==='sys_script'));
});
await check('schema inherits app scope and system metadata',async()=>{
  const r=await call('sn_schema',{table:'sys_app',fields:'sys_id,name,scope,sys_updated_by'});
  assert.equal(r.records.length,4);assert.ok(r.ancestors.includes('sys_scope'));
});
let id;
await check('structured scope-string query resolves one app',async()=>{
  const r=await call('sn_rest',{table:'sys_app',filters:[{field:'scope',operator:'eq',value:'x_fs_asset'}],fields:'sys_id,name,scope',limit:3});
  assert.equal(r.records.length,1);id=r.records[0].sys_id;
});
await check('reference dotwalk and raw query return same record',async()=>{
  const a=await call('sn_rest',{table:'sys_db_object',filters:[{field:'sys_scope.scope',operator:'eq',value:'x_fs_asset'}],fields:'sys_id,name,sys_scope',limit:3});
  const b=await call('sn_rest',{path:'/api/now/table/sys_db_object',query:{sysparm_query:'sys_scope='+id,sysparm_fields:'sys_id,name,sys_scope',sysparm_limit:3}});
  assert.ok(a.records.length);assert.deepEqual(a.records,b.records);
});
await check('stats contributor groups and counts',async()=>{
  const r=await call('sn_rest',{stats_table:'sys_metadata',group_by:'sys_scope,sys_updated_by',filters:[{field:'sys_scope',operator:'eq',value:id}],limit:3});
  assert.ok(r.records.length);assert.ok(r.records.every(r=>r.count>0));
});
await check('scope-key reference mistake and IS operator rejected',async()=>{
  await assert.rejects(call('sn_rest',{table:'sys_db_object',encoded_query:'sys_scope=x_fs_asset',fields:'name'}),/sys_id/);
  await assert.rejects(call('sn_rest',{table:'sys_db_object',encoded_query:'sys_scopeISx_fs_asset',fields:'name'}),/Equality is =/);
});
await check('large requested read clamps to 20 rows and remains pageable',async()=>{
  const r=await call('sn_rest',{table:'sys_app',filters:[],fields:'sys_id,name,scope',limit:500,max_output_rows:20});
  assert.ok(r.records.length<=20);assert.match(r.limit_note,/at most 20/);
});
await check('headless writes and raw whole-record reads blocked',async()=>{
  await assert.rejects(call('sn_rest',{path:'/api/now/table/sys_app',method:'POST',body:{name:'DO NOT CREATE'}}),/write blocked/);
  await assert.rejects(call('sn_rest',{path:'/api/now/table/sys_app',query:{sysparm_limit:1}}),/require sysparm_fields/);
  await assert.rejects(call('sn_rest',{path:'//example.invalid/api'}),/instance-relative/);
});
await check('interactive cancellation does not reach transport',async()=>{
  let confirmed=0;const tool=ext.tools.get('sn_rest').definition;
  await assert.rejects(tool.execute('cancel',{path:'/api/now/table/sys_app',method:'DELETE'},undefined,undefined,
    {hasUI:true,ui:{confirm:async()=>{confirmed++;return false;}}}),/cancelled/);assert.equal(confirmed,1);
});
await check('versioned Table route enforces projection and agrees with standard route',async()=>{
  await assert.rejects(call('sn_rest',{path:'/api/now/v1/table/sys_app',query:{sysparm_limit:1}}),/require sysparm_fields/);
  const a=await call('sn_rest',{path:'/api/now/v1/table/sys_app',query:{sysparm_query:'scope=x_fs_asset',sysparm_fields:'sys_id,name,scope',sysparm_limit:1}});
  assert.equal(a.records[0].sys_id,id);
});
await check('raw Stats normalized with group continuation',async()=>{
  const a=await call('sn_rest',{path:'/api/now/stats/sys_metadata',query:{sysparm_query:'sys_scope='+id,sysparm_group_by:'sys_scope,sys_updated_by'},max_output_rows:1});
  assert.equal(a.mode,'stats');assert.equal(a.returned_rows,1);assert.equal(a.nextOffset,1);assert.equal(a.total_groups,3);
});
await check('ungrouped count object supported',async()=>{
  const r=await call('sn_rest',{stats_table:'sys_metadata',filters:[{field:'sys_scope',operator:'eq',value:id}]});
  assert.ok(Number(r.stats?.count)>0);
});
await check('encoded route and duplicate params fail closed',async()=>{
  await assert.rejects(call('sn_rest',{path:'/api/now/%74able/sys_app'}),/literal REST/);
  await assert.rejects(call('sn_rest',{path:'/api/now/table/sys_app?sysparm_query=scope=x_fs_asset',query:{sysparm_query:'sys_idISNOTEMPTY',sysparm_fields:'sys_id'}}),/Duplicate/);
});
console.log(JSON.stringify({passed,instanceWrites:0}));
