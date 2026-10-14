import { validateNotificationPreferences } from './notification-preferences.js';

// Planejador determinístico. Não consulta o banco, agenda jobs ou envia mensagens.
// Um futuro executor deverá conferir autorização e consentimento novamente,
// imediatamente antes de cada tentativa de entrega.
export const DAILY_DELIVERY_ZONE='America/Sao_Paulo';
export const DAILY_DELIVERY_CHANNEL='email';
const formatter=new Intl.DateTimeFormat('en-US',{
  timeZone:DAILY_DELIVERY_ZONE,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
const localParts=value=>{
  const instant=value instanceof Date?new Date(value.getTime()):new Date(value);
  if(!Number.isFinite(instant.getTime()))throw new Error('Data de avaliação inválida.');
  const parts=Object.fromEntries(formatter.formatToParts(instant).map(x=>[x.type,x.value]));
  const localDate=parts.year+'-'+parts.month+'-'+parts.day;
  const localMinutes=Number(parts.hour)*60+Number(parts.minute);
  return {localDate,localMinutes,instant:instant.toISOString()};
};
const blocked=(reason,details={})=>({eligible:false,reason,canSend:false,...details});

/**
 * Decide apenas se um resumo pode ser PREPARADO naquele dia.
 * Não é autorização para envio. Em particular, a opção ativo das
 * preferências antigas NÃO autoriza e-mail automaticamente.
 *
 * channelApproved só poderá ser fornecido por um backend que comprove
 * consentimento específico do destinatário ao canal de entrega.
 */
export function planDailyDigest(preferences,context={}){
  const {userId,obraId,authorized=false,channelApproved=false,
    previousLocalDate=null,now=new Date()}=context;
  const identity=String(userId??'').trim(),work=String(obraId??'').trim();
  if(!identity||!work)throw new Error('Identificação do usuário e da obra é obrigatória.');
  if(typeof authorized!=='boolean'||typeof channelApproved!=='boolean')
    throw new Error('Autorização da obra e consentimento devem ser verificações explícitas.');
  const local=localParts(now);
  if(!authorized)return blocked('sem_acesso',{localDate:local.localDate});
  if(!preferences)return blocked('sem_preferencia',{localDate:local.localDate});
  const prefs=validateNotificationPreferences({
    ativo:preferences.ativo,
    horario:String(preferences.horario??'').slice(0,5),
    timezone:preferences.timezone,
    incluir_resumo:preferences.incluir_resumo
  });
  if(!prefs.ativo)return blocked('desativado',{localDate:local.localDate});
  if(!prefs.incluir_resumo)return blocked('resumo_desabilitado',{localDate:local.localDate});
  const [hour,minute]=prefs.horario.split(':').map(Number);
  const scheduledMinutes=hour*60+minute;
  if(local.localMinutes<scheduledMinutes)return blocked('antes_do_horario',{
    localDate:local.localDate,horario:prefs.horario
  });
  // Compare apenas o dia local, nunca 24 horas corridas após a última execução.
  if(previousLocalDate!==null && !/^\d{4}-\d{2}-\d{2}$/.test(previousLocalDate))
    throw new Error('Data de controle de duplicidade inválida.');
  if(previousLocalDate===local.localDate)
    return blocked('ja_preparado',{localDate:local.localDate});
  if(!channelApproved)return blocked('canal_nao_autorizado',{
    localDate:local.localDate,horario:prefs.horario
  });
  return {
    eligible:true,
    reason:'apto_para_preparacao',
    canSend:false,
    localDate:local.localDate,
    timezone:DAILY_DELIVERY_ZONE,
    horario:prefs.horario,
    idempotency:{user_id:identity,obra_id:work,data_local:local.localDate,canal:DAILY_DELIVERY_CHANNEL},
    evaluatedAt:local.instant
  };
}
