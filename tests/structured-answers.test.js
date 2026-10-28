const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readSlots, validateAssignments } = require('../structured-answers');
const slots = readSlots({slots:[
  {id:'slot-1', options:[{value:'w',text:'Wales'}]},
  {id:'slot-2', options:[{value:'gb',text:'Great Britain'}]}
]});
test('model response is reordered by slot and uses canonical option text', () => {
  assert.deepEqual(validateAssignments(slots,[{slotId:'slot-2',value:'gb'},{slotId:'slot-1',value:'w'}],'select_slots'),[
    {slotId:'slot-1',value:'w',text:'Wales'}, {slotId:'slot-2',value:'gb',text:'Great Britain'}
  ]);
});
test('missing, duplicate, unknown slots and options fail validation', () => {
  for (const answers of [[], [{slotId:'slot-1',value:'w'},{slotId:'slot-1',value:'w'}],
    [{slotId:'slot-1',value:'w'},{slotId:'other',value:'gb'}],
    [{slotId:'slot-1',value:'gb'},{slotId:'slot-2',value:'gb'}]]) {
    assert.throws(() => validateAssignments(slots,answers,'select_slots'));
  }
});
test('drag choices allow repetition only when reusable', () => {
  const drag = [{id:'slot-1',options:[{value:'a',text:'A'}]}, {id:'slot-2',options:[{value:'a',text:'A'}]}];
  const assignments = [{slotId:'slot-1',value:'a'},{slotId:'slot-2',value:'a'}];
  assert.throws(() => validateAssignments(drag,assignments,'drag_slots'));
  drag.forEach((slot) => slot.options[0].reusable = true);
  assert.equal(validateAssignments(drag,assignments,'drag_slots').length,2);
});
test('empty option sets and duplicate values are rejected', () => {
  assert.throws(() => readSlots({slots:[{id:'slot-1',options:[]}]}));
  assert.throws(() => readSlots({slots:[{id:'slot-1',options:[{value:'a',text:'A'},{value:'a',text:'B'}]}]}));
});
