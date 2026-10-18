CREATE TABLE app_meta(id text PRIMARY KEY NOT NULL,version integer NOT NULL,token text NOT NULL,owner text NOT NULL,initialized integer NOT NULL DEFAULT 0,mode text NOT NULL DEFAULT 'empty');
CREATE TABLE app_records(collection text NOT NULL,id text NOT NULL,status text NOT NULL DEFAULT '',reference text NOT NULL DEFAULT '',data text NOT NULL,PRIMARY KEY(collection,id));
CREATE INDEX records_status ON app_records(collection,status);
CREATE INDEX records_reference ON app_records(collection,reference);
CREATE TABLE app_outbox(id text PRIMARY KEY NOT NULL,target text NOT NULL,status text NOT NULL,data text NOT NULL);
CREATE INDEX outbox_pending ON app_outbox(status,target);
CREATE TABLE app_inbox(id text PRIMARY KEY NOT NULL,data text NOT NULL);
CREATE TABLE app_requests(id text PRIMARY KEY NOT NULL,data text NOT NULL);
CREATE TABLE app_audit(id text PRIMARY KEY NOT NULL,data text NOT NULL);
