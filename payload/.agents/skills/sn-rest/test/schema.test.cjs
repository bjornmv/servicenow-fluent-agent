'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSchemaService } = require('../schema.cjs');
const tables = [
  ['sys_script','Business Rule','sys_metadata'], ['sys_metadata','Application File',''],
  ['sys_app','Custom Application','sys_scope'], ['sys_scope','Application','sys_package'], ['sys_package','Package','']
].map(([name,label,parent]) => ({name,label,super_class:parent ? 'parent-id' : '', 'super_class.name':parent}));
const fields = [
  ['sys_metadata','sys_id','GUID'], ['sys_metadata','sys_scope','reference','sys_scope'],
  ['sys_metadata','sys_updated_by','string'], ['sys_script','name','string'], ['sys_script','active','boolean'],
  ['sys_script','rank','integer'], ['sys_package','sys_id','GUID'], ['sys_package','name','string'],
  ['sys_scope','scope','string'], ['sys_app','version','string'], ['sys_app','name','string']
].map(([name,element,internal_type,reference='']) => ({name,element,internal_type,reference,column_label:element,choice:'0'}));
function fixture() {
  const calls = [];
  const read = async (table,q,columns,limit,offset=0) => {
    calls.push({table,q,limit,offset});
    let data = table==='sys_db_object' ? tables : table==='sys_dictionary' ? fields : [];
    if (table==='sys_choice') data=Array.from({length:12},(_,i)=>({name:'sys_script',element:'rank',value:String(i),label:`Rank ${i}`,inactive:'false'}));
    const parts=q.split('^').filter(x=>!x.startsWith('ORDERBY'));
    const match=(row,c)=> {
      const m=c.match(/^(.*?)(ISNOTEMPTY|LIKE|IN|=)(.*)$/); if(!m) throw Error('Unsupported fixture '+c);
      const [,f,op,v]=m; const a=String(row[f] ?? '');
      return op==='=' ? a===v : op==='IN' ? v.split(',').includes(a) : op==='LIKE' ? a.toLowerCase().includes(v.toLowerCase()) : a!=='';
    };
    if (parts.some(x=>x.startsWith('OR'))) data=data.filter(r=>parts.some(c=>match(r,c.replace(/^OR/,''))));
    else data=data.filter(r=>parts.every(c=>match(r,c)));
    if (q.includes('ORDERBYelement')) data=[...data].sort((a,b)=>a.element.localeCompare(b.element));
    return data.slice(offset,offset+limit);
  };
  return {service:createSchemaService(read),calls};
}
test('search resolves curated synonym against instance metadata',async()=>{
  const {service,calls}=fixture(); const r=await service.search('business rules');
  assert.equal(r.records[0].name,'sys_script'); assert.ok(calls.every(c=>c.limit<=20));
});
test('inheritance, override and missing metadata are reported',async()=>{
  const {service}=fixture(); const r=await service.describe('sys_app','name,scope,sys_id,owner');
  assert.deepEqual(r.ancestors,['sys_scope','sys_package']);
  assert.equal(r.records.find(r=>r.field==='name').defined_on,'sys_app');
  assert.equal(r.records.find(r=>r.field==='scope').defined_on,'sys_scope');
  assert.deepEqual(r.missing_fields,['owner']);
});
test('reference dotwalk uses reference target schema',async()=>{
  const {service}=fixture(); assert.equal(await service.compileFilters('sys_script',[{field:'sys_scope.scope',operator:'eq',value:'x_example'}]),'sys_scope.scope=x_example');
  await assert.rejects(service.compileFilters('sys_script',[{field:'sys_scope',operator:'eq',value:'x_example'}]),/sys_id/);
});
test('Boolean and numeric operators validated',async()=>{
  const {service}=fixture(); assert.equal(await service.compileFilters('sys_script',[{field:'active',operator:'eq',value:true}]),'active=true');
  await assert.rejects(service.compileFilters('sys_script',[{field:'active',operator:'eq',value:1}]),/Boolean/);
  await assert.rejects(service.compileFilters('sys_script',[{field:'active',operator:'contains',value:'true'}]),/unsupported/);
  await assert.rejects(service.compileFilters('sys_script',[{field:'rank',operator:'eq',value:1.2}]),/Integer/);
});
test('query injection, invented operators and unknown fields fail closed',async()=>{
  const {service}=fixture();
  for(const value of ['a^ORactive=true','javascript:gs.getUserID()','a\n'])
    await assert.rejects(service.compileFilters('sys_script',[{field:'name',operator:'eq',value}]),/Unsafe/);
  await assert.rejects(service.compileFilters('sys_script',[{field:'name',operator:'IS',value:'a'}]),/Unsupported/);
  await assert.rejects(service.compileFilters('sys_script',[{field:'name',operator:'in',value:['a,b']}]),/Commas/);
  await assert.rejects(service.validateFields('sys_script','missing'),/not found OR not readable/);
  await assert.rejects(service.describe('made_up'),/not found OR not readable/);
  await assert.rejects(service.search('name^ORx=y'),/Invalid/);
});
test('empty filters explicit, reference globals special, stable field pagination',async()=>{
  const {service}=fixture(); assert.equal(await service.compileFilters('sys_script',[]),'sys_idISNOTEMPTY');
  assert.equal(await service.compileFilters('sys_script',[{field:'sys_scope',operator:'eq',value:'global'}]),'sys_scope=global');
  const a=await service.describe('sys_script',undefined,{limit:2});
  const b=await service.describe('sys_script',undefined,{limit:2,offset:a.nextOffset});
  assert.equal(a.records.length,2); assert.equal(new Set([...a.records,...b.records].map(r=>r.field)).size,4);
});
test('field pages at offset 80 do not issue per-field lookups',async()=>{
  let calls=0;const data=Array.from({length:120},(_,i)=>({name:'many',element:'f'+String(i).padStart(3,'0'),internal_type:'string',column_label:'Field '+i}));
  const service=createSchemaService(async(table,q,f,limit,offset=0)=>{calls++;
    return table==='sys_db_object' ? [{name:'many',label:'Many',super_class:'','super_class.name':''}] : data.slice(offset,offset+limit);
  });
  const page=await service.describe('many',undefined,{limit:10,offset:80});
  assert.equal(page.records[0].field,'f080');assert.equal(page.nextOffset,90);assert.ok(calls<=12);
});
test('inheritance cycles fail closed',async()=>{
  const service=createSchemaService(async()=>[{name:'cycle',label:'Cycle',super_class:'id','super_class.name':'cycle'}]);
  await assert.rejects(service.describe('cycle'),/Cycle/);
});
test('public calls never reuse metadata across changing visibility',async()=>{
  let visible=true;const service=createSchemaService(async()=>visible?[{name:'one',label:'One',super_class:'','super_class.name':''}]:[]);
  await service.search('one');visible=false;await assert.rejects(service.describe('one'),/not found OR not readable/);
});
test('choice output bounded and disclosure present',async()=>{
  const {service}=fixture(); const r=await service.describe('sys_script','rank',{choices:true});
  assert.equal(r.records[0].choices.length,10); assert.equal(r.records[0].choices_truncated,true);
});
