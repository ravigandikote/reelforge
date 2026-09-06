import { z } from 'zod'

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Expected a #RRGGBB colour')

export const brandColorsSchema = z.object({
  cream: hex,
  indigo: hex,
  terracotta: hex,
})

export const brandFontsSchema = z.object({
  display: z.string().min(1),
  body: z.string().min(1),
  caption: z.string().min(1),
})

export const brandKitSchema = z.object({
  name: z.string().min(1),
  colors: brandColorsSchema,
  fonts: brandFontsSchema,
  logoPath: z.string().nullable().default(null),
  logoMarkPath: z.string().nullable().default(null),
  handle: z.string(),
  website: z.string(),
})
export type BrandKitInput = z.infer<typeof brandKitSchema>
