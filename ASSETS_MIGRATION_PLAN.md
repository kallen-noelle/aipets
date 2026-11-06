# 角色素材迁移计划

把 440 MB 角色素材从 `electron/resources/characters` 挪到根目录 `assets/characters`，
打包方式由 `asarUnpack` 改为 `extraResources`。同时修复便携版 `aipets.exe` 内
没有 `.webm` 文件的问题。

## 现状问题

- `electron/resources/characters` 被 `files: ['electron/**/*']` 纳入 asar 打包范围，
  再用 `asarUnpack` 排除，链路绕。
- `npm run dist` 产出的 `release/aipets.exe` 只有 92.8 MB，7z 包内 `.webm` 条目为 0，
  `characters` 目录只有空文件夹。便携版启动后角色没有动画素材。
- NSIS 安装包 484.5 MB，包含素材，未受影响。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `assets/characters/`（新建） | 从 `electron/resources/characters` 整体移动，内容不变 |
| `vite.config.ts` | `CHARACTERS_DIR` 指向 `assets/characters` |
| `scripts/build-characters.mjs` | `targetRoot` 指向 `assets/characters` |
| `electron/main.cjs` | `charactersBase()`：打包后读 `process.resourcesPath/characters`，开发读项目根 `assets/characters` |
| `electron-builder.config.cjs` | 删除 `asarUnpack`，新增 `extraResources: [{ from: 'assets/characters', to: 'characters' }]` |
| `README.md` | 目录结构、资源路径、打包机制说明同步 |

图标 `icon.ico` / `icon.png` 保持在 `electron/resources`，`buildResources` 不变。

## 验证

1. `npm run lint`
2. `npm run test`
3. `npm run build`，确认 `dist` 内没有 `characters`
4. `npm run dist`
5. 检查 `release/win-unpacked/resources/characters` 存在且约 440 MB
6. 检查 `release/win-unpacked/resources/app.asar` 内没有角色素材
7. 检查 `release/aipets.exe` 的 7z 列表里 `.webm` 条目数大于 0
8. 检查 NSIS 安装包体积仍在 480 MB 左右
9. 启动便携版，确认进程存活、桌宠窗口存在

## 回滚

移动目录回 `electron/resources/characters`，恢复 `asarUnpack` 配置与三处路径即可。
