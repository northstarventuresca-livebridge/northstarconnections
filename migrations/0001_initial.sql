-- North Star Connections • schema version 1
-- Already applied to the dedicated Northstar Cloudflare D1 instance.
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,salt TEXT NOT NULL,
 full_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',status TEXT NOT NULL DEFAULT 'active',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS profiles (
 user_id TEXT PRIMARY KEY,business_name TEXT NOT NULL DEFAULT '',headline TEXT NOT NULL DEFAULT '',
 region TEXT NOT NULL DEFAULT '',years TEXT NOT NULL DEFAULT '',about TEXT NOT NULL DEFAULT '',
 offers TEXT NOT NULL DEFAULT '',needs TEXT NOT NULL DEFAULT '',portfolio TEXT NOT NULL DEFAULT '[]',
 website TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS profiles_published ON profiles(published);
CREATE TABLE IF NOT EXISTS proposals (
 id TEXT PRIMARY KEY,sender_id TEXT NOT NULL,receiver_id TEXT NOT NULL,message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(sender_id) REFERENCES users(id),FOREIGN KEY(receiver_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS proposals_received ON proposals(receiver_id,created_at);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,
 body TEXT NOT NULL,related_id TEXT,read_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,created_at);
CREATE TABLE IF NOT EXISTS match_alerts (
 user_a TEXT NOT NULL,user_b TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_a,user_b)
);
CREATE TABLE IF NOT EXISTS auth_attempts (
 identifier TEXT NOT NULL,window_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(identifier,window_at)
);