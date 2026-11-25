/**
 * ESLint 9 Flat Config — Liga Chaquito F8
 *
 * Basado en estándares de repositorios >1.000★ en GitHub:
 *   - eslint/eslint (★27k+) — @eslint/js recommended
 *   - antfu/eslint-config (★6.2k+) — reglas estrictas de corrección, igualdad y módulos ESM
 *   - sindresorhus/eslint-plugin-unicorn (★5.2k+) — protocolo node:, buenas prácticas modernas
 *   - eslint-community/eslint-plugin-security (★2.3k+) — prevención de eval, regex inseguros y bidi trojans
 *   - eslint-community/eslint-plugin-promise (★1k+) — integridad en promesas asíncronas
 *   - prettier/eslint-config-prettier — convivencia limpia con Prettier
 */
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import unicorn from 'eslint-plugin-unicorn';
import security from 'eslint-plugin-security';
import promisePlugin from 'eslint-plugin-promise';

/** Globales compartidos del cliente Canvas / UI que conviven con imports ESM. */
const appBrowserGlobals = {
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
    MatchStats: 'readonly',
    Replay: 'readonly',
    CamaraReplay: 'readonly',
    SeriePenales: 'readonly',
    HistorialLocalStore: 'readonly',
    CopaCore: 'readonly',
    CopaStore: 'readonly',
    CopaModo: 'readonly',
    SupercopaCore: 'readonly',
    SupercopaStore: 'readonly',
    SupercopaModo: 'readonly',
    CarreraStore: 'readonly',
    EquipoFavoritoStore: 'readonly',
    DesafiosStore: 'readonly',
    HistoriaStore: 'readonly',
    io: 'readonly',
};

export default [
    {
        name: 'chaquito/ignores',
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
        name: 'chaquito/base-standards',
        linterOptions: {
            reportUnusedDisableDirectives: 'warn',
        },
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...appBrowserGlobals,
            },
        },
        plugins: {
            unicorn,
            security,
            promise: promisePlugin,
        },
        rules: {
            // --- Corrección y calidad (referencia: antfu/eslint-config) ---
            'no-undef': 'error',
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-new-wrappers': 'error',
            'no-extend-native': 'error',
            'no-proto': 'error',
            'no-caller': 'error',
            'no-iterator': 'error',
            'no-self-compare': 'error',
            'no-template-curly-in-string': 'error',
            'no-unreachable-loop': 'error',
            'no-unsafe-finally': 'error',
            'no-unsafe-negation': 'error',
            'no-loss-of-precision': 'error',
            'no-async-promise-executor': 'error',
            'array-callback-return': 'error',
            'default-case-last': 'error',
            eqeqeq: ['error', 'smart'],
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-constant-condition': ['warn', { checkLoops: false }],
            'no-case-declarations': 'warn',
            'no-fallthrough': 'error',
            'no-prototype-builtins': 'warn',
            'no-redeclare': ['error', { builtinGlobals: false }],
            'no-useless-assignment': 'warn',
            'no-useless-catch': 'error',
            'no-useless-rename': 'error',
            'no-useless-return': 'warn',
            'no-console': 'off',

            // --- Seguridad SAST (referencia: eslint-community/eslint-plugin-security) ---
            'security/detect-eval-with-expression': 'error',
            'security/detect-bidi-characters': 'error',
            'security/detect-buffer-noassert': 'error',
            'security/detect-new-buffer': 'error',
            'security/detect-unsafe-regex': 'error',
            'security/detect-pseudoRandomBytes': 'warn',

            // --- Promesas (referencia: eslint-community/eslint-plugin-promise) ---
            'promise/no-new-statics': 'error',
            'promise/no-return-wrap': 'error',
            'promise/param-names': [
                'error',
                {
                    resolvePattern: '^_?(?:resolve|res|r|ok)$',
                    rejectPattern: '^_?(?:reject|rej|err|ko)$',
                },
            ],
            'promise/valid-params': 'error',

            // --- Modern JS (referencia: sindresorhus/eslint-plugin-unicorn) ---
            'unicorn/no-instanceof-array': 'error',
            'unicorn/no-invalid-remove-event-listener': 'error',
            'unicorn/no-unnecessary-await': 'error',
            'unicorn/error-message': 'error',
        },
    },
    {
        name: 'chaquito/server-and-scripts-node-strict',
        files: [
            'server.js',
            'config.js',
            'estado.js',
            'matchmaking.js',
            'onlineSockets.js',
            'partido_online.js',
            'salas.js',
            'persistencia.js',
            'persistencia_json.js',
            'persistencia_pg.js',
            'rutas/**/*.js',
            'obs/**/*.js',
            'scripts/**/*.{js,mjs}',
        ],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'unicorn/prefer-node-protocol': 'error',
            'no-restricted-globals': [
                'error',
                { name: 'window', message: 'El servidor autoritativo Node no puede usar window.' },
                { name: 'document', message: 'El servidor autoritativo Node no puede usar document.' },
                { name: 'localStorage', message: 'El servidor autoritativo Node no puede usar localStorage.' },
            ],
        },
    },
    {
        name: 'chaquito/service-worker',
        files: ['sw.js'],
        languageOptions: {
            globals: {
                ...globals.serviceworker,
            },
        },
    },
    {
        name: 'chaquito/tests',
        files: ['tests/**/*.{js,mjs}'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...appBrowserGlobals,
            },
        },
        rules: {
            'unicorn/prefer-node-protocol': 'error',
        },
    },
];
