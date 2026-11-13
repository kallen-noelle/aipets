import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * 分层约束的提示文案：让报错直接说明依赖方向，而不是只报“被禁止”。
 */
const LAYER_HINT = '依赖方向应自上而下：apps → ui → llm/mcp/speech/image/desktop → config/character。'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
  {
    // shadcn 生成的组件会同时导出组件和样式变体（例如 buttonVariants），
    // 这与 Fast Refresh 的单组件导出约定冲突，因此只在 UI 目录关闭该规则。
    files: ['src/ui/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // 分层白名单。第一批只锁定当前已经成立的方向，避免历史违规淹没有效信号；
  // UI 直接依赖具体服务实现的问题留到后续阶段收敛。
  // ---------------------------------------------------------------------------

  {
    // 渲染层不引用主进程源码，统一通过 src/desktop/bridge.ts 的类型与 preload 桥交互。
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['electron', 'electron/*'], message: `渲染层不要直接引用主进程源码。${LAYER_HINT}` },
        ],
      }],
    },
  },
  {
    // 配置层是最底层：只允许依赖同目录模块、工具库与平台桥以外的纯工具。
    files: ['src/config/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '@/character', '@/character/*',
              '@/llm', '@/llm/*',
              '@/mcp', '@/mcp/*',
              '@/speech', '@/speech/*',
              '@/image', '@/image/*',
              '@/audio', '@/audio/*',
              '@/weather', '@/weather/*',
              '@/desktop', '@/desktop/*',
              '@/ui', '@/ui/*',
              '@/apps', '@/apps/*',
              'electron', 'electron/*',
            ],
            message: `配置层不应反向依赖上层。${LAYER_HINT}`,
          },
        ],
      }],
    },
  },
  {
    // 角色动画与模型、工具无关。
    files: ['src/character/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/llm', '@/llm/*', '@/mcp', '@/mcp/*', '@/ui', '@/ui/*', '@/apps', '@/apps/*', 'electron', 'electron/*'],
            message: `角色层不应依赖模型或界面层。${LAYER_HINT}`,
          },
        ],
      }],
    },
  },
  {
    // MCP 是底层客户端，不能被 Agent 编排层反向引用，否则形成环。
    files: ['src/mcp/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/llm', '@/llm/*', '@/ui', '@/ui/*', '@/apps', '@/apps/*', 'electron', 'electron/*'],
            message: `MCP 客户端不应依赖 Agent 编排层。${LAYER_HINT}`,
          },
        ],
      }],
    },
  },
  {
    // 其余下层模块（语音、绘图、天气、调试、桌面桥）不得引用 UI 与入口。
    files: [
      'src/speech/**/*.{ts,tsx}',
      'src/image/**/*.{ts,tsx}',
      'src/audio/**/*.{ts,tsx}',
      'src/weather/**/*.{ts,tsx}',
      'src/debug/**/*.{ts,tsx}',
      'src/desktop/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/ui', '@/ui/*', '@/apps', '@/apps/*'],
            message: `下层模块不应依赖界面与入口。${LAYER_HINT}`,
          },
        ],
      }],
    },
  },
  {
    // UI 组件不依赖具体入口，页面组合由 src/apps 完成。
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/apps', '@/apps/*'], message: `UI 组件不应依赖具体入口。${LAYER_HINT}` },
        ],
      }],
    },
  },
])
