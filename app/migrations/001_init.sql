-- SecureCart schema. Money is stored as integer paise (1 INR = 100 paise) to avoid float rounding.

CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL UNIQUE CHECK (email = lower(email)),
  name                text NOT NULL,
  password_hash       text NOT NULL,
  role                text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'support', 'admin')),
  disabled            boolean NOT NULL DEFAULT false,
  failed_logins       integer NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  totp_secret_enc     text,
  totp_enabled        boolean NOT NULL DEFAULT false,
  totp_last_step      bigint,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recovery_codes (
  id        bigserial PRIMARY KEY,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at   timestamptz
);
CREATE INDEX ON recovery_codes (user_id);

CREATE TABLE passkeys (
  id           text PRIMARY KEY,            -- credential ID, base64url
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key   bytea NOT NULL,
  counter      bigint NOT NULL DEFAULT 0,
  transports   text[] NOT NULL DEFAULT '{}',
  device_type  text,
  backed_up    boolean NOT NULL DEFAULT false,
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX ON passkeys (user_id);

-- The cookie holds a random token; only its SHA-256 is stored, so a database leak
-- does not hand out live sessions.
CREATE TABLE sessions (
  id_hash                 text PRIMARY KEY,
  public_id               uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id                 uuid REFERENCES users(id) ON DELETE CASCADE,
  stage                   text NOT NULL CHECK (stage IN ('anonymous', 'mfa_pending', 'full')),
  auth_method             text,
  mfa                     boolean NOT NULL DEFAULT false,
  challenge               text,
  challenge_expires_at    timestamptz,
  pending_totp_secret_enc text,
  ip                      text,
  user_agent              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  last_seen_at            timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz NOT NULL
);
CREATE INDEX ON sessions (user_id);

CREATE TABLE products (
  id          serial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  sku         text NOT NULL UNIQUE,
  name        text NOT NULL,
  tagline     text NOT NULL,
  description text NOT NULL,
  category    text NOT NULL,
  art         text NOT NULL DEFAULT 'key',
  price_paise integer NOT NULL CHECK (price_paise > 0),
  stock       integer NOT NULL CHECK (stock >= 0),
  active      boolean NOT NULL DEFAULT true,
  specs       jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- owner is 'u:<user id>' for signed-in shoppers and 's:<session public id>' for guests.
CREATE TABLE cart_items (
  owner      text NOT NULL,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner, product_id)
);

CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number           bigserial UNIQUE,
  user_id          uuid NOT NULL REFERENCES users(id),
  status           text NOT NULL CHECK (status IN ('pending_payment', 'paid', 'shipped', 'cancelled')),
  total_paise      integer NOT NULL CHECK (total_paise > 0),
  currency         text NOT NULL DEFAULT 'INR',
  provider         text NOT NULL,
  provider_ref     text,
  client_ip        text,
  declined_count   integer NOT NULL DEFAULT 0,
  cancel_reason    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  paid_at          timestamptz,
  shipped_at       timestamptz
);
CREATE INDEX ON orders (user_id, created_at DESC);
CREATE INDEX ON orders (provider, provider_ref);

CREATE TABLE order_items (
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       integer NOT NULL REFERENCES products(id),
  name             text NOT NULL,
  unit_price_paise integer NOT NULL,
  quantity         integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, product_id)
);

-- Every processed webhook event, keyed by the provider's event ID: a replayed or
-- duplicated delivery is recognised and ignored (idempotency).
CREATE TABLE payment_events (
  id          bigserial PRIMARY KEY,
  provider    text NOT NULL,
  event_id    text NOT NULL,
  type        text NOT NULL,
  order_id    uuid REFERENCES orders(id),
  data        jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE TABLE password_resets (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_limits (
  key        text PRIMARY KEY,
  count      integer NOT NULL,
  expires_at timestamptz NOT NULL
);

-- Outgoing mail is captured here (no SMTP server in the demo); visible at /dev/mailbox in demo mode.
CREATE TABLE mail_outbox (
  id         bigserial PRIMARY KEY,
  to_email   text NOT NULL,
  subject    text NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tamper-evident audit log: each row stores the hash of the previous row, so editing or
-- deleting any entry breaks the chain from that point on.
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  ts          timestamptz NOT NULL,
  actor_id    uuid,
  actor_email text,
  action      text NOT NULL,
  target      text,
  ip          text,
  details     jsonb NOT NULL DEFAULT '{}',
  prev_hash   text NOT NULL,
  hash        text NOT NULL
);
CREATE INDEX ON audit_log (action);
CREATE INDEX ON audit_log (actor_id);

CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
