/**
 * ETAPA 12 — Sistema expandido de Rachas.
 *
 * Registra victorias consecutivas, derrotas consecutivas, partidos invicto,
 * partidos consecutivos convirtiendo goles y vallas invictas seguidas,
 * generando mensajes contextuales reales cuando se alcanzan hitos o se cortan rachas.
 */

export function crearEstadoRachas() {
    return {
        victoriasConsecutivas: 0,
        mejorVictorias: 0,
        derrotasConsecutivas: 0,
        partidosInvicto: 0,
        mejorInvicto: 0,
        partidosMarcando: 0,
        mejorMarcando: 0,
        vallasInvictasSeguidas: 0,
        mejorVallasInvictas: 0,
        totalPartidos: 0,
    };
}

export function normalizarEstadoRachas(raw) {
    const base = crearEstadoRachas();
    if (!raw || typeof raw !== 'object') return base;
    for (const k of Object.keys(base)) {
        const v = parseInt(raw[k], 10);
        base[k] = Number.isFinite(v) && v >= 0 ? v : 0;
    }
    return base;
}

/**
 * Procesa un partido real terminado (`resultado`: 'win' | 'draw' | 'loss', `gf`, `gc`)
 * y devuelve el nuevo estado junto con los hitos/cortes ocurridos en ese encuentro.
 */
export function actualizarRachas(estadoPrevio, { resultado, gf = 0, gc = 0 } = {}) {
    const prev = normalizarEstadoRachas(estadoPrevio);
    const next = { ...prev };
    const golesFavor = Math.max(0, parseInt(gf, 10) || 0);
    const golesContra = Math.max(0, parseInt(gc, 10) || 0);

    const eventos = [];
    const mensajes = [];

    next.totalPartidos = prev.totalPartidos + 1;

    // 1) Resultado: victorias, derrotas e invicto
    if (resultado === 'win') {
        if (prev.derrotasConsecutivas >= 2) {
            eventos.push({ tipo: 'fin_mala_racha', cantidadAnterior: prev.derrotasConsecutivas });
            mensajes.push(`¡SE CORTÓ LA MALA RACHA DE ${prev.derrotasConsecutivas} DERROTAS!`);
        }
        next.victoriasConsecutivas = prev.victoriasConsecutivas + 1;
        next.derrotasConsecutivas = 0;
        next.partidosInvicto = prev.partidosInvicto + 1;

        if (next.victoriasConsecutivas > next.mejorVictorias) {
            next.mejorVictorias = next.victoriasConsecutivas;
        }
        if (next.partidosInvicto > next.mejorInvicto) {
            next.mejorInvicto = next.partidosInvicto;
        }

        if (next.victoriasConsecutivas >= 2) {
            eventos.push({ tipo: 'racha_victorias', cantidad: next.victoriasConsecutivas });
            mensajes.push(`${next.victoriasConsecutivas} VICTORIAS CONSECUTIVAS`);
        } else if (next.partidosInvicto >= 4) {
            eventos.push({ tipo: 'racha_invicto', cantidad: next.partidosInvicto });
            mensajes.push(`${next.partidosInvicto} PARTIDOS INVICTO`);
        }
    } else if (resultado === 'draw') {
        if (prev.victoriasConsecutivas >= 3) {
            eventos.push({ tipo: 'corte_victorias', cantidadAnterior: prev.victoriasConsecutivas });
        }
        next.victoriasConsecutivas = 0;
        next.derrotasConsecutivas = 0;
        next.partidosInvicto = prev.partidosInvicto + 1;
        if (next.partidosInvicto > next.mejorInvicto) {
            next.mejorInvicto = next.partidosInvicto;
        }
        if (next.partidosInvicto >= 3) {
            eventos.push({ tipo: 'racha_invicto', cantidad: next.partidosInvicto });
            mensajes.push(`${next.partidosInvicto} PARTIDOS INVICTO`);
        }
    } else {
        // Derrota ('loss')
        if (prev.partidosInvicto >= 3) {
            eventos.push({ tipo: 'fin_invicto', cantidadAnterior: prev.partidosInvicto });
            mensajes.push(`SE TERMINÓ EL INVICTO (${prev.partidosInvicto} PARTIDOS)`);
        } else if (prev.victoriasConsecutivas >= 3) {
            eventos.push({ tipo: 'corte_victorias', cantidadAnterior: prev.victoriasConsecutivas });
            mensajes.push(`SE CORTÓ LA RACHA DE ${prev.victoriasConsecutivas} VICTORIAS`);
        }
        next.victoriasConsecutivas = 0;
        next.partidosInvicto = 0;
        next.derrotasConsecutivas = prev.derrotasConsecutivas + 1;
        if (next.derrotasConsecutivas >= 2) {
            eventos.push({ tipo: 'racha_derrotas', cantidad: next.derrotasConsecutivas });
            mensajes.push(`${next.derrotasConsecutivas} DERROTAS CONSECUTIVAS`);
        }
    }

    // 2) Goles consecutivos
    if (golesFavor > 0) {
        next.partidosMarcando = prev.partidosMarcando + 1;
        if (next.partidosMarcando > next.mejorMarcando) {
            next.mejorMarcando = next.partidosMarcando;
        }
        if (next.partidosMarcando >= 4 && mensajes.length < 2) {
            eventos.push({ tipo: 'racha_goles', cantidad: next.partidosMarcando });
            mensajes.push(`${next.partidosMarcando} PARTIDOS SEGUIDOS MARCANDO`);
        }
    } else {
        next.partidosMarcando = 0;
    }

    // 3) Vallas invictas consecutivas
    if (golesContra === 0) {
        next.vallasInvictasSeguidas = prev.vallasInvictasSeguidas + 1;
        if (next.vallasInvictasSeguidas > next.mejorVallasInvictas) {
            next.mejorVallasInvictas = next.vallasInvictasSeguidas;
        }
        if (next.vallasInvictasSeguidas >= 3 && mensajes.length < 2) {
            eventos.push({ tipo: 'racha_valla_invicta', cantidad: next.vallasInvictasSeguidas });
            mensajes.push(`${next.vallasInvictasSeguidas} VALLAS INVICTAS SEGUIDAS`);
        }
    } else {
        next.vallasInvictasSeguidas = 0;
    }

    const mensajePrincipal =
        mensajes[0] ||
        (resultado === 'win'
            ? '1 VICTORIA · EN MARCHA'
            : resultado === 'draw'
            ? (next.partidosInvicto >= 2 ? `${next.partidosInvicto} PARTIDOS INVICTO` : 'EMPATE · SUMANDO')
            : 'A LEVANTAR CABEZA');

    return {
        estado: next,
        eventos,
        mensajes,
        mensajePrincipal,
    };
}
