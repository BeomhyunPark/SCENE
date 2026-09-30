// Run only in Figma use_figma with skillNames=figma-use after reading the skill.
// This writes the live prototype and resets named O01 fixture defaults.
// BOOLEAN prototype variables require ALL_SCOPES; text variables use TEXT_CONTENT.
const p=await figma.getNodeByIdAsync('262:7');await figma.setCurrentPageAsync(p);
const collection=await figma.variables.getVariableCollectionByIdAsync('VariableCollectionId:646:36132');
const all=await figma.variables.getLocalVariablesAsync(); const changed=[];const createdVars=[];
async function variable(name,type,value){let v=all.find(x=>x.name===name);if(!v){v=figma.variables.createVariable(name,collection,type);createdVars.push(v.id);}v.scopes=type==='STRING'?['TEXT_CONTENT']:['ALL_SCOPES'];v.setValueForMode('646:1',value);return v;}
const reg=await variable('D05/registrationOpen','BOOLEAN',true);
const pending=await variable('D05/phoneChangePending','BOOLEAN',false);
const verified=await variable('D05/newPhoneVerified','BOOLEAN',false);
const context=await variable('D05/phoneChangeAuthContext','BOOLEAN',false);
const draftName=await variable('D05/draftName','STRING','김민수');
const savedName=await variable('D05/savedName','STRING','김민수');
const draftPhone=await variable('D05/draftPhone','STRING','010-4821-1034');
const savedPhoneFull=await variable('D05/savedPhoneFull','STRING','010-4821-1034');
const savedPhone=await variable('D05/savedPhoneMasked','STRING','010-****-1034');
const draftAttendance=await variable('D05/draftAttendance','STRING','전체 참석');
const authMessage=await variable('D05/authMessage','STRING','010-****-1034로 인증번호를 보냈어요');
const authTitle=await variable('D05/authTitle','STRING','인증번호를 입력해 주세요.');
const edit=await figma.variables.getVariableByIdAsync('VariableID:826:44310');edit.name='D05/editDeadlineOpen';
const alias=(id,type='BOOLEAN')=>({type:'VARIABLE_ALIAS',resolvedType:type,value:{type:'VARIABLE_ALIAS',id}});
const literal=value=>({type:typeof value==='boolean'?'BOOLEAN':'STRING',resolvedType:typeof value==='boolean'?'BOOLEAN':'STRING',value});
const set=(id,value)=>({type:'SET_VARIABLE',variableId:id,variableValue:typeof value==='object'?value:literal(value)});
const nav=id=>({type:'NODE',destinationId:id,navigation:'NAVIGATE',transition:null,resetScrollPosition:true,resetVideoPosition:false});
const expr=(fn,args)=>({type:'EXPRESSION',resolvedType:'BOOLEAN',value:{expressionFunction:fn,expressionArguments:args}});
const not=x=>expr('NOT',[x]);const and=(...x)=>expr('AND',x);
const conditional=(condition,yes,no=[])=>({type:'CONDITIONAL',conditionalBlocks:[{condition,actions:yes},{actions:no}]});
const cancelled=alias('VariableID:683:43370');
const allowed=and(alias(edit.id),not(cancelled));
// Figma rejects nested conditional actions. Snapshot branch predicates before
// any state mutation, then emit independent two-block conditionals.
async function reactions(id,actions){const n=await figma.getNodeByIdAsync(id);const leaves=[];function walk(list,guard){let run=[];function flush(){if(run.length){leaves.push({guard,actions:run});run=[];}}for(const a of list){if(a.type==='CONDITIONAL'){flush();const c=a.conditionalBlocks[0].condition;walk(a.conditionalBlocks[0].actions,guard?and(guard,c):c);walk(a.conditionalBlocks[1].actions,guard?and(guard,not(c)):not(c));}else run.push(a);}flush();}walk(actions,null);const snapshots=[];const flat=[];for(let i=0;i<leaves.length;i++){const leaf=leaves[i];if(leaf.guard){const v=await variable('D05/dispatch/'+id+'/'+i,'BOOLEAN',false);snapshots.push(set(v.id,leaf.guard));flat.push(conditional(alias(v.id),leaf.actions));}else flat.push(...leaf.actions);}await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[...snapshots,...flat]}]);changed.push(id);}
async function text(id,value,binding){const n=await figma.getNodeByIdAsync(id);for(const s of n.getStyledTextSegments(['fontName']))await figma.loadFontAsync(s.fontName);if(binding)n.setBoundVariable('characters',binding);else n.characters=value;changed.push(id);}
const entries=await Promise.all(['478:31022','I443:30828;476:3877','I443:30843;476:3877','I445:30901;476:3877'].map(id=>figma.getNodeByIdAsync(id)));
for(const n of entries){const closed=n.id==='I445:30901;476:3877';const rest=[nav('395:30763')];
await reactions(n.id,[set(reg.id,!closed),set(context.id,false),set(authTitle.id,'인증번호를 입력해 주세요.'),set(authMessage.id,'010-****-1034로 인증번호를 보냈어요'),conditional(allowed,[set('VariableID:826:44311','신청 수정'),set('VariableID:826:44312','수정 마감 전까지 신청 정보를 변경할 수 있어요.')],[set('VariableID:826:44311','변경 안내'),set('VariableID:826:44312','수정 마감이 지났어요. 변경은 운영팀에 문의해 주세요.')]),...rest]);}
await reactions('I444:30850;416:3852',[conditional(alias(reg.id),[nav('394:30763')],[nav('395:31032')])]);
const resetDraft=[set(draftName.id,alias(savedName.id,'STRING')),set(draftPhone.id,alias(savedPhoneFull.id,'STRING')),set(draftAttendance.id,alias('VariableID:667:75893','STRING')),set(pending.id,false),set(verified.id,false),set(context.id,false)];
await reactions('478:31044',[conditional(allowed,[...resetDraft,nav('395:30885')],[nav('826:44314')])]);
await reactions('I444:30866;416:3852',[...resetDraft,nav('395:30836')]);
await reactions('588:34668',[conditional(allowed,[nav('853:44589')],[nav('826:44314')])]);
const startAuth=[set(context.id,true),set(authTitle.id,'새 휴대폰 번호를 인증해 주세요.'),set(authMessage.id,'새 번호 010-****-0000 인증 후 저장할 수 있어요'),nav('395:30800')];
await reactions('448:31167',[conditional(allowed,[set(draftName.id,'김민서')],[nav('826:44314')])]);
await reactions('448:31259',[conditional(allowed,[set(draftAttendance.id,'오후만 참석')],[nav('826:44314')])]);
await reactions('448:31213',[conditional(allowed,[set(pending.id,true),set(verified.id,false),set(draftPhone.id,'010-0000-0000'),...startAuth],[nav('826:44314')])]);
const oldConfirm=[conditional(cancelled,[nav('577:43798')],[nav('395:30836')])];
await reactions('I444:30839;476:3877',[conditional(alias(context.id),[conditional(allowed,[set(verified.id,true),set(context.id,false),nav('395:30885')],[set(context.id,false),nav('826:44314')])],oldConfirm)]);
for(const id of ['I444:30833;416:3852','574:31156'])await reactions(id,[conditional(alias(context.id),[set(context.id,false),nav('395:30885')],[nav('395:30763')])]);
for(const id of ['I574:31140;682:43546','602:48471'])await reactions(id,[conditional(alias(context.id),[nav('395:30800')],[nav('574:43590')])]);
const save=[set(savedName.id,alias(draftName.id,'STRING')),set('VariableID:667:75893',alias(draftAttendance.id,'STRING')),conditional(alias(pending.id),[set(savedPhoneFull.id,alias(draftPhone.id,'STRING')),set(savedPhone.id,'010-****-0000'),set(pending.id,false),set(verified.id,false)]),nav('395:30927')];
await reactions('I444:30872;476:3877',[conditional(allowed,[conditional(and(alias(pending.id),not(alias(verified.id))),startAuth,save)],[nav('826:44314')])]);
await text('395:31061','신규 신청은 마감됐어요. 기존 신청의 수정 가능 기간은 별도로 확인해 주세요.');
await text('853:44594','수정 마감 전까지 이름·참석 범위를 변경할 수 있어요.');
await text('I853:44595;566:3903','신규 신청 마감과 수정 마감은 별도예요. 휴대폰 변경은 새 번호 인증이 필요해요. 수정 마감 이후에는 운영팀에 문의해 주세요.');
await text('826:44319','수정 마감이 지났어요. 변경은 운영팀에 문의해 주세요. 접수된 신청 내역은 유지돼요.');
await text('395:30914','이름·참석 범위 수정 가능. 휴대폰 변경은 새 번호 인증 후 저장돼요.');
await text('I448:31213;67:2434','휴대폰 번호 · 변경 시 재인증');
await text('I448:31167;67:2439',null,draftName);
await text('I448:31213;67:2439',null,draftPhone);
await text('I448:31259;67:2439',null,draftAttendance);
await text('395:30872',null,savedName);
await text('395:30876',null,savedPhone);
await text('577:43811',null,savedName);
await text('577:43815',null,savedPhone);
await text('395:30828',null,authTitle);
await text('395:30829',null,authMessage);
await text('I574:31140;565:3899',null,authMessage);
await text('395:30958','신청 정보 변경');
await text('395:30959','저장된 내역은 내 신청에서 확인할 수 있어요.');
return {createdNodeIds:[],mutatedNodeIds:changed,createdVariableIds:createdVars,renamedVariableId:edit.id,variables:[reg,pending,verified,context,draftName,savedName,draftPhone,savedPhoneFull,savedPhone,draftAttendance,authMessage,authTitle,edit].map(v=>({id:v.id,name:v.name,values:v.valuesByMode})),entryIds:entries.map(n=>n.id)};
