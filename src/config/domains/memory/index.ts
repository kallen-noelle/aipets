/**
 * 记忆域的公共入口。
 *
 * 调用方仍然从 `@/config/domains/memory` 导入：策略、store 与持久化在目录内
 * 分开，但对外只暴露一个入口，避免一次性改动所有引用点。
 */

export * from './policy'
export * from './store'
