CREATE TABLE state_revision (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL DEFAULT 0);
INSERT INTO state_revision(id,version) VALUES (1,0);
CREATE TRIGGER expenses_insert_revision AFTER INSERT ON expenses BEGIN UPDATE state_revision SET version=version+1 WHERE id=1; END;
CREATE TRIGGER expenses_update_revision AFTER UPDATE ON expenses BEGIN UPDATE state_revision SET version=version+1 WHERE id=1; END;
CREATE TRIGGER expenses_delete_revision AFTER DELETE ON expenses BEGIN UPDATE state_revision SET version=version+1 WHERE id=1; END;
CREATE TRIGGER months_insert_revision AFTER INSERT ON months BEGIN UPDATE state_revision SET version=version+1 WHERE id=1; END;
CREATE TRIGGER months_update_revision AFTER UPDATE ON months BEGIN UPDATE state_revision SET version=version+1 WHERE id=1; END;
CREATE TRIGGER months_delete_revision AFTER DELETE ON months BEGIN UPDATE state_revision SET version=version+1 WHERE id=1; END;
