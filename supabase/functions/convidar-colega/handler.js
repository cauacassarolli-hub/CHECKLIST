export const APP_URL='https://cauacassarolli-hub.github.io/CHECKLIST/auth.html';
const ORIGIN=new URL(APP_URL).origin;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createInviteHandler({userClient,adminClient}) {
  return async req=>{
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
    if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return reply(403,{error:'Origem não permitida.'});
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(req.method!=='POST')return reply(405,{error:'Método não permitido.'});
    const authorization=req.headers.get('authorization')||'';
    if(!/^Bearer [^\s]+$/.test(authorization))return reply(401,{error:'Entre novamente para convidar.'});
    try {
      // Auth validates the actual bearer token, including projects using signing keys.
      const user=userClient(authorization);
      const identity=await user.auth.getUser(authorization.slice(7));
      if(identity.error||!identity.data?.user)return reply(401,{error:'Sessão inválida. Entre novamente.'});
      const raw=await req.text();if(raw.length>2000)return reply(400,{error:'Convite inválido.'});
      let input;try{input=JSON.parse(raw);}catch{return reply(400,{error:'Convite inválido.'});}
      const {work_id,member_email,member_name}=input||{};
      if(!uuid.test(work_id||'')||typeof member_email!=='string'||member_email.length>254||typeof member_name!=='string'||member_name.length>150)return reply(400,{error:'Informe obra, nome e e-mail válidos.'});
      // Database checks ownership and serializes/rate-limits attempts, using this user's JWT.
      const prepared=await user.rpc('chk_preparar_convite',{work_id,member_email,member_name});
      if(prepared.error)return reply(prepared.error.code==='42501'?403:400,{error:prepared.error.code==='23514'?prepared.error.message:'Não foi possível autorizar o convite nesta obra.'});
      const invitation=prepared.data;
      const admin=adminClient();let outcome='falhou';
      try {
        const sent=await admin.auth.admin.inviteUserByEmail(invitation.email,{redirectTo:APP_URL});
        if(!sent.error)outcome='enviado';
        else if(['email_exists','user_already_exists'].includes(sent.error.code))outcome='conta_existente';
      }catch{/* Keep failure state, without logging tokens, addresses or provider details. */}
      const finished=await admin.rpc('chk_finalizar_convite',{invite_id:invitation.id,attempt_id:invitation.envio_id,result_status:outcome});
      if(finished.error)return reply(503,{error:'Não foi possível confirmar o envio. Confira a lista antes de reenviar.'});
      if(!finished.data)return reply(409,{error:'A autorização foi cancelada ou substituída. Nenhum acesso foi ativado por esta tentativa.'});
      if(outcome==='falhou')return reply(502,{error:'Não foi possível enviar o e-mail. O acesso não foi ativado. Confira o serviço de e-mail do Supabase e tente novamente.'});
      return reply(200,{status:outcome,message:outcome==='enviado'?'Convite enviado. O colega receberá o link para definir a própria senha.':'Esta pessoa já tem conta. A obra foi autorizada; ela pode entrar com sua senha atual. Não foi enviado um novo convite de criação de conta.'});
    }catch{return reply(503,{error:'Serviço de convites indisponível. Tente novamente.'});}
  };
}
