-- Local PostgreSQL fixture mirrors the inspected public chk_* schema before team sharing.
-- Auth and Storage here are minimal stand-ins, not tests of login or actual file uploads.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
grant usage on schema auth,storage to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
create table storage.buckets(id text primary key,name text,public boolean);
insert into storage.buckets values('checklist-fotos','checklist-fotos',false),('checklist-relatorios','checklist-relatorios',false);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/'); $$;
create table public."chk_ambientes" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "obra_id" uuid not null,
  "nome" text not null,
  "ordem" integer default 0,
  "created_at" timestamp with time zone default now(),
  "ativo" boolean default true not null
);
alter table public."chk_ambientes" enable row level security;
grant select,insert,update,delete on public."chk_ambientes" to authenticated;
create table public."chk_apartamentos" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "obra_id" uuid not null,
  "pavimento" text not null,
  "apartamento" text not null,
  "status" text default 'nao_iniciado'::text,
  "created_at" timestamp with time zone default now()
);
alter table public."chk_apartamentos" enable row level security;
grant select,insert,update,delete on public."chk_apartamentos" to authenticated;
create table public."chk_itens" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "obra_id" uuid not null,
  "apartamento_id" uuid not null,
  "ambiente" text not null,
  "servico" text not null,
  "status" text default 'nao_vistoriado'::text,
  "responsavel" text,
  "prioridade" text default 'normal'::text,
  "observacao" text,
  "foto_antes_path" text,
  "foto_depois_path" text,
  "data_vistoria" timestamp with time zone default now(),
  "data_correcao" timestamp with time zone,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "foto_antes_data" text,
  "foto_depois_data" text,
  "prazo" date
);
alter table public."chk_itens" enable row level security;
grant select,insert,update,delete on public."chk_itens" to authenticated;
create table public."chk_obras" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "nome" text not null,
  "empresa" text,
  "created_at" timestamp with time zone default now()
);
alter table public."chk_obras" enable row level security;
grant select,insert,update,delete on public."chk_obras" to authenticated;
create table public."chk_prioridades" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "obra_id" uuid not null,
  "nome" text not null,
  "ordem" integer default 0 not null,
  "ativo" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);
alter table public."chk_prioridades" enable row level security;
grant select,insert,update,delete on public."chk_prioridades" to authenticated;
create table public."chk_relatorios" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "obra_id" uuid not null,
  "tipo" text not null,
  "titulo" text not null,
  "pavimento" text,
  "apartamento" text,
  "conteudo" jsonb not null,
  "created_at" timestamp with time zone default now(),
  "servico" text,
  "pdf_path" text
);
alter table public."chk_relatorios" enable row level security;
grant select,insert,update,delete on public."chk_relatorios" to authenticated;
create table public."chk_servicos" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "obra_id" uuid not null,
  "nome" text not null,
  "categoria" text,
  "ordem" integer default 0,
  "ativo" boolean default true,
  "created_at" timestamp with time zone default now()
);
alter table public."chk_servicos" enable row level security;
grant select,insert,update,delete on public."chk_servicos" to authenticated;
alter table public."chk_ambientes" add constraint "chk_ambientes_pkey" PRIMARY KEY (id);
alter table public."chk_apartamentos" add constraint "chk_apartamentos_obra_id_pavimento_apartamento_key" UNIQUE (obra_id, pavimento, apartamento);
alter table public."chk_apartamentos" add constraint "chk_apartamentos_pkey" PRIMARY KEY (id);
alter table public."chk_itens" add constraint "chk_itens_pkey" PRIMARY KEY (id);
alter table public."chk_obras" add constraint "chk_obras_pkey" PRIMARY KEY (id);
alter table public."chk_prioridades" add constraint "chk_prioridades_pkey" PRIMARY KEY (id);
alter table public."chk_relatorios" add constraint "chk_relatorios_pkey" PRIMARY KEY (id);
alter table public."chk_servicos" add constraint "chk_servicos_obra_id_nome_key" UNIQUE (obra_id, nome);
alter table public."chk_servicos" add constraint "chk_servicos_pkey" PRIMARY KEY (id);
alter table public."chk_ambientes" add constraint "chk_ambientes_obra_id_fkey" FOREIGN KEY (obra_id) REFERENCES chk_obras(id) ON DELETE CASCADE;
alter table public."chk_ambientes" add constraint "chk_ambientes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."chk_apartamentos" add constraint "chk_apartamentos_obra_id_fkey" FOREIGN KEY (obra_id) REFERENCES chk_obras(id) ON DELETE CASCADE;
alter table public."chk_apartamentos" add constraint "chk_apartamentos_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."chk_itens" add constraint "chk_itens_apartamento_id_fkey" FOREIGN KEY (apartamento_id) REFERENCES chk_apartamentos(id) ON DELETE CASCADE;
alter table public."chk_itens" add constraint "chk_itens_obra_id_fkey" FOREIGN KEY (obra_id) REFERENCES chk_obras(id) ON DELETE CASCADE;
alter table public."chk_itens" add constraint "chk_itens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."chk_obras" add constraint "chk_obras_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."chk_prioridades" add constraint "chk_prioridades_obra_id_fkey" FOREIGN KEY (obra_id) REFERENCES chk_obras(id) ON DELETE CASCADE;
alter table public."chk_prioridades" add constraint "chk_prioridades_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public."chk_relatorios" add constraint "chk_relatorios_obra_id_fkey" FOREIGN KEY (obra_id) REFERENCES chk_obras(id) ON DELETE CASCADE;
alter table public."chk_relatorios" add constraint "chk_relatorios_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."chk_servicos" add constraint "chk_servicos_obra_id_fkey" FOREIGN KEY (obra_id) REFERENCES chk_obras(id) ON DELETE CASCADE;
alter table public."chk_servicos" add constraint "chk_servicos_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
create policy "chk_prioridades_owner_delete" on "public"."chk_prioridades" for DELETE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "chk_prioridades_owner_insert" on "public"."chk_prioridades" for INSERT to "authenticated" with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "chk_prioridades_owner_select" on "public"."chk_prioridades" for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "chk_prioridades_owner_update" on "public"."chk_prioridades" for UPDATE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "Usuário acessa suas obras" on "public"."chk_obras" for ALL to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Usuário acessa seus apartamentos" on "public"."chk_apartamentos" for ALL to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Usuário acessa seus ambientes" on "public"."chk_ambientes" for ALL to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Usuário acessa seus itens" on "public"."chk_itens" for ALL to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Usuário acessa seus relatórios" on "public"."chk_relatorios" for ALL to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Usuário acessa seus serviços" on "public"."chk_servicos" for ALL to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Usuário atualiza suas fotos do checklist" on "storage"."objects" for UPDATE to "authenticated" using (((bucket_id = 'checklist-fotos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'checklist-fotos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Usuário envia suas fotos do checklist" on "storage"."objects" for INSERT to "authenticated" with check (((bucket_id = 'checklist-fotos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Usuário remove suas fotos do checklist" on "storage"."objects" for DELETE to "authenticated" using (((bucket_id = 'checklist-fotos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "Usuário visualiza suas fotos do checklist" on "storage"."objects" for SELECT to "authenticated" using (((bucket_id = 'checklist-fotos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "chk_pdf_owner_delete" on "storage"."objects" for DELETE to "authenticated" using (((bucket_id = 'checklist-relatorios'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "chk_pdf_owner_insert" on "storage"."objects" for INSERT to "authenticated" with check (((bucket_id = 'checklist-relatorios'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "chk_pdf_owner_select" on "storage"."objects" for SELECT to "authenticated" using (((bucket_id = 'checklist-relatorios'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "chk_pdf_owner_update" on "storage"."objects" for UPDATE to "authenticated" using (((bucket_id = 'checklist-relatorios'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))) with check (((bucket_id = 'checklist-relatorios'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
