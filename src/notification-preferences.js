// Preferências de resumos futuros. Este módulo não agenda nem envia mensagens.
export const DEFAULT_NOTIFICATION_PREFERENCES=Object.freeze({
  ativo:false,horario:'07:00',timezone:'America/Sao_Paulo',incluir_resumo:true
});
const boolean=value=>value===true||value==='true'?true:value===false||value==='false'?false:null;
const timePattern=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function validateNotificationPreferences(input={}){
  const ativo=boolean(input.ativo),incluir_resumo=boolean(input.incluir_resumo);
  if(ativo===null||incluir_resumo===null)
    throw new Error('Selecione opções válidas para as preferências.');
  const horario=String(input.horario??'').trim();
  if(!timePattern.test(horario))
    throw new Error('Informe um horário válido no formato 24 horas (HH:MM).');
  const timezone=String(input.timezone??'America/Sao_Paulo').trim();
  if(timezone!=='America/Sao_Paulo')
    throw new Error('O fuso horário selecionado ainda não é suportado.');
  return {ativo,horario,timezone,incluir_resumo};
}
export function normalizeNotificationPreferences(row){
  if(!row)return {...DEFAULT_NOTIFICATION_PREFERENCES};
  return validateNotificationPreferences({
    ativo:row.ativo,
    horario:String(row.horario??'').slice(0,5),
    timezone:row.timezone,
    incluir_resumo:row.incluir_resumo
  });
}
