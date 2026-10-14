import { planDailyDigest, DAILY_DELIVERY_ZONE } from './daily-delivery.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blocked=(reason,details={})=>Object.freeze({
  apto_para_preparar:false,
  motivo:reason,
  envio_executado:false,
  reserva_criada:false,
  ...details
});
const verifiedAuthEmail=(user,now)=>{
  // Only accept a trusted Auth Admin user, never user_metadata or request body.
  if(!user||typeof user.email!=='string'||!user.email.trim()||
      typeof user.email_confirmed_at!=='string')return false;
  const when=new Date(user.email_confirmed_at).getTime();
  return Number.isFinite(when)&&when>0&&when<=now.getTime();
};
const localDate=now=>{
  const date=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(date.getTime()))throw new Error('Data da simulação inválida.');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:DAILY_DELIVERY_ZONE,year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(date).map(x=>[x.type,x.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
};

/**
 * Backend-only, read-only simulation. The dependencies MUST come from a
 * trusted server adapter: getAuthUser uses Auth Admin getUserById and
 * getWorkState reads the current Supabase membership, preferences, consent
 * and ledger. The PWA never supplies any of those values.
 *
 * No transport, cron, booking or status update is possible through this API.
 */
export function createEmailDigestDryRun({getAuthUser,getWorkState,clock=()=>new Date()}){
  if(typeof getAuthUser!=='function'||typeof getWorkState!=='function'||typeof clock!=='function')
    throw new Error('Dependências seguras da simulação não configuradas.');
  return async ({userId,obraId}={})=>{
    if(typeof userId!=='string'||!uuid.test(userId)||typeof obraId!=='string'||!uuid.test(obraId))
      throw new Error('Identificadores inválidos na simulação.');
    const now=clock();
    const day=localDate(now);
    let authUser;
    try{authUser=await getAuthUser(userId);}catch{
      return blocked('auth_indisponivel',{data_local:day});
    }
    if(!authUser||authUser.id!==userId)
      return blocked('identidade_nao_confirmada',{data_local:day});
    if(!verifiedAuthEmail(authUser,new Date(now)))
      return blocked('email_nao_confirmado',{data_local:day});

    let state;
    try{state=await getWorkState({userId,obraId,dataLocal:day});}catch{
      return blocked('consulta_indisponivel',{data_local:day});
    }
    // Missing backend attestations are never interpreted as permission.
    if(!state||typeof state!=='object'||Array.isArray(state)||
      state.user_id!==userId||state.obra_id!==obraId||
      typeof state.autorizado_na_obra!=='boolean'||
      typeof state.reserva_existente!=='boolean'||
      typeof state.ledger_consultado!=='boolean'||
      typeof state.consentimento?.autorizado!=='boolean')
      return blocked('dados_incompletos',{data_local:day});

    if(!state.ledger_consultado)
      return blocked('ledger_nao_verificado',{data_local:day});
    if(!state.autorizado_na_obra)
      return blocked('sem_acesso',{data_local:day});
    if(!state.preferencias)
      return blocked('sem_preferencia',{data_local:day});
    if(state.consentimento.user_id!==userId||
      state.consentimento.obra_id!==obraId||
      !state.consentimento.autorizado||
      !state.consentimento.autorizado_em||
      state.consentimento.revogado_em)
      return blocked('canal_nao_autorizado',{data_local:day});
    if(state.reserva_existente)
      return blocked('ja_preparado',{data_local:day});

    let planned;
    try{
      planned=planDailyDigest(state.preferencias,{
        userId,obraId,authorized:true,channelApproved:true,now,
        previousLocalDate:null
      });
    }catch{return blocked('preferencias_invalidas',{data_local:day});}
    if(!planned.eligible)
      return blocked(planned.reason,{data_local:day});

    // Intentionally exclude Auth email, metadata, message body, occurrence
    // details and trusted backend state from all responses.
    return Object.freeze({
      apto_para_preparar:true,
      motivo:'preparacao_possivel_em_simulacao',
      data_local:planned.localDate,
      horario:planned.horario,
      fuso:planned.timezone,
      envio_executado:false,
      reserva_criada:false
    });
  };
}
