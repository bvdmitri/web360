export default {
  '*.ts': ['eslint --fix --max-warnings 0 --no-warn-ignored', 'prettier --write'],
  '*.{js,cjs,mjs,json,md,yaml,yml}': ['prettier --write'],
};
