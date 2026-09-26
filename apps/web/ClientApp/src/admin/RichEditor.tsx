import { Node } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState } from 'react'
import type { JSONContent } from '@tiptap/core'

export type RichNode = {
  type: string
  text?: string
  level?: number
  items?: string[]
  rows?: string[][]
  src?: string
  alt?: string
  entityId?: string
}
type Pickers = Record<string, { id: string; name: string }[]>
const embedKinds = ['destination', 'hotel', 'offer'] as const
const extensions = embedKinds.map((kind) =>
  Node.create({
    name: `${kind}Embed`,
    group: 'block',
    atom: true,
    addAttributes: () => ({ entityId: { default: null } }),
    parseHTML: () => [{ tag: `div[data-${kind}-embed]` }],
    renderHTML: ({ HTMLAttributes }) => [
      'div',
      { [`data-${kind}-embed`]: '', class: 'entity-embed', ...HTMLAttributes },
      `${kind}: ${String(HTMLAttributes.entityId)}`,
    ],
  }),
)
function text(node: JSONContent): string {
  return node.text ?? node.content?.map(text).join('') ?? ''
}
function toDocument(nodes: RichNode[]): JSONContent {
  return {
    type: 'doc',
    content: nodes.map((node) => {
      const content = node.text
        ? [{ type: 'text', text: node.text }]
        : undefined
      if (node.type === 'heading')
        return { type: 'heading', attrs: { level: node.level ?? 2 }, content }
      if (node.type === 'blockquote')
        return { type: 'blockquote', content: [{ type: 'paragraph', content }] }
      if (node.type === 'bulletList' || node.type === 'orderedList')
        return {
          type: node.type,
          content: node.items?.map((item) => ({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: item ? [{ type: 'text', text: item }] : undefined,
              },
            ],
          })),
        }
      if (node.type === 'image')
        return { type: 'image', attrs: { src: node.src, alt: node.alt ?? '' } }
      if (node.type === 'table')
        return {
          type: 'table',
          content: node.rows?.map((row, index) => ({
            type: 'tableRow',
            content: row.map((cell) => ({
              type: index ? 'tableCell' : 'tableHeader',
              content: [
                {
                  type: 'paragraph',
                  content: cell ? [{ type: 'text', text: cell }] : undefined,
                },
              ],
            })),
          })),
        }
      if (node.type.endsWith('Embed'))
        return { type: node.type, attrs: { entityId: node.entityId } }
      return { type: 'paragraph', content }
    }),
  }
}
function fromDocument(doc: JSONContent): RichNode[] {
  return (doc.content ?? []).flatMap<RichNode>((node) => {
    if (node.type === 'heading')
      return [
        {
          type: 'heading',
          level: Number(node.attrs?.level ?? 2),
          text: text(node),
        },
      ]
    if (node.type === 'paragraph' || node.type === 'blockquote')
      return [{ type: node.type, text: text(node) }]
    if (node.type === 'bulletList' || node.type === 'orderedList')
      return [{ type: node.type, items: node.content?.map(text) ?? [] }]
    if (node.type === 'image')
      return [
        {
          type: 'image',
          src: String(node.attrs?.src ?? ''),
          alt: String(node.attrs?.alt ?? ''),
        },
      ]
    if (node.type === 'table')
      return [
        {
          type: 'table',
          rows: node.content?.map((row) => row.content?.map(text) ?? []) ?? [],
        },
      ]
    if (embedKinds.some((kind) => node.type === `${kind}Embed`))
      return [
        { type: node.type!, entityId: String(node.attrs?.entityId ?? '') },
      ]
    return []
  })
}
export function RichEditor({
  initial,
  pickers,
  onChange,
}: {
  initial: RichNode[]
  pickers: Pickers
  onChange: (nodes: RichNode[]) => void
}) {
  const [embed, setEmbed] = useState<(typeof embedKinds)[number]>('hotel')
  const [selectedEmbedId, setSelectedEmbedId] = useState('')
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Image, TableKit, ...extensions],
    content: toDocument(initial),
    editorProps: {
      attributes: {
        class: 'tiptap-editor rich-text-editor__content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Rich content editor',
      },
    },
    onUpdate: ({ editor: instance }) =>
      onChange(fromDocument(instance.getJSON())),
  })
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      heading2: current?.isActive('heading', { level: 2 }) ?? false,
      heading3: current?.isActive('heading', { level: 3 }) ?? false,
      quote: current?.isActive('blockquote') ?? false,
      bullets: current?.isActive('bulletList') ?? false,
      numbers: current?.isActive('orderedList') ?? false,
      undo: current?.can().undo() ?? false,
      redo: current?.can().redo() ?? false,
    }),
  })
  if (!editor || !toolbarState) return <p>Loading editor…</p>
  const action = (
    label: string,
    run: () => void,
    options: { active?: boolean; disabled?: boolean; title?: string } = {},
  ) => (
    <button
      className="button is-small rich-text-editor__tool"
      type="button"
      onClick={run}
      aria-label={options.title ?? label}
      aria-pressed={options.active === undefined ? undefined : options.active}
      disabled={options.disabled}
    >
      {label}
    </button>
  )
  return (
    <div className="rich-text-editor">
      <div
        className="rich-text-editor__toolbar"
        role="toolbar"
        aria-label="Rich text formatting"
      >
        <div
          className="rich-text-editor__group"
          role="group"
          aria-label="Text formatting"
        >
          <span className="rich-text-editor__group-label" aria-hidden="true">
            Text
          </span>
          <div className="rich-text-editor__group-controls">
            {action('B', () => editor.chain().focus().toggleBold().run(), {
              active: toolbarState.bold,
              title: 'Bold',
            })}
            {action(
              'H2',
              () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
              {
                active: toolbarState.heading2,
                title: 'Heading level 2',
              },
            )}
            {action(
              'H3',
              () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
              {
                active: toolbarState.heading3,
                title: 'Heading level 3',
              },
            )}
            {action(
              'Quote',
              () => editor.chain().focus().toggleBlockquote().run(),
              {
                active: toolbarState.quote,
              },
            )}
            {action(
              'Bullets',
              () => editor.chain().focus().toggleBulletList().run(),
              {
                active: toolbarState.bullets,
              },
            )}
            {action(
              'Numbers',
              () => editor.chain().focus().toggleOrderedList().run(),
              {
                active: toolbarState.numbers,
              },
            )}
          </div>
        </div>
        <div
          className="rich-text-editor__group"
          role="group"
          aria-label="Insert content"
        >
          <span className="rich-text-editor__group-label" aria-hidden="true">
            Insert
          </span>
          <div className="rich-text-editor__group-controls">
            {action('Table', () =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run(),
            )}
            {action('Image', () => {
              const src = window.prompt('Local image path or HTTPS URL')
              if (src)
                editor
                  .chain()
                  .focus()
                  .setImage({
                    src,
                    alt: window.prompt('Alternative text') ?? '',
                  })
                  .run()
            })}
          </div>
        </div>
        <div
          className="rich-text-editor__group"
          role="group"
          aria-label="Edit history"
        >
          <span className="rich-text-editor__group-label" aria-hidden="true">
            History
          </span>
          <div className="rich-text-editor__group-controls">
            {action('Undo', () => editor.chain().focus().undo().run(), {
              disabled: !toolbarState.undo,
            })}
            {action('Redo', () => editor.chain().focus().redo().run(), {
              disabled: !toolbarState.redo,
            })}
          </div>
        </div>
        <div
          className="rich-text-editor__group rich-text-editor__group--embed"
          role="group"
          aria-label="Embed content"
        >
          <span className="rich-text-editor__group-label" aria-hidden="true">
            Embed
          </span>
          <div className="rich-text-editor__group-controls">
            <label className="rich-text-editor__select">
              <span className="is-sr-only">Embed type</span>
              <select
                value={embed}
                onChange={(event) => {
                  setEmbed(event.target.value as typeof embed)
                  setSelectedEmbedId('')
                }}
              >
                {embedKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="rich-text-editor__select rich-text-editor__select--item">
              <span className="is-sr-only">Embed selection</span>
              <select
                value={selectedEmbedId}
                onChange={(event) => setSelectedEmbedId(event.target.value)}
              >
                <option value="">Select an item</option>
                {(pickers[`${embed}s`] ?? []).map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {action(
              'Insert embed',
              () => {
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: `${embed}Embed`,
                    attrs: { entityId: selectedEmbedId },
                  })
                  .run()
              },
              { disabled: !selectedEmbedId },
            )}
          </div>
        </div>
      </div>
      <div className="rich-text-editor__canvas">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
