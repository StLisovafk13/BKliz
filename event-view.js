const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yekaterinburg',year:'numeric',month:'2-digit',day:'2-digit'});
export function calendarDate(value=new Date()){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=Object.fromEntries(dateFormat.formatToParts(date).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
const compact=(value,max)=>{const text=typeof value==='string'?value.replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim():'';if(text.length<=max)return text;const cut=text.slice(0,max-1);const end=cut.lastIndexOf(' ');return cut.slice(0,end>max*.6?end:cut.length).replace(/[ ,;:]+$/,'')+'…';};
export function briefReason(event){
 const analysis=String(event.analysis||'');
 const sentences=analysis.split(/(?<=[.!?])\s+|\n+/).map(s=>compact(s,300)).filter(Boolean);
 const sports=/форм[ауы]|травм|кадров|потер[ияь]|домаш|выезд|серия|серии|серию|последних|последние|личных встреч|мотивац|нагрузк|xG|оборона|атак|результативн|забива|забро|сезонн/i;
 const result=/финальн|окончательн|подтвержд[её]н[а-я ]*результат|итог[а-я ]*\d+\s*:\s*\d+|сбылся|не сбылся|ROI|P\/L/i;
 const facts=sentences.filter(s=>sports.test(s)&&!result.test(s));
 const reason=compact(event.selection_reason,260)||compact(facts.slice(0,2).join(' '),260)||'Спортивное обоснование выбора в отчёте не указано.';
 const riskNote=compact(event.risk_note,140)||compact(sentences.find(s=>/не подтвержд[её]н|не проверен|неизвестен|не обоснован/i.test(s)&&/состав|вратар|стартов(?:ый|ые|ого)|\bXI\b|вероятност/i.test(s))||'',140);
 const risk=typeof event.risk==='number'&&event.risk>=1&&event.risk<=5?'⭐'.repeat(Math.floor(event.risk)):compact(event.risk,40);
 return {reason,riskNote:riskNote&&reason.includes(riskNote)?'':riskNote,risk};
}
