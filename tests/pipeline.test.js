const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const payload = {type:'select_slots',question:'England, Scotland and [slot-1] form [slot-2].',options:[],slots:[
  {id:'slot-1',label:'Country',options:[{value:'w',text:'Wales'}]},
  {id:'slot-2',label:'Region',options:[{value:'gb',text:'Great Britain'}]}
]};
const assignments = [{slotId:'slot-1',value:'w',text:'Wales'}, {slotId:'slot-2',value:'gb',text:'Great Britain'}];
function loadServer(fetch) {
  const context = vm.createContext({
    console: {log(){},warn(){},error(){}},
    process: {env:{GEMINI_API_KEY:'test-key',GEMINI_MODELS:'first,second'}},
    require(name) {
      if (name === 'node:http') return {createServer:() => ({listen(){}})};
      if (name === './structured-answers') return require('../structured-answers');
      throw new Error('Unexpected dependency');
    }, fetch
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../gemini-server.js'),'utf8'),context);
  return context;
}
test('server asks for all slots and parses a structured Gemini response', async () => {
  let body;
  const server = loadServer(async (_url, options) => {
    body = JSON.parse(options.body);
    return {ok:true,json:async () => ({candidates:[{content:{parts:[{text:JSON.stringify({assignments,confidence:0.9})}]}}]})};
  });
  const result = await server.askGemini(payload);
  assert.deepEqual(JSON.parse(JSON.stringify(result.assignments)),assignments);
  assert.match(body.contents[0].parts[0].text,/slot-2/);
  assert.match(body.contents[0].parts[0].text,/"value":"gb"/);
  assert.match(result.answer,/Espacio 2: Great Britain/);
});
test('server retries malformed mappings and rejects an invalid final response', async () => {
  let calls = 0;
  const server = loadServer(async () => {
    calls++;
    return {ok:true,json:async () => ({candidates:[{content:{parts:[{text:'{"assignments":[]}'}]}}]})};
  });
  await assert.rejects(server.askGemini(payload), /cada espacio/);
  assert.equal(calls,2);
});
test('background transports slot metadata and preserves assignments', async () => {
  let sent;
  const context = vm.createContext({
    console:{warn(){}}, setTimeout,
    chrome:{commands:{onCommand:{addListener(){}}},runtime:{onMessage:{addListener(){}}}},
    fetch:async (_url,options) => {
      sent = JSON.parse(options.body);
      return {ok:true,json:async () => ({answer:'Resolved',confidence:0.9,assignments})};
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),context);
  const result = await context.answerQuestionOnce(payload);
  assert.deepEqual(sent.slots,payload.slots);
  assert.equal(sent.type,'select_slots');
  assert.deepEqual(result.assignments,assignments);
  const alternative = {...payload,slots:[{...payload.slots[0],options:[{value:'ni',text:'Northern Ireland'}]},payload.slots[1]]};
  assert.notEqual(context.requestSignature(payload),context.requestSignature(alternative));
});
test('structured questions never fall back to a single local answer', async () => {
  const context = vm.createContext({console:{warn(){}},setTimeout,
    chrome:{commands:{onCommand:{addListener(){}}},runtime:{onMessage:{addListener(){}}}},
    fetch:async () => {throw new Error('offline');}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),context);
  const result = await context.answerQuestionOnce({...payload,question:'Who uses a scythe? Kayn'});
  assert.equal(result.confidence,0);
  assert.equal(result.assignments,undefined);
});
