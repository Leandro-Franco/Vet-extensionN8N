// Configuração do web-ext — https://extensionworkshop.com/documentation/develop/web-ext-command-reference/
module.exports = {
  // Não vão para dentro do .zip/.xpi
  ignoreFiles: [
    'logo.png', // fonte 2048x2048 (~4,7 MB); o pacote usa icons/*
    'README.md',
    'web-ext-config.cjs',
  ],
  build: {
    overwriteDest: true,
  },
};
