import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-e2e',
      'playwright-report',
      'test-results',
      // gen:api가 자동 생성하므로 검사하지 않는다
      'src/api/schema.d.ts',
      // msw init이 생성한다
      'public/mockServiceWorker.js',
    ],
  },

  // 화면 코드 (브라우저)
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 쓰지 않는 변수는 오류. _ 로 시작하면 의도적으로 버린 값으로 본다.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Hook 규칙. react-hooks 7은 configs['recommended-latest']가 구형(eslintrc) 형식이고,
  // flat config는 configs.flat 아래에 들어 있다.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },

  // 설정 파일과 E2E (Node)
  {
    files: ['*.config.{ts,js}', 'e2e/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
  },

  // Prettier와 겹치는 모양 규칙을 끈다. 반드시 마지막에 둔다.
  prettier,
)
