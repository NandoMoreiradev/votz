import { sql } from './lib.mjs'
const count = () => sql(`select (select count(*) from users),(select count(*) from reports),(select count(*) from entities),(select count(*) from politicians),(select count(*) from companies),(select count(*) from org_roles),(select count(*) from comments),(select count(*) from access_logs)`)
console.log('antes  (users|reports|entities|politicians|companies|org_roles|comments|access_logs):', count())
const U = `(select id from users where email like 'qa.%@votz.test')`
const R = `(select id from reports where title like 'QA %' or "authorId" in ${U})`
const O = `((select id from entities where "legalName" like 'QA %') union all (select id from politicians where name like 'QA %') union all (select id from companies where "legalName" like 'QA %'))`
const stmts = [
  `delete from notifications where "userId" in ${U} or "reportId" in ${R}`,
  `delete from votes where "userId" in ${U} or "reportId" in ${R}`,
  `update comments set "parentId"=null where "reportId" in ${R} or "authorId" in ${U}`,
  `delete from comments where "reportId" in ${R} or "authorId" in ${U}`,
  `delete from report_followers where "reportId" in ${R}`,
  `delete from content_flags where "reporterId" in ${U} or "targetId" in (select id::text from reports where id in ${R})`,
  `delete from timeline_events where "reportId" in ${R} or "authorId" in ${U}`,
  `delete from moderation_actions where "actorId" in ${U} or "targetId" in (select id::text from users where email like 'qa.%@votz.test') or "targetId" in (select id::text from reports where id in ${R})`,
  `delete from reports where id in ${R}`,
  `delete from proposta_votos where "usuarioId" in ${U} or "propostaId" in (select id from propostas where "politicoId" in (select id from politicians where name like 'QA %'))`,
  `delete from proposta_timeline where "autorId" in ${U} or "propostaId" in (select id from propostas where "politicoId" in (select id from politicians where name like 'QA %'))`,
  `delete from propostas where "politicoId" in (select id from politicians where name like 'QA %')`,
  `delete from member_invites where "orgId" in ${O} or email like 'qa.%@votz.test'`,
  `delete from org_memberships where "userId" in ${U} or "orgId" in ${O}`,
  `delete from org_roles where "orgId" in ${O}`,
  `delete from user_politician_followers where "userId" in ${U} or "politicianId" in (select id from politicians where name like 'QA %')`,
  `delete from registration_requests where "requesterId" in ${U}`,
  `delete from api_keys where "userId" in ${U}`,
  `delete from refresh_tokens where "userId" in ${U}`,
  `delete from access_logs where "userId" in ${U} or "userId"='3d10dbe0-cbd6-4c5c-b824-9f2e114e5ef9'`,
  `delete from entities where "legalName" like 'QA %'`,
  `delete from politicians where name like 'QA %'`,
  `delete from companies where "legalName" like 'QA %'`,
  `delete from users where email like 'qa.%@votz.test'`,
]
console.log(sql(stmts.join(';\n')).split('\n').join(' | '))
console.log('depois (mesma ordem):', count())
