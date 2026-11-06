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
  // 角色素材不进 asar：直接复制到 resources/characters，由主进程的本地服务读取。
  extraResources: [
    { from: 'assets/characters', to: 'characters' },
  ],
  // 素材本身已压缩，继续用最大压缩换取更小的产物。
  compression: 'maximum',
  win: {
    // 只出便携单文件。NSIS 逐个嵌入文件时会丢掉中文名的视频，见 README 的
    // “已知限制”。
    target: ['portable'],
    icon: 'electron/resources/icon.ico',
  },
  portable: {
    artifactName: 'aipets.exe',
  },
}
