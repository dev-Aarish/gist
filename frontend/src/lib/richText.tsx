import { Fragment, memo, type ReactNode } from 'react'

// The local models return light markdown (bold key terms, `code`, bullet
// lists). This renders that safely as React nodes — no HTML injection and no
// extra dependency to keep the offline bundle small.

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE).filter((part) => part !== '')

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={key}>{part.slice(1, -1)}</code>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}

function renderLines(lines: string[], keyPrefix: string): ReactNode {
  return lines.map((line, index) => (
    <Fragment key={`${keyPrefix}-line-${index}`}>
      {renderInline(line, `${keyPrefix}-${index}`)}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ))
}

interface ListItem {
  text: string
  subItems: string[]
}

interface UnorderedListNode {
  type: 'ul'
  items: ListItem[]
}

interface OrderedListNode {
  type: 'ol'
  start?: number
  items: ListItem[]
}

type ListNode = UnorderedListNode | OrderedListNode

type Node =
  | { type: 'heading'; level: number; text: string }
  | ListNode
  | { type: 'blockquote'; lines: string[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'p'; lines: string[] }

function parseMarkdown(text: string): Node[] {
  const rawLines = text.split('\n')
  const nodes: Node[] = []

  let currentP: string[] = []
  let currentList: ListNode | null = null
  let currentQuote: string[] = []
  let currentCode: { language: string; lines: string[] } | null = null
  let pendingBlankLines = 0

  const flushP = () => {
    if (currentP.length > 0) {
      nodes.push({ type: 'p', lines: currentP })
      currentP = []
    }
  }

  const flushList = () => {
    if (currentList && currentList.items.length > 0) {
      nodes.push(currentList)
      currentList = null
    }
  }

  const flushQuote = () => {
    if (currentQuote.length > 0) {
      nodes.push({ type: 'blockquote', lines: currentQuote })
      currentQuote = []
    }
  }

  const flushAll = () => {
    flushP()
    flushList()
    flushQuote()
    pendingBlankLines = 0
  }

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i]
    const trimmed = rawLine.trim()

    // Code block fences (```)
    if (trimmed.startsWith('```')) {
      if (currentCode) {
        nodes.push({
          type: 'code',
          language: currentCode.language,
          code: currentCode.lines.join('\n'),
        })
        currentCode = null
      } else {
        flushAll()
        const language = trimmed.slice(3).trim()
        currentCode = { language, lines: [] }
      }
      continue
    }

    if (currentCode) {
      currentCode.lines.push(rawLine)
      continue
    }

    // Blank line
    if (!trimmed) {
      flushP()
      flushQuote()
      pendingBlankLines++
      if (pendingBlankLines > 1) {
        // Two consecutive blank lines end the list
        flushList()
      }
      continue
    }

    // Headings (e.g. #, ##, ###, ####, etc.)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushAll()
      const level = headingMatch[1].length
      const cleanText = headingMatch[2].replace(/\s+#+$/, '').trim()
      nodes.push({
        type: 'heading',
        level,
        text: cleanText,
      })
      continue
    }

    // Blockquote
    const quoteMatch = trimmed.match(/^>\s*(.*)$/)
    if (quoteMatch) {
      flushP()
      flushList()
      currentQuote.push(quoteMatch[1])
      pendingBlankLines = 0
      continue
    } else if (currentQuote.length > 0) {
      flushQuote()
    }

    // Numbered list item (e.g. "1. Identify Entities:" or "1) ...")
    const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/)
    if (numberedMatch) {
      flushP()
      flushQuote()
      const num = parseInt(numberedMatch[1], 10)
      const itemText = numberedMatch[2]

      if (!currentList || currentList.type !== 'ol') {
        flushList()
        currentList = {
          type: 'ol',
          start: num !== 1 ? num : undefined,
          items: [{ text: itemText, subItems: [] }],
        }
      } else {
        currentList.items.push({ text: itemText, subItems: [] })
      }
      pendingBlankLines = 0
      continue
    }

    // Bullet list item (e.g. "- Look for..." or "* ...")
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/)
    if (bulletMatch) {
      flushP()
      flushQuote()
      const itemText = bulletMatch[1]

      // If we are currently inside an <ol>, attach this bullet as a sub-item of the active numbered item
      if (currentList && currentList.type === 'ol' && currentList.items.length > 0) {
        const lastItem = currentList.items[currentList.items.length - 1]
        lastItem.subItems.push(itemText)
      } else if (currentList && currentList.type === 'ul') {
        currentList.items.push({ text: itemText, subItems: [] })
      } else {
        flushList()
        currentList = {
          type: 'ul',
          items: [{ text: itemText, subItems: [] }],
        }
      }
      pendingBlankLines = 0
      continue
    }

    // Normal paragraph text outside list
    if (currentList) {
      flushList()
    }
    pendingBlankLines = 0
    currentP.push(trimmed)
  }

  if (currentCode) {
    nodes.push({
      type: 'code',
      language: currentCode.language,
      code: currentCode.lines.join('\n'),
    })
  }

  flushAll()

  return nodes
}

export const RichText = memo(function RichText({ text }: { text: string }) {
  if (!text) return null
  const nodes = parseMarkdown(text.trim())

  return (
    <>
      {nodes.map((node, nodeIndex) => {
        const key = `node-${nodeIndex}`

        if (node.type === 'heading') {
          const content = renderInline(node.text, `${key}-h`)
          switch (node.level) {
            case 1:
              return (
                <h2 key={key} className="prose__h1">
                  {content}
                </h2>
              )
            case 2:
              return (
                <h3 key={key} className="prose__h2">
                  {content}
                </h3>
              )
            case 3:
              return (
                <h4 key={key} className="prose__h3">
                  {content}
                </h4>
              )
            case 4:
              return (
                <h5 key={key} className="prose__h4">
                  {content}
                </h5>
              )
            default:
              return (
                <h6 key={key} className="prose__h5">
                  {content}
                </h6>
              )
          }
        }

        if (node.type === 'ul') {
          return (
            <ul key={key}>
              {node.items.map((item, index) => (
                <li key={`${key}-${index}`}>
                  {renderInline(item.text, `${key}-${index}`)}
                  {item.subItems && item.subItems.length > 0 ? (
                    <ul>
                      {item.subItems.map((sub, subIdx) => (
                        <li key={`${key}-${index}-sub-${subIdx}`}>
                          {renderInline(sub, `${key}-${index}-sub-${subIdx}`)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        }

        if (node.type === 'ol') {
          return (
            <ol key={key} start={node.start}>
              {node.items.map((item, index) => (
                <li key={`${key}-${index}`}>
                  {renderInline(item.text, `${key}-${index}`)}
                  {item.subItems && item.subItems.length > 0 ? (
                    <ul>
                      {item.subItems.map((sub, subIdx) => (
                        <li key={`${key}-${index}-sub-${subIdx}`}>
                          {renderInline(sub, `${key}-${index}-sub-${subIdx}`)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          )
        }

        if (node.type === 'blockquote') {
          return (
            <blockquote key={key}>
              {renderLines(node.lines, `${key}-quote`)}
            </blockquote>
          )
        }

        if (node.type === 'code') {
          return (
            <pre key={key} className="prose__code-block">
              <code>{node.code}</code>
            </pre>
          )
        }

        return <p key={key}>{renderLines(node.lines, key)}</p>
      })}
    </>
  )
})
