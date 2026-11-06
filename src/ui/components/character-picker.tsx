/**
 * 角色选择器：列出资源索引里的全部角色。
 *
 * 纯展示组件，选中后由设置页写入角色域。
 */

import type { CharacterDefinition } from '@/character/types'

export interface CharacterPickerProps {
  characters: CharacterDefinition[]
  activeId: string
  onSelect: (id: string) => void
}

/** 片段总数，卡片上用来提示动作丰富度。 */
function clipCount(character: CharacterDefinition): number {
  const states = Object.values(character.states).flat()
  const pools = Object.values(character.pools).flat()
  return [...states, ...pools].reduce((sum, clip) => sum + clip.segments.length, 0)
}

export function CharacterPicker({ characters, activeId, onSelect }: CharacterPickerProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {characters.map((character) => {
        const active = character.id === activeId
        return (
          <button
            key={character.id}
            type="button"
            onClick={() => onSelect(character.id)}
            className={`rounded-xl border p-4 text-left transition ${
              active
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40 hover:bg-muted/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: character.accent }}
              />
              <span className="font-medium">{character.name}</span>
              {active
                ? <span className="text-xs text-primary">已有实例</span>
                : null}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              {character.roman}
              {character.role ? ` · ${character.role}` : ''}
            </p>

            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {character.description}
            </p>

            <p className="mt-2 text-xs text-muted-foreground">
              {clipCount(character)} 段动作
            </p>
          </button>
        )
      })}
    </div>
  )
}
