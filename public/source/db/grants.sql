-- Run by `init-db` after schema.sql, as the owner role. :app_role is the application login role (hr_app).
GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";
-- audit rows can be added and read, never changed or removed by the application
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM :"app_role";
