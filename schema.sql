-- Liga Chaquito F8 — esquema PostgreSQL
-- El servidor lo crea solo al arrancar (CREATE IF NOT EXISTS), así que NO hace falta
-- correrlo a mano. Queda acá como referencia o por si querés crearlo desde Railway → Postgres → Data.

CREATE TABLE IF NOT EXISTS cuentas (
    id           TEXT PRIMARY KEY,
    nombre       TEXT NOT NULL,
    salt         TEXT NOT NULL,
    hash         TEXT NOT NULL,            -- contraseña hasheada (scrypt), nunca en texto plano
    creada       BIGINT NOT NULL           -- ms desde epoch
);
CREATE UNIQUE INDEX IF NOT EXISTS cuentas_nombre_lower_uq ON cuentas (LOWER(nombre));

CREATE TABLE IF NOT EXISTS sesiones (
    token        TEXT PRIMARY KEY,
    cuenta_id    TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    creada       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sesiones_cuenta_idx ON sesiones (cuenta_id);

CREATE TABLE IF NOT EXISTS jugadores (
    id           TEXT PRIMARY KEY,
    cuenta_id    TEXT NOT NULL UNIQUE REFERENCES cuentas(id) ON DELETE CASCADE,
    nombre       TEXT NOT NULL,
    pj INTEGER NOT NULL DEFAULT 0,
    pg INTEGER NOT NULL DEFAULT 0,
    pp INTEGER NOT NULL DEFAULT 0,
    pe INTEGER NOT NULL DEFAULT 0,
    pts INTEGER NOT NULL DEFAULT 0,
    gf INTEGER NOT NULL DEFAULT 0,
    gc INTEGER NOT NULL DEFAULT 0,
    ultimo       BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS jugadores_ranking_idx ON jugadores (pts DESC, pg DESC, pj DESC);

CREATE TABLE IF NOT EXISTS partidos (
    id           TEXT PRIMARY KEY,
    partido_id   TEXT NOT NULL DEFAULT '',  -- id de sala online (evita anotar dos veces el mismo partido)
    cuenta_id    TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    resultado    TEXT NOT NULL CHECK (resultado IN ('win','loss','draw')),
    gf           INTEGER NOT NULL DEFAULT 0,
    gc           INTEGER NOT NULL DEFAULT 0,
    modo         TEXT NOT NULL DEFAULT 'solo' CHECK (modo IN ('solo','liga','online')),
    cuando       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS partidos_cuenta_idx ON partidos (cuenta_id, cuando DESC);
CREATE UNIQUE INDEX IF NOT EXISTS partidos_sala_uq ON partidos (partido_id, cuenta_id) WHERE partido_id <> '';

CREATE TABLE IF NOT EXISTS amigos (
    cuenta_id    TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    amigo_nombre TEXT NOT NULL,
    desde        BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (cuenta_id, amigo_nombre)
);
CREATE INDEX IF NOT EXISTS amigos_cuenta_idx ON amigos (cuenta_id);
