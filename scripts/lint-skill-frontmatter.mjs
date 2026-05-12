#!/usr/bin/env node
// Validate frontmatter of every SKILL.md in the repo:
//   - has YAML frontmatter (delimited by ---)
//   - frontmatter contains `name` and `description`
//   - `name` matches the parent skill directory name
//   - data-skill SKILL.md additionally has `version` matching plugin.json
//
// Exits non-zero on any failure so PR check workflows can flag it (advisory).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const findSkills = (dir, found = []) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      findSkills(path, found)
    } else if (entry === 'SKILL.md') {
      found.push(path)
    }
  }
  return found
}

const parseFrontmatter = (content) => {
  if (!content.startsWith('---\n')) return null
  const closing = content.indexOf('\n---\n', 4)
  if (closing === -1) return null
  const yaml = content.slice(4, closing)
  const fields = {}
  for (const line of yaml.split('\n')) {
    const colonAt = line.indexOf(':')
    if (colonAt === -1) continue
    const key = line.slice(0, colonAt).trim()
    let value = line.slice(colonAt + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    fields[key] = value
  }
  return fields
}

const skills = findSkills(repoRoot)
let failures = 0

for (const path of skills) {
  const content = readFileSync(path, 'utf8')
  const fm = parseFrontmatter(content)
  const rel = path.replace(repoRoot + '/', '')
  let perFileFailures = 0

  if (!fm) {
    console.error(`::error file=${rel}::missing frontmatter (no leading --- block)`)
    failures += 1
    continue
  }

  for (const required of [ 'name', 'description' ]) {
    if (!fm[required]) {
      console.error(`::error file=${rel}::frontmatter is missing required field: ${required}`)
      perFileFailures += 1
    }
  }

  // SKILL.md in data-skill/ lives at the plugin root (one skill per plugin
  // shortcut); SKILL.md inside mcp-server/skills/<name>/ follows the
  // standard skills/<name>/SKILL.md convention.
  const parent = dirname(path)
  const grand = basename(dirname(parent))
  const expectedName = grand === 'skills' ? basename(parent) : 'stakewise-data-query'
  if (fm.name && fm.name !== expectedName) {
    console.error(`::error file=${rel}::frontmatter name='${fm.name}' does not match expected '${expectedName}'`)
    perFileFailures += 1
  }

  // data-skill specific cross-check with plugin.json + schema-snapshot pinning
  if (rel.startsWith('data-skill/')) {
    const pluginJsonPath = join(repoRoot, 'data-skill/.claude-plugin/plugin.json')
    if (existsSync(pluginJsonPath)) {
      const plugin = JSON.parse(readFileSync(pluginJsonPath, 'utf8'))
      if (plugin.version !== fm.version) {
        console.error(`::error file=${rel}::SKILL.md version='${fm.version}' but plugin.json version='${plugin.version}'`)
        perFileFailures += 1
      }
      if (plugin.name !== fm.name) {
        console.error(`::error file=${rel}::SKILL.md name='${fm.name}' but plugin.json name='${plugin.name}'`)
        perFileFailures += 1
      }
    } else {
      console.error(`::error file=${rel}::expected plugin.json at ${pluginJsonPath}`)
      perFileFailures += 1
    }

    const snapshotPath = join(repoRoot, 'data-skill/references/schema-snapshot.graphql')
    if (existsSync(snapshotPath)) {
      const firstLine = readFileSync(snapshotPath, 'utf8').split('\n', 1)[0]
      if (!/^# Snapshot of stakewise\/v3-subgraph@[a-f0-9]{40} on \d{4}-\d{2}-\d{2}$/.test(firstLine)) {
        console.error(`::error file=data-skill/references/schema-snapshot.graphql::missing or malformed pinning header (expected '# Snapshot of stakewise/v3-subgraph@<sha> on <YYYY-MM-DD>')`)
        perFileFailures += 1
      }
    }
  }

  failures += perFileFailures
  if (perFileFailures === 0) {
    console.log(`ok ${rel}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} skill-lint failure(s).`)
  process.exit(1)
}

console.log(`\nAll ${skills.length} skill(s) passed.`)
