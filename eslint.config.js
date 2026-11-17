/**
 * ESLint 9 flat config — Liga Chaquito F8
 * Node (server) + browser (cliente) en el mismo repo ESM.
 */
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

/** Símbolos compartidos del cliente (canvas / stores) aún referenciados sin import en algunos archivos. */
const appGlobals = {
    CONFIG: 'readonly',
    DIFICULTADES: 'readonly',
    EstadoPartido: 'readonly',
    TACTICAS: 'readonly',
    TACTICA_ORDEN: 'readonly',
    Vector2D: 'readonly',
    Pelota: 'readonly',
    Jugador: 'readonly',
    GestorPartido: 'readonly',
    factorEstrellas: 'readonly',
    perfilConEstrellas: 'readonly',
    EQUIPOS: 'readonly',
    SPRITE_ATLAS: 'readonly',
    ANIMACIONES: 'readonly',
    FANS_ATLAS: 'readonly',
    Crowd: 'readonly',
    FX: 'readonly',
    NetSync: 'readonly',
    RankingCore: 'readonly',
    RankingStore: 'readonly',
    RankingUI: 'readonly',
    SettingsStore: 'readonly',
    SettingsUI: 'readonly',
    AuthStore: 'readonly',
    SocialStore: 'readonly',
    SocialUI: 'readonly',
    LigaCore: 'readonly',
    LigaStore: 'readonly',
    LigaModo: 'readonly',
    Preloader: 'readonly',
    Game: 'readonly',
    MOVILIDAD_JUGADORES: 'readonly',
    io: 'readonly',
};

export default [
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'data/**',
            'assets/sprites/**',
            'assets/hinchada/fans_atlas.js',
            'assets/animaciones.js',
            'assets/movilidad.js',
            'assets/equipos.js',
        ],
    },
    js.configs.recommended,
    prettier,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...appGlobals,
            },
        },
        rules: {
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-console': 'off',
            'no-constant-condition': ['warn', { checkLoops: false }],
            'no-case-declarations': 'warn',
            'no-fallthrough': 'warn',
            'no-prototype-builtins': 'warn',
            'no-redeclare': 'warn',
            'no-undef': 'error',
            'no-useless-assignment': 'warn',
            'prefer-const': 'off',
            'no-var': 'off',
        },
    },
];
