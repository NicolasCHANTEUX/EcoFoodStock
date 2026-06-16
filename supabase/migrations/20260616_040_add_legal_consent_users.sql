-- Adds MVP legal consent tracking for account creation.

alter table users
  add column if not exists legal_terms_accepted_at timestamptz,
  add column if not exists legal_terms_version text,
  add column if not exists privacy_policy_version text;
