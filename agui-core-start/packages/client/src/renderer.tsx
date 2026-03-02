import React from 'react'
import type { OJNode } from './openJsonUi'

export function renderNode(node: OJNode): React.ReactNode {
  switch (node.type) {
    case 'page':
      return (
        <div style={{ padding: 16, background: '#fff', color: '#000' }}>
          {node.children.map((c, i) => (
            <React.Fragment key={i}>{renderNode(c)}</React.Fragment>
          ))}
        </div>
      )

    case 'card':
      return (
        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          {node.title && <div style={{ fontWeight: 600, marginBottom: 8 }}>{node.title}</div>}
          {node.children.map((c, i) => (
            <React.Fragment key={i}>{renderNode(c)}</React.Fragment>
          ))}
        </div>
      )

    case 'text':
      return <div style={{ marginBottom: 8 }}>{node.value}</div>

    case 'button':
      return (
        <button
          onClick={() => {
            if (node.action?.type === 'custom_event') {
              fetch('http://localhost:3001/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'CUSTOM',
                  name: node.action.name,
                  value: node.action.value,
                  timestamp: Date.now(),
                }),
              })
            }
          }}
        >
          {node.label}
        </button>
      )
  }
}
