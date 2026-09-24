'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preview, createOutputBudget } = require('../output.cjs');
const rows=Array.from({length:200},(_,i)=>({sys_id:String(i),name:'x'.repeat(2000),script:'code'.repeat(5000)}));
test('whole JSON stays bounded with row/value omissions',()=>{
  const p=preview({ok:true,mode:'table',count:200,offset:0,hasMore:false,records:rows});
  assert.ok(JSON.stringify(p).length<=8000); assert.ok(p.records.length<=10);
  assert.equal(p.truncated_rows,200-p.records.length); assert.equal(p.nextOffset,p.records.length);
  assert.ok(p.shortened_values>0); assert.ok(p.records[0].script.length<400);
});
test('second preview preserves earlier omissions and continuation',()=>{
  const first=preview({ok:true,count:200,offset:30,records:rows});
  const second=preview(first); assert.equal(second.truncated_rows,first.truncated_rows); assert.equal(second.nextOffset,first.nextOffset);
  assert.equal(second.records[0].script,first.records[0].script); assert.equal(second.shortened_values,first.shortened_values);
});
test('explicit field expansion still respects total cap',()=>{
  const r=preview({ok:true,records:rows},{maxFieldChars:2000,maxRows:20}); assert.ok(JSON.stringify(r).length<=8000);
});
test('non-table and errors never produce broken JSON or huge output',()=>{
  for (const input of [{ok:true,body:{result:rows}}, {ok:false,error:'bad'.repeat(10000)}, {ok:true,body:Object.fromEntries(rows.map((r,i)=>[i,r]))}]) {
    const r=preview(input); assert.ok(JSON.stringify(r).length<=8000); assert.doesNotThrow(()=>JSON.parse(JSON.stringify(r)));
  }
});
test('shared budget caps data across batch and task, including error notices',()=>{
  const b=createOutputBudget(); const data={ok:true,count:200,records:rows};
  let chars=0; for(let i=0;i<6;i++) chars+=b.consume(data).content[0].text.length;
  assert.ok(chars<=17000); assert.equal(b.remaining(),0);
  b.resetTurn(); assert.ok(b.remaining()>0);
  for(let i=0;i<30;i++){ if(i%6===0)b.resetTurn(); b.consume(data); }
  assert.equal(b.remaining(),0); b.resetTask(); assert.equal(b.remaining(),16000);
});
test('zero-row preview honest, no skipped rows',()=>{
  const r=preview({ok:true,offset:10,count:2,records:rows.slice(0,2)},{maxRows:0});
  assert.equal(r.records.length,0); assert.equal(r.nextOffset,10); assert.equal(r.truncated_rows,2);
});
