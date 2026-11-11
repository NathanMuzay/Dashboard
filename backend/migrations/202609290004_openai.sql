ALTER TABLE service_subscriptions DROP CONSTRAINT service_subscriptions_service_check;
ALTER TABLE service_subscriptions ADD CONSTRAINT service_subscriptions_service_check CHECK (service IN ('spotify','gmail','google_calendar','github','openai'));
CREATE TABLE ai_requests (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    requests INTEGER NOT NULL DEFAULT 1
);
