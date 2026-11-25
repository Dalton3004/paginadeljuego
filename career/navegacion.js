/**
 * ETAPA 27 — NAVEGACIÓN Y ESTRUCTURA DE MENÚS (CENTRAL CHAQUITO).
 *
 * Centraliza los 10 accesos principales requeridos manteniendo la portada limpia
 * y priorizando pantallas móviles y navegación por teclado:
 *   - Jugar
 *   - Liga
 *   - Copa
 *   - Arcade
 *   - Desafíos
 *   - Mi Club
 *   - Perfil
 *   - Noticias
 *   - Ranking
 *   - Ajustes
 *   (+ acceso rápido opcional a Historia y Palmarés/Récords dentro de la misma grilla limpia)
 */

import { describirEquipoFavorito } from './favorito_perfil.js';

export const SECCIONES_NAVEGACION = Object.freeze([
    { id: 'jugar', icono: '⚽', titulo: 'JUGAR', subtitulo: 'Solo · Online 1v1 · Modos', grupo: 'cancha' },
    { id: 'liga', icono: '🏆', titulo: 'LIGA', subtitulo: 'Temporada y tabla', grupo: 'competiciones' },
    { id: 'copa', icono: '🥇', titulo: 'COPA', subtitulo: 'Eliminación directa', grupo: 'competiciones' },
    { id: 'arcade', icono: '🕹', titulo: 'ARCADE', subtitulo: 'Reglas locas Chaquito', grupo: 'modos_extra' },
    { id: 'desafios', icono: '🎯', titulo: 'DESAFÍOS', subtitulo: 'Retos y medallas', grupo: 'modos_extra' },
    { id: 'historia', icono: '📖', titulo: 'HISTORIA', subtitulo: 'El Camino del Barrio', grupo: 'modos_extra' },
    { id: 'mi_club', icono: '🏛', titulo: 'MI CLUB', subtitulo: 'Plantel · Palmarés · Récords', grupo: 'club_social' },
    { id: 'perfil', icono: '👤', titulo: 'PERFIL', subtitulo: 'Cuenta y Equipo Favorito', grupo: 'club_social' },
    { id: 'noticias', icono: '📰', titulo: 'NOTICIAS', subtitulo: 'Diario, prensa y clásicos', grupo: 'club_social' },
    { id: 'ranking', icono: '📊', titulo: 'RANKING', subtitulo: 'Tabla global y amigos', grupo: 'club_social' },
    { id: 'ajustes', icono: '⚙', titulo: 'AJUSTES', subtitulo: 'Audio · Táctil · Accesibilidad', grupo: 'sistema' },
]);

export function construirEstadoCentralChaquito({
    ligaActual = null,
    copaActual = null,
    noticiasNoLeidas = 0,
    desafiosCompletados = 0,
    totalDesafios = 5,
    equipoFavoritoId = '',
    equiposCatalogo = [],
    sesionNombre = '',
} = {}) {
    const fav = describirEquipoFavorito(equipoFavoritoId, equiposCatalogo);
    const badges = Object.create(null);

    if (ligaActual && !ligaActual.terminada) {
        badges.liga = `FECHA ${(Number(ligaActual.fechaActual) || 0) + 1}`;
    } else if (ligaActual && ligaActual.terminada) {
        badges.liga = 'FINALIZADA';
    }

    if (copaActual && !copaActual.terminada) {
        badges.copa = 'EN CURSO';
    }

    if (noticiasNoLeidas > 0) {
        badges.noticias = `${noticiasNoLeidas} NUEVA${noticiasNoLeidas === 1 ? '' : 'S'}`;
    }

    if (desafiosCompletados > 0) {
        badges.desafios = `${desafiosCompletados}/${totalDesafios}`;
    }

    if (fav.elegido) {
        badges.perfil = `★ ${fav.siglas}`;
        badges.mi_club = fav.corto;
    } else if (sesionNombre) {
        badges.perfil = sesionNombre;
    }

    return {
        favorito: fav,
        secciones: SECCIONES_NAVEGACION.map((sec) => ({
            ...sec,
            badge: badges[sec.id] || '',
        })),
    };
}
