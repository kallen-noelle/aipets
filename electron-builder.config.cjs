/**
 * electron-builder 打包配置。
 *
 * vite 产物在 dist/，打包输出单独放 release/，两个目录不冲突。
 */

module.exports = {
  appId: 'com.aipets.desktop',
  productName: 'aipets',
  directories: {
    output: 'release',
    buildResources: 'electron/resources',
  },
  files: [
    'dist/**/*',
    'electron/**/*',
    'package.json',
  ],
  // 角色素材不进 asar：直接复制到 resources/characters，NSIS 与 portable 共用。
  extraResources: [
    { from: 'assets/characters', to: 'characters' },
  ],
  // 安装包体积接近验收线，使用最大压缩换取更小的产物。
  compression: 'maximum',
  win: {
    // NSIS 与 portable 共用同名 app 7z 缓存。便携版必须排在前面：先由 portable
    // 生成完整的素材包，NSIS 再复用，否则便携版会拿到缺失视频的旧缓存。
    target: ['portable', 'nsis'],
    icon: 'electron/resources/icon.ico',
  },
  portable: {
    artifactName: 'aipets.exe',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'aipets',
  },
}
