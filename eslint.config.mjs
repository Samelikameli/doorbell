// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ["node_modules", ".next", ".firebase", "functions/lib"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
);
