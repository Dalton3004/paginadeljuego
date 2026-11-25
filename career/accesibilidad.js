/**
 * ETAPA 28 — ACCESIBILIDAD.
 *
 * Configuraciones y paletas accesibles para PC y móvil manteniendo la estética arcade:
 *   - modo daltónico ('off' | 'deuteranopia' | 'protanopia' | 'tritanopia')
 *   - contraste alto configurable (highContrast: boolean)
 *   - tamaño de fuente legible ('normal' | 'grande')
 *   - controles táctiles configurables:
 *       · touchScale ('compacto' | 'normal' | 'grande')
 *       · touchHandedness ('diestro' | 'zurdo')
 *   - indicadores visuales no dependientes únicamente del color (formas y prefijos)
 */

export const MODOS_DALTONISMO = {
    off: {
        id: 'off',
        nombre: 'DESACTIVADO (COLORES ORIGINALES)',
        localColor: '#3a9bff',
        rivalColor: '#ff5555',
        acentoColor: '#ffcc00',
        winColor: '#48e078',
        lossColor: '#ff626c',
        drawColor: '#ffd45a',
        marcadorAnilloRival: false,
    },
    deuteranopia: {
        id: 'deuteranopia',
        nombre: 'DEUTERANOPIA / PROTANOPIA SUAVE (AZUL · NARANJA)',
        localColor: '#2b9dff',
        rivalColor: '#ff9419',
        acentoColor: '#ffee55',
        winColor: '#4db8ff',
        lossColor: '#ff8c1a',
        drawColor: '#e0e6f0',
        marcadorAnilloRival: true,
    },
    protanopia: {
        id: 'protanopia',
        nombre: 'PROTANOPIA ALTO CONTRASTE (CIAN · ÁMBAR)',
        localColor: '#00d4ff',
        rivalColor: '#ffb000',
        acentoColor: '#ffffff',
        winColor: '#00d4ff',
        lossColor: '#ffb000',
        drawColor: '#d8dee9',
        marcadorAnilloRival: true,
    },
    tritanopia: {
        id: 'tritanopia',
        nombre: 'TRITANOPIA (TURQUESA · MAGENTA)',
        localColor: '#00c9b7',
        rivalColor: '#ff4da6',
        acentoColor: '#ffe66d',
        winColor: '#00c9b7',
        lossColor: '#ff4da6',
        drawColor: '#dce8f7',
        marcadorAnilloRival: true,
    },
};

export const ESCALAS_FUENTE = ['normal', 'grande'];
export const ESCALAS_TACTIL = ['compacto', 'normal', 'grande'];
export const MANOS_TACTIL = ['diestro', 'zurdo'];

export function normalizarPreferenciasAccesibilidad(raw = {}) {
    const p = raw && typeof raw === 'object' ? raw : {};
    return {
        colorblindMode: MODOS_DALTONISMO[p.colorblindMode] ? p.colorblindMode : 'off',
        highContrast: !!p.highContrast,
        fontScale: ESCALAS_FUENTE.includes(p.fontScale) ? p.fontScale : 'normal',
        touchScale: ESCALAS_TACTIL.includes(p.touchScale) ? p.touchScale : 'normal',
        touchHandedness: MANOS_TACTIL.includes(p.touchHandedness) ? p.touchHandedness : 'diestro',
    };
}

export function obtenerPaletaAccesible(prefs = {}) {
    const modo = (prefs && prefs.colorblindMode) || 'off';
    return MODOS_DALTONISMO[modo] || MODOS_DALTONISMO.off;
}

/**
 * Etiqueta textual/simbólica que no depende únicamente del color para distinguir resultados o bandos.
 */
export function indicadorResultadoAccesible(resultado) {
    if (resultado === 'win' || resultado === 'VICTORIA') return { simbolo: '▲', prefijo: 'V', texto: 'VICTORIA' };
    if (resultado === 'loss' || resultado === 'DERROTA') return { simbolo: '▼', prefijo: 'D', texto: 'DERROTA' };
    return { simbolo: '◆', prefijo: 'E', texto: 'EMPATE' };
}

/**
 * Aplica clases CSS globales de accesibilidad sobre `document.body` y `#touch-controls`.
 * Seguro en entornos sin DOM (Node tests).
 */
export function aplicarClasesAccesibilidadDOM(prefs = {}, doc = typeof document !== 'undefined' ? document : null) {
    const norm = normalizarPreferenciasAccesibilidad(prefs);
    if (!doc || !doc.body) return norm;

    const b = doc.body;
    b.classList.toggle('a11y-high-contrast', norm.highContrast);
    b.classList.toggle('a11y-font-large', norm.fontScale === 'grande');
    b.classList.toggle('a11y-reduce-motion', !!(prefs && prefs.reduceMotion));
    b.dataset.colorblind = norm.colorblindMode;

    const tc = doc.getElementById('touch-controls');
    if (tc) {
        tc.classList.toggle('tc-zurdo', norm.touchHandedness === 'zurdo');
        tc.classList.toggle('tc-scale-compacto', norm.touchScale === 'compacto');
        tc.classList.toggle('tc-scale-grande', norm.touchScale === 'grande');
    }
    return norm;
}
