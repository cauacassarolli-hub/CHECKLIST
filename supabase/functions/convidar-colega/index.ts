import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createInviteHandler} from './handler.js';
const url=Deno.env.get('SUPABASE_URL')!;
const anonymousKey=Deno.env.get('SUPABASE_ANON_KEY')!;
const serverKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
// verify_jwt=false at the gateway; handler.getUser(token) validates every request.
Deno.serve(createInviteHandler({
  userClient:authorization=>createClient(url,anonymousKey,{...options,global:{headers:{Authorization:authorization}}}),
  adminClient:()=>createClient(url,serverKey,options)
}));
