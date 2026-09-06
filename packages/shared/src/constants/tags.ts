export const TAG_GROUPS = ['scene', 'time', 'shot', 'people', 'admin'] as const
export type TagGroup = (typeof TAG_GROUPS)[number]

export interface TagDefinition {
  slug: string
  label: string
  group: TagGroup
}

/** Seed vocabulary. The vision pass may only emit these slugs. */
export const TAG_VOCABULARY: TagDefinition[] = [
  { slug: 'stage', label: 'Stage', group: 'scene' },
  { slug: 'lake', label: 'Lake', group: 'scene' },
  { slug: 'farm', label: 'Farm', group: 'scene' },
  { slug: 'bonfire', label: 'Bonfire', group: 'scene' },
  { slug: 'audience', label: 'Audience', group: 'scene' },
  { slug: 'close_up', label: 'Close-up', group: 'shot' },
  { slug: 'wide', label: 'Wide', group: 'shot' },
  { slug: 'day', label: 'Day', group: 'time' },
  { slug: 'night', label: 'Night', group: 'time' },
  { slug: 'solo', label: 'Solo', group: 'people' },
  { slug: 'small_group', label: 'Small group', group: 'people' },
  { slug: 'crowd', label: 'Crowd', group: 'people' },
  { slug: 'cleared', label: 'Consent cleared', group: 'admin' },
  { slug: 'indian_flag', label: 'Contains Indian flag', group: 'admin' },
]
