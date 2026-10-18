import {sqliteTable,text,integer,primaryKey,index} from 'drizzle-orm/sqlite-core';
export const appMeta=sqliteTable('app_meta',{id:text('id').primaryKey(),version:integer('version').notNull(),token:text('token').notNull(),owner:text('owner').notNull(),initialized:integer('initialized').notNull().default(0),mode:text('mode').notNull().default('empty')});
export const records=sqliteTable('app_records',{collection:text('collection').notNull(),id:text('id').notNull(),status:text('status').notNull().default(''),reference:text('reference').notNull().default(''),data:text('data').notNull()},t=>[primaryKey({columns:[t.collection,t.id]}),index('records_status').on(t.collection,t.status),index('records_reference').on(t.collection,t.reference)]);
export const outbox=sqliteTable('app_outbox',{id:text('id').primaryKey(),target:text('target').notNull(),status:text('status').notNull(),data:text('data').notNull()},t=>[index('outbox_pending').on(t.status,t.target)]);
export const inbox=sqliteTable('app_inbox',{id:text('id').primaryKey(),data:text('data').notNull()});
export const requests=sqliteTable('app_requests',{id:text('id').primaryKey(),data:text('data').notNull()});
export const audit=sqliteTable('app_audit',{id:text('id').primaryKey(),data:text('data').notNull()});
