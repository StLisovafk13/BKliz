import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const h=JSON.parse(await fs.readFile(path.join(root,'data/feeds/history.json'),'utf8'));
const now=new Date().toISOString();
const win='✅ Сбылся',lose='❌ Не сбылся';
const original15={
 'Франция — Бельгия':'1.73','Spirit — MOUZ':'1.54','Vitality — Falcons':'1.54','Динамо Минск — Торпедо НН':'1.72','Металлург Магнитогорск — Адмирал':'≈1.76','Ак Барс — Локомотив':'1.79','ЦСКА — Салават Юлаев':'1.87','Италия — Турция':'2.08','Лада — Шанхайские Драконы':'1.77','Тампа-Бэй — Филадельфия':'1.85','Питтсбург — Виннипег':'1.96','Бостон — Оттава':'1.77','Даллас — Сан-Хосе':'1.99','Aurora — BetBoom Team':'1.78','M80 — TYLOO':'1.90'
};
const oldResults={
 'Франция — Бельгия':['4:1',win],'Spirit — MOUZ':['0:2',lose],'Vitality — Falcons':['2:1',win],'Динамо Минск — Торпедо НН':['1:2 Б',lose],'Металлург Магнитогорск — Адмирал':['2:5',lose],'Ак Барс — Локомотив':['0:2',lose],'ЦСКА — Салават Юлаев':['3:1',win],'Италия — Турция':['3:1',win],'Лада — Шанхайские Драконы':['0:5',lose],'Тампа-Бэй — Филадельфия':['4:1',win],'Питтсбург — Виннипег':['2:3',lose],'Бостон — Оттава':['1:4',lose],'Даллас — Сан-Хосе':['4:0',win],'Aurora — BetBoom Team':['2:1',lose],'M80 — TYLOO':['2:1',win]
};
const nations='https://www.uefa.com/uefanationsleague/news/02a2-1fea18abbcbc-456e846509e7-1000--2026-27-uefa-nations-league-all-the-league-phase-fixtures-a/';
// date, score, source URL, source name, settlement for the archived selection.
const checked={
 'Хорватия — Испания':['2026-10-06','1:2',nations,'UEFA',win],
 'Англия — Чехия':['2026-10-06','3:0',nations,'UEFA',lose],
 'Казахстан — Фарерские острова':['2026-10-06','2:2',nations,'UEFA',lose],
 'Шотландия — Словения':['2026-10-06','1:2',nations,'UEFA',lose],
 'Швейцария — Северная Македония':['2026-10-06','3:0',nations,'UEFA',win],
 'Люксембург — Болгария':['2026-10-06','0:2',nations,'UEFA',win],
 'Эстония — Исландия':['2026-10-06','0:0',nations,'UEFA',lose],
 'Молдова — Словакия':['2026-10-06','0:4',nations,'UEFA',win],
 'Беларусь — Финляндия':['2026-10-06','1:0',nations,'UEFA',lose],
 'Албания — Сан-Марино':['2026-10-06','2:1',nations,'UEFA',win],
 'Франция — Бельгия':['2026-10-05','4:1',nations,'UEFA',win],
 'Италия — Турция':['2026-10-05','3:1',nations,'UEFA',win],
 'Россия — Нигерия':['2026-10-06','3:3','https://www.rfs.ru/news/225267','РФС',lose],
 'Северсталь — СКА':['2026-10-13','2:0','https://www.khl.ru/game/1436/902133/resume/','КХЛ',win],
 'Spirit — 1WIN':['2026-10-06','0:2','https://www.hltv.org/matches/2398742/spirit-vs-1win-esl-pro-league-season-24','HLTV',lose],
 '9z — BetBoom Team':['2026-10-06','2:0','https://www.hltv.org/matches/2398744/9z-vs-betboom-esl-pro-league-season-24','HLTV',lose],
 'G2 — PARIVISION':['2026-10-06','1:2','https://www.hltv.org/matches/2398741/g2-vs-parivision-esl-pro-league-season-24','HLTV',lose],
 'Falcons — Natus Vincere':['2026-10-06','2:1','https://www.hltv.org/matches/2398745/falcons-vs-natus-vincere-esl-pro-league-season-24','HLTV',win],
 'Амур — Лада':['2026-10-12','1:0','https://www.khl.ru/game/1436/902130/teams/','КХЛ',win],
 'Барыс — Сибирь':['2026-10-12','2:3 ОТ','https://www.khl.ru/game/1436/902129/text/','КХЛ',lose],
 'Ак Барс — Сочи':['2026-10-12','2:3','https://www.khl.ru/game/1436/902127/resume/','КХЛ',lose],
 'Шанхайские Драконы — Динамо Минск':['2026-10-12','2:3','https://www.khl.ru/game/1436/902131/resume/','КХЛ',lose],
 'Торпедо НН — Металлург Магнитогорск':['2026-10-12','2:3 ОТ','https://www.khl.ru/game/1436/902132/resume/','КХЛ',lose]
};
for(const e of h.events){
 if(e.history_group==='15-событий'){
  e.historical_quote=original15[e.event]||e.historical_quote;
  if(oldResults[e.event]){[e.reported_score,e.reported_forecast_result]=oldResults[e.event];e.analysis+=' Финальный счёт ранее сообщался в чате, но повторная проверка может отсутствовать.';}
 }
 const r=checked[e.event];
 if(r){
  e.event_date=r[0];e.date_basis='Подтверждена календарём источника';e.score=r[1];e.source_url=r[2];e.source_name=r[3];e.status='Завершён';e.audit_status='Проверен результат';e.checked_at=now;
  e.forecast_result=r[4];
  if(e.event==='Франция — Бельгия'&&e.market==='Обе забьют — нет')e.forecast_result=lose;
  if(e.event==='Россия — Нигерия'&&e.market==='ТБ(2.5)')e.forecast_result=win;
  if(e.market.startsWith('Линия П1'))e.forecast_result='Исход не выбран';
  if(e.event==='Барыс — Сибирь'||e.event==='Торпедо НН — Металлург Магнитогорск')e.regulation_score='2:2';
  e.analysis=`Перепроверено ${now.slice(0,10)}: ${e.score}. ${e.forecast_result}. ${e.regulation_score?'За 60 минут '+e.regulation_score+'; исходы основного времени не включают ОТ. ':''}Исходная цена взята из переписки и не является текущей котировкой. Дата обсуждения ${e.discussed_on}.`;
 }
 if(e.score){
  const m=/^(\d+):(\d+)/.exec(e.score),teams=e.event.split(' — ');
  if(m)e.winner=Number(m[1])===Number(m[2])?'Ничья':Number(m[1])>Number(m[2])?teams[0]:teams[1];
  if(e.event==='Локомотив — Акрон')e.winner='Акрон по пенальти; за 90 минут ничья';
  if(!e.forecast_result)e.forecast_result=/Не прошёл/.test(e.analysis)?lose:/Прошёл/.test(e.analysis)?win:null;
 }
}
h.generated_at=now;h.run_id='history-enriched-20261015';
const verified=h.events.filter(e=>e.score).length,prices=h.events.filter(e=>e.historical_quote).length,dates=h.events.filter(e=>e.event_date).length;
h.summary=`Таблица исходных прогнозов: ${h.events.length} записей по ${new Set(h.events.map(e=>e.event)).size} парам. Восстановлены архивные коэффициенты у ${prices} записей, даты событий у ${dates}; подтверждённые результаты — у ${verified}. В отдельных колонках показаны победитель матча и итог выбранного прогноза. Коэффициенты из старых ответов не считаются подтверждёнными купонами или текущими ценами.\n\nЕсли официального подтверждения нет, прежний счёт показан с пометкой «Ранее сообщалось · не перепроверено». Для хоккея отдельно указан счёт за 60 минут, когда матч завершился в ОТ. Дата обсуждения не подменяет дату матча. Архивные версии сохранены.\n\nЧасть дат, точных порогов и коэффициентов восстановить не удалось. Полный экспорт чатов недоступен; набор №3 остаётся неполным. Персональные финансовые данные не публикуются.`;
await fs.writeFile(path.join(root,'data/feeds/history.json'),JSON.stringify(h,null,2)+'\n');
const name=now.replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')+'-history-enriched-20261015.json';
await fs.writeFile(path.join(root,'data/reports',name),JSON.stringify(h,null,2)+'\n');
console.log(JSON.stringify({verified,prices,dates,archive:name}));
