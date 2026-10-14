// Separate, explicit opt-in for future email deliveries.
// This module never sends, schedules, or reveals email addresses.
export const DEFAULT_EMAIL_CONSENT=Object.freeze({
  autorizado:false,autorizado_em:null,revogado_em:null
});
export function validateEmailConsentChoice(value){
  if(value===true||value==='true')return true;
  if(value===false||value==='false')return false;
  throw new Error('Escolha explicitamente se autoriza ou não os resumos por e-mail.');
}
export function normalizeEmailConsent(row){
  if(!row)return {...DEFAULT_EMAIL_CONSENT};
  if(typeof row!=='object'||Array.isArray(row)||typeof row.autorizado!=='boolean')
    throw new Error('Dados inválidos de consentimento por e-mail.');
  const autorizado_em=row.autorizado_em??null,revogado_em=row.revogado_em??null;
  if((row.autorizado&&(!autorizado_em||revogado_em))||
    (revogado_em&&!autorizado_em))
    throw new Error('Histórico de consentimento inconsistente.');
  return {autorizado:row.autorizado,autorizado_em,revogado_em};
}
export function hasCurrentEmailConsent(row,identity){
  if(!row||!identity||!identity.userId||!identity.obraId)return false;
  // A service-side delivery executor must independently revalidate membership,
  // verified recipient email and the daily preferences immediately before send.
  return row.user_id===identity.userId && row.obra_id===identity.obraId &&
    row.autorizado===true && !!row.autorizado_em && !row.revogado_em;
}
