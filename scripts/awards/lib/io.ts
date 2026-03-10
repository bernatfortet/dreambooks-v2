import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export async function writeJsonFile(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2))
}

export async function readJsonFile<T>(path: string): Promise<T> {
  const fileContents = await readFile(path, 'utf8')
  return JSON.parse(fileContents) as T
}

export function getAwardOutputDirectory(awardSlug: string): string {
  return join(process.cwd(), 'scripts', 'output', 'awards', awardSlug)
}

export function getAwardArtifactPath(params: {
  awardSlug: string
  artifactName: 'extracted' | 'resolved' | 'imported'
}): string {
  return join(getAwardOutputDirectory(params.awardSlug), `${params.artifactName}.json`)
}
