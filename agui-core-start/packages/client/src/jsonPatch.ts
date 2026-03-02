type JSONPatchOp = { op: 'add'; path: string; value: any } | { op: 'replace'; path: string; value: any } | { op: 'remove'; path: string }

function decodePointer(seg: string) {
  return seg.replace(/~1/g, '/').replace(/~0/g, '~')
}

function getContainer(root: any, path: string) {
  const parts = path.split('/').slice(1).map(decodePointer)
  const last = parts.pop()
  if (last === undefined) throw new Error('Invalid path')
  let cur = root
  for (const p of parts) {
    const idx = Array.isArray(cur) ? Number(p) : NaN
    cur = Array.isArray(cur) ? cur[idx] : cur[p]
    if (cur === undefined) throw new Error(`Path not found: ${path}`)
  }
  return { cur, last }
}

export function applyJsonPatch<T>(input: T, patch: JSONPatchOp[]): T {
  // demo：直接深拷贝后原地改，简单可靠
  const root: any = structuredClone(input)

  for (const op of patch) {
    const { cur, last } = getContainer(root, op.path)

    if (Array.isArray(cur)) {
      const index = last === '-' ? cur.length : Number(last)
      if (Number.isNaN(index)) throw new Error(`Invalid array index: ${last}`)

      if (op.op === 'add') cur.splice(index, 0, op.value)
      else if (op.op === 'replace') cur[index] = (op as any).value
      else if (op.op === 'remove') cur.splice(index, 1)
    } else {
      if (op.op === 'add' || op.op === 'replace') (cur as any)[last] = (op as any).value
      else if (op.op === 'remove') delete (cur as any)[last]
    }
  }

  return root
}
