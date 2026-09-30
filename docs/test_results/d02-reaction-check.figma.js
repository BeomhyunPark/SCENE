const p=await figma.getNodeByIdAsync('262:7');await figma.setCurrentPageAsync(p);
const state='VariableID:803:43280',label='VariableID:803:43281';const cases=[],inspected=new Set();
function value(d,s){if(d.type==='VARIABLE_ALIAS')return s[d.value.id];if(d.type!=='EXPRESSION')return d.value;const a=d.value.expressionArguments.map(x=>value(x,s));switch(d.value.expressionFunction){case'EQUALS':return a[0]===a[1];case'NOT':return !a[0];case'AND':return a[0]&&a[1];case'OR':return a[0]||a[1];default:throw Error('unsupported expression');}}
function execute(acts,s){for(const a of acts){if(a.type==='NODE')s.destination=a.destinationId;else if(a.type==='SET_VARIABLE')s[a.variableId]=value(a.variableValue,s);else if(a.type==='CONDITIONAL'){for(const b of a.conditionalBlocks)if(!b.condition||value(b.condition,s)){execute(b.actions,s);break;}}else throw Error('unsupported '+a.type);}}
async function click(id,s){const n=await figma.getNodeByIdAsync(id);inspected.add(id);const r=n.reactions.find(r=>r.trigger?.type==='ON_CLICK');if(r)execute(r.actions,s);}
function check(name,pass){cases.push({name,pass:!!pass});}
let s={[state]:'ONE',[label]:'진행 중 · 1/2','VariableID:689:43172':'622:7'};
await click('664:43396',s);check('initial task opens 1/2 detail',s.destination==='664:43439');
await click('664:43462',s);check('checking second item persists 2/2',s[state]==='CHECKED'&&s.destination==='664:43479');
await click('622:274',s);check('schedule preserves checked but incomplete task',s.destination==='664:43479'&&s[label]==='진행 중 · 2/2');
await click('664:43516',s);check('completion persists DONE and 2/2 label',s[state]==='DONE'&&s[label]==='완료 · 2/2'&&s.destination==='664:43522');
await click('664:43566',s);check('completed task returns to completed list',s.destination==='664:43747');
await click('664:43774',s);check('field navigation preserves task state',s.destination==='622:7'&&s[state]==='DONE');
for(const id of ['622:17','661:41711','661:41858','661:41897','661:43185']){await click(id,s);check(id+' schedule entry preserves completion',s.destination==='622:262'&&s[state]==='DONE');await click('622:274',s);check(id+' schedule task opens completed 2/2 detail',s.destination==='664:43522'&&s[state]==='DONE');}
await click('664:43553',s);check('attachment navigation preserves completion',s.destination==='664:43572'&&s[state]==='DONE');await click('664:43590',s);check('attachment return opens completed detail',s.destination==='664:43522');
await click('664:43545',s);check('completed checklist does not silently reopen task',s[state]==='DONE'&&s.destination==='664:43522');
await click('664:43560',s);check('explicit reopen preserves both checked items',s[state]==='CHECKED'&&s.destination==='664:43479'&&s[label]==='진행 중 · 2/2');
await click('622:274',s);check('schedule reflects explicit reopen',s.destination==='664:43479');
await click('664:43502',s);check('explicit uncheck returns task to 1/2',s[state]==='ONE'&&s.destination==='664:43439');
await click('622:274',s);check('schedule reflects explicit uncheck',s.destination==='664:43439'&&s[label]==='진행 중 · 1/2');
const text=await figma.getNodeByIdAsync('622:276');check('schedule status is bound to persisted label',text.boundVariables.characters.id===label);
return {verification:'Read-back prototype reaction evaluation; not actual Present clicks or backend tests',passed:cases.filter(c=>c.pass).length,total:cases.length,cases,inspectedNodeIds:[...inspected]};
