-- Update only historical default labels. Preserve custom titles and widget IDs.
UPDATE user_dashboards d
SET widgets = (
    SELECT jsonb_agg(
        CASE WHEN widget->>'type' = 'openai_chat'
          AND widget->>'title' IN ('Assistant IA local · Poser une question', 'Assistant IA Mistral · Poser une question', 'ChatGPT · Demander à l’IA')
        THEN jsonb_set(widget, '{title}', '"Assistant IA"'::jsonb)
        ELSE widget END ORDER BY position
    ) FROM jsonb_array_elements(d.widgets) WITH ORDINALITY AS items(widget, position)
), revision = revision + 1
WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(d.widgets) AS widget
    WHERE widget->>'type' = 'openai_chat'
      AND widget->>'title' IN ('Assistant IA local · Poser une question', 'Assistant IA Mistral · Poser une question', 'ChatGPT · Demander à l’IA')
);
