-- lab_2_1_header (P4.1): now that the Lab header is config-driven, add the
-- title/subtitle to cell 2.1's lab_config_json so the lab reads exactly as
-- before ("Prompt Construction"). Additive jsonb_set; touches nothing else.
update public.modules
set lab_config_json = jsonb_set(
      jsonb_set(lab_config_json, '{title}', '"Lab: Prompt Construction"'::jsonb, true),
      '{subtitle}', '"Write a constraint-first prompt and run it against Claude."'::jsonb, true
    ),
    updated_at = now()
where cell_id = '2.1' and lab_config_json->>'kind' = 'prompt-construction';
