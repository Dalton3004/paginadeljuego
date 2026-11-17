/**
 * Punto de entrada de persistencia (todas las funciones son async).
 *  - Si existe DATABASE_URL (Railway Postgres)  -> persistencia_pg.js   (PostgreSQL)
 *  - Si no                                      -> persistencia_json.js (archivo liga.json, como antes)
 * Así sigue funcionando en tu PC sin instalar nada, y en Railway usa la base de datos.
 */
const usarPostgres = !!(process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL);
const impl = usarPostgres ? await import("./persistencia_pg.js") : await import("./persistencia_json.js");

export const usaPostgres = usarPostgres;
export const registrar = async (a) => impl.registrar(a);
export const entrar = async (a) => impl.entrar(a);
export const salir = async (t) => impl.salir(t);
export const salirTodos = async (t) => impl.salirTodos(t);
export const cuentaDe = async (t) => impl.cuentaDe(t);
export const listarRanking = async () => impl.listarRanking();
export const resumen = async () => impl.resumen();
export const historial = async (t, n) => impl.historial(t, n);
export const anotarPartido = async (t, p) => impl.anotarPartido(t, p);
export const anotarOnline = async (p) => impl.anotarOnline(p);
export const cambiarClave = async (t, p) => impl.cambiarClave(t, p);
export const exportarRespaldo = async () => impl.exportarRespaldo();
export const restaurarRespaldo = async (c) => impl.restaurarRespaldo(c);
export const infoAlmacenamiento = () => impl.infoAlmacenamiento();
export const vaciarRemoto = async () => impl.vaciarRemoto();
export const forzarGuardado = async () => (impl.forzarGuardado ? impl.forzarGuardado() : undefined);
export const listarAmigos = async (t) => impl.listarAmigos(t);
export const guardarAmigos = async (t, l) => impl.guardarAmigos(t, l);
