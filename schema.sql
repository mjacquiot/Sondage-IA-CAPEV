-- =========================================================================
-- SCRIPT DE CONFIGURATION BASE DE DONNÉES SUPABASE
-- Formation IA CNFPT - 28 Septembre 2026
-- =========================================================================
--
-- INSTRUCTIONS IMPORTANTES POUR L'ADMINISTRATEUR :
-- Pour pouvoir vous connecter en tant qu'administrateur et exporter les données :
-- 1. Rendez-vous sur votre tableau de bord Supabase (https://supabase.com).
-- 2. Allez dans la section "Authentication" -> "Users".
-- 3. Cliquez sur "Add user" -> "Create user".
-- 4. Renseignez l'adresse email : admin@admin.fr
-- 5. Saisissez un mot de passe sécurisé de votre choix.
-- 6. Décochez "Auto-confirm user" si vous préférez envoyer un email, ou laissez-le
--    coché pour valider instantanément le compte (Recommandé).
-- 7. Cliquez sur "Save".
--
-- Ce mot de passe sera celui demandé dans l'application après avoir cliqué
-- sur le cadenas secret.
-- =========================================================================

-- Nettoyage si réinstallation
drop table if exists public.survey_responses;
drop table if exists public.word_cloud_inputs;

-- 1. Table des réponses structurées au sondage (Anonyme)
create table public.survey_responses (
    id uuid default gen_random_uuid() primary key,
    profile text not null,
    usage_contexts text[] not null,
    interests jsonb not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Table pour les nuages de mots interactifs (Attentes et Outils)
create table public.word_cloud_inputs (
    id uuid default gen_random_uuid() primary key,
    question_id text not null, -- 'attentes' ou 'outils'
    word text not null,
    votes integer default 1 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique (question_id, word)
);

-- Indexation pour optimiser les performances des requêtes
create index idx_word_cloud_question_word on public.word_cloud_inputs(question_id, word);
create index idx_survey_responses_created on public.survey_responses(created_at desc);

-- Activation de RLS (Row Level Security) sur les tables
alter table public.survey_responses enable row level security;
alter table public.word_cloud_inputs enable row level security;

-- =========================================================================
-- POLITIQUES DE SÉCURITÉ (RLS)
-- =========================================================================

-- RÈGLES SUR LA TABLE survey_responses :
-- * Tout le monde (public anonyme) peut insérer ses réponses au sondage.
-- * Seul l'administrateur authentifié peut lire (select) ou supprimer (delete) les réponses.

create policy "Permettre l'insertion publique des réponses" 
    on public.survey_responses for insert 
    with check (true);

create policy "Permettre la lecture des réponses uniquement à l'admin authentifié" 
    on public.survey_responses for select 
    using (auth.role() = 'authenticated');

create policy "Permettre la suppression des réponses uniquement à l'admin authentifié" 
    on public.survey_responses for delete 
    using (auth.role() = 'authenticated');


-- RÈGLES SUR LA TABLE word_cloud_inputs :
-- * Tout le monde peut lire les mots existants pour afficher les nuages de mots.
-- * Tout le monde peut insérer un nouveau mot.
-- * Tout le monde peut mettre à jour un mot (uniquement pour incrémenter les votes).
-- * Seul l'administrateur authentifié peut supprimer un mot (modération).

create policy "Permettre la lecture publique des mots" 
    on public.word_cloud_inputs for select 
    using (true);

create policy "Permettre l'insertion publique de mots" 
    on public.word_cloud_inputs for insert 
    with check (true);

create policy "Permettre le vote public (mise à jour) sur les mots" 
    on public.word_cloud_inputs for update 
    using (true)
    with check (true);

create policy "Permettre la modération (suppression) uniquement à l'admin authentifié" 
    on public.word_cloud_inputs for delete 
    using (auth.role() = 'authenticated');
