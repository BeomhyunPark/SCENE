const p=await figma.getNodeByIdAsync('262:7');await figma.setCurrentPageAsync(p);const cases=[];const board=await figma.getNodeByIdAsync('809:44362');const check=(name,pass)=>cases.push({name,pass:!!pass});async function action(id){const n=await figma.getNodeByIdAsync(id);return n.reactions.find(r=>r.trigger?.type==='ON_CLICK')?.actions??[];}
for(const id of ['657:45579','657:47325','657:47360']){const a=await action(id);check(id+' group navigation opens saved board',a.length===1&&a[0].type==='NODE'&&a[0].navigation==='NAVIGATE'&&a[0].destinationId===board.id);}
for(const id of ['657:45764','657:47354','809:44413']){const a=await action(id);check(id+' group detail remains overlay',a[0]?.navigation==='OVERLAY'&&a[0]?.destinationId==='657:47648');}
for(const id of ['809:44385','809:44409']){const a=await action(id);check(id+' returns to matching participant state',a[0]?.navigation==='NAVIGATE'&&a[0]?.destinationId==='657:45557');}
const home=await action('809:44373');check('saved board returns to matching event home',home[0]?.destinationId==='657:47303');
const texts=board.findAllWithCriteria({types:['TEXT']}).map(t=>t.characters);
check('saved board retains 1 assigned and 103 unassigned',texts.includes('배정 1 · 미배정 103 · 저장 완료')&&texts.includes('103명'));
check('saved board retains Kim Minsu in group one',board.findAll(x=>x.name==='Group Column / 1조').length===1&&board.findAll(x=>x.name==='Member · 김민수').length===1);
check('saved board has no unsaved status',!texts.some(t=>/저장 전|아직 저장|검토 후 저장|변경 취소/.test(t)));
check('saved board contains only first created group',board.findAll(x=>x.name.startsWith('Group Column /')).length===1);
check('saved board is a prototype-compatible section child',board.parent.type==='SECTION'&&board.parent.parent.id===p.id);
check('new board preserves source font families',board.findAllWithCriteria({types:['TEXT']}).every(t=>t.getStyledTextSegments(['fontName']).every(s=>['Noto Sans KR','Inter','Geist'].includes(s.fontName.family))));
return {verification:'Read-back prototype navigation and structural checks; not actual Present clicks or backend tests',passed:cases.filter(c=>c.pass).length,total:cases.length,cases,boardId:board.id,sectionId:board.parent.id};
