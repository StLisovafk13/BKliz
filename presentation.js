const prettyDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.split('-').reverse().join('.'):null;
export function eventDate(e){
 if(e.start_at)return {text:new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Yekaterinburg',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(e.start_at)),basis:'ЕКБ · UTC+5'};
 if(prettyDate(e.event_date))return {text:prettyDate(e.event_date),basis:e.date_basis||'Дата события; время не восстановлено'};
 if(e.calendar_date)return {text:e.calendar_date,basis:'Дата из календаря; время не восстановлено'};
 return {text:'Дата не восстановлена',basis:e.discussed_on?'Обсуждалось '+prettyDate(e.discussed_on):''};
}
export function originalPrice(e){return {text:e.original_odds!=null?Number(e.original_odds).toFixed(2):e.historical_quote||'Не восстановлен',basis:e.historical_quote||e.original_odds!=null?'Из исходного отчёта · архив':'Исходный коэффициент отсутствует'};}
function winnerFromScore(e,score){const m=/^(\d+)\s*:\s*(\d+)/.exec(score||'');if(!m)return 'Победитель не установлен';const teams=e.event.split(' — ');return Number(m[1])===Number(m[2])?'Ничья':Number(m[1])>Number(m[2])?teams[0]:teams[1]||'Гости';}
export function actualResult(e){
 if(e.score)return {text:`${e.score} · ${e.winner||winnerFromScore(e,e.score)}`,basis:e.regulation_score?`Основное время: ${e.regulation_score}`:'Подтверждённый результат'};
 if(e.reported_score)return {text:`${e.reported_score} · ${e.reported_winner||winnerFromScore(e,e.reported_score)}`,basis:'Ранее сообщалось · не перепроверено'};
 return {text:'Нет подтверждённого результата',basis:e.status==='Ожидается'?'Событие ожидается':''};
}
export function forecastResult(e){
 if(/Линия П1|Рынок не выбран|Рынок и порог не указаны|Наблюдение — рынок не выбран/.test(e.market))return {text:'Исход не выбран',basis:''};
 const value=e.forecast_result||e.reported_forecast_result;
 if(value)return {text:value,basis:e.forecast_result?'По подтверждённому результату':'По архиву · не перепроверено'};
 if(e.score&&/Не прошёл/.test(e.analysis))return {text:'❌ Не сбылся',basis:'По подтверждённому результату'};
 if(e.score&&/Прошёл/.test(e.analysis))return {text:'✅ Сбылся',basis:'По подтверждённому результату'};
 return {text:'Не рассчитан',basis:'Не хватает результата или условий рынка'};
}
