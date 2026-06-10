#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const skillDir = join(root, 'data-skill/skills/stakewise-data-query')

const files = [
  'SKILL.md',
  'references/vault-entities.md',
  'references/position-entities.md',
  'references/minting-and-rates-entities.md',
  'references/boost-entities.md',
  'references/rewards-entities.md',
  'references/vesting-entities.md',
  'references/network-and-misc-entities.md',
  'references/units-and-gotchas.md',
  'references/blog-articles.md',
]

const read = (file) => readFileSync(join(skillDir, file), 'utf8').trim()

const [ skill, ...references ] = files.map(read)
const signpost = 'The remaining sections are reference content — GraphQL entity shapes you can scan when building a query.'
const body = references.map((text) => text.replace(/^# /, '## ')).join('\n\n')

const combined = `${skill}\n\n---\n\n${signpost}\n\n${body}\n`

writeFileSync(join(root, 'data-skill/llm-context.md'), combined)

console.log(`[build-skill] llm-context.md (${combined.split('\n').length} lines) from ${files.length} files`)
